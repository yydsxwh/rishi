package com.yydsxwh.kemiao.days.data.model

/** 只告诉用户去系统设置里打开权限，不调用厂商私有接口。 */
object OemGuides {
    fun forManufacturer(name: String): Pair<String, List<String>> {
        val hint = name.lowercase()
        return when {
            hint.contains("samsung") -> "Samsung" to listOf(
                "设置 → 应用 → 颗秒日事 → 电池 → 不受限制",
                "允许闹钟和提醒，通知里打开全屏意图",
            )
            hint.contains("xiaomi") || hint.contains("redmi") || hint.contains("poco") -> "Xiaomi" to listOf(
                "省电策略选无限制，并打开自启动",
                "允许精确闹钟和锁屏通知",
            )
            hint.contains("honor") || hint.contains("huawei") -> "Honor" to listOf(
                "电池里允许后台活动",
                "启动管理改为手动管理，允许自启动",
            )
            hint.contains("oppo") || hint.contains("realme") -> "OPPO" to listOf(
                "应用耗电管理允许完全后台行为",
                "允许自启动、锁屏显示和精确闹钟",
            )
            hint.contains("vivo") || hint.contains("iqoo") -> "vivo" to listOf(
                "后台耗电管理允许高耗电",
                "允许自启动、锁屏显示和精确闹钟",
            )
            hint.contains("google") || hint.contains("pixel") -> "Pixel" to listOf(
                "允许闹钟和提醒",
                "电池优化选不受限",
            )
            else -> "Android" to listOf(
                "允许通知和精确闹钟，电池优化设为不受限",
                "权限关闭、关机或没网时会显示失败，不会假装已经响铃",
            )
        }
    }
}
