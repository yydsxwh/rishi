package com.yydsxwh.kemiao.days.data.local

import android.content.Context
import com.yydsxwh.kemiao.days.data.model.DaysJson
import kotlinx.serialization.Serializable
import kotlinx.serialization.builtins.ListSerializer

@Serializable
data class LocalRemoteAlarm(
    val remoteAlarmId: String,
    val triggerAt: String,
    val triggerAtMillis: Long,
    val nextTriggerMillis: Long,
    val requestCode: Int,
    val status: String,
    val title: String,
    val note: String = "",
    val creatorUserId: String = "",
    val creatorName: String = "",
    val entityTitle: String = "",
    val timezone: String = "Asia/Shanghai",
    val revision: Long = 0,
    val vibrate: Boolean = true,
    val sound: Boolean = true,
    val allowSnooze: Boolean = true,
)

class RemoteAlarmStore(context: Context) {
    private val prefs = context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    fun load(): List<LocalRemoteAlarm> {
        val raw = prefs.getString(KEY_ALARMS, null) ?: return emptyList()
        return runCatching { DaysJson.decodeFromString<List<LocalRemoteAlarm>>(raw) }.getOrDefault(emptyList())
    }

    fun save(items: List<LocalRemoteAlarm>) {
        prefs.edit().putString(KEY_ALARMS, DaysJson.encodeToString(ListSerializer(LocalRemoteAlarm.serializer()), items)).apply()
    }

    fun upsert(item: LocalRemoteAlarm) {
        val next = load().filterNot { it.remoteAlarmId == item.remoteAlarmId } + item
        save(next)
    }

    fun deviceId(): String? = prefs.getString(KEY_DEVICE, null)?.takeIf { it.isNotBlank() }

    fun saveDeviceId(id: String) {
        prefs.edit().putString(KEY_DEVICE, id).apply()
    }

    companion object {
        private const val PREFS = "kemiao-remote-alarms"
        private const val KEY_ALARMS = "alarms"
        private const val KEY_DEVICE = "device-id"
    }
}
