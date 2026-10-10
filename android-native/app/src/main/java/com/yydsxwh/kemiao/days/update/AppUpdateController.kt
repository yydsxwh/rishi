package com.yydsxwh.kemiao.days.update

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.PackageInstaller
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.app.NotificationCompat
import androidx.core.content.FileProvider
import com.yydsxwh.kemiao.days.BuildConfig
import com.yydsxwh.kemiao.days.R
import com.yydsxwh.kemiao.days.data.model.UpdateProgress
import com.yydsxwh.kemiao.days.ui.MainActivity
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.File
import java.io.FileOutputStream
import java.security.MessageDigest
import java.util.Locale
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean

data class UpdateUiState(
    val phase: String = "idle",
    val versionName: String = "",
    val versionCode: Int = 0,
    val bytesRead: Long = 0,
    val totalBytes: Long? = null,
    val bytesPerSecond: Double = 0.0,
    val detail: String = "",
)

/** 关于页和启动提示共用的更新任务。进度来自实际读到的字节。 */
object AppUpdateController {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val _state = MutableStateFlow(UpdateUiState())
    val state: StateFlow<UpdateUiState> = _state
    private val pause = AtomicBoolean(false)
    private val cancel = AtomicBoolean(false)
    private var job: Job? = null
    private var service: Service? = null
    private val samples = ArrayDeque<Pair<Long, Long>>()
    private val client = OkHttpClient.Builder().connectTimeout(20, TimeUnit.SECONDS).readTimeout(60, TimeUnit.SECONDS).build()

    fun start(context: Context, versionName: String, versionCode: Int, url: String, sha256: String) {
        val phase = _state.value.phase
        if (phase == "connecting" || phase == "downloading" || phase == "verifying") return
        if (!official(url)) {
            publish(_state.value.copy(phase = "failed", detail = "只接受颗秒日事官方下载地址"))
            return
        }
        cancel.set(false)
        pause.set(false)
        save(context, versionName, versionCode, url, sha256.trim().lowercase(Locale.US))
        publish(UpdateUiState(phase = "connecting", versionName = versionName, versionCode = versionCode, detail = "正在连接服务器"))
        UpdateDownloadService.start(context.applicationContext)
    }

    fun pause() {
        if (_state.value.phase != "downloading" && _state.value.phase != "connecting") return
        pause.set(true)
    }

    fun resume(context: Context) {
        if (_state.value.phase != "paused" && _state.value.phase != "failed") return
        cancel.set(false)
        pause.set(false)
        publish(_state.value.copy(phase = "connecting", detail = "正在继续下载"))
        UpdateDownloadService.start(context.applicationContext)
    }

    fun retry(context: Context) {
        if (load(context) == null) return
        cancel.set(false)
        pause.set(false)
        publish(_state.value.copy(phase = "connecting", detail = "正在重新下载", bytesRead = 0, bytesPerSecond = 0.0))
        partFile(context).delete()
        UpdateDownloadService.start(context.applicationContext)
    }

    fun cancel(context: Context) {
        cancel.set(true)
        pause.set(false)
        partFile(context).delete()
        clear(context)
        publish(UpdateUiState())
        stopService(context)
    }

    fun onServiceStarted(host: Service) {
        service = host
        if (job?.isActive == true) return
        val task = load(host) ?: run {
            host.stopForeground(Service.STOP_FOREGROUND_REMOVE)
            host.stopSelf()
            return
        }
        job = scope.launch { download(host, task) }
    }

    fun onHostResume(context: Context) {
        if (_state.value.phase == "need_permission" && canInstall(context)) {
            val file = readyFile(context)
            if (file.exists()) install(context, file, load(context))
        }
    }

    fun onInstallPrompted() {
        publish(_state.value.copy(phase = "waiting_install", detail = "等待用户确认安装"))
    }

    fun onInstallSuccess() {
        publish(_state.value.copy(phase = "success", detail = "安装成功"))
        service?.let { stopService(it) }
    }

    fun onInstallFailed(message: String?) {
        publish(_state.value.copy(phase = "failed", detail = message?.ifBlank { null } ?: "安装失败"))
        service?.let { stopService(it) }
    }

