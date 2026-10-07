package com.yydsxwh.kemiao.days.data.model

/** 和日事服务端同一条规则：没有 token 的通道不能被选中。 */
object PushPolicy {
    fun choose(platform: String, region: String, gms: Boolean, tokens: Map<String, String>): String {
        fun has(id: String) = !tokens[id].isNullOrBlank()
        if (platform == "ios") return if (has("apns")) "apns" else "none"
        if (platform != "android") return "none"
        val vendor = listOf("huawei", "xiaomi", "oppo", "vivo", "honor").firstOrNull { has(it) }
        val fcm = gms && has("fcm")
        if (region == "global") return if (fcm) "fcm" else vendor ?: "none"
        return vendor ?: if (fcm) "fcm" else "none"
    }

    fun region(country: String, gms: Boolean): String = when {
        country.equals("CN", ignoreCase = true) -> "cn"
        gms -> "global"
        else -> "unknown"
    }
}
