package com.yydsxwh.kemiao.days.notify

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.net.ConnectivityManager
import android.net.Network
import android.os.Build
import android.os.Handler
import android.os.HandlerThread
import android.os.IBinder
import androidx.core.app.NotificationCompat
import com.yydsxwh.kemiao.days.R
import com.yydsxwh.kemiao.days.data.local.AppearanceStore
import com.yydsxwh.kemiao.days.data.local.SecureSession
import com.yydsxwh.kemiao.days.data.model.RemoteAlarmPolicy
import com.yydsxwh.kemiao.days.data.remote.RemoteAlarmClient
import com.yydsxwh.kemiao.days.data.remote.RemoteAlarmException
import com.yydsxwh.kemiao.days.ui.MainActivity

/**
 * 用户打开「好友叫醒实时守护」后才运行。
 * 常驻通知可见，每 20 秒只拉 pending，有变化才登记系统闹钟。
 */
class WakeGuardService : Service() {
    private val worker = HandlerThread("wake-guard")
    private var workerHandler: Handler? = null
    @Volatile private var delayMs = 20_000L
    @Volatile private var cursor = ""
    @Volatile private var polling = false
    private var foreground = false
    private var networkCallback: ConnectivityManager.NetworkCallback? = null

    private val tick = Runnable {
        if (!AppearanceStore(this).wakeGuard()) {
            stopGuard()
            return@Runnable
        }
        if (polling) {
            workerHandler?.postDelayed(tick, delayMs)
            return@Runnable
        }
        polling = true
        val failed = !pollOnce()
        polling = false
        delayMs = RemoteAlarmPolicy.nextPollDelay(delayMs, failed)
        workerHandler?.postDelayed(tick, delayMs)
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP || !AppearanceStore(this).wakeGuard()) {
            AppearanceStore(this).setWakeGuard(false)
            stopGuard()
            return START_NOT_STICKY
        }
        try {
            if (Build.VERSION.SDK_INT >= 34) {
                startForeground(NOTIFICATION_ID, notification(), ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)
            } else {
                startForeground(NOTIFICATION_ID, notification())
            }
            foreground = true
        } catch (error: Exception) {
            AppearanceStore(this).setWakeGuardNote("系统没有允许启动好友叫醒实时守护")
            stopSelf()
            return START_NOT_STICKY
        }
        AppearanceStore(this).setWakeGuardNote("")
        if (workerHandler == null) {
            worker.start()
            workerHandler = Handler(worker.looper)
            listenNetwork()
        }
        delayMs = 20_000L
        workerHandler?.removeCallbacks(tick)
        workerHandler?.post(tick)
        return START_STICKY
    }

    override fun onDestroy() {
        workerHandler?.removeCallbacks(tick)
        val callback = networkCallback
        if (callback != null) {
            runCatching { getSystemService(ConnectivityManager::class.java).unregisterNetworkCallback(callback) }
        }
        networkCallback = null
        if (worker.isAlive) worker.quitSafely()
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun pollOnce(): Boolean {
        val token = SecureSession(this).token()
        if (token.isNullOrBlank()) return false
        val client = RemoteAlarmClient(tokenProvider = { token })
        return try {
            val pending = client.pending()
            if (pending.cursor != cursor) {
                RemoteAlarmSync(this).pullAndSchedule()
                cursor = pending.cursor
            }
            AppearanceStore(this).setWakeGuardNote("")
            true
        } catch (error: RemoteAlarmException) {
            if (error.code == "REMOTE_ALARM_RATE_LIMITED") delayMs = 60_000L
            false
        } catch (_: Exception) {
            false
        }
    }

    private fun listenNetwork() {
        val manager = getSystemService(ConnectivityManager::class.java) ?: return
        val callback = object : ConnectivityManager.NetworkCallback() {
            override fun onAvailable(network: Network) {
                delayMs = 20_000L
                workerHandler?.removeCallbacks(tick)
                workerHandler?.post(tick)
            }
        }
        networkCallback = callback
        runCatching { manager.registerDefaultNetworkCallback(callback) }
    }

    private fun stopGuard() {
        if (foreground) {
            stopForeground(STOP_FOREGROUND_REMOVE)
            foreground = false
        }
        stopSelf()
    }

    private fun notification(): Notification {
        val manager = getSystemService(NotificationManager::class.java)
        manager.createNotificationChannel(NotificationChannel(CHANNEL, "好友叫醒守护", NotificationManager.IMPORTANCE_LOW))
        val stop = PendingIntent.getService(
            this,
            0,
            Intent(this, WakeGuardService::class.java).setAction(ACTION_STOP),
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
            .setContentTitle("颗秒日事 · 好友叫醒守护中")
            .setContentText("正在等待好友设置的闹钟。可随时停止。")
            .setContentIntent(open)
            .addAction(0, "停止", stop)
            .setOngoing(true)
            .build()
    }

    companion object {
        private const val CHANNEL = "wake-guard"
        private const val NOTIFICATION_ID = 43
        const val ACTION_STOP = "com.yydsxwh.kemiao.days.STOP_WAKE_GUARD"

        fun start(context: Context) {
            val intent = Intent(context, WakeGuardService::class.java)
            context.startForegroundService(intent)
        }

        fun stop(context: Context) {
            context.startService(Intent(context, WakeGuardService::class.java).setAction(ACTION_STOP))
        }
    }
}