    fun restore(context: Context) {
        val task = load(context) ?: return
        val part = partFile(context)
        val ready = readyFile(context)
        if (ready.exists() && ready.length() > 0L) {
            publish(UpdateUiState(phase = "waiting_install", versionName = task.versionName, versionCode = task.versionCode, bytesRead = ready.length(), totalBytes = ready.length(), detail = "安装包已下载，等待安装"))
            return
        }
        if (part.exists() && part.length() > 0L) {
            publish(UpdateUiState(phase = "paused", versionName = task.versionName, versionCode = task.versionCode, bytesRead = part.length(), detail = "下载已暂停，可以继续"))
        }
    }

    fun notification(context: Context): Notification {
        val manager = context.getSystemService(NotificationManager::class.java)
        manager.createNotificationChannel(NotificationChannel(CHANNEL, "应用更新", NotificationManager.IMPORTANCE_LOW))
        val ui = _state.value
        val percent = UpdateProgress.percent(ui.bytesRead, ui.totalBytes)
        val open = PendingIntent.getActivity(context, 0, Intent(context, MainActivity::class.java), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val text = when (ui.phase) {
            "downloading" -> listOfNotNull(percent?.let { "$it%" }, UpdateProgress.speedLabel(ui.bytesPerSecond)).joinToString(" · ")
            else -> ui.detail.ifBlank { "正在准备更新" }
        }
        return NotificationCompat.Builder(context, CHANNEL)
            .setSmallIcon(R.drawable.ic_launcher)
            .setContentTitle(if (ui.versionName.isBlank()) "正在更新颗秒日事" else "正在下载颗秒日事 v${ui.versionName}")
            .setContentText(text)
            .setContentIntent(open)
            .setOnlyAlertOnce(true)
            .setOngoing(ui.phase == "downloading" || ui.phase == "connecting" || ui.phase == "verifying")
            .setProgress(100, percent ?: 0, percent == null && ui.phase == "downloading")
            .build()
    }

    private fun download(context: Context, task: UpdateTask) {
        val part = partFile(context)
        part.parentFile?.mkdirs()
        try {
            while (!cancel.get()) {
                if (pause.get()) {
                    publish(_state.value.copy(phase = "paused", detail = "下载已暂停"))
                    refreshNotification(context)
                    return
                }
                publish(_state.value.copy(phase = "connecting", versionName = task.versionName, versionCode = task.versionCode, detail = "正在连接服务器"))
                val existing = part.length().coerceAtLeast(0L)
                val request = Request.Builder().url(task.url).apply {
                    if (existing > 0L) header("Range", "bytes=$existing-")
                }.build()
                client.newCall(request).execute().use { response ->
                    if (response.code == 200 && existing > 0L) {
                        part.delete()
                    }
                    if (response.code !in listOf(200, 206)) {
                        fail(context, "服务器返回 ${response.code}")
                        return
                    }
                    val body = response.body ?: run { fail(context, "服务器没有返回安装包"); return }
                    val total = totalBytes(response.code, response.header("Content-Range"), body.contentLength(), if (response.code == 206) existing else 0L)
                    var read = if (response.code == 206) existing else 0L
                    publish(_state.value.copy(phase = "downloading", bytesRead = read, totalBytes = total, detail = "正在下载"))
                    FileOutputStream(part, response.code == 206).use { out ->
                        body.byteStream().use { input ->
                            val buffer = ByteArray(16 * 1024)
                            var lastUi = 0L
                            samples.clear()
                            samples.addLast(System.currentTimeMillis() to read)
                            while (true) {
                                if (cancel.get()) {
                                    cancel(context)
                                    return
                                }
                                if (pause.get()) {
                                    publish(_state.value.copy(phase = "paused", bytesRead = read, totalBytes = total, detail = "下载已暂停"))
                                    refreshNotification(context)
                                    return
                                }
                                val n = input.read(buffer)
                                if (n < 0) break
                                out.write(buffer, 0, n)
                                read += n
                                val now = System.currentTimeMillis()
                                samples.addLast(now to read)
                                while (samples.size > 20) samples.removeFirst()
                                if (now - lastUi > 250L) {
                                    val speed = UpdateProgress.smoothSpeed(samples.toList(), now)
                                    publish(_state.value.copy(phase = "downloading", bytesRead = read, totalBytes = total, bytesPerSecond = speed, detail = "正在下载"))
                                    refreshNotification(context)
                                    lastUi = now
                                }
                            }
                        }
                    }
                    publish(_state.value.copy(phase = "verifying", bytesRead = part.length(), totalBytes = total ?: part.length(), bytesPerSecond = 0.0, detail = "100%，下载完成，正在校验安装包"))
                    refreshNotification(context)
                    val error = verify(context, part, task, total)
                    if (error != null) {
                        part.delete()
                        fail(context, error)
                        return
                    }
                    val ready = readyFile(context)
                    if (ready.exists()) ready.delete()
                    if (!part.renameTo(ready)) part.copyTo(ready, overwrite = true).also { part.delete() }
                    install(context, ready, task)
                    return
                }
            }
        } catch (error: Exception) {
            val message = when {
                error.message?.contains("ENOSPC") == true -> "手机存储空间不足"
                error is java.net.UnknownHostException || error is java.net.SocketTimeoutException || error is java.io.IOException -> "网络中断，下载没有完成"
                else -> "下载失败"
            }
            fail(context, message)
        }
    }

    private fun install(context: Context, file: File, task: UpdateTask?) {
        if (!canInstall(context)) {
            publish(_state.value.copy(phase = "need_permission", bytesRead = file.length(), totalBytes = file.length(), detail = "需要允许安装未知来源应用。授权后会继续安装，不用重新下载。"))
            refreshNotification(context)
            return
        }
        publish(_state.value.copy(phase = "waiting_install", detail = "安装包校验通过，等待用户确认安装"))
        refreshNotification(context)
        runCatching { commitSession(context, file) }.onFailure {
            runCatching { viewInstall(context, file) }.onFailure { fail(context, "无法打开系统安装界面") }
        }
    }

    private fun commitSession(context: Context, file: File) {
        val installer = context.packageManager.packageInstaller
        val params = PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL)
        params.setAppPackageName(BuildConfig.APPLICATION_ID)
        val sessionId = installer.createSession(params)
        installer.openSession(sessionId).use { session ->
            session.openWrite("base.apk", 0, file.length()).use { output ->
                file.inputStream().use { input -> input.copyTo(output) }
                session.fsync(output)
            }
            val flags = PendingIntent.FLAG_UPDATE_CURRENT or (if (Build.VERSION.SDK_INT >= 31) PendingIntent.FLAG_MUTABLE else 0)
            val pending = PendingIntent.getBroadcast(context, sessionId, Intent(context, UpdateInstallReceiver::class.java), flags)
            session.commit(pending.intentSender)
        }
        publish(_state.value.copy(phase = "installing", detail = "已交给系统安装。请在系统界面确认。系统没有提供安装百分比。"))
    }

