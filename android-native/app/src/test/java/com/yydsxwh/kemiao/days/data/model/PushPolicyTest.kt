package com.yydsxwh.kemiao.days.data.model

import org.junit.Assert.assertEquals
import org.junit.Test

class PushPolicyTest {
    @Test
    fun mainlandPrefersVendorToken() {
        assertEquals("xiaomi", PushPolicy.choose("android", "cn", true, mapOf("xiaomi" to "x", "fcm" to "f")))
    }

    @Test
    fun overseasPrefersFcm() {
        assertEquals("fcm", PushPolicy.choose("android", "global", true, mapOf("huawei" to "h", "fcm" to "f")))
    }

    @Test
    fun missingTokenIsNone() {
        assertEquals("none", PushPolicy.choose("android", "cn", false, emptyMap()))
        assertEquals("cn", PushPolicy.region("CN", true))
        assertEquals("global", PushPolicy.region("US", true))
    }
}
