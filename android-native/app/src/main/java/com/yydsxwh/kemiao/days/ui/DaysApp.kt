package com.yydsxwh.kemiao.days.ui

import android.app.Activity
import android.content.Intent
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.School
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.outlined.Cloud
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import com.yydsxwh.kemiao.days.app.DaysUiState
import com.yydsxwh.kemiao.days.app.DaysViewModel
import com.yydsxwh.kemiao.days.data.model.COUNTDOWN_COLORS
import com.yydsxwh.kemiao.days.data.model.COUNTDOWN_EMOJIS
import com.yydsxwh.kemiao.days.data.model.COURSE_COLORS
import com.yydsxwh.kemiao.days.data.model.CalendarEvent
import com.yydsxwh.kemiao.days.data.model.Countdown
import com.yydsxwh.kemiao.days.data.model.Course
import com.yydsxwh.kemiao.days.data.model.EXAM_KIND_LABEL
import com.yydsxwh.kemiao.days.data.model.Exam
import com.yydsxwh.kemiao.days.data.model.NOTE_COLORS
import com.yydsxwh.kemiao.days.data.model.Note
import com.yydsxwh.kemiao.days.data.model.PRIORITY_LABEL
import com.yydsxwh.kemiao.days.data.model.RecurrenceRule
import com.yydsxwh.kemiao.days.data.model.RecurringReminder
import com.yydsxwh.kemiao.days.data.model.SelfScheduleItem
import com.yydsxwh.kemiao.days.data.model.Todo
import com.yydsxwh.kemiao.days.data.model.WEEKDAY_LABEL
import com.yydsxwh.kemiao.days.data.model.daysInMonth
import com.yydsxwh.kemiao.days.data.model.daysUntil
import com.yydsxwh.kemiao.days.data.model.eventMatchesDate
import com.yydsxwh.kemiao.days.data.model.formatLong
import com.yydsxwh.kemiao.days.data.model.formatRecurrence
import com.yydsxwh.kemiao.days.data.model.formatShort
import com.yydsxwh.kemiao.days.data.model.guessTermKind
import com.yydsxwh.kemiao.days.data.model.greeting
import com.yydsxwh.kemiao.days.data.model.nextOccurrence
import com.yydsxwh.kemiao.days.data.model.nowMillis
import com.yydsxwh.kemiao.days.data.model.occursOn
import com.yydsxwh.kemiao.days.data.model.Term
import com.yydsxwh.kemiao.days.data.model.courseInTeachingWeek
import com.yydsxwh.kemiao.days.data.model.shiftWeek
import com.yydsxwh.kemiao.days.data.model.startOfWeek
import com.yydsxwh.kemiao.days.data.model.teachingWeekNumber
import com.yydsxwh.kemiao.days.data.model.termLabel
import com.yydsxwh.kemiao.days.data.model.toIsoDate
import com.yydsxwh.kemiao.days.data.model.weekDays
import com.yydsxwh.kemiao.days.data.model.todayIso
import com.yydsxwh.kemiao.days.data.model.uid
import com.yydsxwh.kemiao.days.ui.theme.Brand
import com.yydsxwh.kemiao.days.ui.theme.CampusFilterChip
import com.yydsxwh.kemiao.days.ui.theme.Hot
import com.yydsxwh.kemiao.days.ui.theme.Ink
import com.yydsxwh.kemiao.days.ui.theme.Muted
import com.yydsxwh.kemiao.days.ui.theme.Paper
import com.yydsxwh.kemiao.days.ui.theme.PinkSoft
import com.yydsxwh.kemiao.days.data.model.weekdayOf
import com.yydsxwh.kemiao.days.data.sync.SyncState
import java.time.LocalDate

private data class Tab(val route: String, val label: String, val icon: androidx.compose.ui.graphics.vector.ImageVector)

private val TABS = listOf(
    Tab("today", "我的一天", Icons.Filled.Home),
    Tab("calendar", "日历", Icons.Filled.CalendarMonth),
    Tab("timetable", "时间表", Icons.Filled.School),
    Tab("days", "日子", Icons.Filled.Favorite),
    Tab("notes", "便签", Icons.Filled.Edit),
)

private val TIMETABLE_SECTIONS = listOf(
    "courses" to "课表",
    "exams" to "考试",
    "self" to "自律",
    "remind" to "提醒",
)

/** 旧入口仍落到合并后的页面，不另起一套数据。 */
private fun primaryOf(route: String): String = when (route.substringBefore("?")) {
    "todos" -> "today"
    "schedule", "exams", "self", "selfschedule", "more" -> "timetable"
    "countdown" -> "days"
    else -> route.substringBefore("?")
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DaysApp(viewModel: DaysViewModel, activity: Activity) {
    val state by viewModel.state.collectAsState()
    val nav = rememberNavController()
    val snack = remember { SnackbarHostState() }
    val route = nav.currentBackStackEntryAsState().value?.destination?.route ?: "today"
    val primary = primaryOf(route)
    val tabRoutes = TABS.map { it.route }.toSet()
    var timetableSection by rememberSaveable { mutableStateOf("courses") }
    var todayFocus by rememberSaveable { mutableStateOf<String?>(null) }
    var accountOpen by rememberSaveable { mutableStateOf(false) }
    val title = when (primary) {
        "today" -> "我的一天"
        "calendar" -> "日历"
        "timetable" -> "时间表"
        "days" -> "日子"
        "notes" -> "便签"
        "search" -> "搜索"
        "admin" -> "管理后台"
        "wake" -> "好友叫醒"
        else -> "颗秒日事"
    }
    LaunchedEffect(state.notice, state.error) {
        val msg = state.error ?: state.notice
        if (!msg.isNullOrBlank()) {
            snack.showSnackbar(msg)
            viewModel.dismissNotice()
        }
    }
    // 主内容必须吃掉 Scaffold 的 padding。星期栏若画在这块区域外面，下滑就会压住底栏。
    Scaffold(
        containerColor = Paper,
        topBar = {
            TopAppBar(
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = Paper,
                    titleContentColor = Ink,
                    navigationIconContentColor = Ink,
                    actionIconContentColor = Brand,
                ),
                title = { Text(title, maxLines = 1, softWrap = false, overflow = TextOverflow.Ellipsis) },
                navigationIcon = {
                    if (primary !in tabRoutes) {
                        IconButton(onClick = { nav.popBackStack() }) {
                            Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "返回")
                        }
                    }
                },
                actions = {
                    IconButton(onClick = { accountOpen = true }) {
                        Icon(Icons.Outlined.Cloud, contentDescription = syncLabel(state.sync))
                    }
                    IconButton(onClick = { nav.navigate("search") { launchSingleTop = true } }) {
                        Icon(Icons.Filled.Search, contentDescription = "搜索")
                    }
                },
            )
        },
        bottomBar = {
            if (primary in tabRoutes) {
                DaysBottomBar(selected = primary) { target ->
                    nav.navigate(target) {
                        popUpTo("today") { saveState = true }
                        launchSingleTop = true
                        restoreState = true
                    }
                }
            }
        },
        snackbarHost = { SnackbarHost(snack) },
    ) { padding ->
        if (!state.ready) {
            Box(Modifier.fillMaxSize().padding(padding), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
            return@Scaffold
        }
        PullToRefreshBox(isRefreshing = state.sync == SyncState.Syncing, onRefresh = { viewModel.syncNow() }, modifier = Modifier.padding(padding)) {
            NavHost(navController = nav, startDestination = "today") {
                composable("today") { TodayScreen(state, viewModel, activity, todayFocus == "todos") }
                composable("calendar") { CalendarScreen(state, viewModel) }
                composable("timetable") { TimetableScreen(state, viewModel, activity, timetableSection, { timetableSection = it }, { nav.navigate("wake") }) }
                composable("wake") { FriendWakeScreen(state.data) }
                composable("days") { CountdownScreen(state, viewModel) }
                composable("notes") { NotesScreen(state, viewModel) }
                composable("todos") {
                    LaunchedEffect(Unit) {
                        todayFocus = "todos"
                        nav.navigate("today") { popUpTo("today") { saveState = true }; launchSingleTop = true; restoreState = true }
                    }
                }
                composable("schedule") {
                    LaunchedEffect(Unit) {
                        timetableSection = "courses"
                        nav.navigate("timetable") { popUpTo("today") { saveState = true }; launchSingleTop = true; restoreState = true }
                    }
                }
                composable("exams") {
                    LaunchedEffect(Unit) {
                        timetableSection = "exams"
                        nav.navigate("timetable") { popUpTo("today") { saveState = true }; launchSingleTop = true; restoreState = true }
                    }
                }
                composable("self") {
                    LaunchedEffect(Unit) {
                        timetableSection = "self"
                        nav.navigate("timetable") { popUpTo("today") { saveState = true }; launchSingleTop = true; restoreState = true }
                    }
                }
                composable("selfschedule") {
                    LaunchedEffect(Unit) {
                        timetableSection = "self"
                        nav.navigate("timetable") { popUpTo("today") { saveState = true }; launchSingleTop = true; restoreState = true }
                    }
                }
                composable("more") {
                    LaunchedEffect(Unit) {
                        timetableSection = "remind"
                        nav.navigate("timetable") { popUpTo("today") { saveState = true }; launchSingleTop = true; restoreState = true }
                    }
                }
                composable("search") { SearchScreen(state, viewModel) }
                composable("admin") { AdminScreen(state, viewModel) }
            }
        }
    }
    if (accountOpen) AccountDialog(state, viewModel, activity) { accountOpen = false }
    ImportPreviewDialog(state, viewModel)
}

