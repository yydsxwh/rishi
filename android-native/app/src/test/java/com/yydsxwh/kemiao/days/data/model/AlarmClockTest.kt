package com.yydsxwh.kemiao.days.data.model

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.Instant
import java.time.ZoneId
import java.time.ZonedDateTime

class AlarmClockTest {
    private val shanghai = ZoneId.of("Asia/Shanghai")

    @Test
    fun keepsSecondsThroughUtc() {
        assertEquals("2026-10-10T00:05:09Z", AlarmClock.localToIso("2026-10-10", "08:05:09", shanghai))
        assertEquals("2026-10-10T15:59:59Z", AlarmClock.localToIso("2026-10-10", "23:59:59", shanghai))
        assertEquals(9, AlarmClock.parseClock("08:05:09")?.second)
    }

    @Test
    fun rejectsImpossibleClocksAndExplainsPastTimes() {
        assertNull(AlarmClock.localToIso("2026-10-10", "24:00:00", shanghai))
        assertEquals(
            "不能设置过去或 30 秒内的时间",
            AlarmClock.alarmProblem("2026-10-10", "08:05:09", Instant.parse("2026-10-10T00:05:09Z"), shanghai),
        )
    }

    @Test
    fun previewAndDefaultKeepTheSecondField() {
        assertEquals("2026-10-10 08:30:15", AlarmClock.preview("2026-10-10", "08:30:15"))
        val now = ZonedDateTime.parse("2026-10-10T08:00:10+08:00")
        val (date, time) = AlarmClock.defaultSelection(now)
        assertEquals("2026-10-10", date)
        assertEquals("08:05:10", time)
        assertTrue(AlarmClock.localToIso(date, time, shanghai)!!.endsWith(":10Z") || AlarmClock.localToIso(date, time, shanghai)!!.contains(":05:10"))
    }
}
