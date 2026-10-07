package com.yydsxwh.kemiao.days.notify

import android.media.AudioAttributes
import android.media.Ringtone
import android.media.RingtoneManager
import android.os.Build
import android.os.Bundle
import android.os.VibrationEffect
import android.os.Vibrator
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.yydsxwh.kemiao.days.data.local.LocalStore
import com.yydsxwh.kemiao.days.data.local.RemoteAlarmStore
import com.yydsxwh.kemiao.days.data.local.SecureSession
import com.yydsxwh.kemiao.days.data.model.RemoteAlarmPolicy
import com.yydsxwh.kemiao.days.data.remote.RemoteAlarmClient
import com.yydsxwh.kemiao.days.ui.theme.DaysTheme
import kotlin.concurrent.thread

class AlarmActivity : ComponentActivity() {
    private var ringtone: Ringtone? = null
    private var vibrator: Vibrator? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if (Build.VERSION.SDK_INT >= 27) {
            setShowWhenLocked(true)
            setTurnScreenOn(true)
        }
        val remoteId = intent.getStringExtra(RemoteAlarmScheduler.EXTRA_ID).orEmpty()
        if (remoteId.isNotBlank()) {
            showRemote(remoteId)
            return
        }
        val ruleId = intent.getStringExtra("ruleId").orEmpty()
        val occurrenceKey = intent.getStringExtra("occurrenceKey").orEmpty()
        val data = LocalStore(this).load()
        val rule = data.reminderRules.find { it.id == ruleId && it.enabled }
        val title = rule?.let { displayTitle(data, it.targetType, it.targetId) } ?: intent.getStringExtra("title")
        if (rule?.delivery == "alarm") {
            startRing()
            startVibration()
        }
        setContent {
            DaysTheme {
                if (title == null || rule == null) {
                    Text("这条事项已经完成或删除", modifier = Modifier.padding(24.dp))
                } else {
                    AlarmScreen(title, rule.snoozeMinutes) { minutes ->
                        if (minutes != null) ReminderScheduler(this).snooze(ruleId, occurrenceKey, minutes)
                        finish()
                    }
                }
            }
        }
    }

    private fun showRemote(remoteId: String) {
        val record = RemoteAlarmStore(this).load().find { it.remoteAlarmId == remoteId }
        val title = intent.getStringExtra(RemoteAlarmScheduler.EXTRA_TITLE) ?: record?.title ?: "好友叫醒"
        val creator = intent.getStringExtra(RemoteAlarmScheduler.EXTRA_CREATOR) ?: record?.creatorName ?: "好友"
        val entity = intent.getStringExtra(RemoteAlarmScheduler.EXTRA_ENTITY) ?: record?.entityTitle
        val note = intent.getStringExtra(RemoteAlarmScheduler.EXTRA_NOTE) ?: record?.note
        val trigger = intent.getStringExtra(RemoteAlarmScheduler.EXTRA_TRIGGER) ?: record?.triggerAt
        val zone = record?.timezone ?: "Asia/Shanghai"
        val whenText = trigger?.let { runCatching { RemoteAlarmPolicy.describeTrigger(it, zone) }.getOrNull() } ?: ""
        val allowSnooze = intent.getBooleanExtra(RemoteAlarmScheduler.EXTRA_SNOOZE, record?.allowSnooze ?: true)
        if (intent.getBooleanExtra(RemoteAlarmScheduler.EXTRA_SOUND, record?.sound ?: true)) startRing()
        if (intent.getBooleanExtra(RemoteAlarmScheduler.EXTRA_VIBRATE, record?.vibrate ?: true)) startVibration()
        setContent {
            DaysTheme {
                AlarmScreen(title, 10, creator, entity, note, whenText, allowSnooze) { minutes ->
                    if (minutes != null && record != null) RemoteAlarmScheduler(this).snooze(record, minutes)
                    else report(remoteId, "fired", "")
                    NotificationManagerCompatCancel(this, record?.requestCode ?: remoteId.hashCode())
                    finish()
                }
            }
        }
    }

    private fun startRing() {
        val uri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM)
        ringtone = RingtoneManager.getRingtone(this, uri)?.also { tone ->
            if (Build.VERSION.SDK_INT >= 21) {
                tone.audioAttributes = AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM).build()
            }
            if (Build.VERSION.SDK_INT >= 28) tone.isLooping = true
            tone.play()
        }
    }

    private fun startVibration() {
        vibrator = getSystemService(Vibrator::class.java)
        if (Build.VERSION.SDK_INT >= 26) vibrator?.vibrate(VibrationEffect.createWaveform(longArrayOf(0, 700, 400, 700), 0))
        else @Suppress("DEPRECATION") vibrator?.vibrate(longArrayOf(0, 700, 400, 700), 0)
    }

    private fun report(id: String, action: String, reason: String) {
        thread {
            runCatching {
                val token = SecureSession(this).token() ?: return@runCatching
                RemoteAlarmClient(tokenProvider = { token }).report(id, action, reason)
            }
        }
    }

    override fun onDestroy() {
        ringtone?.stop()
        vibrator?.cancel()
        super.onDestroy()
    }
}

private fun NotificationManagerCompatCancel(context: android.content.Context, code: Int) {
    androidx.core.app.NotificationManagerCompat.from(context).cancel(code)
}

@Composable
private fun AlarmScreen(
    title: String,
    snoozeMinutes: Int,
    creator: String? = null,
    entity: String? = null,
    note: String? = null,
    whenText: String = "",
    allowSnooze: Boolean = true,
    onDone: (Int?) -> Unit,
) {
    Column(Modifier.fillMaxSize().padding(24.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text(if (creator.isNullOrBlank()) "闹钟" else "$creator 叫醒你", style = MaterialTheme.typography.labelLarge)
        Text(title, style = MaterialTheme.typography.headlineMedium)
        if (whenText.isNotBlank()) Text(whenText)
        if (!entity.isNullOrBlank()) Text("关联：$entity")
        if (!note.isNullOrBlank()) Text(note)
        Button(onClick = { onDone(null) }) { Text("停止") }
        if (allowSnooze) {
            Button(onClick = { onDone(snoozeMinutes.coerceIn(1, 120)) }) { Text("稍后提醒 $snoozeMinutes 分钟") }
            TextButton(onClick = { onDone(10) }) { Text("稍后提醒 10 分钟") }
        }
    }
}
