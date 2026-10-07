package com.yydsxwh.kemiao.days.notify

import android.Manifest
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.media.RingtoneManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.yydsxwh.kemiao.days.R
import com.yydsxwh.kemiao.days.data.local.RemoteAlarmStore
import com.yydsxwh.kemiao.days.data.local.SecureSession
import com.yydsxwh.kemiao.days.data.model.RemoteAlarmPolicy
import com.yydsxwh.kemiao.days.data.remote.RemoteAlarmClient
import kotlin.concurrent.thread

class RemoteAlarmReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val id = intent.getStringExtra(RemoteAlarmScheduler.EXTRA_ID) ?: return
        val store = RemoteAlarmStore(context)
        val record = store.load().find { it.remoteAlarmId == id } ?: return
        if (record.status == "CANCELLED" || record.status == "EXPIRED" || record.status == "MISSED") return
        RemoteAlarmScheduler(context).prepare()
        val now = System.currentTimeMillis()
        if (!RemoteAlarmPolicy.shouldRing(record.nextTriggerMillis, now)) {
            store.upsert(record.copy(status = "MISSED"))
            RemoteAlarmScheduler(context).prepare()
            notifyQuiet(context, record.requestCode, "错过了好友闹钟", record.title)
            report(context, id, "missed", "手机联网时触发时间已过")
            return
        }
        val open = Intent(context, AlarmActivity::class.java)
            .putExtras(intent)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
        val fullScreen = canFullScreen(context)
        val pending = PendingIntent.getActivity(context, record.requestCode, open, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        if (canNotify(context)) {
            val who = intent.getStringExtra(RemoteAlarmScheduler.EXTRA_CREATOR).orEmpty().ifBlank { "好友" }
            val title = intent.getStringExtra(RemoteAlarmScheduler.EXTRA_TITLE).orEmpty().ifBlank { "好友叫醒" }
            val builder = NotificationCompat.Builder(context, RemoteAlarmScheduler.CHANNEL)
                .setSmallIcon(R.drawable.ic_stat_days)
                .setContentTitle(title)
                .setContentText("$who 给你设的闹钟")
                .setCategory(NotificationCompat.CATEGORY_ALARM)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setPriority(NotificationCompat.PRIORITY_MAX)
                .setOngoing(true)
                .setAutoCancel(false)
                .setSound(RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM))
                .setContentIntent(pending)
            if (record.vibrate) builder.setVibrate(longArrayOf(0, 700, 400, 700))
            if (fullScreen) builder.setFullScreenIntent(pending, true)
            NotificationManagerCompat.from(context).notify(record.requestCode, builder.build())
        }
        if (fullScreen) runCatching { context.startActivity(open) }
    }

    private fun canFullScreen(context: Context): Boolean {
        val manager = context.getSystemService(NotificationManager::class.java)
        return Build.VERSION.SDK_INT < 34 || manager.canUseFullScreenIntent()
    }

    private fun canNotify(context: Context): Boolean {
        if (!NotificationManagerCompat.from(context).areNotificationsEnabled()) return false
        return Build.VERSION.SDK_INT < 33 || ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED
    }

    private fun notifyQuiet(context: Context, code: Int, title: String, body: String) {
        if (!canNotify(context)) return
        val notification = NotificationCompat.Builder(context, RemoteAlarmScheduler.QUIET)
            .setSmallIcon(R.drawable.ic_stat_days)
            .setContentTitle(title)
            .setContentText(body)
            .setAutoCancel(true)
            .build()
        NotificationManagerCompat.from(context).notify(code, notification)
    }

    private fun report(context: Context, id: String, action: String, reason: String) {
        val pending = goAsync()
        thread {
            try {
                val token = SecureSession(context).token()
                if (!token.isNullOrBlank()) RemoteAlarmClient(tokenProvider = { token }).report(id, action, reason)
            } catch (_: Exception) {
            } finally {
                pending.finish()
            }
        }
    }
}
