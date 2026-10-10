package com.yydsxwh.kemiao.days.data.remote

import com.yydsxwh.kemiao.days.BuildConfig
import com.yydsxwh.kemiao.days.data.model.AppData
import com.yydsxwh.kemiao.days.data.model.DaysJson
import com.yydsxwh.kemiao.days.data.model.SessionUser
import com.yydsxwh.kemiao.days.data.model.parseAppDataJson
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonPrimitive
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MultipartBody
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.IOException
import java.util.concurrent.TimeUnit

class SyncUnauthorized : IOException("UNAUTHORIZED")
class SyncUnavailable(message: String) : IOException(message)
class SyncConflict(val remote: RemoteSnapshot) : IOException("VERSION_CONFLICT")

data class RemoteSnapshot(
    val authenticated: Boolean,
    val data: AppData?,
    val version: Long,
    val updatedAt: String?,
)

@Serializable data class HandoffUser(val sub: String? = null, val id: String? = null, val name: String? = null, val avatarUrl: String? = null, val email: String? = null)
@Serializable data class HandoffResponse(val token: String, val user: HandoffUser)
@Serializable data class SessionResponse(val user: SessionUser? = null)
@Serializable data class PushResult(val version: Long, val updatedAt: String? = null)
@Serializable data class AdminMe(val admin: Boolean = false, val sub: String? = null)
@Serializable data class AppVersionDto(
    val platform: String = "android",
    val latestVersionName: String = "",
    val latestVersionCode: Int = 0,
    val minSupportedVersionCode: Int = 0,
    val forceUpdate: Boolean = false,
    val downloadUrl: String = "",
    val releaseNotes: String = "",
    val publishedAt: String = "",
    val sha256: String = "",
)

