package com.yydsxwh.kemiao.days.ui

import android.Manifest
import android.app.Application
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
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import com.yydsxwh.kemiao.days.data.local.SecureSession
import com.yydsxwh.kemiao.days.data.model.AppData
import com.yydsxwh.kemiao.days.data.model.RemoteAlarmPolicy
import com.yydsxwh.kemiao.days.data.remote.OwnerSettingsDto
import com.yydsxwh.kemiao.days.data.remote.RemoteAlarmClient
import com.yydsxwh.kemiao.days.data.remote.RemoteAlarmDto
import com.yydsxwh.kemiao.days.data.remote.RemoteAlarmException
import com.yydsxwh.kemiao.days.data.remote.RemoteGrantDto
import com.yydsxwh.kemiao.days.notify.ReminderScheduler
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneId
import java.time.ZonedDateTime
import java.util.UUID

data class WakeUi(
    val loading: Boolean = false,
    val error: String? = null,
    val notice: String? = null,
    val signedOut: Boolean = false,
    val given: List<RemoteGrantDto> = emptyList(),
    val targets: List<RemoteGrantDto> = emptyList(),
    val incoming: List<RemoteAlarmDto> = emptyList(),
    val outgoing: List<RemoteAlarmDto> = emptyList(),
    val settings: OwnerSettingsDto = OwnerSettingsDto(),
    val contacts: List<com.yydsxwh.kemiao.days.data.remote.ContactDto> = emptyList(),
    val directory: String = "",
    val audit: List<com.yydsxwh.kemiao.days.data.remote.AuditDto> = emptyList(),
)

class FriendWakeViewModel(app: Application) : AndroidViewModel(app) {
    private val session = SecureSession(app)
    private val client = RemoteAlarmClient(tokenProvider = { session.token() })
    private val _state = MutableStateFlow(WakeUi())
    val state: StateFlow<WakeUi> = _state

    fun refresh(data: AppData) {
        viewModelScope.launch {
            if (session.token().isNullOrBlank()) {
                _state.value = WakeUi(signedOut = true)
                return@launch
            }
            _state.update { it.copy(loading = true, error = null) }
            val result = withContext(Dispatchers.IO) {
                runCatching {
                    followEntities(data)
                    val grants = client.grants()
                    WakeUi(
                        given = grants.first,
                        targets = client.targets(),
                        incoming = client.alarms("incoming"),
                        outgoing = client.alarms("outgoing"),
                        settings = client.settings(),
                        audit = client.audit(),
                    )
                }
            }
            _state.value = result.getOrElse { error ->
                WakeUi(error = (error as? RemoteAlarmException)?.message ?: "暂时连不上好友叫醒")
            }
        }
    }

    fun search(query: String) {
        viewModelScope.launch(Dispatchers.IO) {
            val found = runCatching { client.contacts(query) }.getOrNull() ?: return@launch
            _state.update { it.copy(contacts = found.first, directory = found.second) }
        }
    }

    fun grant(scope: String, granteeId: String, granteeName: String, from: String, until: String, entityType: String, entityId: String, entityTitle: String, starts: String, ends: String, lead: Int, trail: Int, data: AppData) {
        viewModelScope.launch(Dispatchers.IO) {
            val result = runCatching {
                when (scope) {
                    "PERMANENT" -> client.grantPermanent(granteeId, granteeName)
                    "ENTITY_BOUND" -> client.grantEntity(granteeId, granteeName, entityType, entityId, entityTitle, starts, ends, lead, trail)
                    else -> client.grantRange(granteeId, granteeName, from, until)
                }
            }
            withContext(Dispatchers.Main) {
                result.onSuccess { refresh(data) }.onFailure { error -> _state.update { it.copy(error = messageOf(error)) } }
            }
        }
    }

    fun setGrantStatus(id: String, status: String, data: AppData) {
        mutate(data) { client.updateGrant(id, """{"status":"$status"}""") }
    }

    fun revoke(id: String, cancelFuture: Boolean, data: AppData) {
        mutate(data) { client.revokeGrant(id, cancelFuture) }
    }

