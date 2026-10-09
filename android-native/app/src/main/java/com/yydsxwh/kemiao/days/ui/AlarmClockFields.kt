package com.yydsxwh.kemiao.days.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
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
    var calendarOpen by rememberSaveable { mutableStateOf(false) }
    val initialMillis = runCatching {
        LocalDate.parse(date).atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli()
    }.getOrNull()
    val pickerState = rememberDatePickerState(initialSelectedDateMillis = initialMillis)
    val clock = AlarmClock.parseClock(time) ?: LocalTime.of(10, 30, 0)
    val shown = AlarmClock.formatClock(clock.hour, clock.minute, clock.second)
    val problem = if (futureOnly) AlarmClock.alarmProblem(date, shown) else null
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Button(onClick = { calendarOpen = true }, modifier = Modifier.fillMaxWidth()) {
            Text(if (date.isBlank()) "选择日期" else "日期 $date")
        }
        if (calendarOpen) {
            DatePickerDialog(
                onDismissRequest = { calendarOpen = false },
                confirmButton = {
                    TextButton(onClick = {
                        val millis = pickerState.selectedDateMillis
                        if (millis != null) {
                            onDate(Instant.ofEpochMilli(millis).atZone(ZoneOffset.UTC).toLocalDate().toString())
                        }
                        calendarOpen = false
                    }) { Text("确定") }
                },
                dismissButton = { TextButton(onClick = { calendarOpen = false }) { Text("取消") } },
            ) {
                DatePicker(state = pickerState)
            }
        }
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            PartMenu("时", clock.hour, 23, Modifier.weight(1f)) { onTime(AlarmClock.formatClock(it, clock.minute, clock.second)) }
            PartMenu("分", clock.minute, 59, Modifier.weight(1f)) { onTime(AlarmClock.formatClock(clock.hour, it, clock.second)) }
            PartMenu("秒", clock.second, 59, Modifier.weight(1f)) { onTime(AlarmClock.formatClock(clock.hour, clock.minute, it)) }
        }
        Text("预览 ${AlarmClock.preview(date, shown)}")
        if (problem != null) Text(problem, color = MaterialTheme.colorScheme.error)
    }
}

@Composable
private fun PartMenu(label: String, value: Int, max: Int, modifier: Modifier, onChange: (Int) -> Unit) {
    var open by rememberSaveable { mutableStateOf(false) }
    OutlinedButton(onClick = { open = true }, modifier = modifier) {
        Text("$label ${"%02d".format(value)}")
    }
    if (open) {
        AlertDialog(
            onDismissRequest = { open = false },
            title = { Text(label) },
            text = {
                Column(Modifier.heightIn(max = 360.dp).verticalScroll(rememberScrollState())) {
                    (0..max).forEach { item ->
                        TextButton(onClick = { onChange(item); open = false }, modifier = Modifier.fillMaxWidth()) {
                            Text("%02d".format(item), style = MaterialTheme.typography.titleMedium)
                        }
                    }
                }
            },
            confirmButton = { TextButton(onClick = { open = false }) { Text("关闭") } },
        )
    }
}
