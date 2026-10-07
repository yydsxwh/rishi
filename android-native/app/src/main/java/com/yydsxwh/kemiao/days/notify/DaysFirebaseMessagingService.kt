package com.yydsxwh.kemiao.days.notify

import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage

/** 推送只负责叫醒去拉取。授权结论仍由登录后的接口决定。 */
class DaysFirebaseMessagingService : FirebaseMessagingService() {
    override fun onMessageReceived(message: RemoteMessage) {
        if (message.data["type"] != "remote_alarm_sync") return
        Thread { runCatching { RemoteAlarmSync(this).pullAndSchedule() } }.start()
    }

    override fun onNewToken(token: String) {
        Thread { runCatching { RemoteAlarmSync(this).pullAndSchedule() } }.start()
    }
}