@Composable
internal fun DaysBottomBar(selected: String, onSelect: (String) -> Unit) {
    NavigationBar(
        modifier = Modifier.testTag("bottom-nav").heightIn(min = 80.dp),
        containerColor = Paper,
        contentColor = Muted,
        tonalElevation = 0.dp,
    ) {
        TABS.forEach { tab ->
            NavigationBarItem(
                selected = selected == tab.route,
                onClick = { onSelect(tab.route) },
                colors = NavigationBarItemDefaults.colors(
                    selectedIconColor = Hot,
                    selectedTextColor = Hot,
                    indicatorColor = PinkSoft,
                    unselectedIconColor = Muted,
                    unselectedTextColor = Muted,
                ),
                icon = { Icon(tab.icon, contentDescription = tab.label) },
                label = {
                    Text(
                        tab.label,
                        maxLines = 1,
                        softWrap = false,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.testTag("nav-${tab.route}"),
                    )
                },
                alwaysShowLabel = true,
                modifier = Modifier.heightIn(min = 48.dp).testTag("nav-item-${tab.route}"),
            )
        }
    }
}

private fun syncLabel(state: SyncState) = when (state) {
    SyncState.Synced -> "已同步"
    SyncState.Syncing -> "正在同步"
    SyncState.Offline -> "离线，改动留在本机"
    SyncState.Error -> "同步出错"
    SyncState.SignedOut -> "未登录"
    SyncState.LocalOnly -> "本机模式"
    SyncState.Starting -> "正在检查登录"
}

@Composable
private fun TodayScreen(state: DaysUiState, vm: DaysViewModel, activity: Activity, focusTodos: Boolean) {
    val today = todayIso()
    val weekday = weekdayOf(today)
    val courses = state.data.courses.filter { it.weekday == weekday }
    val exams = state.data.exams.filter { it.date == today }
    val downs = state.data.countdowns.sortedBy { daysUntil(nextOccurrence(it.date, it.repeatYearly)) }
    val pins = state.data.notes.filter { it.pinned }
    Column(Modifier.fillMaxSize()) {
        Column(Modifier.padding(horizontal = 16.dp, vertical = 12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text("${greeting()}，${state.user?.name ?: "同学"}", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(formatLong(), color = MaterialTheme.colorScheme.onSurfaceVariant)
            Text(syncLabel(state.sync), style = MaterialTheme.typography.bodySmall)
            Text("今天的课 ${courses.size} · 考试 ${exams.size} · 日子 ${downs.size} · 钉住便签 ${pins.size}", style = MaterialTheme.typography.bodySmall)
            if (state.user == null) Button(onClick = { vm.login(activity) }) { Text("登录") }
        }
        Text("待办", Modifier.padding(horizontal = 16.dp).testTag(if (focusTodos) "today-todos-focus" else "today-todos"), fontWeight = FontWeight.SemiBold)
        Box(Modifier.weight(1f)) { TodosScreen(state, vm) }
    }
}

@Composable
private fun SectionCard(title: String, empty: Boolean, emptyText: String, content: @Composable () -> Unit) {
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text(title, fontWeight = FontWeight.SemiBold)
            if (empty) Text(emptyText, color = MaterialTheme.colorScheme.onSurfaceVariant) else content()
        }
    }
}

