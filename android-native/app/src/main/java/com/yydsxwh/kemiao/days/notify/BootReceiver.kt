package com.yydsxwh.kemiao.days.notify

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.yydsxwh.kemiao.days.data.local.AppearanceStore
import com.yydsxwh.kemiao.days.data.local.LocalStore

class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val action = intent.action
        if (action != Intent.ACTION_BOOT_COMPLETED && action != Intent.ACTION_MY_PACKAGE_REPLACED && action != Intent.ACTION_TIMEZONE_CHANGED && action != Intent.ACTION_TIME_CHANGED) return
        ReminderScheduler(context).reschedule(LocalStore(context).load())
        RemoteAlarmScheduler(context).restoreAll()
        if (!AppearanceStore(context).wakeGuard()) return
        if (action != Intent.ACTION_BOOT_COMPLETED && action != Intent.ACTION_MY_PACKAGE_REPLACED) return
        val pending = goAsync()
        Thread {
            try {
                WakeGuardService.start(context)
                AppearanceStore(context).setWakeGuardNote("")
            } catch (_: Exception) {
                AppearanceStore(context).setWakeGuardNote("开机后系统没有允许恢复好友叫醒实时守护")
            } finally {
                pending.finish()
            }
        }.start()
    }
}
