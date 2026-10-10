package com.yydsxwh.kemiao.days.ui

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import com.yydsxwh.kemiao.days.BuildConfig
import com.yydsxwh.kemiao.days.app.DaysUiState
import com.yydsxwh.kemiao.days.app.DaysViewModel
import com.yydsxwh.kemiao.days.data.local.AppearanceStore
import com.yydsxwh.kemiao.days.data.model.OemGuides
import com.yydsxwh.kemiao.days.data.remote.AppVersionDto
import com.yydsxwh.kemiao.days.data.remote.DaysApi
import com.yydsxwh.kemiao.days.data.sync.SyncWorker
import com.yydsxwh.kemiao.days.notify.WakeGuardService
import com.yydsxwh.kemiao.days.update.AppUpdateController
import com.yydsxwh.kemiao.days.ui.theme.Brand
import com.yydsxwh.kemiao.days.ui.theme.Muted
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

@Composable
fun ProfileScreen(state: DaysUiState, vm: DaysViewModel, activity: Activity, onOpenWake: () -> Unit, onOpenGuard: () -> Unit) {
    val appearance = AppearanceStore(activity)
    val importPicker = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri != null) vm.importBackup(activity, uri)
    }
    var autoSync by remember { mutableStateOf(appearance.autoSync()) }
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Text("个人中心", style = MaterialTheme.typography.titleLarge)
        val user = state.user
        if (user == null) {
            Text("还没有登录。日程仍留在这台手机上。")
            Button(onClick = { vm.login(activity) }) { Text("用账号中心登录") }
        } else {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Avatar(user.name, user.avatarUrl, 64)
                Column {
                    Text(user.name ?: "已登录", fontWeight = FontWeight.SemiBold)
                    Text(maskEmail(user.email), color = Muted)
                }
            }
            Text("账号中心这次登录带回了昵称和头像。手机号、KK 号和微信绑定状态没有出现在日事会话里，这里不另造一份。", style = MaterialTheme.typography.bodySmall, color = Muted)
            Text("用户 ID", fontWeight = FontWeight.SemiBold)
            Text(user.accountSub, style = MaterialTheme.typography.bodySmall)
            Text("当前设备：${android.os.Build.MANUFACTURER} ${android.os.Build.MODEL}", style = MaterialTheme.typography.bodySmall)
        }
        Card(Modifier.fillMaxWidth()) {
            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("云同步", fontWeight = FontWeight.SemiBold)
                Text(syncText(state))
                state.lastSyncedAt?.let { Text("最后同步：${formatTime(it)}", style = MaterialTheme.typography.bodySmall, color = Muted) }
                if (state.pending) Text("有还没同步到云端的修改")
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("自动同步", Modifier.weight(1f))
                    Switch(autoSync, {
                        autoSync = it
                        appearance.setAutoSync(it)
                        SyncWorker.setAutomatic(activity, it)
                    })
                }
                Button(onClick = { vm.syncNow() }, enabled = user != null) { Text("立即同步") }
                state.error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
            }
        }
        TextButton(onClick = onOpenWake) { Text("远程闹钟授权") }
        TextButton(onClick = onOpenGuard) { Text("位置守护授权") }
        TextButton(onClick = { activity.startActivity(Intent.createChooser(vm.shareBackup(), "导出日事备份")) }) { Text("导出备份") }
        TextButton(onClick = { importPicker.launch(arrayOf("application/json", "text/plain")) }) { Text("导入备份") }
        TextButton(onClick = {
            coil.Coil.imageLoader(activity).memoryCache?.clear()
        }) { Text("清理图片缓存") }
        if (user != null) TextButton(onClick = { vm.logout() }) { Text("退出登录") }
    }
}

