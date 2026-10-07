package com.yydsxwh.kemiao.days.notify

import android.app.AlarmManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.media.RingtoneManager
import android.os.Build
import com.yydsxwh.kemiao.days.data.local.LocalRemoteAlarm
import com.yydsxwh.kemiao.days.data.local.RemoteAlarmStore
import com.yydsxwh.kemiao.days.data.model.RemoteAlarmPolicy

class RemoteAlarmScheduler(private val context: Context) {
    private val alarms = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
    private val store = RemoteAlarmStore(context)

    fun canExact(): Boolean = if (Build.VERSION.SDK_INT >= 31) alarms.canScheduleExactAlarms() else true

    fun prepare() {
        ensureChannel()
    }

    fun schedule(record: LocalRemoteAlarm): Boolean {
        ensureChannel()
        val triggerAt = record.nextTriggerMillis
        if (triggerAt <= System.currentTimeMillis()) return false
        val pending = broadcast(record.requestCode, record)
        val show = activity(record.requestCode, record)
        return runCatching {
            if (canExact()) alarms.setAlarmClock(AlarmManager.AlarmClockInfo(triggerAt, show), pending)
            else alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAt, pending)
            true
        }.getOrDefault(false)
    }

    fun cancel(record: LocalRemoteAlarm) {
        val pending = PendingIntent.getBroadcast(
            context,
            record.requestCode,
            Intent(context, RemoteAlarmReceiver::class.java),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        alarms.cancel(pending)
        pending.cancel()
    }

    fun snooze(record: LocalRemoteAlarm, minutes: Int) {
        val next = System.currentTimeMillis() + minutes.coerceIn(1, 120) * 60_000L
        val updated = record.copy(nextTriggerMillis = next, status = "DEVICE_SCHEDULED")
        store.upsert(updated)
        schedule(updated)
    }

    /** 开机、升级或时区变化后，只恢复还没到点的闹钟。 */
    fun restoreAll() {
        val now = System.currentTimeMillis()
        val next = store.load().map { record ->
            when (RemoteAlarmPolicy.bootAction(record.status, record.nextTriggerMillis, now)) {
                "restore" -> {
                    schedule(record)
                    record
                }
                "missed" -> record.copy(status = "MISSED")
                else -> record
            }
        }
        store.save(next)
    }

    private fun broadcast(code: Int, record: LocalRemoteAlarm): PendingIntent {
        return PendingIntent.getBroadcast(context, code, intent(record), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    }

    private fun activity(code: Int, record: LocalRemoteAlarm): PendingIntent {
        return PendingIntent.getActivity(
            context,
            code,
            intent(record).setClass(context, AlarmActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
    }

    private fun intent(record: LocalRemoteAlarm): Intent {
        return Intent(context, RemoteAlarmReceiver::class.java)
            .putExtra(EXTRA_ID, record.remoteAlarmId)
            .putExtra(EXTRA_TITLE, record.title)
            .putExtra(EXTRA_CREATOR, record.creatorName)
            .putExtra(EXTRA_ENTITY, record.entityTitle)
            .putExtra(EXTRA_NOTE, record.note)
            .putExtra(EXTRA_TRIGGER, record.triggerAt)
            .putExtra(EXTRA_VIBRATE, record.vibrate)
            .putExtra(EXTRA_SOUND, record.sound)
            .putExtra(EXTRA_SNOOZE, record.allowSnooze)
    }

    private fun ensureChannel() {
        val manager = context.getSystemService(NotificationManager::class.java)
        val channel = NotificationChannel(CHANNEL, "好友叫醒", NotificationManager.IMPORTANCE_HIGH)
        val sound = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM)
        channel.setSound(sound, AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM).build())
        channel.enableVibration(true)
        channel.vibrationPattern = longArrayOf(0, 700, 400, 700)
        manager.createNotificationChannel(channel)
        val quiet = NotificationChannel(QUIET, "好友叫醒结果", NotificationManager.IMPORTANCE_DEFAULT)
        manager.createNotificationChannel(quiet)
    }

    companion object {
        const val CHANNEL = "kemiao-days-remote-alarms"
        const val QUIET = "kemiao-days-remote-quiet"
        const val EXTRA_ID = "remoteAlarmId"
        const val EXTRA_TITLE = "title"
        const val EXTRA_CREATOR = "creatorName"
        const val EXTRA_ENTITY = "entityTitle"
        const val EXTRA_NOTE = "note"
        const val EXTRA_TRIGGER = "triggerAt"
        const val EXTRA_VIBRATE = "vibrate"
        const val EXTRA_SOUND = "sound"
        const val EXTRA_SNOOZE = "allowSnooze"
    }
}
