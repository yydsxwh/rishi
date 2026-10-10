package com.yydsxwh.kemiao.days.data.remote

import com.yydsxwh.kemiao.days.BuildConfig
import com.yydsxwh.kemiao.days.data.model.DaysJson
import kotlinx.serialization.Serializable
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.IOException
import java.util.concurrent.TimeUnit

class RemoteAlarmException(val code: String, message: String) : IOException(message)

@Serializable
data class RemoteGrantDto(
    val id: String,
    val ownerUserId: String = "",
    val ownerName: String = "",
    val granteeUserId: String = "",
    val granteeName: String = "",
    val scope: String = "",
    val status: String = "",
    val validFrom: String? = null,
    val validUntil: String? = null,
    val entityType: String? = null,
    val entityId: String? = null,
    val entityTitle: String? = null,
    val entityStartsAt: String? = null,
    val entityEndsAt: String? = null,
    val leadHours: Double? = null,
    val trailHours: Double? = null,
    val permissions: GrantPermissionsDto = GrantPermissionsDto(),
    val canCreate: Boolean = false,
    val blockReason: String? = null,
)

@Serializable
data class GrantPermissionsDto(
    val createAlarm: Boolean = true,
    val modifyOwnAlarm: Boolean = true,
    val cancelOwnAlarm: Boolean = true,
)

@Serializable
data class RemoteAlarmDto(
    val id: String,
    val ownerUserId: String = "",
    val creatorUserId: String = "",
    val creatorName: String = "",
    val grantId: String = "",
    val triggerAt: String = "",
    val timezone: String = "Asia/Shanghai",
    val title: String = "",
    val note: String = "",
    val entityTitle: String = "",
    val vibrate: Boolean = true,
    val sound: Boolean = true,
    val allowSnooze: Boolean = true,
    val status: String = "",
    val revision: Long = 0,
    val acceptance: String = "",
    val deviceReady: Boolean = false,
)

@Serializable
data class AuditDto(val id: String = "", val at: String = "", val action: String = "", val summary: String = "", val actorUserId: String = "")
@Serializable
data class ContactDto(val sub: String = "", val name: String = "", val kkNumber: Long? = null, val username: String? = null)
@Serializable
data class OwnerSettingsDto(
    val pausedAll: Boolean = false,
    val maxPerHour: Int = 3,
    val maxPerDay: Int = 10,
    val allowNight: Boolean = true,
    val timezone: String = "Asia/Shanghai",
)
@Serializable
private data class GrantList(val given: List<RemoteGrantDto> = emptyList(), val received: List<RemoteGrantDto> = emptyList())
@Serializable
private data class TargetList(val targets: List<RemoteGrantDto> = emptyList())
@Serializable
data class PendingDeviceDto(
    val registered: Boolean = false,
    val platform: String = "unknown",
    val lastSeenAt: String = "",
    val exactAlarmPermission: String = "unknown",
    val notificationPermission: String = "unknown",
    val nativeAlarm: String = "NOT_APPLICABLE",
)

@Serializable
data class PendingAlarmsDto(
    val cursor: String = "",
    val alarms: List<RemoteAlarmDto> = emptyList(),
    val device: PendingDeviceDto = PendingDeviceDto(),
)

@Serializable
private data class AlarmList(val alarms: List<RemoteAlarmDto> = emptyList())
@Serializable
private data class AuditList(val events: List<AuditDto> = emptyList())
@Serializable
private data class SettingsBody(val settings: OwnerSettingsDto = OwnerSettingsDto())
@Serializable
private data class ContactList(val users: List<ContactDto> = emptyList(), val directory: String = "")
@Serializable
private data class AlarmBody(val alarm: RemoteAlarmDto)
@Serializable
private data class GrantBody(val grant: RemoteGrantDto)
@Serializable
private data class DeviceBody(val device: DeviceEcho)
@Serializable
private data class DeviceEcho(val id: String = "", val hasToken: Boolean = false)
@Serializable
data class ResolvedAccountDto(
    val userSub: String = "",
    val displayName: String = "",
    val matchedBy: String = "",
    val maskedIdentifier: String = "",
    val accountName: String = "",
    val kkNumberMasked: String = "",
)
@Serializable
data class RecentContactDto(val sub: String = "", val displayName: String = "", val username: String? = null, val kkNumber: Long? = null)
@Serializable
private data class ResolveBody(val account: ResolvedAccountDto = ResolvedAccountDto())
@Serializable
private data class RecentList(val contacts: List<RecentContactDto> = emptyList(), val source: String = "")
@Serializable
private data class ApiError(val error: String = "", val message: String = "")