class DaysApi(
    private val origin: String = BuildConfig.DAYS_API_ORIGIN,
    private val tokenProvider: () -> String?,
    private val client: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(20, TimeUnit.SECONDS)
        .readTimeout(45, TimeUnit.SECONDS)
        .writeTimeout(45, TimeUnit.SECONDS)
        .build(),
) {
    /**
     * 课表图片走视觉模型，线上一次成功识别大约 30 秒，慢的会接近平台的 60 秒上限。
     * 同步接口仍用上面的 45 秒；识别单独放宽，避免模型还在看图时手机先断开。
     */
    private val ocrClient: OkHttpClient = client.newBuilder()
        .readTimeout(110, TimeUnit.SECONDS)
        .writeTimeout(110, TimeUnit.SECONDS)
        .callTimeout(110, TimeUnit.SECONDS)
        .build()
    private val jsonMedia = "application/json; charset=utf-8".toMediaType()

    private fun request(path: String, method: String = "GET", body: String? = null, extraHeaders: Map<String, String> = emptyMap()): Pair<Int, String> {
        val builder = Request.Builder().url("$origin$path")
        tokenProvider()?.takeIf { it.isNotBlank() }?.let { builder.header("Authorization", "Bearer $it") }
        extraHeaders.forEach { (k, v) -> builder.header(k, v) }
        val reqBody = body?.toRequestBody(jsonMedia)
        builder.method(method, if (method == "GET" || method == "HEAD") null else (reqBody ?: "".toRequestBody(jsonMedia)))
        client.newCall(builder.build()).execute().use { response ->
            return response.code to (response.body?.string().orEmpty())
        }
    }

    fun appVersion(): AppVersionDto? {
        val (code, text) = request("/api/days/app/version?platform=android")
        if (code !in 200..299) return null
        return runCatching { DaysJson.decodeFromString(AppVersionDto.serializer(), text) }.getOrNull()
    }

    fun session(): SessionUser? {
        val (code, text) = request("/api/days/auth/session")
        if (code == 401) return null
        if (code !in 200..299) throw SyncUnavailable("SESSION_$code")
        return DaysJson.decodeFromString(SessionResponse.serializer(), text).user
    }

    fun logout() {
        runCatching { request("/api/days/auth/logout") }
    }

    fun consumeHandoff(code: String): Pair<String, SessionUser> {
        val body = """{"code":${DaysJson.encodeToString(kotlinx.serialization.serializer<String>(), code)}}"""
        val (status, text) = request("/api/days/auth/handoff", "POST", body)
        if (status !in 200..299) throw SyncUnavailable("HANDOFF_$status")
        val parsed = DaysJson.decodeFromString(HandoffResponse.serializer(), text)
        val sub = parsed.user.sub ?: parsed.user.id ?: throw SyncUnavailable("HANDOFF_NO_SUB")
        return parsed.token to SessionUser(id = sub, sub = sub, name = parsed.user.name, avatarUrl = parsed.user.avatarUrl, email = parsed.user.email)
    }

    fun pull(): RemoteSnapshot {
        val (code, text) = request("/api/days/sync")
        if (code == 401) return RemoteSnapshot(false, null, 0, null)
        if (code !in 200..299) throw SyncUnavailable("GET_$code")
        val obj = DaysJson.parseToJsonElement(text) as JsonObject
        val dataEl = obj["data"]
        val data = if (dataEl == null || dataEl.toString() == "null") null else parseAppDataJson(dataEl.toString())
        return RemoteSnapshot(
            authenticated = true,
            data = data,
            version = obj["version"]?.jsonPrimitive?.contentOrNull?.toLongOrNull() ?: 0,
            updatedAt = obj["updatedAt"]?.jsonPrimitive?.contentOrNull,
        )
    }

    fun push(data: AppData, baseVersion: Long): PushResult {
        val payload = """{"data":${DaysJson.encodeToString(AppData.serializer(), data)},"baseVersion":$baseVersion}"""
        val (code, text) = request("/api/days/sync", "PUT", payload)
        if (code == 401) throw SyncUnauthorized()
        if (code == 409) {
            val obj = DaysJson.parseToJsonElement(text) as JsonObject
            val dataEl = obj["data"]
            throw SyncConflict(
                RemoteSnapshot(
                    true,
                    if (dataEl == null || dataEl.toString() == "null") null else parseAppDataJson(dataEl.toString()),
                    obj["version"]?.jsonPrimitive?.contentOrNull?.toLongOrNull() ?: 0,
                    obj["updatedAt"]?.jsonPrimitive?.contentOrNull,
                ),
            )
        }
        if (code !in 200..299) throw SyncUnavailable("PUT_$code")
        return DaysJson.decodeFromString(PushResult.serializer(), text)
    }

    fun adminMe(): AdminMe {
        val (code, text) = request("/api/days/admin/me")
        if (code == 401 || code == 403) return AdminMe(false)
        if (code !in 200..299) return AdminMe(false)
        return DaysJson.decodeFromString(AdminMe.serializer(), text)
    }

    fun getIntegrations(): String {
        val (code, text) = request("/api/days/admin/integrations")
        if (code !in 200..299) throw SyncUnavailable("ADMIN_$code")
        return text
    }

    fun putIntegrations(json: String): String {
        val (code, text) = request("/api/days/admin/integrations", "PUT", json)
        if (code !in 200..299) throw SyncUnavailable("ADMIN_SAVE_$code")
        return text
    }

    fun testAccount(): String {
        val (code, text) = request("/api/days/admin/integrations/account/test", "POST", "{}")
        return text.ifBlank { """{"ok":${code in 200..299}}""" }
    }

    fun testPlatform(): String {
        val (code, text) = request("/api/days/admin/integrations/platform/test", "POST", "{}")
        return text.ifBlank { """{"ok":${code in 200..299}}""" }
    }

    fun createProductApi(json: String): String {
        val (code, text) = request("/api/days/admin/integrations/apis", "POST", json)
        if (code !in 200..299) throw SyncUnavailable(text.ifBlank { "API_$code" })
        return text
    }

    fun deleteProductApi(id: String): Boolean {
        val (code, _) = request("/api/days/admin/integrations/apis/$id", "DELETE", "{}")
        return code in 200..299
    }

    fun testProductApi(id: String): String {
        val (_, text) = request("/api/days/admin/integrations/apis/$id/test", "POST", "{}")
        return text
    }

    fun uploadOcr(fileName: String, bytes: ByteArray, mime: String, kind: String = "auto"): String {
        val body = MultipartBody.Builder().setType(MultipartBody.FORM)
            .addFormDataPart("file", fileName, bytes.toRequestBody(mime.toMediaType()))
            .addFormDataPart("kind", kind)
            .build()
        val builder = Request.Builder().url("$origin/api/days/timetable-ocr").post(body)
        tokenProvider()?.takeIf { it.isNotBlank() }?.let { builder.header("Authorization", "Bearer $it") }
        ocrClient.newCall(builder.build()).execute().use { response ->
            val text = response.body?.string().orEmpty()
            if (response.code !in 200..299) throw SyncUnavailable(text.ifBlank { "OCR_${response.code}" })
            return text
        }
    }
}
