package com.yydsxwh.kemiao.days.update

import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder

/** 下载安装包时保持前台通知，避免切到后台后进度和下载一起消失。 */
class UpdateDownloadService : Service() {
    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val notification = AppUpdateController.notification(this)
        if (Build.VERSION.SDK_INT >= 34) {
            startForeground(AppUpdateController.NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)
        } else {
            startForeground(AppUpdateController.NOTIFICATION_ID, notification)
        }
        if (intent?.action == ACTION_CANCEL) {
            AppUpdateController.cancel(this)
            return START_NOT_STICKY
        }
        AppUpdateController.onServiceStarted(this)
        return START_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null

    companion object {
        private const val ACTION_CANCEL = "com.yydsxwh.kemiao.days.CANCEL_UPDATE"

        fun start(context: Context) {
            val intent = Intent(context, UpdateDownloadService::class.java)
            context.startForegroundService(intent)
        }
    }
}
