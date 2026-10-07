package com.yydsxwh.kemiao.days

import android.app.Application
import com.yydsxwh.kemiao.days.data.sync.SyncWorker
import com.yydsxwh.kemiao.days.notify.FirebaseBootstrap

class DaysApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        FirebaseBootstrap.start(this)
        SyncWorker.enqueue(this)
    }
}
