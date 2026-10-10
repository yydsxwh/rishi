package com.yydsxwh.kemiao.days

import android.app.Application
import com.yydsxwh.kemiao.days.data.local.AppearanceStore
import com.yydsxwh.kemiao.days.data.sync.SyncWorker
import com.yydsxwh.kemiao.days.notify.FirebaseBootstrap
import com.yydsxwh.kemiao.days.update.AppUpdateController

class DaysApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        FirebaseBootstrap.start(this)
        AppUpdateController.restore(this)
        if (AppearanceStore(this).autoSync()) SyncWorker.enqueue(this)
    }
}
