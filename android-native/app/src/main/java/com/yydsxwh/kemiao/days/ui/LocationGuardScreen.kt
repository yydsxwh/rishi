package com.yydsxwh.kemiao.days.ui

import android.Manifest
import android.app.Application
import android.content.pm.PackageManager
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import com.google.android.gms.tasks.CancellationTokenSource
import com.yydsxwh.kemiao.days.BuildConfig
import com.yydsxwh.kemiao.days.data.local.SecureSession
import com.yydsxwh.kemiao.days.data.remote.LocationClient
import com.yydsxwh.kemiao.days.data.remote.LocationGrantDto
import com.yydsxwh.kemiao.days.data.remote.LocationViewDto
import com.yydsxwh.kemiao.days.data.remote.RemoteAlarmClient
import com.yydsxwh.kemiao.days.data.remote.RemoteAlarmException
import com.yydsxwh.kemiao.days.data.remote.ResolvedAccountDto
import com.yydsxwh.kemiao.days.location.LocationShareService
import com.yydsxwh.kemiao.days.location.LocationUploader
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import java.time.Instant

data class GuardUi(
    val error: String? = null,
    val notice: String? = null,
    val given: List<LocationGrantDto> = emptyList(),
    val received: List<LocationGrantDto> = emptyList(),
    val pending: ResolvedAccountDto? = null,
    val view: LocationViewDto? = null,
    val viewName: String = "",
)

class LocationGuardViewModel(app: Application) : AndroidViewModel(app) {
    private val session = SecureSession(app)
    private val client = LocationClient { session.token() }
    private val accounts = RemoteAlarmClient(tokenProvider = { session.token() })
    private val _state = MutableStateFlow(GuardUi())
    val state: StateFlow<GuardUi> = _state

    fun refresh() {
        viewModelScope.launch(Dispatchers.IO) {
            val result = runCatching { client.grants() }
            withContext(Dispatchers.Main) {
                result.onSuccess { (given, received) -> _state.value = _state.value.copy(given = given, received = received, error = null) }
                    .onFailure { error -> _state.value = _state.value.copy(error = (error as? RemoteAlarmException)?.message ?: "请先登录") }
            }
        }
    }

    fun resolve(identifier: String) {
        viewModelScope.launch(Dispatchers.IO) {
            val result = runCatching { accounts.resolveAccount(identifier) }
            withContext(Dispatchers.Main) {
                result.onSuccess { _state.value = _state.value.copy(pending = it, error = null) }
                    .onFailure { error -> _state.value = _state.value.copy(error = (error as? RemoteAlarmException)?.message ?: "没有找到可授权的账号，请核对输入内容", pending = null) }
            }
        }
    }

    fun clearPending() {
        _state.value = _state.value.copy(pending = null)
    }

    fun grant(person: ResolvedAccountDto, scope: String, mode: String, precision: String, from: String, until: String) {
        viewModelScope.launch(Dispatchers.IO) {
            val json = buildString {
                append("""{"granteeUserId":${q(person.userSub)},"granteeName":${q(person.displayName)},"scope":${q(scope)},"mode":${q(mode)},"precision":${q(precision)}""")
                if (scope == "TIME_RANGE") append(""","validFrom":${q(from)},"validUntil":${q(until)}""")
                append("}")
            }
            val result = runCatching { client.create(json) }
            withContext(Dispatchers.Main) {
                result.onSuccess {
                    _state.value = _state.value.copy(notice = "已授权查看位置。这不会让对方给你设闹钟。", pending = null)
                    refresh()
                }.onFailure { error -> _state.value = _state.value.copy(error = (error as? RemoteAlarmException)?.message ?: "授权失败") }
            }
        }
    }

    fun pauseAll() = act { client.pauseAll() }
    fun resumeAll() = act { client.resumeAll() }
    fun pause(id: String) = act { client.pause(id) }
    fun resume(id: String) = act { client.resume(id) }
    fun revoke(id: String) = act { client.revoke(id) }

    fun open(grant: LocationGrantDto) {
        viewModelScope.launch(Dispatchers.IO) {
            val result = runCatching { client.view(grant.ownerUserId) }
            withContext(Dispatchers.Main) {
                result.onSuccess { _state.value = _state.value.copy(view = it, viewName = grant.ownerName, error = null) }
                    .onFailure { error -> _state.value = _state.value.copy(view = null, error = (error as? RemoteAlarmException)?.message ?: "现在看不到位置") }
            }
        }
    }