@Composable
fun SettingsScreen(state: DaysUiState, vm: DaysViewModel, activity: Activity, onOpenHealth: () -> Unit, onOpenAbout: () -> Unit) {
    val appearance = AppearanceStore(activity)
    var theme by remember { mutableStateOf(appearance.theme()) }
    val guide = OemGuides.forManufacturer(android.os.Build.MANUFACTURER)
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text("设置", style = MaterialTheme.typography.titleLarge)
        Text("通用", fontWeight = FontWeight.SemiBold)
        Row {
            listOf("system" to "跟随系统", "light" to "浅色", "dark" to "深色").forEach { (id, label) ->
                TextButton(onClick = {
                    theme = id
                    appearance.setTheme(id)
                    activity.recreate()
                }) { Text(if (theme == id) "$label ✓" else label) }
            }
        }
        Row {
            listOf(0.9f to "较小", 1f to "标准", 1.15f to "较大").forEach { (scale, label) ->
                TextButton(onClick = {
                    appearance.setFontScale(scale)
                    activity.recreate()
                }) { Text(if (appearance.fontScale() == scale) "$label ✓" else label) }
            }
        }
        Text("一周从周一开始或周日开始", style = MaterialTheme.typography.bodySmall, color = Muted)
        Row {
            TextButton(onClick = { vm.updateTimetable(state.data.timetableView.copy(weekStartsOn = 1)) }) {
                Text(if (state.data.timetableView.weekStartsOn != 7) "周一 ✓" else "周一")
            }
            TextButton(onClick = { vm.updateTimetable(state.data.timetableView.copy(weekStartsOn = 7)) }) {
                Text(if (state.data.timetableView.weekStartsOn == 7) "周日 ✓" else "周日")
            }
        }
        Text("上课默认提前 ${state.data.reminderSettings.classDefaultMinutes} 分钟", style = MaterialTheme.typography.bodySmall)
        Row {
            listOf(5, 15, 30).forEach { minutes ->
                TextButton(onClick = { vm.updateReminders(state.data.reminderSettings.copy(classDefaultMinutes = minutes)) }) {
                    Text(if (state.data.reminderSettings.classDefaultMinutes == minutes) "$minutes ✓" else "$minutes")
                }
            }
        }
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("显示中国节假日", Modifier.weight(1f))
            Switch(state.data.holidaySettings.showCn, { vm.updateHolidaySettings(state.data.holidaySettings.copy(showCn = it)) })
        }
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("显示传统节日", Modifier.weight(1f))
            Switch(state.data.holidaySettings.showTraditional, { vm.updateHolidaySettings(state.data.holidaySettings.copy(showTraditional = it)) })
        }
        Text("启动打开", style = MaterialTheme.typography.bodySmall, color = Muted)
        Row {
            listOf("today" to "我的一天", "calendar" to "日历", "timetable" to "时间表").forEach { (id, label) ->
                TextButton(onClick = { appearance.setStartPage(id) }) {
                    Text(if (appearance.startPage() == id) "$label ✓" else label)
                }
            }
        }
        Text("界面目前是中文。时间沿用 24 小时制，没有单独的 12 小时开关。", style = MaterialTheme.typography.bodySmall, color = Muted)
        Text("通知与后台", fontWeight = FontWeight.SemiBold)
        var wakeGuard by remember { mutableStateOf(appearance.wakeGuard()) }
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("好友叫醒实时守护", Modifier.weight(1f))
            Switch(wakeGuard, { checked ->
                wakeGuard = checked
                appearance.setWakeGuard(checked)
                if (checked) runCatching { WakeGuardService.start(activity) }
                else {
                    appearance.setWakeGuardNote("")
                    runCatching { WakeGuardService.stop(activity) }
                }
            })
        }
        Text("开启后会显示常驻通知「颗秒日事 · 好友叫醒守护中」，可随时关闭。当前未配置厂商 Push 也能接收。", style = MaterialTheme.typography.bodySmall, color = Muted)
        appearance.wakeGuardNote().takeIf { it.isNotBlank() }?.let { Text(it) }
        Text("当前推送通道：${pushLabel(appearance.pushProvider())}")
        Text("${guide.first}：${guide.second.firstOrNull().orEmpty()}", style = MaterialTheme.typography.bodySmall)
        TextButton(onClick = onOpenHealth) { Text("打开设备检查") }
        Text("隐私与安全", fontWeight = FontWeight.SemiBold)
        Text("可信联系人、远程闹钟和位置守护在时间表的提醒里。", style = MaterialTheme.typography.bodySmall, color = Muted)
        TextButton(onClick = onOpenAbout) { Text("关于颗秒日事") }
    }
}