@Composable
private fun CalendarScreen(state: DaysUiState, vm: DaysViewModel) {
    var cursor by remember { mutableStateOf(LocalDate.now().withDayOfMonth(1)) }
    var selected by remember { mutableStateOf(todayIso()) }
    var show by remember { mutableStateOf(false) }
    var editing by remember { mutableStateOf<CalendarEvent?>(null) }
    var pendingDelete by remember { mutableStateOf<CalendarEvent?>(null) }
    var detailDate by remember { mutableStateOf<String?>(null) }
    var editingTodo by remember { mutableStateOf<Todo?>(null) }
    var editingExam by remember { mutableStateOf<Exam?>(null) }
    var openedCourse by remember { mutableStateOf<Pair<Course, String>?>(null) }
    var editingCourse by remember { mutableStateOf<Course?>(null) }
    val days = daysInMonth(cursor.year, cursor.monthValue)
    val firstWeekday = ((cursor.dayOfWeek.value) % 7)
    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp).padding(bottom = 24.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
            TextButton(onClick = { cursor = cursor.minusMonths(1) }) { Text("上月") }
            Text("${cursor.year} 年 ${cursor.monthValue} 月", fontWeight = FontWeight.Bold)
            TextButton(onClick = { cursor = cursor.plusMonths(1) }) { Text("下月") }
        }
        Row { listOf("一", "二", "三", "四", "五", "六", "日").forEach { Text(it, Modifier.weight(1f), style = MaterialTheme.typography.labelMedium) } }
        val cells = List(firstWeekday) { null } + (1..days).map { it } + List((7 - (firstWeekday + days) % 7) % 7) { null }
        cells.chunked(7).forEach { week ->
            Row {
                week.forEach { day ->
                    val iso = day?.let { toIsoDate(cursor.withDayOfMonth(it)) }
                    val marked = iso != null && hasItems(state, iso)
                    Box(
                        Modifier.weight(1f).heightIn(min = 56.dp).clip(CircleShape).clickable(enabled = iso != null) { if (iso != null) { selected = iso; detailDate = iso } }.background(if (iso == selected) MaterialTheme.colorScheme.primary.copy(alpha = 0.2f) else Color.Transparent),
                        contentAlignment = Alignment.Center,
                    ) {
                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            Text(day?.toString() ?: "")
                            if (iso != null) {
                                val label = HolidayLines(state, iso).firstOrNull()
                                if (label != null) Text(label, style = MaterialTheme.typography.labelSmall, maxLines = 1)
                            }
                            if (marked) Box(Modifier.size(5.dp).clip(CircleShape).background(MaterialTheme.colorScheme.tertiary))
                            val eventCount = if (iso == null) 0 else state.data.calendarEvents.count { eventMatchesDate(it, iso) }
                            if (eventCount > 1) Text("+${eventCount - 1}", style = MaterialTheme.typography.labelSmall)
                        }
                    }
                }
            }
        }
        val items = itemsOn(state, selected) + HolidayLines(state, selected)
        val events = state.data.calendarEvents.filter { eventMatchesDate(it, selected) }.sortedWith(compareBy<CalendarEvent> { !it.allDay }.thenBy { it.startTime ?: "99:99" }.thenBy { it.createdAt }.thenBy { it.id })
        Text("${formatShort(selected)} · ${items.size + events.size} 条", fontWeight = FontWeight.SemiBold)
        Text("日程", fontWeight = FontWeight.SemiBold)
        if (events.isEmpty()) Text("这一天还没有日程", color = MaterialTheme.colorScheme.onSurfaceVariant)
        events.forEach { event ->
            Card(Modifier.fillMaxWidth().testTag("event-card-${event.id}")) {
                Column(Modifier.padding(horizontal = 12.dp, vertical = 12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text(event.title, fontWeight = FontWeight.Medium)
                    Text(listOfNotNull(if (event.allDay) "全天" else event.startTime, event.endTime?.let { "到 $it" }, event.location, event.note).joinToString(" · "), style = MaterialTheme.typography.bodySmall)
                    if (event.repeat != "none") Text("重复日程。删除会去掉整条规则，不能只删这一天。", style = MaterialTheme.typography.bodySmall)
                    EventActionRow(
                        onEdit = { editing = event },
                        onDelete = { pendingDelete = event },
                        editTag = "event-edit-${event.id}",
                        deleteTag = "event-delete-${event.id}",
                        alarm = { ReminderRulesButton(state, vm, "event", event.id, "${event.title} ${event.date} ${event.startTime ?: "全天"}") },
                    )
                }
            }
        }
        Button(onClick = { show = true }, modifier = Modifier.fillMaxWidth()) { Text("添加日程") }
        if (items.isEmpty()) Text("这一天没有其他事项", color = MaterialTheme.colorScheme.onSurfaceVariant)
        items.forEach { Text(it) }
    }
    if (show) {
        EventEditor(initial = CalendarEvent(uid(), "", selected, "09:00", "10:00", false, null, null, COURSE_COLORS.first(), "medium", 15, "none", nowMillis()), editing = false, onDismiss = { show = false }) { vm.addEvent(it); show = false }
    }
    editing?.let { current ->
        EventEditor(initial = current, editing = true, onDismiss = { editing = null }) { vm.updateEvent(it); editing = null }
    }
    pendingDelete?.let { current ->
        AlertDialog(
            onDismissRequest = { pendingDelete = null },
            title = { Text("删除日程") },
            text = { Text(if (current.repeat == "none") "确认删除「${current.title}」？同一天的其他日程会保留。" else "确认删除「${current.title}」的整条重复日程？不能只删这一天。") },
            confirmButton = { Button(onClick = { vm.removeEvent(current.id); pendingDelete = null }) { Text("删除") } },
            dismissButton = { TextButton(onClick = { pendingDelete = null }) { Text("取消") } },
        )
    }
    detailDate?.let { iso ->
        DateDetailDialog(
            state = state,
            vm = vm,
            iso = iso,
            onOpenEvent = { id -> editing = state.data.calendarEvents.find { it.id == id } },
            onOpenTodo = { id -> editingTodo = state.data.todos.find { it.id == id } },
            onOpenCourse = { course, day -> openedCourse = course to day },
            onOpenExam = { id -> editingExam = state.data.exams.find { it.id == id } },
            onClose = { detailDate = null },
        )
    }
    editingTodo?.let { current ->
        TodoEditor(current, { editingTodo = null }) { title, date, time, pri, remind ->
            vm.updateTodo(current.copy(title = title, dueDate = date, dueTime = time, priority = pri, remindMinutes = remind))
            editingTodo = null
        }
    }
    editingExam?.let { current ->
        AlertDialog(
            onDismissRequest = { editingExam = null },
            title = { Text(current.name) },
            text = { Text("${current.date} ${current.startTime}${current.endTime?.let { "-$it" }.orEmpty()} ${current.location.orEmpty()}") },
            confirmButton = { Button(onClick = { editingExam = null }) { Text("关闭") } },
            dismissButton = { TextButton(onClick = { vm.removeExam(current.id); editingExam = null }) { Text("删除考试") } },
        )
    }
    openedCourse?.let { (course, day) ->
        val latest = state.data.courses.find { it.id == course.id } ?: course
        CourseDetailDialog(state, vm, latest, day, onEditCourse = { editingCourse = latest }, onClose = { openedCourse = null })
    }
    editingCourse?.let { current ->
        CourseEditor(current, { editingCourse = null }) { vm.updateCourse(it); editingCourse = null }
    }
}

private fun hasItems(state: DaysUiState, iso: String) =
    itemsOn(state, iso).isNotEmpty() || state.data.calendarEvents.any { eventMatchesDate(it, iso) }

private fun itemsOn(state: DaysUiState, iso: String): List<String> {
    val d = state.data
    return d.todos.filter { it.dueDate == iso }.map { "待办 ${it.title}" } +
        d.exams.filter { it.date == iso }.map { "考试 ${it.name}" } +
        d.notes.filter { it.date == iso }.map { "便签 ${it.title.ifBlank { it.body }}" } +
        d.countdowns.filter { nextOccurrence(it.date, it.repeatYearly) == iso || it.date == iso }.map { "倒数 ${it.title}" } +
        d.recurringReminders.filter { occursOn(it, iso) }.map { "周期 ${it.title}" }
}

@Composable
private fun TodosScreen(state: DaysUiState, vm: DaysViewModel) {
    var filter by remember { mutableStateOf("all") }
    var show by remember { mutableStateOf(false) }
    var editing by remember { mutableStateOf<Todo?>(null) }
    val items = state.data.todos.filter {
        when (filter) {
            "open" -> !it.done
            "done" -> it.done
            else -> true
        }
    }
    Box(Modifier.fillMaxSize()) {
        Column(Modifier.fillMaxSize().padding(16.dp)) {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                listOf("all" to "全部", "open" to "未完成", "done" to "已完成").forEach { (id, label) ->
                    CampusFilterChip(selected = filter == id, onClick = { filter = id }, label = { Text(label) })
                }
            }
            if (items.isEmpty()) EmptyState("还没有待办", "点右下角加上今天要做的事")
            LazyColumn(contentPadding = PaddingValues(top = 12.dp, bottom = 88.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                items(items, key = { it.id }) { todo ->
                    Card(Modifier.fillMaxWidth().clickable { editing = todo }) {
                        Row(Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                            Checkbox(todo.done, onCheckedChange = { vm.toggleTodo(todo.id) })
                            Column(Modifier.weight(1f)) {
                                Text(todo.title, fontWeight = FontWeight.Medium)
                                Text(listOfNotNull(todo.dueDate, todo.dueTime, PRIORITY_LABEL[todo.priority]).joinToString(" · "), style = MaterialTheme.typography.bodySmall)
                                ReminderRulesButton(state, vm, "todo", todo.id, listOfNotNull(todo.dueDate, todo.dueTime).joinToString(" "))
                            }
                            TextButton(onClick = { vm.removeTodo(todo.id) }) { Text("删除") }
                        }
                    }
                }
            }
        }
        FloatingActionButton(
            onClick = { show = true },
            modifier = Modifier.align(Alignment.BottomEnd).padding(20.dp),
            containerColor = Brand,
            contentColor = Color.White,
        ) { Icon(Icons.Filled.Add, "添加待办") }
    }
    if (show) TodoEditor(null, { show = false }) { title, date, time, pri, remind -> vm.addTodo(title, date, time, pri, remind); show = false }
    editing?.let { current ->
        TodoEditor(current, { editing = null }) { title, date, time, pri, remind ->
            vm.updateTodo(current.copy(title = title, dueDate = date, dueTime = time, priority = pri, remindMinutes = remind)); editing = null
        }
    }
}