    fun upload(latitude: Double, longitude: Double, accuracy: Float) {
        viewModelScope.launch(Dispatchers.IO) {
            val body = """{"latitude":$latitude,"longitude":$longitude,"accuracyMeters":$accuracy,"capturedAt":"${Instant.now()}","source":"GPS"}"""
            runCatching { client.upload(body) }
            withContext(Dispatchers.Main) { _state.value = _state.value.copy(notice = "已更新最近位置") }
        }
    }

    private fun act(block: () -> Unit) {
        viewModelScope.launch(Dispatchers.IO) {
            val result = runCatching { block() }
            withContext(Dispatchers.Main) {
                result.onFailure { error -> _state.value = _state.value.copy(error = (error as? RemoteAlarmException)?.message ?: "操作失败") }
                refresh()
            }
        }
    }

    private fun q(value: String) = "\"" + value.replace("\\", "\\\\").replace("\"", "") + "\""
}

@Composable
fun LocationGuardScreen(model: LocationGuardViewModel = viewModel()) {
    val state by model.state.collectAsState()
    val context = androidx.compose.ui.platform.LocalContext.current
    var identifier by rememberSaveable { mutableStateOf("") }
    var chosen by remember { mutableStateOf<ResolvedAccountDto?>(null) }
    var scope by rememberSaveable { mutableStateOf("PERMANENT") }
    var mode by rememberSaveable { mutableStateOf("LAST_KNOWN") }
    var precision by rememberSaveable { mutableStateOf("APPROXIMATE") }
    LaunchedEffect(Unit) { model.refresh() }
    val permission = rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { granted ->
        if (granted.values.any { it }) {
            val fused = LocationServices.getFusedLocationProviderClient(context)
            fused.getCurrentLocation(Priority.PRIORITY_BALANCED_POWER_ACCURACY, CancellationTokenSource().token)
                .addOnSuccessListener { location ->
                    if (location != null) model.upload(location.latitude, location.longitude, location.accuracy)
                }
        }
    }
    LazyColumn(Modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        item { Text("位置守护", style = MaterialTheme.typography.titleLarge) }
        item { Text("谁可以看位置，和谁可以设闹钟，是分开的。默认谁都不能看。", style = MaterialTheme.typography.bodySmall) }
        state.error?.let { item { Text(it, color = MaterialTheme.colorScheme.error) } }
        state.notice?.let { item { Text(it) } }
        item {
            TextButton(onClick = { model.pauseAll() }) { Text("暂停全部位置共享") }
            TextButton(onClick = { model.resumeAll() }) { Text("恢复位置共享") }
            TextButton(onClick = {
                val needed = arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION)
                if (needed.any { ContextCompat.checkSelfPermission(context, it) != PackageManager.PERMISSION_GRANTED }) {
                    permission.launch(needed)
                } else {
                    LocationServices.getFusedLocationProviderClient(context)
                        .getCurrentLocation(Priority.PRIORITY_BALANCED_POWER_ACCURACY, CancellationTokenSource().token)
                        .addOnSuccessListener { location -> if (location != null) model.upload(location.latitude, location.longitude, location.accuracy) }
                }
            }) { Text("更新最近位置") }
        }
        item {
            Text("实时守护会显示正在共享的通知。关掉系统定位后会停止上传。", style = MaterialTheme.typography.bodySmall)
            TextButton(onClick = {
                val permissions = mutableListOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION)
                if (android.os.Build.VERSION.SDK_INT >= 29) permissions += Manifest.permission.ACCESS_BACKGROUND_LOCATION
                permission.launch(permissions.toTypedArray())
                if (LocationUploader.hasForegroundPermission(context)) LocationShareService.start(context)
            }) { Text("开启实时守护") }
            TextButton(onClick = { LocationShareService.stop(context) }) { Text("停止实时守护") }
        }
        item { Text("谁可以查看我的位置", style = MaterialTheme.typography.titleMedium) }
        if (state.given.isEmpty()) item { Text("还没有位置授权") }
        items(state.given.size) { index ->
            val grant = state.given[index]
            Text("${grant.granteeName} · ${grant.status} · ${if (grant.precision == "PRECISE") "精确" else "模糊"}")
            if (grant.status == "ACTIVE") TextButton(onClick = { model.pause(grant.id) }) { Text("暂停") }
            if (grant.status == "PAUSED") TextButton(onClick = { model.resume(grant.id) }) { Text("恢复") }
            TextButton(onClick = { model.revoke(grant.id) }) { Text("撤销") }
        }
        item {
            OutlinedTextField(identifier, { identifier = it }, label = { Text("输入账号、KK号、邮箱或手机号") }, modifier = Modifier.fillMaxWidth())
            TextButton(onClick = { model.resolve(identifier) }) { Text("查找") }
            Text(if (chosen == null) "还没有确认授权对象" else "已确认：${chosen?.displayName}")
            TextButton(onClick = { scope = "PERMANENT" }) { Text(if (scope == "PERMANENT") "永久 ✓" else "永久") }
            TextButton(onClick = { mode = if (mode == "LIVE") "LAST_KNOWN" else "LIVE" }) { Text(if (mode == "LIVE") "实时 ✓" else "最近位置") }
            TextButton(onClick = { precision = if (precision == "PRECISE") "APPROXIMATE" else "PRECISE" }) { Text(if (precision == "PRECISE") "精确 ✓" else "模糊") }
            Button(onClick = {
                val person = chosen ?: return@Button
                model.grant(person, scope, mode, precision, "", "")
            }) { Text("授权查看位置") }
        }
        item { Text("我可以查看谁的位置", style = MaterialTheme.typography.titleMedium) }
        items(state.received.size) { index ->
            val grant = state.received[index]
            TextButton(onClick = { model.open(grant) }) { Text(grant.ownerName.ifBlank { "好友" }) }
        }
        state.view?.let { view ->
            item {
                Card(Modifier.fillMaxWidth()) {
                    Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        Text("${state.viewName}的位置", style = MaterialTheme.typography.titleMedium)
                        Text("状态：${view.statusLabel.ifBlank { view.status }}")
                        view.capturedAt?.let { Text("最后更新：$it") }
                        view.accuracyMeters?.let { Text("定位精度：约 ${it.toInt()} 米") }
                        if (!view.advice.isNullOrBlank()) Text(view.advice)
                        if (view.latitude != null && view.longitude != null) {
                            AndroidView(
                                factory = { ctx ->
                                    WebView(ctx).apply {
                                        settings.javaScriptEnabled = true
                                        webViewClient = tileClient(sessionToken(ctx))
                                        loadDataWithBaseURL(
                                            BuildConfig.DAYS_API_ORIGIN,
                                            mapHtml(view.latitude, view.longitude),
                                            "text/html",
                                            "utf-8",
                                            null,
                                        )
                                    }
                                },
                                modifier = Modifier.fillMaxWidth().height(240.dp),
                            )
                        } else {
                            Text("现在没有可以画在地图上的位置。")
                        }
                    }
                }
            }
        }
    }
    state.pending?.let { person ->
        AlertDialog(
            onDismissRequest = { model.clearPending() },
            title = { Text("确认授权给") },
            text = { Text("昵称：${person.displayName}\n账号：${person.accountName}\nKK号：${person.kkNumberMasked}\n匹配：${person.maskedIdentifier}") },
            confirmButton = {
                TextButton(onClick = {
                    chosen = person
                    model.clearPending()
                }) { Text("确认是此人") }
            },
            dismissButton = { TextButton(onClick = { model.clearPending() }) { Text("取消") } },
        )
    }
}

private fun sessionToken(context: android.content.Context): String = SecureSession(context).token().orEmpty()

private fun tileClient(token: String) = object : WebViewClient() {
    private val http = OkHttpClient()
    override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? {
        val path = request.url.path.orEmpty()
        if (!path.contains("/api/days/geo/")) return null
        val call = http.newCall(Request.Builder().url(request.url.toString()).header("Authorization", "Bearer $token").build())
        val response = runCatching { call.execute() }.getOrNull() ?: return null
        val type = response.header("content-type") ?: "image/png"
        return WebResourceResponse(type.substringBefore(";"), null, response.body?.byteStream())
    }
}

private fun mapHtml(latitude: Double, longitude: Double): String = """
<!doctype html><html><head>
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>html,body,#map{height:100%;margin:0}</style>
</head><body><div id="map"></div>
<script>
const map = L.map('map').setView([$latitude, $longitude], 15);
L.tileLayer('${BuildConfig.DAYS_API_ORIGIN}/api/days/geo/tile/{z}/{x}/{y}', {maxZoom:19}).addTo(map);
L.circleMarker([$latitude, $longitude], {radius:9, color:'#e11d48'}).addTo(map);
</script></body></html>
""".trimIndent()
