package com.yydsxwh.kemiao.days.data.local

import android.content.Context

/** 只保存已经接到界面上的偏好。 */
class AppearanceStore(context: Context) {
    private val prefs = context.applicationContext.getSharedPreferences("kemiao-appearance", Context.MODE_PRIVATE)

    fun theme(): String = prefs.getString("theme", "system") ?: "system"
    fun setTheme(value: String) = prefs.edit().putString("theme", value).apply()

    fun fontScale(): Float = prefs.getFloat("font", 1f)
    fun setFontScale(value: Float) = prefs.edit().putFloat("font", value).apply()

    fun startPage(): String = prefs.getString("start", "today") ?: "today"
    fun setStartPage(value: String) = prefs.edit().putString("start", value).apply()

    fun autoSync(): Boolean = prefs.getBoolean("autoSync", true)
    fun setAutoSync(value: Boolean) = prefs.edit().putBoolean("autoSync", value).apply()

    fun pushProvider(): String = prefs.getString("pushProvider", "none") ?: "none"
    fun setPushProvider(value: String) = prefs.edit().putString("pushProvider", value).apply()
}
