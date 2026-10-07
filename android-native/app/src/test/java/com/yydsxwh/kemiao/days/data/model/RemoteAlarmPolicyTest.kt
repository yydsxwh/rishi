package com.yydsxwh.kemiao.days.data.model

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.ZoneId

class RemoteAlarmPolicyTest {
    @Test
    fun requestCodeStaysStableAndPositive() {
        val first = RemoteAlarmPolicy.requestCode("ra_lunch")
        assertEquals(first, RemoteAlarmPolicy.requestCode("ra_lunch"))
        assertTrue(first > 0)
        assertNotEquals(first, RemoteAlarmPolicy.requestCode("ra_other"))
    }

    @Test
    fun convertsUtcInstantIntoTheSavedTimezone() {
        val millis = RemoteAlarmPolicy.triggerMillis("2026-10-08T02:30:00Z")
        assertEquals(1_791_426_600_000L, millis)
        val text = RemoteAlarmPolicy.describeTrigger("2026-10-08T02:30:00Z", "Asia/Shanghai", ZoneId.of("Asia/Shanghai"))
        assertEquals("10月8日 10:30（你的当前时区）", text)
        val traveled = RemoteAlarmPolicy.describeTrigger("2026-10-08T02:30:00Z", "Asia/Shanghai", ZoneId.of("UTC"))
        assertTrue(traveled.contains("02:30"))
        assertTrue(traveled.contains("10月8日 10:30"))
        assertTrue(traveled.contains("Asia/Shanghai"))
    }

    @Test
    fun bootRestoresFutureAlarmsAndDropsExpiredOnes() {
        val trigger = RemoteAlarmPolicy.triggerMillis("2026-10-08T02:30:00Z")
        assertEquals("restore", RemoteAlarmPolicy.bootAction("DEVICE_SCHEDULED", trigger, trigger - 60_000))
        assertEquals("missed", RemoteAlarmPolicy.bootAction("DEVICE_SCHEDULED", trigger, trigger + 1))
        assertEquals("drop", RemoteAlarmPolicy.bootAction("CANCELLED", trigger, trigger - 60_000))
        assertEquals("drop", RemoteAlarmPolicy.bootAction("EXPIRED", trigger, trigger - 60_000))
        assertEquals("drop", RemoteAlarmPolicy.bootAction("FIRED", trigger, trigger - 60_000))
        assertEquals("drop", RemoteAlarmPolicy.bootAction("FAILED", trigger, trigger - 60_000))
        assertEquals("drop", RemoteAlarmPolicy.bootAction("MISSED", trigger, trigger - 60_000))
    }

    @Test
    fun cancelUsesTheSameRequestCodeSoRescheduleReplacesIt() {
        val code = RemoteAlarmPolicy.requestCode("ra_lunch")
        assertEquals(code, RemoteAlarmPolicy.requestCode("ra_lunch"))
    }

    @Test
    fun lateDeliveryDoesNotRing() {
        val trigger = 1_000_000L
        assertTrue(RemoteAlarmPolicy.shouldRing(trigger, trigger + 1_000))
        assertFalse(RemoteAlarmPolicy.shouldRing(trigger, trigger + RemoteAlarmPolicy.RING_GRACE_MS + 1))
    }
}
