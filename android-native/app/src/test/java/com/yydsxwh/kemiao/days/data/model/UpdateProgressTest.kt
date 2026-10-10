package com.yydsxwh.kemiao.days.data.model

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class UpdateProgressTest {
    @Test
    fun percentNeedsARealTotal() {
        assertEquals(68, UpdateProgress.percent(68L, 100L))
        assertEquals(100, UpdateProgress.percent(42_600_000L, 42_600_000L))
        assertNull(UpdateProgress.percent(1000L, null))
        assertNull(UpdateProgress.percent(1000L, 0L))
    }

    @Test
    fun speedUsesTheRecentWindow() {
        val samples = listOf(0L to 0L, 1_000L to 1_048_576L, 3_000L to 3_145_728L)
        val speed = UpdateProgress.smoothSpeed(samples, nowMs = 3_000L)
        assertEquals(3_145_728.0 * 1000.0 / 3_000.0, speed, 1.0)
        assertEquals("1.0 MB/s", UpdateProgress.speedLabel(1024.0 * 1024.0))
    }

    @Test
    fun etaIsOmittedWhenSizeOrSpeedIsUnknown() {
        assertEquals(5L, UpdateProgress.remainingSeconds(0L, 5L * 3_200_000L, 3_200_000.0))
        assertNull(UpdateProgress.remainingSeconds(10L, null, 1000.0))
        assertNull(UpdateProgress.remainingSeconds(10L, 100L, 0.0))
        assertEquals("预计剩余：5 秒", UpdateProgress.remainingLabel(5L))
    }
}
