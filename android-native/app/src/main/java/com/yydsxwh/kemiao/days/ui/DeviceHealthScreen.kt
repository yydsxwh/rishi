package com.yydsxwh.kemiao.days.ui

import android.Manifest
import android.app.AlarmManager
import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import com.yydsxwh.kemiao.days.data.local.AppearanceStore
import com.yydsxwh.kemiao.days.data.local.SecureSession
import com.yydsxwh.kemiao.days.data.model.OemGuides
import com.yydsxwh.kemiao.days.location.LocationUploader

@Composable
fun DeviceHealthScreen() {
    val context = LocalContext.current
    val guide = OemGuides.forManufacturer(Build.MANUFACTURER)
    val rows = healthRows(context)
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text("设备检查", style = MaterialTheme.typography.titleLarge)
        Text("发送成功不等于手机一定会响。只有本机回执之后，对方才会看到「已成功设置到对方手机」。", style = MaterialTheme.typography.bodySmall)
        rows.forEach { (ok, text) -> Text("${if (ok) "✅" else "⚠️"} $text") }
        Text(guide.first, style = MaterialTheme.typography.titleMedium)
        guide.second.forEach { Text(it) }
        TextButton(onClick = {
            context.startActivity(Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, Uri.parse("package:${context.packageName}")))
        }) { Text("打开精确闹钟设置") }
        TextButton(onClick = {
            context.startActivity(Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:${context.packageName}")))
        }) { Text("打开电池限制设置") }
        Text("iPhone 远程系统闹钟：尚未验证，当前不能当成已支持。", style = MaterialTheme.typography.bodySmall)
    }
}

private fun healthRows(context: Context): List<Pair<Boolean, String>> {
    val signedIn = !SecureSession(context).token().isNullOrBlank()
    val alarm = context.getSystemService(AlarmManager::class.java)
    val exact = Build.VERSION.SDK_INT < Build.VERSION_CODES.S || alarm?.canScheduleExactAlarms() == true
    val notifications = if (Build.VERSION.SDK_INT >= 33) {
        ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED
    } else {
        context.getSystemService(NotificationManager::class.java).areNotificationsEnabled()
    }
    val power = context.getSystemService(PowerManager::class.java)
    val batteryOk = power?.isIgnoringBatteryOptimizations(context.packageName) == true
    val guard = AppearanceStore(context).wakeGuard()
    val guardNote = AppearanceStore(context).wakeGuardNote()
    val location = LocationUploader.hasForegroundPermission(context)
    val background = LocationUploader.hasBackgroundPermission(context)
    return listOf(
        signedIn to "登录",
        (guardNote.isBlank()) to (if (guard) "好友叫醒实时守护已开启" else "好友叫醒实时守护未开启。打开 App、回到前台和后台周期同步仍会检查") + if (guardNote.isBlank()) "" else "。$guardNote",
        true to "当前未配置厂商 Push。这不阻止好友叫醒。",
        notifications to "通知",
        exact to "精确闹钟",
        batteryOk to "电池后台限制",
        location to "定位",
        background to "后台定位。只有打开实时守护时才需要",
    )
}
