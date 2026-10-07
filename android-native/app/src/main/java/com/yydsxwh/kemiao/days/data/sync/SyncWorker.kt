package com.yydsxwh.kemiao.days.data.sync

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import com.yydsxwh.kemiao.days.data.local.LocalStore
import com.yydsxwh.kemiao.days.data.local.SecureSession
import com.yydsxwh.kemiao.days.data.remote.DaysApi
import com.yydsxwh.kemiao.days.notify.RemoteAlarmSync
import java.util.concurrent.TimeUnit

class SyncWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result {
        val session = SecureSession(applicationContext)
        if (session.token().isNullOrBlank()) return Result.success()
        val store = LocalStore(applicationContext)
        val engine = SyncEngine(DaysApi(tokenProvider = { session.token() }))
        val result = engine.reconcile(store.load(), store.version())
        if (result.data != null) store.save(result.data)
        if (result.version != null) store.saveVersion(result.version)
        runCatching { RemoteAlarmSync(applicationContext).pullAndSchedule() }
        return if (result.state == SyncState.Error || result.state == SyncState.Offline) Result.retry() else Result.success()
    }

    companion object {
        fun enqueue(context: Context) {
            val request = PeriodicWorkRequestBuilder<SyncWorker>(15, TimeUnit.MINUTES).build()
            WorkManager.getInstance(context).enqueueUniquePeriodicWork("rishi-sync", ExistingPeriodicWorkPolicy.UPDATE, request)
        }
    }
}
