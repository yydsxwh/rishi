package com.yydsxwh.kemiao.days.ui

import android.widget.NumberPicker
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
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
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import com.yydsxwh.kemiao.days.data.model.AlarmClock
import java.time.Instant
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneOffset

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
    LaunchedEffect(dateOpen, initialMillis) {
        if (dateOpen && initialMillis != null) pickerState.selectedDateMillis = initialMillis
    }
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Button(onClick = { dateOpen = true }, modifier = Modifier.fillMaxWidth().height(52.dp)) {
            Text(if (date.isBlank()) "选择日期" else "日期 $date")
        }
        Button(onClick = { timeOpen = true }, modifier = Modifier.fillMaxWidth().height(52.dp)) {
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
                    Text("选择日期", style = MaterialTheme.typography.titleLarge)
                    Column(Modifier.weight(1f).verticalScroll(rememberScrollState())) {
                        DatePicker(state = pickerState, modifier = Modifier.fillMaxWidth())
                    }
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                        TextButton(onClick = { dateOpen = false }) { Text("取消") }
                        TextButton(onClick = {
                            val millis = pickerState.selectedDateMillis
                            if (millis != null) {
                                onDate(Instant.ofEpochMilli(millis).atZone(ZoneOffset.UTC).toLocalDate().toString())
                            }
                            dateOpen = false
                        }) { Text("确定") }
                    }
                }
            }
        }
    }
    if (timeOpen) {
        TimeWheelDialog(
            hour = clock.hour,
            minute = clock.minute,
            second = clock.second,
            onChange = { hour, minute, second -> onTime(AlarmClock.formatClock(hour, minute, second)) },
            onDismiss = { timeOpen = false },
        )
    }
}

@Composable
private fun TimeWheelDialog(
    hour: Int,
    minute: Int,
    second: Int,
    onChange: (Int, Int, Int) -> Unit,
    onDismiss: () -> Unit,
) {
    var hourValue by rememberSaveable { mutableIntStateOf(hour) }
    var minuteValue by rememberSaveable { mutableIntStateOf(minute) }
    var secondValue by rememberSaveable { mutableIntStateOf(second) }
    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(usePlatformDefaultWidth = false, decorFitsSystemWindows = true),
    ) {
        Surface(Modifier.fillMaxWidth().padding(16.dp)) {
            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text("选择时间", style = MaterialTheme.typography.titleLarge)
                Text(
                    AlarmClock.formatClock(hourValue, minuteValue, secondValue),
                    style = MaterialTheme.typography.headlineMedium,
                )
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Wheel("时", hourValue, 23, Modifier.weight(1f)) { hourValue = it }
                    Wheel("分", minuteValue, 59, Modifier.weight(1f)) { minuteValue = it }
                    Wheel("秒", secondValue, 59, Modifier.weight(1f)) { secondValue = it }
                }
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                    TextButton(onClick = onDismiss) { Text("取消") }
                    TextButton(onClick = {
                        onChange(hourValue, minuteValue, secondValue)
                        onDismiss()
                    }) { Text("确定") }
                }
            }
        }
    }
}

@Composable
private fun Wheel(label: String, value: Int, max: Int, modifier: Modifier, onChange: (Int) -> Unit) {
    Column(modifier, horizontalAlignment = Alignment.CenterHorizontally) {
        Text(label, style = MaterialTheme.typography.titleMedium)
        AndroidView(
            modifier = Modifier.fillMaxWidth().height(180.dp),
            factory = { context ->
                NumberPicker(context).apply {
                    minValue = 0
                    maxValue = max
                    displayedValues = Array(max + 1) { index -> "%02d".format(index) }
                    wrapSelectorWheel = true
                    this.value = value.coerceIn(0, max)
                    setOnValueChangedListener { _, _, newValue -> onChange(newValue) }
                }
            },
            update = { picker ->
                if (picker.maxValue != max) picker.maxValue = max
                val next = value.coerceIn(0, max)
                if (picker.value != next) picker.value = next
            },
        )
    }
}