    private fun viewInstall(context: Context, file: File) {
        val uri = FileProvider.getUriForFile(context, "${context.packageName}.updates", file)
        val intent = Intent(Intent.ACTION_VIEW).setDataAndType(uri, "application/vnd.android.package-archive")
            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
        context.startActivity(intent)
        publish(_state.value.copy(phase = "waiting_install", detail = "等待用户确认安装"))
    }

    private fun verify(context: Context, file: File, task: UpdateTask, announcedTotal: Long?): String? {
        if (announcedTotal != null && file.length() != announcedTotal) return "安装包大小和服务器声明的不一致"
        if (file.length() < 1_000_000L) return "安装包不完整"
        if (task.sha256.isNotBlank() && sha256(file) != task.sha256) return "安装包 SHA-256 和版本信息不一致"
        val flags = if (Build.VERSION.SDK_INT >= 28) PackageManager.GET_SIGNING_CERTIFICATES else PackageManager.GET_SIGNATURES
        val archive = context.packageManager.getPackageArchiveInfo(file.absolutePath, flags) ?: return "无法读取安装包"
        if (archive.packageName != BuildConfig.APPLICATION_ID) return "安装包包名不正确"
        val version = if (Build.VERSION.SDK_INT >= 28) archive.longVersionCode else @Suppress("DEPRECATION") archive.versionCode.toLong()
        if (version < task.versionCode.toLong() || version <= BuildConfig.VERSION_CODE) return "安装包版本没有高于当前版本"
        val archiveCert = certSha(archive)
        val installed = runCatching {
            if (Build.VERSION.SDK_INT >= 33) context.packageManager.getPackageInfo(context.packageName, PackageManager.PackageInfoFlags.of(PackageManager.GET_SIGNING_CERTIFICATES.toLong()))
            else context.packageManager.getPackageInfo(context.packageName, flags)
        }.getOrNull()
        val installedCert = installed?.let { certSha(it) }
        if (archiveCert == null || installedCert == null || archiveCert != installedCert) return "安装包签名和当前应用不一致，不能覆盖安装"
        return null
    }

