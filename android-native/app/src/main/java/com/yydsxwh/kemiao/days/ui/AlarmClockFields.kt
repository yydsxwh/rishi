package com.yydsxwh.kemiao.days.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material3.Button
import androidx.compose.material3.DatePicker
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import com.yydsxwh.kemiao.days.data.model.AlarmClock
import java.time.Instant
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneOffset

/**
 * 日期日历必须放在有明确高度的容器里。
 * 外层再套 verticalScroll 会给日历无限高度，格子出不来，看起来就像点了没反应。
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AlarmWhenFields(
    date: String,
    time: String,
    onDate: (String) -> Unit,
    onTime: (String) -> Unit,
    futureOnly: Boolean,
) {
    var dateOpen by rememberSaveable { mutableStateOf(false) }
    var timeOpen by rememberSaveable { mutableStateOf(false) }
    val clock = AlarmClock.parseClock(time) ?: LocalTime.of(10, 30, 0)
    val shown = AlarmClock.formatClock(clock.hour, clock.minute, clock.second)
    val problem = if (futureOnly) AlarmClock.alarmProblem(date, shown) else null
    val initialMillis = runCatching {
        LocalDate.parse(date).atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli()
    }.getOrNull()
    val year = LocalDate.now().year
    val pickerState = rememberDatePickerState(
        initialSelectedDateMillis = initialMillis,
        yearRange = (year - 1)..(year + 10),
    )
    LaunchedEffect(dateOpen) {
        if (dateOpen && initialMillis != null) pickerState.selectedDateMillis = initialMillis
    }
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Button(onClick = { dateOpen = true }, modifier = Modifier.fillMaxWidth().heightIn(min = 52.dp)) {
            Text(if (date.isBlank()) "选择日期" else "日期 $date")
        }
        Button(onClick = { timeOpen = true }, modifier = Modifier.fillMaxWidth().heightIn(min = 52.dp)) {
            Text("时间 $shown")
        }
        Text("预览 ${AlarmClock.preview(date, shown)}", style = MaterialTheme.typography.titleMedium)
        if (problem != null) Text(problem, color = MaterialTheme.colorScheme.error)
    }
    if (dateOpen) {
        Dialog(
            onDismissRequest = { dateOpen = false },
            properties = DialogProperties(usePlatformDefaultWidth = false, decorFitsSystemWindows = true),
        ) {
            Surface(Modifier.fillMaxSize()) {
                Column(Modifier.fillMaxSize().padding(12.dp)) {
                    Text("选择日期", style = MaterialTheme.typography.titleLarge, modifier = Modifier.padding(bottom = 8.dp))
                    DatePicker(state = pickerState, modifier = Modifier.weight(1f).fillMaxWidth())
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                        TextButton(onClick = { dateOpen = false }, modifier = Modifier.heightIn(min = 48.dp)) { Text("取消") }
                        TextButton(
                            onClick = {
                                val millis = pickerState.selectedDateMillis
                                if (millis != null) {
                                    onDate(Instant.ofEpochMilli(millis).atZone(ZoneOffset.UTC).toLocalDate().toString())
                                }
                                dateOpen = false
                            },
                            modifier = Modifier.heightIn(min = 48.dp),
                        ) { Text("确定") }
                    }
                }
            }
        }
    }
    if (timeOpen) {
        TimeListDialog(
            hour = clock.hour,
            minute = clock.minute,
            second = clock.second,
            onConfirm = { hour, minute, second ->
                onTime(AlarmClock.formatClock(hour, minute, second))
                timeOpen = false
            },
            onDismiss = { timeOpen = false },
        )
    }
}

@Composable
private fun TimeListDialog(
    hour: Int,
    minute: Int,
    second: Int,
    onConfirm: (Int, Int, Int) -> Unit,
    onDismiss: () -> Unit,
) {
    var hourValue by remember(hour) { mutableIntStateOf(hour) }
    var minuteValue by remember(minute) { mutableIntStateOf(minute) }
    var secondValue by remember(second) { mutableIntStateOf(second) }
    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(usePlatformDefaultWidth = false, decorFitsSystemWindows = true),
    ) {
        Surface(Modifier.fillMaxSize()) {
            Column(Modifier.fillMaxSize().padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("选择时间", style = MaterialTheme.typography.titleLarge)
                Text(
                    AlarmClock.formatClock(hourValue, minuteValue, secondValue),
                    style = MaterialTheme.typography.headlineMedium,
                )
                Row(Modifier.weight(1f).fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    NumberList("时", hourValue, 23, Modifier.weight(1f)) { hourValue = it }
                    NumberList("分", minuteValue, 59, Modifier.weight(1f)) { minuteValue = it }
                    NumberList("秒", secondValue, 59, Modifier.weight(1f)) { secondValue = it }
                }
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                    TextButton(onClick = onDismiss, modifier = Modifier.heightIn(min = 48.dp)) { Text("取消") }
                    TextButton(
                        onClick = { onConfirm(hourValue, minuteValue, secondValue) },
                        modifier = Modifier.heightIn(min = 48.dp),
                    ) { Text("确定") }
                }
            }
        }
    }
}

@Composable
private fun NumberList(label: String, value: Int, max: Int, modifier: Modifier, onChange: (Int) -> Unit) {
    val state = rememberLazyListState()
    LaunchedEffect(value) {
        state.scrollToItem(value.coerceIn(0, max))
    }
    Column(modifier) {
        Text(label, style = MaterialTheme.typography.titleMedium)
        LazyColumn(state = state, modifier = Modifier.fillMaxWidth().height(280.dp)) {
            items(max + 1) { item ->
                TextButton(
                    onClick = { onChange(item) },
                    modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp),
                ) {
                    Text(
                        "%02d".format(item),
                        style = MaterialTheme.typography.titleLarge,
                        fontWeight = if (item == value) FontWeight.Bold else FontWeight.Normal,
                        color = if (item == value) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurface,
                    )
                }
            }
        }
    }
}