@Composable
private fun TodoEditor(initial: Todo?, onDismiss: () -> Unit, onSave: (String, String?, String?, String, Int) -> Unit) {
    var title by remember { mutableStateOf(initial?.title.orEmpty()) }
    var date by remember { mutableStateOf(initial?.dueDate.orEmpty()) }
    var time by remember { mutableStateOf(initial?.dueTime.orEmpty()) }
    var pri by remember { mutableStateOf(initial?.priority ?: "medium") }
    var remind by remember { mutableStateOf((initial?.remindMinutes ?: 15).toString()) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(if (initial == null) "新待办" else "编辑待办") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(title, { title = it }, label = { Text("标题") }, isError = title.isBlank(), supportingText = { if (title.isBlank()) Text("请填写标题") })
                OutlinedTextField(date, { date = it }, label = { Text("到期日 YYYY-MM-DD") })
                OutlinedTextField(time, { time = it }, label = { Text("时间 HH:MM") })
                OutlinedTextField(pri, { pri = it }, label = { Text("优先级 high/medium/low") })
                OutlinedTextField(remind, { remind = it }, label = { Text("提前提醒（分钟）") })
            }
        },
        confirmButton = { Button(onClick = { if (title.isNotBlank()) onSave(title, date.ifBlank { null }, time.ifBlank { null }, pri, remind.toIntOrNull() ?: 15) }, enabled = title.isNotBlank()) { Text("保存") } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("取消") } },
    )
}

@Composable
private fun ScheduleScreen(state: DaysUiState, vm: DaysViewModel, activity: Activity) {
    var show by remember { mutableStateOf(false) }
    var editing by remember { mutableStateOf<Course?>(null) }
    var opened by remember { mutableStateOf<Pair<String, String>?>(null) }
    var confirmClear by remember { mutableStateOf(false) }
    var termsOpen by remember { mutableStateOf(false) }
    var deleteTermId by remember { mutableStateOf<String?>(null) }
    val weekday = weekdayOf(todayIso())
    val term = state.data.terms.firstOrNull { it.id == state.data.currentTermId }
    val weekStartsOn = state.data.timetableView.weekStartsOn
    var weekStart by remember(weekStartsOn) { mutableStateOf(startOfWeek(LocalDate.now(), weekStartsOn)) }
    val picker = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri != null) vm.startImport(activity, uri, "courses")
    }
    val termCourses = state.data.courses.filter { it.termId == null || it.termId == state.data.currentTermId }
    val weekNo = teachingWeekNumber(weekStart, term?.startDate, weekStartsOn)
    val days = weekDays(weekStart, LocalDate.now(), weekStartsOn, state.data.timetableView.hiddenWeekdays)
    val visibleCourses = if (state.data.timetableView.showOffWeekCourses || weekNo == null || weekNo < 1) {
        termCourses
    } else {
        termCourses.filter { courseInTeachingWeek(it, weekNo) }
    }
    val weekExams = state.data.exams.filter { exam -> days.any { it.iso == exam.date } }
    val weekTitle = if (weekNo != null && weekNo >= 1) {
        "第 $weekNo${term?.let { " / ${it.weekCount}" }.orEmpty()} 周"
    } else {
        "周课表"
    }
    val thisWeek = startOfWeek(LocalDate.now(), weekStartsOn)
    Column(Modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
            Button(onClick = { termsOpen = true }, modifier = Modifier.weight(1f)) {
                Text(term?.let { termLabel(it) } ?: "学期", maxLines = 1, softWrap = false, overflow = TextOverflow.Ellipsis)
            }
            if (state.data.terms.size > 1 && term != null) {
                TextButton(onClick = { deleteTermId = term.id }) { Text("删除学期") }
            }
        }
        Row(verticalAlignment = Alignment.CenterVertically) {
            TextButton(
                onClick = { weekStart = shiftWeek(weekStart, -1) },
                enabled = weekNo == null || weekNo > 1,
            ) { Text("上一周") }
            Column(Modifier.weight(1f), horizontalAlignment = Alignment.CenterHorizontally) {
                Text(weekTitle + if (weekStart == thisWeek) " · 本周" else "", fontWeight = FontWeight.Bold, maxLines = 1, softWrap = false)
                if (days.isNotEmpty()) {
                    val first = days.first().date
                    val last = days.last().date
                    Text("${first.monthValue}/${first.dayOfMonth} – ${last.monthValue}/${last.dayOfMonth}", color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.bodySmall, maxLines = 1)
                }
            }
            TextButton(
                onClick = { weekStart = shiftWeek(weekStart, 1) },
                enabled = term?.startDate.isNullOrBlank() || weekNo == null || weekNo < (term?.weekCount ?: Int.MAX_VALUE),
            ) { Text("下一周") }
            TextButton(onClick = { weekStart = thisWeek }) { Text("本周") }
        }
        if (visibleCourses.isEmpty()) Text("这周还没有课程。可以加一节，或导入课表图片、PDF、Word、表格。", color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.bodySmall)
        TimetableBoard(
            visibleCourses,
            Modifier.weight(1f).fillMaxWidth(),
            exams = weekExams,
            hiddenHours = state.data.timetableView.hiddenHours,
            columnDates = days.associate { it.weekday to it.iso },
            onOpenCourse = { course, iso -> opened = course.id to iso },
        )
        if (state.importing) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                CircularProgressIndicator(Modifier.size(18.dp))
                Text(state.importProgress ?: "正在识别…", Modifier.weight(1f), maxLines = 2)
                TextButton(onClick = { vm.cancelImport() }) { Text("取消") }
            }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Button(onClick = { show = true }) { Text("加课程") }
            Button(onClick = { picker.launch(IMPORT_MIME) }, enabled = !state.importing) {
                Text(if (state.importing) "识别中…" else "导入课表")
            }
            TextButton(onClick = { confirmClear = true }) { Text("清空课表") }
        }
        Text("今天星期${WEEKDAY_LABEL.getOrElse(weekday) { "?" }}。图片、PDF、Word 走平台视觉识别；表格能直接解析时不调用模型。", style = MaterialTheme.typography.bodySmall)
    }
    if (show) CourseEditor(null, { show = false }) { vm.addCourse(it); show = false }
    editing?.let { current ->
        CourseEditor(current, { editing = null }, extra = { ReminderRulesButton(state, vm, "course", current.id, "周${current.weekday} ${current.startTime}") }) { vm.updateCourse(it); editing = null }
    }
    opened?.let { (id, iso) ->
        val course = state.data.courses.find { it.id == id }
        if (course != null) {
            CourseDetailDialog(state, vm, course, iso, onEditCourse = { editing = course }, onClose = { opened = null })
        }
    }
    if (confirmClear) {
        AlertDialog(
            onDismissRequest = { confirmClear = false },
            title = { Text("清空当前课表？") },
            text = { Text("课程会按同步规则打上删除标记，不会静默覆盖云端其他数据。") },
            confirmButton = { Button(onClick = { vm.clearCourses(); confirmClear = false }) { Text("清空") } },
            dismissButton = { TextButton(onClick = { confirmClear = false }) { Text("取消") } },
        )
    }
    if (termsOpen) {
        TermManagerDialog(
            terms = state.data.terms,
            current = term,
            onDismiss = { termsOpen = false },
            onSwitch = { vm.setCurrentTerm(it) },
            onAdd = { vm.addTerm(it) },
            onDelete = { deleteTermId = it },
            onUpdate = { vm.updateTerm(it) },
        )
    }
    deleteTermId?.let { id ->
        val target = state.data.terms.firstOrNull { it.id == id }
        AlertDialog(
            onDismissRequest = { deleteTermId = null },
            title = { Text("删除学期？") },
            text = { Text("${target?.let { termLabel(it) } ?: "这个学期"}会从列表里去掉。这个学期的课程仍留在原学期下，不会混进其他学期。至少要留下一个学期。") },
            confirmButton = {
                Button(onClick = { vm.removeTerm(id); deleteTermId = null }) { Text("删除") }
            },
            dismissButton = { TextButton(onClick = { deleteTermId = null }) { Text("取消") } },
        )
    }
}