    fun endEntity(id: String, data: AppData) {
        mutate(data) { client.updateGrant(id, """{"entityActive":false,"cancelFuture":true}""") }
    }

    fun createAlarm(ownerId: String, grantId: String, triggerAt: String, title: String, note: String, data: AppData) {
        viewModelScope.launch(Dispatchers.IO) {
            val result = runCatching {
                client.createAlarm(ownerId, grantId, triggerAt, ZoneId.systemDefault().id, title, note, UUID.randomUUID().toString())
            }
            withContext(Dispatchers.Main) {
                result.onSuccess { alarm ->
                    val text = if (alarm.deviceReady) "对方手机已成功设置闹钟" else "已发送，等待对方手机注册闹钟"
                    _state.update { it.copy(notice = text) }
                    refresh(data)
                }.onFailure { error -> _state.update { it.copy(error = messageOf(error)) } }
            }
        }
    }

    fun cancelAlarm(id: String, data: AppData) {
        mutate(data) { client.cancelAlarm(id) }
    }

    fun pauseAll(cancelFuture: Boolean, data: AppData) {
        mutate(data) { client.pauseAll(cancelFuture) }
    }

    fun resumeAll(data: AppData) {
        mutate(data) { client.resumeAll() }
    }

    fun saveLimits(hour: Int, day: Int, allowNight: Boolean, data: AppData) {
        mutate(data) {
            client.saveSettings("""{"maxPerHour":$hour,"maxPerDay":$day,"allowNight":$allowNight,"timezone":"${ZoneId.systemDefault().id}"}""")
        }
    }

    private fun mutate(data: AppData, block: () -> Unit) {
        viewModelScope.launch(Dispatchers.IO) {
            val result = runCatching { block() }
            withContext(Dispatchers.Main) {
                result.onSuccess { refresh(data) }.onFailure { error -> _state.update { it.copy(error = messageOf(error)) } }
            }
        }
    }

    private fun followEntities(data: AppData) {
        val (given, _) = client.grants()
        for (grant in given) {
            if (grant.scope != "ENTITY_BOUND" || grant.entityId.isNullOrBlank() || grant.status == "REVOKED" || grant.status == "EXPIRED") continue
            val id = grant.entityId
            if (data.tombstones.any { it.id == id }) {
                client.updateGrant(grant.id, """{"entityActive":false,"cancelFuture":true}""")
                continue
            }
            val window = entityWindow(data, grant.entityType.orEmpty(), id) ?: continue
            if (!sameInstant(grant.entityStartsAt, window.first) || !sameInstant(grant.entityEndsAt, window.second) || window.third != grant.entityTitle) {
                client.updateGrant(
                    grant.id,
                    """{"entityStartsAt":${q(window.first)},"entityEndsAt":${q(window.second)},"entityTitle":${q(window.third)},"leadHours":${grant.leadHours?.toInt() ?: 0},"trailHours":${grant.trailHours?.toInt() ?: 0}}""",
                )
            }
        }
    }

    private fun messageOf(error: Throwable) = (error as? RemoteAlarmException)?.message ?: "操作没有完成"
}

private fun q(value: String) = com.yydsxwh.kemiao.days.data.model.DaysJson.encodeToString(kotlinx.serialization.serializer<String>(), value)

private fun sameInstant(saved: String?, next: String): Boolean {
    if (saved.isNullOrBlank()) return false
    val left = runCatching { java.time.Instant.parse(saved) }.getOrNull() ?: return false
    val right = runCatching { java.time.Instant.parse(next) }.getOrNull() ?: return false
    return left == right
}