class RemoteAlarmClient(
    private val origin: String = BuildConfig.DAYS_API_ORIGIN,
    private val tokenProvider: () -> String?,
    private val client: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(20, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .build(),
) {
    private val jsonMedia = "application/json; charset=utf-8".toMediaType()

    fun grants(): Pair<List<RemoteGrantDto>, List<RemoteGrantDto>> {
        val parsed = decode<GrantList>(request("/api/days/remote-alarm/grants"))
        return parsed.given to parsed.received
    }
    fun targets(): List<RemoteGrantDto> = decode<TargetList>(request("/api/days/remote-alarm/allowed-targets")).targets
    fun alarms(role: String): List<RemoteAlarmDto> = decode<AlarmList>(request("/api/days/remote-alarm/alarms?role=$role")).alarms
    fun pending(): PendingAlarmsDto = decode(request("/api/days/remote-alarm/pending"))
    fun audit(): List<AuditDto> = decode<AuditList>(request("/api/days/remote-alarm/audit")).events
    fun settings(): OwnerSettingsDto = decode<SettingsBody>(request("/api/days/remote-alarm/settings")).settings
    fun contacts(query: String): Pair<List<ContactDto>, String> {
        val parsed = decode<ContactList>(request("/api/days/remote-alarm/contacts?q=${java.net.URLEncoder.encode(query, "UTF-8")}"))
        return parsed.users to parsed.directory
    }

    fun createGrant(json: String): RemoteGrantDto = decode<GrantBody>(request("/api/days/remote-alarm/grants", "POST", json)).grant

    fun grantPermanent(granteeUserId: String, granteeName: String) = createGrant(grantJson(granteeUserId, granteeName, "PERMANENT"))

    fun grantRange(granteeUserId: String, granteeName: String, validFrom: String, validUntil: String): RemoteGrantDto {
        val json = grantJson(granteeUserId, granteeName, "TIME_RANGE").trimEnd('}') +
            ""","validFrom":${q(validFrom)},"validUntil":${q(validUntil)}}"""
        return createGrant(json)
    }

    fun grantEntity(granteeUserId: String, granteeName: String, entityType: String, entityId: String, entityTitle: String, starts: String, ends: String, leadHours: Int, trailHours: Int): RemoteGrantDto {
        val json = grantJson(granteeUserId, granteeName, "ENTITY_BOUND").trimEnd('}') +
            ""","entityType":${q(entityType)},"entityId":${q(entityId)},"entityTitle":${q(entityTitle)},"entityStartsAt":${q(starts)},"entityEndsAt":${q(ends)},"leadHours":$leadHours,"trailHours":$trailHours}"""
        return createGrant(json)
    }
    fun updateGrant(id: String, json: String): RemoteGrantDto = decode<GrantBody>(request("/api/days/remote-alarm/grants/$id", "PATCH", json)).grant
    fun revokeGrant(id: String, cancelFuture: Boolean) {
        request("/api/days/remote-alarm/grants/$id?cancelFuture=${if (cancelFuture) 1 else 0}", "DELETE", """{"cancelFuture":$cancelFuture}""")
    }

    fun revokePerson(granteeUserId: String, cancelFuture: Boolean) {
        request("/api/days/remote-alarm/grants/by-person", "POST", """{"granteeUserId":${q(granteeUserId)},"cancelFuture":$cancelFuture}""")
    }

    fun createAlarm(json: String): RemoteAlarmDto = decode<AlarmBody>(request("/api/days/remote-alarm/alarms", "POST", json)).alarm

    fun createAlarm(ownerUserId: String, grantId: String, triggerAt: String, timezone: String, title: String, note: String, nonce: String): RemoteAlarmDto {
        val json = """{"ownerUserId":${q(ownerUserId)},"grantId":${q(grantId)},"triggerAt":${q(triggerAt)},"timezone":${q(timezone)},"title":${q(title)},"note":${q(note)},"clientNonce":${q(nonce)}}"""
        return createAlarm(json)
    }
    fun cancelAlarm(id: String) {
        request("/api/days/remote-alarm/alarms/$id", "DELETE", "{}")
    }

    fun report(id: String, action: String, reason: String = "") {
        request("/api/days/remote-alarm/alarms/$id/$action", "POST", """{"reason":${DaysJson.encodeToString(kotlinx.serialization.serializer<String>(), reason)}}""")
    }

    fun saveSettings(json: String): OwnerSettingsDto = decode<SettingsBody>(request("/api/days/remote-alarm/settings", "PUT", json)).settings
    fun pauseAll(cancelFuture: Boolean) {
        request("/api/days/remote-alarm/pause", "POST", """{"cancelFuture":$cancelFuture}""")
    }

    fun resumeAll() {
        request("/api/days/remote-alarm/resume", "POST", "{}")
    }

    fun registerDevice(
        deviceId: String?,
        appVersion: String,
        pushToken: String = "",
        capabilitiesJson: String = "{}",
        pushProvider: String = "none",
        gmsAvailable: Boolean = false,
        region: String = "unknown",
    ): String {
        val idField = if (deviceId.isNullOrBlank()) "" else ""","id":${q(deviceId)}"""
        val body = """{"platform":"android","appVersion":${q(appVersion)},"pushToken":${q(pushToken)},"pushProvider":${q(pushProvider)},"gmsAvailable":$gmsAvailable,"region":${q(region)},"capabilities":$capabilitiesJson$idField}"""
        return decode<DeviceBody>(request("/api/days/devices", "POST", body)).device.id
    }

    fun resolveAccount(identifier: String): ResolvedAccountDto {
        return decode<ResolveBody>(request("/api/days/account/resolve", "POST", """{"identifier":${q(identifier)}}""")).account
    }

    fun recentContacts(): List<RecentContactDto> = decode<RecentList>(request("/api/days/contacts/kkchat")).contacts

    private fun q(value: String) = DaysJson.encodeToString(kotlinx.serialization.serializer<String>(), value)

    private fun grantJson(granteeUserId: String, granteeName: String, scope: String) =
        """{"granteeUserId":${q(granteeUserId)},"granteeName":${q(granteeName)},"scope":${q(scope)}}"""

    private inline fun <reified T> decode(text: String): T = DaysJson.decodeFromString(text)

    private fun request(path: String, method: String = "GET", body: String? = null): String {
        val builder = Request.Builder().url("$origin$path")
        val token = tokenProvider()?.takeIf { it.isNotBlank() } ?: throw RemoteAlarmException("unauthorized", "请先登录")
        builder.header("Authorization", "Bearer $token")
        val reqBody = body?.toRequestBody(jsonMedia)
        builder.method(method, if (method == "GET" || method == "HEAD") null else (reqBody ?: "{}".toRequestBody(jsonMedia)))
        client.newCall(builder.build()).execute().use { response ->
            val text = response.body?.string().orEmpty()
            if (response.code !in 200..299) {
                val parsed = runCatching { DaysJson.decodeFromString(ApiError.serializer(), text) }.getOrNull()
                throw RemoteAlarmException(parsed?.error ?: "HTTP_${response.code}", parsed?.message ?: "请求失败 ${response.code}")
            }
            return text
        }
    }
}