@Composable
private fun TermManagerDialog(
    terms: List<Term>,
    current: Term?,
    onDismiss: () -> Unit,
    onSwitch: (String) -> Unit,
    onAdd: (String) -> Unit,
    onDelete: (String) -> Unit,
    onUpdate: (Term) -> Unit,
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("学年学期") },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("点学期名称切换。右边可以删除。至少保留一个学期。", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                terms.forEach { item ->
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        TextButton(onClick = { onSwitch(item.id) }, modifier = Modifier.weight(1f)) {
                            Text(
                                termLabel(item),
                                color = if (item.id == current?.id) Brand else Ink,
                                fontWeight = if (item.id == current?.id) FontWeight.Bold else FontWeight.Normal,
                                maxLines = 2,
                            )
                        }
                        if (terms.size > 1) {
                            TextButton(onClick = { onDelete(item.id) }) { Text("删除") }
                        }
                    }
                }
                current?.let { term ->
                    OutlinedTextField(
                        term.startDate,
                        { onUpdate(term.copy(startDate = it)) },
                        label = { Text("开学日 YYYY-MM-DD") },
                        singleLine = true,
                    )
                    OutlinedTextField(
                        term.weekCount.toString(),
                        { value -> value.toIntOrNull()?.takeIf { it in 1..40 }?.let { onUpdate(term.copy(weekCount = it)) } },
                        label = { Text("周数") },
                        singleLine = true,
                    )
                }
                Text("添加学期", fontWeight = FontWeight.Bold)
                Button(onClick = { onAdd(guessTermKind()) }, modifier = Modifier.fillMaxWidth()) { Text("新学期") }
                TextButton(onClick = { onAdd("summer") }) { Text("新建暑假小学期") }
                TextButton(onClick = { onAdd("winter") }) { Text("新建寒假小学期") }
                TextButton(onClick = { onAdd("practice") }) { Text("新建社会实践课表") }
                TextButton(onClick = { onAdd("intern") }) { Text("新建实习项目课表") }
            }
        },
        confirmButton = { TextButton(onClick = onDismiss) { Text("完成") } },
    )
}

private val IMPORT_MIME = arrayOf(
    "image/jpeg",
    "image/png",
    "image/webp",
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/msword",
    "text/csv",
    "text/plain",
    "text/comma-separated-values",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
)

@Composable
private fun TimetableScreen(
    state: DaysUiState,
    vm: DaysViewModel,
    activity: Activity,
    section: String,
    onSection: (String) -> Unit,
    onOpenWake: () -> Unit,
) {
    Column(Modifier.fillMaxSize()) {
        Row(Modifier.fillMaxWidth().heightIn(min = 48.dp).testTag("timetable-sections")) {
            TIMETABLE_SECTIONS.forEach { (id, label) ->
                CampusFilterChip(
                    selected = section == id,
                    onClick = { onSection(id) },
                    label = { Text(label, maxLines = 1, softWrap = false) },
                    modifier = Modifier.weight(1f).padding(horizontal = 4.dp).heightIn(min = 48.dp).testTag("section-$id"),
                )
            }
        }
        Box(Modifier.weight(1f).fillMaxWidth()) {
            when (section) {
                "exams" -> ExamsScreen(state, vm, activity)
                "self" -> SelfScreen(state, vm, activity)
                "remind" -> RemindersPane(state, vm, onOpenWake)
                else -> ScheduleScreen(state, vm, activity)
            }
        }
    }
}

@Composable
private fun RemindersPane(state: DaysUiState, vm: DaysViewModel, onOpenWake: () -> Unit) {
    LazyColumn(contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        item {
            Card(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("提醒", fontWeight = FontWeight.SemiBold)
                    Button(onClick = onOpenWake, modifier = Modifier.fillMaxWidth()) { Text("好友叫醒") }
                    Text("授权好友在你的手机上设置真正的闹钟。默认谁都不能。", style = MaterialTheme.typography.bodySmall, color = Muted)
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text("开启提醒", Modifier.weight(1f))
                        Switch(state.data.reminderSettings.enabled, { vm.updateReminders(state.data.reminderSettings.copy(enabled = it)) })
                    }
                    OutlinedTextField(
                        state.data.reminderSettings.classDefaultMinutes.toString(),
                        { value -> value.toIntOrNull()?.let { vm.updateReminders(state.data.reminderSettings.copy(classDefaultMinutes = it)) } },
                        label = { Text("上课提前（分钟）") },
                    )
                    OutlinedTextField(
                        state.data.reminderSettings.examDefaultMinutes.toString(),
                        { value -> value.toIntOrNull()?.let { vm.updateReminders(state.data.reminderSettings.copy(examDefaultMinutes = it)) } },
                        label = { Text("考试提前（分钟）") },
                    )
                }
            }
        }
        item { HolidaySettingsCard(state, vm) }
        item { AlarmPermissionNote() }
        item { HolidayBoard(state, vm, upcomingOnly = true) }
        item { RecurringBlock(state, vm) }
    }
}

@Composable
private fun AccountDialog(state: DaysUiState, vm: DaysViewModel, activity: Activity, onDismiss: () -> Unit) {
    val importPicker = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri != null) vm.importBackup(activity, uri)
    }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("账号与备份") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(syncLabel(state.sync))
                Text("早期测试版换成正式签名前，请先在这里导出备份，或登录后点立即同步。确认云端或备份里有课程、待办、日子和便签，再卸载旧版。", style = MaterialTheme.typography.bodySmall)
                if (state.user == null) {
                    Button(onClick = { vm.login(activity) }) { Text("用账号中心登录") }
                } else {
                    Text(state.user.name ?: "已登录")
                    Text(state.user.accountSub, style = MaterialTheme.typography.bodySmall)
                    Button(onClick = { vm.syncNow() }) { Text("立即同步") }
                    TextButton(onClick = { vm.logout() }) { Text("退出登录") }
                }
                TextButton(onClick = { activity.startActivity(Intent.createChooser(vm.shareBackup(), "导出日事备份")) }) { Text("导出 JSON 备份") }
                TextButton(onClick = { importPicker.launch(arrayOf("application/json", "text/plain")) }) { Text("导入备份") }
                if (state.admin) TextButton(onClick = onDismiss) { Text("站长入口在搜索旁的管理页") }
            }
        },
        confirmButton = { TextButton(onClick = onDismiss) { Text("关闭") } },
    )
}

