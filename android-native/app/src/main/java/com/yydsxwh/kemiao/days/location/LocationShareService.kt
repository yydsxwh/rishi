package com.yydsxwh.kemiao.days.location

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.IBinder
import androidx.core.app.NotificationCompat
import com.google.android.gms.location.LocationCallback
import com.google.android.gms.location.LocationRequest
import com.google.android.gms.location.LocationResult
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import com.yydsxwh.kemiao.days.R
import com.yydsxwh.kemiao.days.ui.MainActivity

/** 只有用户打开实时守护后才跑。通知一直可见，系统权限被收回就停止。 */
class LocationShareService : Service() {
    private val fused by lazy { LocationServices.getFusedLocationProviderClient(this) }
    private val callback = object : LocationCallback() {
        override fun onLocationResult(result: LocationResult) {
            if (!LocationUploader.hasForegroundPermission(this@LocationShareService)) {
                stopSelf()
                return
            }
            val location = result.lastLocation ?: return
            Thread { LocationUploader(this@LocationShareService).upload(location, "GPS") }.start()
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP || !LocationUploader.hasForegroundPermission(this)) {
            stopForeground(STOP_FOREGROUND_REMOVE)
            stopSelf()
            return START_NOT_STICKY
        }
        startForeground(NOTIFICATION_ID, notification())
        val request = LocationRequest.Builder(Priority.PRIORITY_BALANCED_POWER_ACCURACY, INTERVAL_MS)
            .setMinUpdateIntervalMillis(INTERVAL_MS)
            .build()
        runCatching { fused.requestLocationUpdates(request, callback, mainLooper) }
            .onFailure { stopSelf() }
        return START_STICKY
    }

    override fun onDestroy() {
        runCatching { fused.removeLocationUpdates(callback) }
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun notification(): Notification {
        val manager = getSystemService(NotificationManager::class.java)
        manager.createNotificationChannel(NotificationChannel(CHANNEL, "位置共享", NotificationManager.IMPORTANCE_LOW))
        val stop = PendingIntent.getService(
            this,
            0,
            Intent(this, LocationShareService::class.java).setAction(ACTION_STOP),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val open = PendingIntent.getActivity(
            this,
            1,
            Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        return NotificationCompat.Builder(this, CHANNEL)
            .setSmallIcon(R.drawable.ic_launcher)
            .setContentTitle("正在共享位置")
            .setContentText("可信联系人可以按你的授权查看。点停止可马上结束。")
            .setContentIntent(open)
            .addAction(0, "停止", stop)
            .setOngoing(true)
            .build()
    }

    companion object {
        private const val CHANNEL = "location-share"
        private const val NOTIFICATION_ID = 42
        private const val INTERVAL_MS = 60_000L
        const val ACTION_STOP = "com.yydsxwh.kemiao.days.STOP_LOCATION"

        fun start(context: Context) {
            val intent = Intent(context, LocationShareService::class.java)
            context.startForegroundService(intent)
        }

        fun stop(context: Context) {
            context.startService(Intent(context, LocationShareService::class.java).setAction(ACTION_STOP))
        }
    }
}
