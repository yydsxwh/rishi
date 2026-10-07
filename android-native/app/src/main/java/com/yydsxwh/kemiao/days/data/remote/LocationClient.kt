package com.yydsxwh.kemiao.days.data.remote

import com.yydsxwh.kemiao.days.BuildConfig
import com.yydsxwh.kemiao.days.data.model.DaysJson
import kotlinx.serialization.Serializable
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.util.concurrent.TimeUnit

@Serializable
data class LocationGrantDto(
    val id: String = "",
    val ownerUserId: String = "",
    val ownerName: String = "",
    val granteeUserId: String = "",
    val granteeName: String = "",
    val status: String = "",
    val scope: String = "",
    val mode: String = "",
    val precision: String = "",
    val entityTitle: String? = null,
)

@Serializable
data class LocationViewDto(
    val status: String = "",
    val statusLabel: String = "",
    val latitude: Double? = null,
    val longitude: Double? = null,
    val accuracyMeters: Double? = null,
    val capturedAt: String? = null,
    val advice: String? = null,
)

@Serializable
private data class LocationGrantList(val given: List<LocationGrantDto> = emptyList(), val received: List<LocationGrantDto> = emptyList())
@Serializable
private data class LocationGrantBody(val grant: LocationGrantDto = LocationGrantDto())
@Serializable
private data class LocationViewBody(val location: LocationViewDto = LocationViewDto())
@Serializable
private data class LocationError(val error: String = "", val message: String = "")

class LocationClient(
    private val origin: String = BuildConfig.DAYS_API_ORIGIN,
    private val tokenProvider: () -> String?,
) {
    private val client = OkHttpClient.Builder().connectTimeout(20, TimeUnit.SECONDS).readTimeout(30, TimeUnit.SECONDS).build()
    private val json = "application/json; charset=utf-8".toMediaType()

    fun grants(): Pair<List<LocationGrantDto>, List<LocationGrantDto>> {
        val parsed = DaysJson.decodeFromString<LocationGrantList>(request("/api/days/location/grants"))
        return parsed.given to parsed.received
    }

    fun create(body: String): LocationGrantDto = DaysJson.decodeFromString<LocationGrantBody>(request("/api/days/location/grants", "POST", body)).grant

    fun pause(id: String) {
        request("/api/days/location/grants/$id", "PATCH", """{"status":"PAUSED"}""")
    }

    fun resume(id: String) {
        request("/api/days/location/grants/$id", "PATCH", """{"status":"ACTIVE"}""")
    }

    fun revoke(id: String) {
        request("/api/days/location/grants/$id", "DELETE", "{}")
    }

    fun pauseAll() {
        request("/api/days/location/pause", "POST", "{}")
    }

    fun resumeAll() {
        request("/api/days/location/resume", "POST", "{}")
    }

    fun upload(body: String) {
        request("/api/days/location/snapshot", "PUT", body)
    }

    fun view(ownerUserId: String): LocationViewDto {
        return DaysJson.decodeFromString<LocationViewBody>(request("/api/days/location/people/$ownerUserId")).location
    }

    private fun request(path: String, method: String = "GET", body: String? = null): String {
        val token = tokenProvider()?.takeIf { it.isNotBlank() } ?: throw RemoteAlarmException("unauthorized", "请先登录")
        val builder = Request.Builder().url("$origin$path").header("Authorization", "Bearer $token")
        val payload = body?.toRequestBody(json)
        builder.method(method, if (method == "GET") null else payload ?: "{}".toRequestBody(json))
        client.newCall(builder.build()).execute().use { response ->
            val text = response.body?.string().orEmpty()
            if (response.code !in 200..299) {
                val parsed = runCatching { DaysJson.decodeFromString(LocationError.serializer(), text) }.getOrNull()
                throw RemoteAlarmException(parsed?.error ?: "HTTP_${response.code}", parsed?.message ?: "请求失败")
            }
            return text
        }
    }
}