@Composable
private fun ImportPreviewDialog(state: DaysUiState, vm: DaysViewModel) {
    val preview = state.importPreview ?: return
    var editing by remember { mutableStateOf<Course?>(null) }
    AlertDialog(
        onDismissRequest = { vm.dismissImport() },
        title = { Text("核对${state.importFileName ?: "导入结果"}") },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text("确认后才写入。取消或重试都不会改已有课表。", style = MaterialTheme.typography.bodySmall)
                preview.warnings.forEach { Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error) }
                preview.courses.forEach { course ->
                    TextButton(onClick = { editing = course }) {
                        Text("${course.name} · 周${WEEKDAY_LABEL.getOrElse(course.weekday) { "?" }} ${course.startTime}-${course.endTime}", maxLines = 2)
                    }
                }
                preview.exams.forEach { exam -> Text("考试 ${exam.name} ${exam.date} ${exam.startTime}") }
                preview.selfSchedules.forEach { item -> Text("自律 ${item.title}") }
            }
        },
        confirmButton = { Button(onClick = { vm.confirmImport() }) { Text("写入") } },
        dismissButton = { TextButton(onClick = { vm.dismissImport() }) { Text("取消") } },
    )
    editing?.let { current ->
        CourseEditor(current, { editing = null }) { vm.updatePreviewCourse(it); editing = null }
    }
}

@Composable
private fun CourseEditor(initial: Course?, onDismiss: () -> Unit, extra: @Composable () -> Unit = {}, onSave: (Course) -> Unit) {
    var name by remember { mutableStateOf(initial?.name.orEmpty()) }
    var weekday by remember { mutableStateOf((initial?.weekday ?: 1).toString()) }
    var start by remember { mutableStateOf(initial?.startTime ?: "08:00") }
    var end by remember { mutableStateOf(initial?.endTime ?: "09:40") }
    var room by remember { mutableStateOf(initial?.location.orEmpty()) }
    var teacher by remember { mutableStateOf(initial?.teacher.orEmpty()) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(if (initial == null) "新课程" else "编辑课程") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(name, { name = it }, label = { Text("课程名") })
                OutlinedTextField(weekday, { weekday = it }, label = { Text("星期 1-7") })
                OutlinedTextField(start, { start = it }, label = { Text("开始") })
                OutlinedTextField(end, { end = it }, label = { Text("结束") })
                OutlinedTextField(room, { room = it }, label = { Text("教室") })
                OutlinedTextField(teacher, { teacher = it }, label = { Text("老师") })
                extra()
            }
        },
        confirmButton = {
            Button(onClick = {
                onSave(
                    (initial ?: Course(uid(), "", 1, start, end, null, null, null, COURSE_COLORS.first(), 15, nowMillis()))
                        .copy(name = name.trim(), weekday = weekday.toIntOrNull()?.coerceIn(1, 7) ?: 1, startTime = start, endTime = end, location = room.ifBlank { null }, teacher = teacher.ifBlank { null }),
                )
            }, enabled = name.isNotBlank()) { Text("保存") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("取消") } },
    )
}

@Composable
private fun ExamsScreen(state: DaysUiState, vm: DaysViewModel, activity: Activity) {
    var show by remember { mutableStateOf(false) }
    val picker = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri != null) vm.startImport(activity, uri, "exams")
    }
    Column(Modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        if (state.data.exams.isEmpty()) EmptyState("考试时间表是空的", "期中、期末、补考都可以记在这里")
        LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.weight(1f, false)) {
            items(state.data.exams, key = { it.id }) { exam ->
                Card(Modifier.fillMaxWidth()) {
                    Column(Modifier.padding(12.dp)) {
                        Text("${exam.name} · ${EXAM_KIND_LABEL[exam.kind] ?: exam.kind}", fontWeight = FontWeight.Medium)
                        Text("${exam.date} ${exam.startTime} ${exam.location.orEmpty()} ${exam.seat.orEmpty()}")
                        ReminderRulesButton(state, vm, "exam", exam.id, "${exam.date} ${exam.startTime}")
                        TextButton(onClick = { vm.removeExam(exam.id) }) { Text("删除") }
                    }
                }
            }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Button(onClick = { show = true }) { Text("添加考试") }
            Button(onClick = { picker.launch(IMPORT_MIME) }, enabled = !state.importing) {
                Text(if (state.importing) "识别中…" else "导入考试表")
            }
        }
    }
    if (show) {
        var name by remember { mutableStateOf("") }
        var date by remember { mutableStateOf("") }
        var time by remember { mutableStateOf("09:00") }
        var kind by remember { mutableStateOf("final") }
        AlertDialog(
            onDismissRequest = { show = false },
            title = { Text("新考试") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedTextField(name, { name = it }, label = { Text("科目") })
                    OutlinedTextField(date, { date = it }, label = { Text("日期") })
                    OutlinedTextField(time, { time = it }, label = { Text("开始") })
                    OutlinedTextField(kind, { kind = it }, label = { Text("类型 midterm/final/makeup/other") })
                }
            },
            confirmButton = {
                Button(onClick = {
                    vm.addExam(Exam(uid(), name.trim(), kind, date, time, null, null, null, 1440, nowMillis()))
                    show = false
                }, enabled = name.isNotBlank() && date.isNotBlank()) { Text("保存") }
            },
            dismissButton = { TextButton(onClick = { show = false }) { Text("取消") } },
        )
    }
}

@Composable
private fun SelfScreen(state: DaysUiState, vm: DaysViewModel, activity: Activity) {
    var show by remember { mutableStateOf(false) }
    val picker = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri != null) vm.startImport(activity, uri, "self")
    }
    Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        if (state.data.selfSchedules.isEmpty()) EmptyState("还没有自律安排", "把晚自习、跑步、背单词排进一周")
        state.data.selfSchedules.forEach { item ->
            Card(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(12.dp)) {
                    Text("${item.title} · 周${WEEKDAY_LABEL.getOrElse(item.weekday) { "?" }}", fontWeight = FontWeight.Medium)
                    Text("${item.startTime}-${item.endTime}  ${PRIORITY_LABEL[item.priority]}")
                    ReminderRulesButton(state, vm, "self", item.id, "周${item.weekday} ${item.startTime}")
                    TextButton(onClick = { vm.removeSelf(item.id) }) { Text("删除") }
                }
            }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Button(onClick = { show = true }) { Text("添加自律") }
            Button(onClick = { picker.launch(IMPORT_MIME) }, enabled = !state.importing) { Text("导入") }
        }
    }
    if (show) {
        var title by remember { mutableStateOf("") }
        var weekday by remember { mutableStateOf("1") }
        AlertDialog(
            onDismissRequest = { show = false },
            title = { Text("新自律") },
            text = { Column { OutlinedTextField(title, { title = it }, label = { Text("标题") }); OutlinedTextField(weekday, { weekday = it }, label = { Text("星期 1-7") }) } },
            confirmButton = {
                Button(onClick = {
                    vm.addSelf(SelfScheduleItem(uid(), title.trim(), weekday.toIntOrNull() ?: 1, "20:00", "21:30", COURSE_COLORS[1], null, 10, "medium", nowMillis()))
                    show = false
                }, enabled = title.isNotBlank()) { Text("保存") }
            },
            dismissButton = { TextButton(onClick = { show = false }) { Text("取消") } },
        )
    }
}