    private fun certSha(info: android.content.pm.PackageInfo): String? {
        val bytes = if (Build.VERSION.SDK_INT >= 28) {
            info.signingInfo?.apkContentsSigners?.firstOrNull()?.toByteArray()
        } else {
            @Suppress("DEPRECATION")
            info.signatures?.firstOrNull()?.toByteArray()
        } ?: return null
        return MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it) }
    }

    private fun sha256(file: File): String = file.inputStream().use { input ->
        val digest = MessageDigest.getInstance("SHA-256")
        val buffer = ByteArray(16 * 1024)
        while (true) {
            val n = input.read(buffer)
            if (n < 0) break
            digest.update(buffer, 0, n)
        }
        digest.digest().joinToString("") { "%02x".format(it) }
    }

    private fun totalBytes(code: Int, contentRange: String?, bodyLength: Long, already: Long): Long? {
        if (code == 206 && contentRange != null && contentRange.contains("/")) {
            val total = contentRange.substringAfter("/").toLongOrNull()
            if (total != null && total > 0L) return total
        }
        if (bodyLength > 0L) return already + bodyLength
        return null
    }

    private fun fail(context: Context, detail: String) {
        publish(_state.value.copy(phase = "failed", detail = detail, bytesPerSecond = 0.0))
        refreshNotification(context)
        stopService(context)
    }

    private fun publish(value: UpdateUiState) {
        _state.value = value
    }

    private fun refreshNotification(context: Context) {
        val manager = context.getSystemService(NotificationManager::class.java)
        manager.notify(NOTIFICATION_ID, notification(context))
    }

    private fun stopService(context: Context) {
        runCatching { context.stopService(Intent(context, UpdateDownloadService::class.java)) }
    }

    private fun canInstall(context: Context): Boolean = Build.VERSION.SDK_INT < 26 || context.packageManager.canRequestPackageInstalls()

    fun openInstallSettings(context: Context) {
        if (Build.VERSION.SDK_INT < 26) return
        val intent = Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:${context.packageName}")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        context.startActivity(intent)
    }

    private fun official(url: String): Boolean = url.startsWith("https://www.yydsxwh.com/") || url.startsWith("https://xiaowenhua.net/")

    private fun partFile(context: Context) = File(File(context.cacheDir, "updates"), "kemiao-days.apk.part")
    private fun readyFile(context: Context) = File(File(context.cacheDir, "updates"), "kemiao-days.apk")

    private fun save(context: Context, versionName: String, versionCode: Int, url: String, sha256: String) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
            .putString("name", versionName)
            .putInt("code", versionCode)
            .putString("url", url)
            .putString("sha", sha256)
            .apply()
    }

    private fun load(context: Context): UpdateTask? {
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val url = prefs.getString("url", null) ?: return null
        if (!official(url)) return null
        return UpdateTask(prefs.getString("name", "").orEmpty(), prefs.getInt("code", 0), url, prefs.getString("sha", "").orEmpty())
    }

    private fun clear(context: Context) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().clear().apply()
    }

    private data class UpdateTask(val versionName: String, val versionCode: Int, val url: String, val sha256: String)

    const val CHANNEL = "app-update"
    const val NOTIFICATION_ID = 44
    private const val PREFS = "kemiao-update"
}