@Composable
fun AboutScreen(activity: Activity) {
    var version by remember { mutableStateOf<AppVersionDto?>(null) }
    var message by remember { mutableStateOf("") }
    val scope = rememberCoroutineScope()
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text("关于颗秒日事", style = MaterialTheme.typography.titleLarge)
        Text("颗秒日事")
        Text("版本 ${BuildConfig.VERSION_NAME}（${BuildConfig.VERSION_CODE}）")
        Text(BuildConfig.APPLICATION_ID, style = MaterialTheme.typography.bodySmall, color = Muted)
        TextButton(onClick = { activity.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("https://www.yydsxwh.com"))) }) { Text("官方网站") }
        TextButton(onClick = { activity.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("https://www.yydsxwh.com/privacy"))) }) { Text("隐私政策") }
        TextButton(onClick = { activity.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("https://www.yydsxwh.com/terms"))) }) { Text("用户协议") }
        TextButton(onClick = { activity.startActivity(Intent(Intent.ACTION_SENDTO, Uri.parse("mailto:yydsxwh@gmail.com"))) }) { Text("反馈") }
        Text("© 歪歪滴艾斯", color = Muted)
        Button(onClick = {
            scope.launch {
                val remote = withContext(Dispatchers.IO) { runCatching { DaysApi(tokenProvider = { null }).appVersion() }.getOrNull() }
                version = remote
                message = when {
                    remote == null -> "暂时连不上版本服务，当前版本仍可使用"
                    remote.latestVersionCode > BuildConfig.VERSION_CODE -> "发现 ${remote.latestVersionName}"
                    else -> "已是最新版本"
                }
            }
        }) { Text("检查更新") }
        if (message.isNotBlank()) Text(message)
        version?.takeIf { it.latestVersionCode > BuildConfig.VERSION_CODE }?.let { remote ->
            Text(remote.releaseNotes)
            Button(onClick = {
                AppUpdateController.start(activity, remote.latestVersionName, remote.latestVersionCode, remote.downloadUrl, remote.sha256)
            }) { Text("立即更新") }
        }
        val update by AppUpdateController.state.collectAsState()
        UpdateProgressCard(
            update,
            onPause = { AppUpdateController.pause() },
            onResume = { AppUpdateController.resume(activity) },
            onCancel = { AppUpdateController.cancel(activity) },
            onRetry = { AppUpdateController.retry(activity) },
            onInstallPermission = { AppUpdateController.openInstallSettings(activity) },
        )
    }
}

fun beginOfficialUpdate(activity: Activity, version: AppVersionDto) {
    AppUpdateController.start(activity, version.latestVersionName, version.latestVersionCode, version.downloadUrl, version.sha256)
}

@Composable
fun UpdateDialog(version: AppVersionDto, onLater: () -> Unit, onUpdate: () -> Unit) {
    AlertDialog(
        onDismissRequest = { if (!version.forceUpdate) onLater() },
        title = { Text(if (version.forceUpdate) "需要更新后继续使用" else "发现新版本") },
        text = { Text("当前 ${BuildConfig.VERSION_NAME}，最新 ${version.latestVersionName}\n${version.releaseNotes}") },
        confirmButton = { TextButton(onClick = onUpdate) { Text("立即更新") } },
        dismissButton = { if (!version.forceUpdate) TextButton(onClick = onLater) { Text("稍后") } },
    )
}

@Composable
fun Avatar(name: String?, url: String?, size: Int) {
    val letter = name?.trim()?.firstOrNull()?.toString() ?: "我"
    if (!url.isNullOrBlank()) {
        AsyncImage(url, contentDescription = name ?: "头像", modifier = Modifier.size(size.dp).clip(CircleShape), contentScale = ContentScale.Crop)
    } else {
        Box(Modifier.size(size.dp).clip(CircleShape).background(Brand), contentAlignment = Alignment.Center) {
            Text(letter, color = androidx.compose.ui.graphics.Color.White, fontWeight = FontWeight.Bold)
        }
    }
}

fun installOfficialUpdate(activity: Activity, url: String) {
    AppUpdateController.start(activity, "", 0, url, "")
}

private fun maskEmail(email: String?): String {
    if (email.isNullOrBlank()) return "邮箱未返回"
    val parts = email.split("@")
    if (parts.size != 2) return "邮箱未返回"
    return "${parts[0].take(1)}***@${parts[1]}"
}

private fun syncText(state: DaysUiState) = when (state.sync) {
    com.yydsxwh.kemiao.days.data.sync.SyncState.Synced -> "已同步"
    com.yydsxwh.kemiao.days.data.sync.SyncState.Syncing -> "正在同步"
    com.yydsxwh.kemiao.days.data.sync.SyncState.Offline -> "离线，改动留在本机"
    com.yydsxwh.kemiao.days.data.sync.SyncState.Error -> "同步出错"
    com.yydsxwh.kemiao.days.data.sync.SyncState.SignedOut -> "未登录"
    com.yydsxwh.kemiao.days.data.sync.SyncState.LocalOnly -> "本机模式"
    com.yydsxwh.kemiao.days.data.sync.SyncState.Starting -> "正在检查登录"
}

private fun formatTime(millis: Long): String = Instant.ofEpochMilli(millis).atZone(ZoneId.systemDefault()).format(DateTimeFormatter.ofPattern("M月d日 HH:mm"))

private fun pushLabel(provider: String) = when (provider) {
    "fcm" -> "FCM（已拿到 token）"
    "huawei", "xiaomi", "oppo", "vivo", "honor" -> "$provider（已拿到 token）"
    else -> "未配置厂商 Push。实时守护、打开应用和后台同步仍会拉取"
}

object LaunchGate {
    var applied = false
    var updateDismissed = false
}