@Composable
private fun CountdownScreen(state: DaysUiState, vm: DaysViewModel) {
    var show by remember { mutableStateOf(false) }
    Column(Modifier.padding(16.dp).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        HolidaySettingsCard(state, vm)
        HolidayBoard(state, vm, upcomingOnly = false)
        if (state.data.countdowns.isEmpty()) EmptyState("还没有日子", "生日、节日、开学都可以记。原来的倒数日和纪念日还在这里。")
        state.data.countdowns.sortedBy { daysUntil(nextOccurrence(it.date, it.repeatYearly)) }.forEach { item ->
            val left = daysUntil(nextOccurrence(item.date, item.repeatYearly))
            Card(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(16.dp)) {
                    Text("${item.emoji} ${item.title}", fontWeight = FontWeight.Bold)
                    Text(if (left >= 0) "还有 $left 天" else "已经过去 ${-left} 天", style = MaterialTheme.typography.headlineMedium)
                    Text(item.date + if (item.repeatYearly) " · 每年" else "")
                    ReminderRulesButton(state, vm, "day", item.id, item.date)
                    TextButton(onClick = { vm.removeCountdown(item.id) }) { Text("删除") }
                }
            }
        }
        Button(onClick = { show = true }) { Text("添加日子") }
    }
    if (show) {
        var title by remember { mutableStateOf("") }
        var date by remember { mutableStateOf("") }
        var yearly by remember { mutableStateOf(false) }
        AlertDialog(
            onDismissRequest = { show = false },
            title = { Text("新日子") },
            text = {
                Column {
                    OutlinedTextField(title, { title = it }, label = { Text("名称") })
                    OutlinedTextField(date, { date = it }, label = { Text("日期") })
                    Row(verticalAlignment = Alignment.CenterVertically) { Text("每年重复"); Switch(yearly, { yearly = it }) }
                }
            },
            confirmButton = {
                Button(onClick = {
                    vm.addCountdown(title, date, COUNTDOWN_COLORS.first(), COUNTDOWN_EMOJIS.first(), yearly)
                    show = false
                }, enabled = title.isNotBlank() && date.isNotBlank()) { Text("保存") }
            },
            dismissButton = { TextButton(onClick = { show = false }) { Text("取消") } },
        )
    }
}

@Composable
private fun NotesScreen(state: DaysUiState, vm: DaysViewModel) {
    var show by remember { mutableStateOf(false) }
    Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        if (state.data.notes.isEmpty()) EmptyState("便签还是空的", "随手记一句，也可以钉到今日")
        state.data.notes.forEach { note ->
            Card(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(12.dp)) {
                    Text(note.title.ifBlank { "无标题" }, fontWeight = FontWeight.Medium)
                    Text(note.body)
                    Row {
                        TextButton(onClick = { vm.updateNote(note.copy(pinned = !note.pinned)) }) { Text(if (note.pinned) "取消钉住" else "钉住") }
                        TextButton(onClick = { vm.removeNote(note.id) }) { Text("删除") }
                    }
                }
            }
        }
        Button(onClick = { show = true }) { Text("新便签") }
    }
    if (show) {
        var title by remember { mutableStateOf("") }
        var body by remember { mutableStateOf("") }
        AlertDialog(
            onDismissRequest = { show = false },
            title = { Text("新便签") },
            text = { Column { OutlinedTextField(title, { title = it }, label = { Text("标题") }); OutlinedTextField(body, { body = it }, label = { Text("内容") }) } },
            confirmButton = { Button(onClick = { vm.addNote(title, body, NOTE_COLORS.first(), null); show = false }, enabled = title.isNotBlank() || body.isNotBlank()) { Text("保存") } },
            dismissButton = { TextButton(onClick = { show = false }) { Text("取消") } },
        )
    }
}

@Composable
private fun MoreScreen(state: DaysUiState, vm: DaysViewModel, activity: Activity, go: (String) -> Unit) {
    var confirmClear by remember { mutableStateOf(false) }
    val importPicker = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri != null) vm.importBackup(activity, uri)
    }
    LazyColumn(contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        item { Text("更多", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold) }
        item { MoreLink("考试时间表") { go("exams") } }
        item { MoreLink("自律课表") { go("self") } }
        item { MoreLink("倒数日 · 纪念日") { go("days") } }
        item { MoreLink("便签") { go("notes") } }
        item {
            Card(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("账号", fontWeight = FontWeight.SemiBold)
                    if (state.user == null) {
                        Text("登录后和网页看到同一份数据")
                        Button(onClick = { vm.login(activity) }) { Text("用账号中心登录") }
                    } else {
                        Text(state.user.name ?: "已登录")
                        Text(state.user.accountSub, style = MaterialTheme.typography.bodySmall)
                        Text(syncLabel(state.sync))
                        Button(onClick = { vm.syncNow() }) { Text("立即同步") }
                        TextButton(onClick = { vm.logout() }) { Text("退出登录") }
                    }
                }
            }
        }
        item {
            Card(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("提醒", fontWeight = FontWeight.SemiBold)
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text("开启提醒", Modifier.weight(1f))
                        Switch(state.data.reminderSettings.enabled, { vm.updateReminders(state.data.reminderSettings.copy(enabled = it)) })
                    }
                    OutlinedTextField(
                        state.data.reminderSettings.classDefaultMinutes.toString(),
                        { value -> value.toIntOrNull()?.let { vm.updateReminders(state.data.reminderSettings.copy(classDefaultMinutes = it)) } },
                        label = { Text("上课提前（分钟）") },
                    )
                    OutlinedTextField(
                        state.data.reminderSettings.examDefaultMinutes.toString(),
                        { value -> value.toIntOrNull()?.let { vm.updateReminders(state.data.reminderSettings.copy(examDefaultMinutes = it)) } },
                        label = { Text("考试提前（分钟）") },
                    )
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text("考试再提前提 1 小时", Modifier.weight(1f))
                        Switch(state.data.reminderSettings.examAlsoHourBefore, { vm.updateReminders(state.data.reminderSettings.copy(examAlsoHourBefore = it)) })
                    }
                }
            }
        }
        item {
            RecurringBlock(state, vm)
        }
        item {
            Card(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(16.dp)) {
                    Text("备份", fontWeight = FontWeight.SemiBold)
                    TextButton(onClick = { activity.startActivity(Intent.createChooser(vm.shareBackup(), "导出日事备份")) }) { Text("导出 JSON") }
                    TextButton(onClick = { importPicker.launch(arrayOf("application/json", "text/plain")) }) { Text("导入备份") }
                    TextButton(onClick = { confirmClear = true }) { Text("清空本机数据") }
                }
            }
        }
        if (state.admin) item { MoreLink("管理后台") { go("admin") } }
    }
    if (confirmClear) {
        AlertDialog(
            onDismissRequest = { confirmClear = false },
            title = { Text("清空本机全部日事数据？") },
            text = { Text("此操作不可恢复。云端数据不会自动删。") },
            confirmButton = { Button(onClick = { vm.clearAll(); confirmClear = false }) { Text("清空") } },
            dismissButton = { TextButton(onClick = { confirmClear = false }) { Text("取消") } },
        )
    }
}