private fun entityWindow(data: AppData, type: String, id: String): Triple<String, String, String>? {
    val zone = ZoneId.systemDefault()
    fun at(date: String, time: String?): String? {
        val day = runCatching { LocalDate.parse(date) }.getOrNull() ?: return null
        val clock = time?.takeIf { it.length >= 4 }?.let {
            val parts = it.split(":")
            LocalTime.of(parts[0].toInt(), parts.getOrNull(1)?.toInt() ?: 0)
        } ?: LocalTime.of(9, 0)
        return ZonedDateTime.of(day, clock, zone).toInstant().toString()
    }
    return when (type) {
        "todo" -> {
            val todo = data.todos.find { it.id == id } ?: return null
            val date = todo.dueDate ?: return null
            val start = at(date, todo.dueTime) ?: return null
            Triple(start, at(date, todo.dueEndTime ?: todo.dueTime) ?: start, todo.title)
        }
        "event" -> {
            val event = data.calendarEvents.find { it.id == id } ?: return null
            val start = at(event.date, event.startTime) ?: return null
            Triple(start, at(event.date, event.endTime ?: event.startTime) ?: start, event.title)
        }
        "exam" -> {
            val exam = data.exams.find { it.id == id } ?: return null
            val start = at(exam.date, exam.startTime) ?: return null
            Triple(start, at(exam.date, exam.endTime ?: exam.startTime) ?: start, exam.name)
        }
        else -> null
    }
}

fun localToIso(date: String, time: String): String? {
    val day = runCatching { LocalDate.parse(date.trim()) }.getOrNull() ?: return null
    val parts = time.trim().split(":")
    val hour = parts.getOrNull(0)?.toIntOrNull() ?: return null
    val minute = parts.getOrNull(1)?.toIntOrNull() ?: return null
    if (hour !in 0..23 || minute !in 0..59) return null
    return ZonedDateTime.of(day, LocalTime.of(hour, minute), ZoneId.systemDefault()).toInstant().toString()
}

@Composable
fun FriendWakeScreen(data: AppData, model: FriendWakeViewModel = viewModel()) {
    val state by model.state.collectAsState()
    val context = LocalContext.current
    LaunchedEffect(data.updatedAt()) { model.refresh(data) }
    if (state.signedOut) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text("好友叫醒", style = MaterialTheme.typography.titleLarge)
            Text("先用账号中心登录。好友关系不等于可以给你设闹钟，只有你本人授权之后才行。")
        }
        return
    }
    LazyColumn(Modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        if (state.loading) item { LinearProgressIndicator(Modifier.fillMaxWidth()) }
        state.error?.let { message -> item { Text(message, color = MaterialTheme.colorScheme.error) } }
        state.notice?.let { message -> item { Text(message) } }
        item { HealthCard(context) }
        item { LimitCard(state.settings, data, model) }
        item { GrantCard(state, data, model) }
        item { SendCard(state, data, model) }
        item { AlarmList("收到的远程闹钟", state.incoming, data, model, incoming = true) }
        item { AlarmList("我发出的远程闹钟", state.outgoing, data, model, incoming = false) }
        item {
            Card(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text("授权记录", style = MaterialTheme.typography.titleMedium)
                    if (state.audit.isEmpty()) Text("还没有记录")
                    state.audit.take(12).forEach { event -> Text("${event.at.take(16).replace('T', ' ')} ${event.summary}") }
                }
            }
        }
    }
}

private fun AppData.updatedAt(): String = "${todos.size}:${calendarEvents.size}:${exams.size}:${tombstones.size}"

@Composable
private fun HealthCard(context: Context) {
    val exact = ReminderScheduler(context).canExact()
    val notifications = if (Build.VERSION.SDK_INT < 33) true else ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED
    val fullScreen = if (Build.VERSION.SDK_INT < 34) true else context.getSystemService(NotificationManager::class.java).canUseFullScreenIntent()
    val battery = context.getSystemService(PowerManager::class.java).isIgnoringBatteryOptimizations(context.packageName)
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text("好友叫醒可用性", style = MaterialTheme.typography.titleMedium)
            Text(if (notifications) "通知权限已开启" else "通知权限未开启")
            Text(if (exact) "精确闹钟已开启" else "精确闹钟未开启。未开启时不会显示成已设置到手机。")
            Text(if (fullScreen) "锁屏全屏提醒可用" else "系统不允许全屏闹钟，到点仍会响铃，但可能只显示通知")
            Text(if (battery) "已忽略电池优化" else "电池优化可能推迟后台同步")
            Text("推送要等站长配置 Firebase 后才能在应用完全退出时立刻送达。现在会在打开应用和大约每 15 分钟的后台同步里登记闹钟。")
            Text("小米、OPPO、vivo、荣耀、三星请在系统里允许日事后台运行。应用不能绕过厂商限制。", style = MaterialTheme.typography.bodySmall)
            if (!exact) TextButton(onClick = {
                context.startActivity(Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, Uri.parse("package:${context.packageName}")))
            }) { Text("去开启精确闹钟") }
            if (!notifications) TextButton(onClick = {
                context.startActivity(Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName))
            }) { Text("去开启通知") }
            if (!fullScreen && Build.VERSION.SDK_INT >= 34) TextButton(onClick = {
                context.startActivity(Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT).setData(Uri.parse("package:${context.packageName}")))
            }) { Text("去开启全屏提醒") }
            if (!battery) TextButton(onClick = {
                runCatching {
                    context.startActivity(Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:${context.packageName}")))
                }
            }) { Text("去查看电池优化") }
        }
    }
}

