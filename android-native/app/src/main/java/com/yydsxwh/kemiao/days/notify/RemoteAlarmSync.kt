package com.yydsxwh.kemiao.days.notify

import android.content.Context
import com.yydsxwh.kemiao.days.data.local.LocalRemoteAlarm
import com.yydsxwh.kemiao.days.data.local.RemoteAlarmStore
import com.yydsxwh.kemiao.days.data.local.SecureSession
import com.yydsxwh.kemiao.days.data.model.RemoteAlarmPolicy
import com.yydsxwh.kemiao.days.data.remote.RemoteAlarmClient
import com.yydsxwh.kemiao.days.data.remote.RemoteAlarmDto
import com.yydsxwh.kemiao.days.data.remote.RemoteAlarmException

/** 打开应用、回到前台或后台同步时，把服务端闹钟登记进 AlarmManager。 */
class RemoteAlarmSync(private val context: Context) {
    private val store = RemoteAlarmStore(context)
    private val scheduler = RemoteAlarmScheduler(context)

    fun pullAndSchedule() {
        val token = SecureSession(context).token()
        if (token.isNullOrBlank()) return
        val client = RemoteAlarmClient(tokenProvider = { token })
        runCatching { com.yydsxwh.kemiao.days.location.DeviceRegistrar.refresh(context) }
        val incoming = client.alarms("incoming")
        val now = System.currentTimeMillis()
        val kept = store.load().associateBy { it.remoteAlarmId }.toMutableMap()
        for (alarm in incoming) {
            val fresh = toLocal(alarm) ?: continue
            val existing = kept[fresh.remoteAlarmId]
            val local = if (existing != null && existing.nextTriggerMillis > fresh.triggerAtMillis && existing.nextTriggerMillis > now) {
                fresh.copy(nextTriggerMillis = existing.nextTriggerMillis)
            } else {
                fresh
            }
            if (alarm.status == "CANCELLED" || alarm.status == "EXPIRED" || alarm.status == "FIRED" || alarm.status == "FAILED") {
                scheduler.cancel(local)
                kept[local.remoteAlarmId] = local.copy(status = alarm.status)
                continue
            }
            val action = RemoteAlarmPolicy.bootAction(alarm.status, local.nextTriggerMillis, now)
            when (action) {
                "missed" -> {
                    scheduler.cancel(local)
                    kept[local.remoteAlarmId] = local.copy(status = "MISSED")
                    if (alarm.status != "MISSED") runCatching { client.report(alarm.id, "missed", "触发时间已过") }
                }
                "restore" -> {
                    if (alarm.status == "DEVICE_SCHEDULED" && scheduler.canExact()) {
                        scheduler.schedule(local)
                        kept[local.remoteAlarmId] = local.copy(status = "DEVICE_SCHEDULED")
                        continue
                    }
                    val registered = scheduler.schedule(local)
                    if (registered && scheduler.canExact()) {
                        val reported = runCatching { client.report(alarm.id, "device-scheduled") }
                        if (reported.isSuccess) {
                            kept[local.remoteAlarmId] = local.copy(status = "DEVICE_SCHEDULED")
                        } else if (grantBlocked(reported.exceptionOrNull())) {
                            scheduler.cancel(local)
                            kept[local.remoteAlarmId] = local.copy(status = alarm.status)
                        } else {
                            kept[local.remoteAlarmId] = local.copy(status = "DELIVERED")
                        }
                    } else if (!registered) {
                        runCatching { client.report(alarm.id, "failed", "本机没有登记到系统闹钟") }
                        kept[local.remoteAlarmId] = local.copy(status = "FAILED")
                    } else {
                        runCatching { client.report(alarm.id, "delivered") }
                        kept[local.remoteAlarmId] = local.copy(status = "DELIVERED")
                    }
                }
                else -> kept[local.remoteAlarmId] = local.copy(status = alarm.status)
            }
        }
        store.save(kept.values.toList())
    }

    private fun grantBlocked(error: Throwable?): Boolean {
        val code = (error as? RemoteAlarmException)?.code ?: return false
        return code.startsWith("REMOTE_ALARM_") && code != "REMOTE_ALARM_RATE_LIMITED"
    }

    private fun toLocal(alarm: RemoteAlarmDto): LocalRemoteAlarm? {
        val trigger = runCatching { RemoteAlarmPolicy.triggerMillis(alarm.triggerAt) }.getOrNull() ?: return null
        val code = RemoteAlarmPolicy.requestCode(alarm.id)
        return LocalRemoteAlarm(
            remoteAlarmId = alarm.id,
            triggerAt = alarm.triggerAt,
            triggerAtMillis = trigger,
            nextTriggerMillis = trigger,
            requestCode = code,
            status = alarm.status,
            title = alarm.title,
            note = alarm.note,
            creatorUserId = alarm.creatorUserId,
            creatorName = alarm.creatorName,
            entityTitle = alarm.entityTitle,
            timezone = alarm.timezone,
            revision = alarm.revision,
            vibrate = alarm.vibrate,
            sound = alarm.sound,
            allowSnooze = alarm.allowSnooze,
        )
    }
}
