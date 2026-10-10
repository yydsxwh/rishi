package com.yydsxwh.kemiao.days.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.material3.Button
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.yydsxwh.kemiao.days.data.model.UpdateProgress
import com.yydsxwh.kemiao.days.update.UpdateUiState

@Composable
fun UpdateProgressCard(state: UpdateUiState, onPause: () -> Unit, onResume: () -> Unit, onCancel: () -> Unit, onRetry: () -> Unit, onInstallPermission: () -> Unit) {
    if (state.phase == "idle") return
    val percent = UpdateProgress.percent(state.bytesRead, state.totalBytes)
    val title = if (state.versionName.isBlank()) "正在更新颗秒日事" else "正在下载颗秒日事 v${state.versionName}"
    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text(if (state.phase == "success" || state.phase == "failed" || state.phase == "waiting_install" || state.phase == "installing" || state.phase == "need_permission" || state.phase == "verifying") state.detail else title, style = MaterialTheme.typography.titleMedium)
        if (state.phase == "downloading" || state.phase == "connecting" || state.phase == "paused" || state.phase == "verifying") {
            if (percent == null) LinearProgressIndicator(Modifier.fillMaxWidth())
            else LinearProgressIndicator(progress = { percent / 100f }, modifier = Modifier.fillMaxWidth())
            Text(percent?.let { "$it%" } ?: "大小未知，无法计算百分比")
            val downloaded = UpdateProgress.sizeLabel(state.bytesRead)
            Text(if (state.totalBytes == null) "已下载：$downloaded" else "已下载：$downloaded / ${UpdateProgress.sizeLabel(state.totalBytes)}")
            if (state.phase == "downloading") {
                Text("实时网速：${UpdateProgress.speedLabel(state.bytesPerSecond)}")
                UpdateProgress.remainingLabel(UpdateProgress.remainingSeconds(state.bytesRead, state.totalBytes, state.bytesPerSecond))?.let { Text(it) }
            }
        }
        if (state.phase == "failed") Text(state.detail, color = MaterialTheme.colorScheme.error)
        if (state.phase == "downloading" || state.phase == "connecting") {
            TextButton(onClick = onPause, modifier = Modifier.heightIn(min = 48.dp)) { Text("暂停") }
            Button(onClick = onCancel, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) { Text("取消下载") }
        }
        if (state.phase == "paused") {
            Button(onClick = onResume, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) { Text("继续下载") }
            TextButton(onClick = onCancel) { Text("取消下载") }
        }
        if (state.phase == "failed") {
            Button(onClick = onRetry, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) { Text("重试") }
            TextButton(onClick = onCancel) { Text("关闭") }
        }
        if (state.phase == "need_permission") {
            Button(onClick = onInstallPermission, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) { Text("去允许安装") }
        }
    }
}