@Composable
private fun LimitCard(settings: OwnerSettingsDto, data: AppData, model: FriendWakeViewModel) {
    var hour by rememberSaveable { mutableStateOf(settings.maxPerHour.toString()) }
    var day by rememberSaveable { mutableStateOf(settings.maxPerDay.toString()) }
    var cancel by rememberSaveable { mutableStateOf(false) }
    LaunchedEffect(settings.maxPerHour, settings.maxPerDay) {
        hour = settings.maxPerHour.toString()
        day = settings.maxPerDay.toString()
    }
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(if (settings.pausedAll) "已暂停所有好友远程闹钟" else "正在接收已授权好友的远程闹钟", style = MaterialTheme.typography.titleMedium)
            if (settings.pausedAll) {
                Button(onClick = { model.resumeAll(data) }) { Text("恢复接收") }
            } else {
                if (cancel) {
                    Text("要取消这些好友已经设好、但还没响的闹钟吗？")
                    Row {
                        TextButton(onClick = { model.pauseAll(false, data); cancel = false }) { Text("只暂停，保留闹钟") }
                        TextButton(onClick = { model.pauseAll(true, data); cancel = false }) { Text("暂停并取消") }
                    }
                } else {
                    Button(onClick = { cancel = true }) { Text("暂停所有好友远程闹钟") }
                }
            }
            OutlinedTextField(hour, { hour = it }, label = { Text("每小时最多") })
            OutlinedTextField(day, { day = it }, label = { Text("每天最多") })
            Button(onClick = { model.saveLimits(hour.toIntOrNull() ?: 3, day.toIntOrNull() ?: 10, settings.allowNight, data) }) { Text("保存接收限制") }
            TextButton(onClick = { model.saveLimits(settings.maxPerHour, settings.maxPerDay, !settings.allowNight, data) }) {
                Text(if (settings.allowNight) "夜间允许响铃，点此关闭" else "夜间不响铃，点此允许")
            }
        }
    }
}