@Composable
private fun RecurringBlock(state: DaysUiState, vm: DaysViewModel) {
    var show by remember { mutableStateOf(false) }
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text("周期性提醒", fontWeight = FontWeight.SemiBold)
            if (state.data.recurringReminders.isEmpty()) Text("还没有周期提醒", color = MaterialTheme.colorScheme.onSurfaceVariant)
            state.data.recurringReminders.forEach { item ->
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text(item.title)
                        Text("${formatRecurrence(item.rule)} · ${if (item.enabled) "启用" else "暂停"}", style = MaterialTheme.typography.bodySmall)
                    }
                    Switch(item.enabled, { vm.updateRecurring(item.copy(enabled = it)) })
                    TextButton(onClick = { vm.removeRecurring(item.id) }) { Text("删除") }
                }
            }
            Button(onClick = { show = true }) { Text("添加周期提醒") }
        }
    }
    if (show) {
        var title by remember { mutableStateOf("") }
        var start by remember { mutableStateOf(todayIso()) }
        AlertDialog(
            onDismissRequest = { show = false },
            title = { Text("周期提醒") },
            text = { Column { OutlinedTextField(title, { title = it }, label = { Text("标题") }); OutlinedTextField(start, { start = it }, label = { Text("开始日期") }) } },
            confirmButton = {
                Button(onClick = {
                    vm.addRecurring(RecurringReminder(uid(), title.trim(), null, start, "09:00", RecurrenceRule("interval", 1, "year"), null, true, true, nowMillis(), nowMillis()))
                    show = false
                }, enabled = title.isNotBlank()) { Text("保存") }
            },
            dismissButton = { TextButton(onClick = { show = false }) { Text("取消") } },
        )
    }
}

@Composable
private fun SearchScreen(state: DaysUiState, vm: DaysViewModel) {
    val q = state.query.trim().lowercase()
    val d = state.data
    val todos = d.todos.filter { it.title.lowercase().contains(q) }
    val notes = d.notes.filter { it.title.lowercase().contains(q) || it.body.lowercase().contains(q) }
    val courses = d.courses.filter { it.name.lowercase().contains(q) || it.location.orEmpty().lowercase().contains(q) || it.teacher.orEmpty().lowercase().contains(q) }
    val exams = d.exams.filter { it.name.lowercase().contains(q) || it.location.orEmpty().lowercase().contains(q) }
    val downs = d.countdowns.filter { it.title.lowercase().contains(q) }
    val selves = d.selfSchedules.filter { it.title.lowercase().contains(q) || it.note.orEmpty().lowercase().contains(q) }
    val events = d.calendarEvents.filter { it.title.lowercase().contains(q) || it.location.orEmpty().lowercase().contains(q) || it.note.orEmpty().lowercase().contains(q) }
    val recurring = d.recurringReminders.filter { it.title.lowercase().contains(q) || it.body.orEmpty().lowercase().contains(q) }
    Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        OutlinedTextField(state.query, { vm.setQuery(it) }, label = { Text("搜索日程、待办、课表、考试、便签") }, modifier = Modifier.fillMaxWidth())
        if (q.isBlank()) Text("输入关键字会在待办、课表、考试、便签、倒数日和周期提醒里找")
        else {
            Text("待办 ${todos.size}"); todos.forEach { Text(it.title) }
            Text("课程 ${courses.size}"); courses.forEach { Text(it.name) }
            Text("考试 ${exams.size}"); exams.forEach { Text(it.name) }
            Text("自律 ${selves.size}"); selves.forEach { Text(it.title) }
            Text("日程 ${events.size}"); events.forEach { Text(it.title) }
            Text("日子 ${downs.size}"); downs.forEach { Text("${it.emoji} ${it.title}") }
            Text("便签 ${notes.size}"); notes.forEach { Text(it.title.ifBlank { it.body }) }
            Text("周期提醒 ${recurring.size}"); recurring.forEach { Text(it.title) }
        }
    }
}

@Composable
private fun AdminScreen(state: DaysUiState, vm: DaysViewModel) {
    LaunchedEffect(state.admin) { vm.loadAdmin() }
    Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text("日事管理后台", fontWeight = FontWeight.Bold)
        Text("密钥只写到服务器，这里只显示配置状态。非站长看不到这个入口。")
        Text(state.adminPayload ?: "正在读取…", style = MaterialTheme.typography.bodySmall)
        Button(onClick = { vm.testAccount() }) { Text("测试 Account") }
        Button(onClick = { vm.testPlatform() }) { Text("测试 Platform") }
        Button(onClick = { vm.loadAdmin() }) { Text("刷新配置") }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
internal fun EventActionRow(
    onEdit: () -> Unit,
    onDelete: () -> Unit,
    editTag: String,
    deleteTag: String,
    alarm: @Composable () -> Unit,
) {
    FlowRow(
        Modifier.fillMaxWidth().padding(bottom = 4.dp).testTag("event-actions"),
        horizontalArrangement = Arrangement.spacedBy(4.dp),
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        TextButton(onClick = onEdit, modifier = Modifier.heightIn(min = 48.dp).testTag(editTag)) { Text("编辑") }
        TextButton(onClick = onDelete, modifier = Modifier.heightIn(min = 48.dp).testTag(deleteTag)) { Text("删除") }
        Box(Modifier.heightIn(min = 48.dp)) { alarm() }
    }
}

@Composable
private fun EventEditor(initial: CalendarEvent, editing: Boolean, onDismiss: () -> Unit, onSave: (CalendarEvent) -> Unit) {
    var title by remember { mutableStateOf(initial.title) }
    var date by remember { mutableStateOf(initial.date) }
    var start by remember { mutableStateOf(initial.startTime.orEmpty()) }
    var end by remember { mutableStateOf(initial.endTime.orEmpty()) }
    var allDay by remember { mutableStateOf(initial.allDay) }
    var location by remember { mutableStateOf(initial.location.orEmpty()) }
    var note by remember { mutableStateOf(initial.note.orEmpty()) }
    var repeat by remember { mutableStateOf(initial.repeat) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(if (editing) "编辑日程" else "新日程") },
        text = {
            Column(Modifier.heightIn(max = 420.dp).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(title, { title = it }, label = { Text("标题") }, isError = title.isBlank())
                OutlinedTextField(date, { date = it }, label = { Text("日期 YYYY-MM-DD") })
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Checkbox(allDay, { allDay = it })
                    Text("全天")
                }
                if (!allDay) {
                    OutlinedTextField(start, { start = it }, label = { Text("开始 HH:MM") })
                    OutlinedTextField(end, { end = it }, label = { Text("结束 HH:MM") })
                }
                OutlinedTextField(location, { location = it }, label = { Text("地点") })
                OutlinedTextField(note, { note = it }, label = { Text("说明") })
                OutlinedTextField(repeat, { repeat = it }, label = { Text("重复 none/daily/weekly/monthly/yearly") })
                if (repeat != "none") Text("重复日程按整条规则保存。删除时会删掉以后的每一次。", style = MaterialTheme.typography.bodySmall)
            }
        },
        confirmButton = {
            Button(onClick = {
                if (title.isBlank() || date.isBlank()) return@Button
                onSave(initial.copy(
                    title = title.trim(),
                    date = date.trim(),
                    startTime = if (allDay) null else start.ifBlank { null },
                    endTime = if (allDay) null else end.ifBlank { null },
                    allDay = allDay,
                    location = location.trim().ifBlank { null },
                    note = note.trim().ifBlank { null },
                    repeat = repeat.ifBlank { "none" },
                ))
            }, enabled = title.isNotBlank() && date.isNotBlank()) { Text("保存") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("取消") } },
    )
}

@Composable
private fun MoreLink(label: String, onClick: () -> Unit) {
    Card(Modifier.fillMaxWidth().clickable(onClick = onClick).semantics { contentDescription = label }) {
        Text(label, Modifier.padding(16.dp), fontWeight = FontWeight.Medium)
    }
}

@Composable
private fun EmptyState(title: String, body: String) {
    Column(Modifier.fillMaxWidth().padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        Text(title, fontWeight = FontWeight.SemiBold)
        Text(body, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}
