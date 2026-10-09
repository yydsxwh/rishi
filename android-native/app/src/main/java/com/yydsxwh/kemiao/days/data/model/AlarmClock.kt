package com.yydsxwh.kemiao.days.data.model

import java.time.Instant
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneId
import java.time.ZonedDateTime

/** 远程闹钟的本地日期和时分秒。秒数不能在转成 UTC 时丢掉。 */
object AlarmClock {
    fun localToIso(date: String, time: String, zone: ZoneId = ZoneId.systemDefault()): String? {
        val day = runCatching { LocalDate.parse(date.trim()) }.getOrNull() ?: return null
        val clock = parseClock(time) ?: return null
        return ZonedDateTime.of(day, clock, zone).toInstant().toString()
    }

    fun parseClock(time: String): LocalTime? {
        val parts = time.trim().split(":")
        if (parts.size !in 2..3) return null
        val hour = parts[0].toIntOrNull() ?: return null
        val minute = parts[1].toIntOrNull() ?: return null
        val second = if (parts.size == 3) parts[2].toIntOrNull() ?: return null else 0
        if (hour !in 0..23 || minute !in 0..59 || second !in 0..59) return null
        return LocalTime.of(hour, minute, second)
    }

    fun formatClock(hour: Int, minute: Int, second: Int): String = "%02d:%02d:%02d".format(hour, minute, second)

    fun preview(date: String, time: String): String {
        val clock = parseClock(time) ?: return date
        return "$date ${formatClock(clock.hour, clock.minute, clock.second)}"
    }

    fun alarmProblem(date: String, time: String, now: Instant = Instant.now(), zone: ZoneId = ZoneId.systemDefault()): String? {
        val iso = localToIso(date, time, zone) ?: return "请选择完整的日期、时、分、秒"
        if (!Instant.parse(iso).isAfter(now.plusMillis(30_000))) return "不能设置过去或 30 秒内的时间"
        return null
    }

    fun defaultSelection(now: ZonedDateTime = ZonedDateTime.now()): Pair<String, String> {
        val next = now.plusMinutes(5).withNano(0)
        return next.toLocalDate().toString() to formatClock(next.hour, next.minute, next.second)
    }
}
