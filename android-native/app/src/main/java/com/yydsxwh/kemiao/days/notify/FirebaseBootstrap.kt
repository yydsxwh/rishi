package com.yydsxwh.kemiao.days.notify

import android.content.Context
import com.google.firebase.FirebaseApp
import com.google.firebase.FirebaseOptions
import com.google.firebase.messaging.FirebaseMessaging
import org.json.JSONObject

/**
 * 没有 google-services.json 时不初始化 Firebase，应用仍可打开。
 * 这个文件由构建机放进 assets，不提交到 Git。
 */
object FirebaseBootstrap {
    @Volatile
    private var token: String = ""

    fun start(context: Context) {
        val appContext = context.applicationContext
        if (FirebaseApp.getApps(appContext).isEmpty()) {
            val options = readOptions(appContext) ?: return
            FirebaseApp.initializeApp(appContext, options)
        }
        FirebaseMessaging.getInstance().token.addOnSuccessListener { value -> token = value }
    }

    fun token(): String = token

    fun ready(context: Context): Boolean = FirebaseApp.getApps(context.applicationContext).isNotEmpty()

    private fun readOptions(context: Context): FirebaseOptions? {
        val text = runCatching { context.assets.open("google-services.json").bufferedReader().use { it.readText() } }.getOrNull() ?: return null
        val root = runCatching { JSONObject(text) }.getOrNull() ?: return null
        val projectId = root.optJSONObject("project_info")?.optString("project_id").orEmpty()
        val sender = root.optJSONObject("project_info")?.optString("project_number").orEmpty()
        val clients = root.optJSONArray("client") ?: return null
        for (index in 0 until clients.length()) {
            val client = clients.optJSONObject(index) ?: continue
            val packageName = client.optJSONObject("client_info")?.optJSONObject("android_client_info")?.optString("package_name")
            if (packageName != context.packageName && packageName != "com.yydsxwh.kemiao.days") continue
            val appId = client.optJSONObject("client_info")?.optString("mobilesdk_app_id").orEmpty()
            val apiKey = client.optJSONArray("api_key")?.optJSONObject(0)?.optString("current_key").orEmpty()
            if (appId.isBlank() || apiKey.isBlank() || projectId.isBlank()) continue
            return FirebaseOptions.Builder()
                .setApplicationId(appId)
                .setApiKey(apiKey)
                .setProjectId(projectId)
                .setGcmSenderId(sender)
                .build()
        }
        return null
    }
}
