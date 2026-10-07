package com.yydsxwh.kemiao.days.data.model

import org.junit.Assert.assertEquals
import org.junit.Test

class OemGuidesTest {
    @Test
    fun brandsGetTheirOwnSteps() {
        assertEquals("Xiaomi", OemGuides.forManufacturer("Xiaomi").first)
        assertEquals("Honor", OemGuides.forManufacturer("HONOR").first)
        assertEquals("Samsung", OemGuides.forManufacturer("samsung").first)
        assertEquals("Android", OemGuides.forManufacturer("Nothing").first)
    }
}
