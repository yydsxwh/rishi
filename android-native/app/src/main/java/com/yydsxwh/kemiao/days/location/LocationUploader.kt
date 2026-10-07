package com.yydsxwh.kemiao.days.location

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.location.Location
import androidx.core.content.ContextCompat
import com.yydsxwh.kemiao.days.data.local.SecureSession
import com.yydsxwh.kemiao.days.data.remote.LocationClient
import java.time.Instant

class LocationUploader(private val context: Context) {
    fun upload(location: Location, source: String) {
        if (!hasForegroundPermission(context)) return
        val token = SecureSession(context).token() ?: return
        val precise = location.accuracy in 0f..100f && hasFinePermission(context)
        val capturedAt = Instant.ofEpochMilli(location.time).toString()
        val body = """{"latitude":${location.latitude},"longitude":${location.longitude},"accuracyMeters":${location.accuracy},"capturedAt":"$capturedAt","source":"$source"}"""
        runCatching { LocationClient { token }.upload(body) }
        DeviceRegistrar.refresh(context, sharing = true, precise = precise)
    }

    companion object {
        fun hasForegroundPermission(context: Context): Boolean {
            val fine = ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
            val coarse = ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED
            return fine || coarse
        }

        fun hasFinePermission(context: Context): Boolean {
            return ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
        }

        fun hasBackgroundPermission(context: Context): Boolean {
            return ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_BACKGROUND_LOCATION) == PackageManager.PERMISSION_GRANTED
        }
    }
}