@Composable
private fun GrantCard(state: WakeUi, data: AppData, model: FriendWakeViewModel) {
    var query by rememberSaveable { mutableStateOf("") }
    var picked by rememberSaveable { mutableStateOf("") }
    var pickedName by rememberSaveable { mutableStateOf("") }
    var scope by rememberSaveable { mutableStateOf("TIME_RANGE") }
    var fromDate by rememberSaveable { mutableStateOf("") }
    var fromTime by rememberSaveable { mutableStateOf("20:00") }
    var untilDate by rememberSaveable { mutableStateOf("") }
    var untilTime by rememberSaveable { mutableStateOf("14:00") }
    var lead by rememberSaveable { mutableStateOf("24") }
    var trail by rememberSaveable { mutableStateOf("2") }
    var entityKey by rememberSaveable { mutableStateOf("") }
    var revokeId by rememberSaveable { mutableStateOf("") }
    val choices = buildList {
        data.todos.filter { !it.done && !it.dueDate.isNullOrBlank() }.forEach { add("todo:${it.id}" to "待办 ${it.title}") }
        data.calendarEvents.forEach { add("event:${it.id}" to "日程 ${it.title}") }
        data.exams.forEach { add("exam:${it.id}" to "考试 ${it.name}") }
    }
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text("谁可以给我设闹钟", style = MaterialTheme.typography.titleMedium)
            Text("默认谁都不行。kkchat 好友、同群、同一个待办都不会自动获得权限。", style = MaterialTheme.typography.bodySmall)
            if (state.given.isEmpty()) Text("还没有授权")
            state.given.forEach { grant ->
                val label = when (grant.scope) {
                    "PERMANENT" -> "永久有效，直到你主动撤销"
                    "ENTITY_BOUND" -> "仅限「${grant.entityTitle ?: "事项"}」"
                    else -> "${grant.validFrom.orEmpty().take(16)} - ${grant.validUntil.orEmpty().take(16)}"
                }
                Text("${grant.granteeName} · ${grant.status} · $label")
                Row {
                    if (grant.status == "ACTIVE") TextButton(onClick = { model.setGrantStatus(grant.id, "PAUSED", data) }) { Text("暂停") }
                    if (grant.status == "PAUSED") TextButton(onClick = { model.setGrantStatus(grant.id, "ACTIVE", data) }) { Text("恢复") }
                    TextButton(onClick = { revokeId = grant.id }) { Text("撤销") }
                    if (grant.scope == "ENTITY_BOUND") TextButton(onClick = { model.endEntity(grant.id, data) }) { Text("事项已取消") }
                }
            }
            OutlinedTextField(query, { query = it }, label = { Text("KK 号、用户名或 usr_ 账号") })
            TextButton(onClick = { model.search(query) }) { Text("查找") }
            if (state.directory == "unconfigured") Text("账号目录还没配置。可以填写对方的 usr_ 账号 ID，只有你点授权后对方才能设闹钟。", style = MaterialTheme.typography.bodySmall)
            state.contacts.forEach { contact ->
                TextButton(onClick = { picked = contact.sub; pickedName = contact.name }) { Text("${contact.name} ${contact.username ?: ""} ${contact.kkNumber ?: ""}") }
            }
            OutlinedTextField(picked, { picked = it }, label = { Text("对方账号 ID") })
            OutlinedTextField(pickedName, { pickedName = it }, label = { Text("显示名") })
            Row {
                TextButton(onClick = { scope = "TIME_RANGE" }) { Text(if (scope == "TIME_RANGE") "一段时间 ✓" else "一段时间") }
                TextButton(onClick = { scope = "PERMANENT" }) { Text(if (scope == "PERMANENT") "永久 ✓" else "永久") }
                TextButton(onClick = { scope = "ENTITY_BOUND" }) { Text(if (scope == "ENTITY_BOUND") "跟随事项 ✓" else "跟随事项") }
            }
            if (scope == "PERMANENT") Text("永久有效，直到你主动撤销")
            if (scope == "TIME_RANGE") {
                OutlinedTextField(fromDate, { fromDate = it }, label = { Text("开始日期 2026-10-07") })
                OutlinedTextField(fromTime, { fromTime = it }, label = { Text("开始时间") })
                OutlinedTextField(untilDate, { untilDate = it }, label = { Text("结束日期") })
                OutlinedTextField(untilTime, { untilTime = it }, label = { Text("结束时间") })
            }
            if (scope == "ENTITY_BOUND") {
                choices.forEach { (key, label) ->
                    TextButton(onClick = { entityKey = key }) { Text(if (entityKey == key) "$label ✓" else label) }
                }
                OutlinedTextField(lead, { lead = it }, label = { Text("事项前几小时开始") })
                OutlinedTextField(trail, { trail = it }, label = { Text("事项后几小时结束") })
            }
            Button(onClick = {
                val name = pickedName.ifBlank { "好友" }
                when (scope) {
                    "PERMANENT" -> model.grant(scope, picked, name, "", "", "", "", "", "", "", 0, 0, data)
                    "ENTITY_BOUND" -> {
                        val type = entityKey.substringBefore(":")
                        val id = entityKey.substringAfter(":")
                        val window = entityWindow(data, type, id)
                        if (window == null) return@Button
                        model.grant(scope, picked, name, "", "", type, id, window.third, window.first, window.second, lead.toIntOrNull() ?: 0, trail.toIntOrNull() ?: 0, data)
                    }
                    else -> {
                        val from = localToIso(fromDate, fromTime) ?: return@Button
                        val until = localToIso(untilDate, untilTime) ?: return@Button
                        model.grant(scope, picked, name, from, until, "", "", "", "", "", 0, 0, data)
                    }
                }
            }) { Text("授权这位好友") }
        }
    }
    if (revokeId.isNotBlank()) {
        AlertDialog(
            onDismissRequest = { revokeId = "" },
            title = { Text("撤销授权") },
            text = { Text("是否同时取消该好友已经为你设置、但尚未触发的未来闹钟？") },
            confirmButton = {
                TextButton(onClick = { model.revoke(revokeId, true, data); revokeId = "" }) { Text("撤销并取消闹钟") }
            },
            dismissButton = {
                TextButton(onClick = { model.revoke(revokeId, false, data); revokeId = "" }) { Text("只撤销权限") }
            },
        )
    }
}

