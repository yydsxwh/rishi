package com.yydsxwh.kemiao.days.data.model

import java.util.Locale

/** 更新进度的纯计算。没有总大小时不编造百分比和剩余时间。 */
object UpdateProgress {
    fun percent(read: Long, total: Long?): Int? {
        if (total == null || total <= 0L) return null
        return ((read.coerceAtLeast(0L) * 100L) / total).toInt().coerceIn(0, 100)
    }

    fun sizeLabel(bytes: Long): String {
        val safe = bytes.coerceAtLeast(0L)
        if (safe < 1024L) return "$safe B"
        val kb = safe / 1024.0
        if (kb < 1024.0) return String.format(Locale.US, "%.1f KB", kb)
        return String.format(Locale.US, "%.1f MB", kb / 1024.0)
    }

    fun speedLabel(bytesPerSecond: Double): String {
        if (bytesPerSecond < 1024.0) return String.format(Locale.US, "%.0f B/s", bytesPerSecond.coerceAtLeast(0.0))
        if (bytesPerSecond < 1024.0 * 1024.0) return String.format(Locale.US, "%.1f KB/s", bytesPerSecond / 1024.0)
        return String.format(Locale.US, "%.1f MB/s", bytesPerSecond / (1024.0 * 1024.0))
    }

    /** 用最近几秒的采样算平均速度，避免瞬间抖动。 */
    fun smoothSpeed(samples: List<Pair<Long, Long>>, nowMs: Long, windowMs: Long = 3_000L): Double {
        val recent = samples.filter { nowMs - it.first in 0..windowMs }
        if (recent.size < 2) return 0.0
        val first = recent.first()
        val last = recent.last()
        val elapsed = (last.first - first.first).coerceAtLeast(1L)
        val delta = (last.second - first.second).coerceAtLeast(0L)
        return delta * 1000.0 / elapsed
    }

    fun remainingSeconds(read: Long, total: Long?, bytesPerSecond: Double): Long? {
        if (total == null || total <= read || bytesPerSecond < 1.0) return null
        return ((total - read) / bytesPerSecond).toLong().coerceAtLeast(0L)
    }

    fun remainingLabel(seconds: Long?): String? {
        seconds ?: return null
        if (seconds < 60) return "预计剩余：$seconds 秒"
        val minutes = seconds / 60
        return "预计剩余：$minutes 分钟"
    }
}
