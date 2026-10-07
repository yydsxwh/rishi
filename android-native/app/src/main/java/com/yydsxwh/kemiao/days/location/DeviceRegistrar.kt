package com.yydsxwh.kemiao.days.location

import android.Manifest
import android.app.AlarmManager
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.os.PowerManager
import androidx.core.content.ContextCompat
import com.yydsxwh.kemiao.days.BuildConfig
import com.yydsxwh.kemiao.days.data.local.RemoteAlarmStore
import com.yydsxwh.kemiao.days.data.local.SecureSession
import com.yydsxwh.kemiao.days.data.remote.RemoteAlarmClient
import com.yydsxwh.kemiao.days.notify.FirebaseBootstrap

/** 把本机能力交给服务端。好友只能看到权限是否打开，看不到型号。 */
object DeviceRegistrar {
    fun refresh(context: Context, sharing: Boolean = false, precise: Boolean = LocationUploader.hasFinePermission(context)) {
        val token = SecureSession(context).token() ?: return
        val store = RemoteAlarmStore(context)
        val push = FirebaseBootstrap.token()
        val json = capabilitiesJson(context, sharing, precise, push.isNotBlank())
        val client = RemoteAlarmClient(tokenProvider = { token })
        val id = client.registerDevice(store.deviceId(), BuildConfig.VERSION_NAME, push, json)
        if (id.isNotBlank()) store.saveDeviceId(id)
    }

    private fun json(value: String): String = value.replace("\\", "").replace("\"", "").take(40)

    fun capabilitiesJson(context: Context, sharing: Boolean, precise: Boolean, pushReady: Boolean): String {
        val alarm = context.getSystemService(AlarmManager::class.java)
        val exact = if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S || alarm?.canScheduleExactAlarms() == true) "granted" else "denied"
        val notifications = if (Build.VERSION.SDK_INT < 33 || ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED) "granted" else "denied"
        val power = context.getSystemService(PowerManager::class.java)
        val restricted = power?.isIgnoringBatteryOptimizations(context.packageName) == false
        val foreground = if (LocationUploader.hasForegroundPermission(context)) "granted" else "denied"
        val background = if (LocationUploader.hasBackgroundPermission(context)) "granted" else "denied"
        val release = json(Build.VERSION.RELEASE)
        val manufacturer = json(Build.MANUFACTURER)
        val model = json(Build.MODEL)
        return """{"osVersion":"$release","manufacturer":"$manufacturer","model":"$model","remoteAlarm":{"exactAlarmPermission":"$exact","notificationPermission":"$notifications","batteryRestricted":$restricted},"location":{"foregroundPermission":"$foreground","backgroundPermission":"$background","precise":$precise,"sharingEnabled":$sharing},"push":{"ready":$pushReady}}"""
    }
}
