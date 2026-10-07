package com.yydsxwh.kemiao.days.data.model

import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

/** 远程闹钟的时间、编号和是否恢复。这些判断不能依赖进程还活着。 */
object RemoteAlarmPolicy {
    private val OPEN = setOf("CREATED", "DELIVERY_PENDING", "DELIVERED", "DEVICE_SCHEDULED")
    private val clock = DateTimeFormatter.ofPattern("M月d日 HH:mm")

    /** 闹钟响了之后，晚到超过这个时间就不再补响。 */
    const val RING_GRACE_MS = 3 * 60 * 1000L

    fun requestCode(alarmId: String): Int {
        var hash = -2128831035
        for (ch in alarmId) {
            hash = hash xor ch.code
            hash *= 16777619
        }
        val positive = hash and 0x7fffffff
        return if (positive == 0) 1 else positive
    }

    fun triggerMillis(iso: String): Long = Instant.parse(iso).toEpochMilli()

    /**
     * 同步或开机时怎么处理一条本地记录。
     * 过期、取消、已响过的不恢复；触发时间已过的不补响。
     */
    fun bootAction(status: String, triggerAtMillis: Long, nowMillis: Long): String {
        if (status !in OPEN) return "drop"
        if (triggerAtMillis <= nowMillis) return "missed"
        return "restore"
    }

    fun shouldRing(triggerAtMillis: Long, nowMillis: Long): Boolean {
        return nowMillis <= triggerAtMillis + RING_GRACE_MS
    }

    /** 实时守护短轮询。成功回到 20 秒，失败 20 → 40 → 60 秒后停住。 */
    fun nextPollDelay(previousMs: Long, failed: Boolean): Long {
        if (!failed) return 20_000L
        val base = if (previousMs < 20_000L) 20_000L else previousMs
        return (base * 2).coerceAtMost(60_000L)
    }

    fun describeTrigger(iso: String, savedZone: String, deviceZone: ZoneId = ZoneId.systemDefault()): String {
        val instant = Instant.parse(iso)
        val local = clock.format(instant.atZone(deviceZone))
        val saved = runCatching { ZoneId.of(savedZone) }.getOrNull()
        if (saved == null || saved == deviceZone) return "$local（你的当前时区）"
        val original = clock.format(instant.atZone(saved))
        return "$local（你的当前时区），原定 $original $savedZone"
    }
}