@Composable
private fun SendCard(state: WakeUi, data: AppData, model: FriendWakeViewModel) {
    var grantId by rememberSaveable { mutableStateOf("") }
    var date by rememberSaveable { mutableStateOf("") }
    var time by rememberSaveable { mutableStateOf("10:30") }
    var title by rememberSaveable { mutableStateOf("起床啦") }
    var note by rememberSaveable { mutableStateOf("") }
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text("我可以给谁设闹钟", style = MaterialTheme.typography.titleMedium)
            val open = state.targets.filter { it.canCreate }
            if (open.isEmpty()) Text("还没有人授权你。对方授权后才会出现在这里。")
            open.forEach { target ->
                TextButton(onClick = { grantId = target.id }) { Text(if (grantId == target.id) "${target.ownerName} ✓" else target.ownerName) }
            }
            OutlinedTextField(date, { date = it }, label = { Text("日期 2026-10-08") })
            OutlinedTextField(time, { time = it }, label = { Text("时间") })
            OutlinedTextField(title, { title = it }, label = { Text("标题") })
            OutlinedTextField(note, { note = it }, label = { Text("备注") })
            Button(onClick = {
                val target = open.find { it.id == grantId } ?: return@Button
                val trigger = localToIso(date, time) ?: return@Button
                model.createAlarm(target.ownerUserId, target.id, trigger, title, note, data)
            }) { Text("设置闹钟") }
            Text("发送成功只表示请求已交给服务器。对方手机用系统闹钟登记之后，这里才会变成已设置。", style = MaterialTheme.typography.bodySmall)
        }
    }
}

@Composable
private fun AlarmList(title: String, alarms: List<RemoteAlarmDto>, data: AppData, model: FriendWakeViewModel, incoming: Boolean) {
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text(title, style = MaterialTheme.typography.titleMedium)
            if (alarms.isEmpty()) Text("没有记录")
            alarms.forEach { alarm ->
                val whenText = runCatching { RemoteAlarmPolicy.describeTrigger(alarm.triggerAt, alarm.timezone) }.getOrDefault(alarm.triggerAt)
                val who = if (incoming) alarm.creatorName else alarm.ownerUserId
                Text("$who · ${alarm.title} · $whenText")
                Text(statusText(alarm.status, alarm.deviceReady))
                if (alarm.entityTitle.isNotBlank()) Text("关联：${alarm.entityTitle}")
                if (alarm.status in setOf("DELIVERY_PENDING", "DELIVERED", "DEVICE_SCHEDULED", "CREATED")) {
                    TextButton(onClick = { model.cancelAlarm(alarm.id, data) }) { Text("取消") }
                }
            }
        }
    }
}

private fun statusText(status: String, deviceReady: Boolean): String = when {
    deviceReady && status == "FIRED" -> "已响铃"
    deviceReady -> "对方手机已成功设置闹钟"
    status == "MISSED" -> "错过了，没有补响"
    status == "CANCELLED" -> "已取消"
    status == "FAILED" -> "手机没能登记闹钟"
    status == "EXPIRED" -> "授权已失效"
    else -> "已发送，等待对方手机注册闹钟"
}
