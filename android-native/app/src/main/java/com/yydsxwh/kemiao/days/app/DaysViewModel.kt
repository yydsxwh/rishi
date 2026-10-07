package com.yydsxwh.kemiao.days.app

import android.app.Application
import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.browser.customtabs.CustomTabsIntent
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.yydsxwh.kemiao.days.BuildConfig
import com.yydsxwh.kemiao.days.data.local.LocalStore
import com.yydsxwh.kemiao.days.data.local.SecureSession
import com.yydsxwh.kemiao.days.data.model.AppData
import com.yydsxwh.kemiao.days.data.model.CalendarEvent
import com.yydsxwh.kemiao.days.data.model.COUNTDOWN_COLORS
import com.yydsxwh.kemiao.days.data.model.COUNTDOWN_EMOJIS
import com.yydsxwh.kemiao.days.data.model.Countdown
import com.yydsxwh.kemiao.days.data.model.Course
import com.yydsxwh.kemiao.days.data.model.Exam
import com.yydsxwh.kemiao.days.data.model.HolidayFavorite
import com.yydsxwh.kemiao.days.data.model.HolidaySettings
import com.yydsxwh.kemiao.days.data.model.NOTE_COLORS
import com.yydsxwh.kemiao.days.data.model.Note
import com.yydsxwh.kemiao.days.data.model.RecurrenceRule
import com.yydsxwh.kemiao.days.data.model.RecurringReminder
import com.yydsxwh.kemiao.days.data.model.Remark
import com.yydsxwh.kemiao.days.data.model.ReminderRule
import com.yydsxwh.kemiao.days.data.model.ReminderSettings
import com.yydsxwh.kemiao.days.data.model.SelfScheduleItem
import com.yydsxwh.kemiao.days.data.model.SessionUser
import com.yydsxwh.kemiao.days.data.model.Term
import com.yydsxwh.kemiao.days.data.model.TimetableViewSettings
import com.yydsxwh.kemiao.days.data.model.Todo
import com.yydsxwh.kemiao.days.data.model.applyOcrImport
import com.yydsxwh.kemiao.days.data.model.dumpAppData
import com.yydsxwh.kemiao.days.data.model.emptyData
import com.yydsxwh.kemiao.days.data.model.fingerprint
import com.yydsxwh.kemiao.days.data.model.insertCalendarEvent
import com.yydsxwh.kemiao.days.data.model.replaceCalendarEvent
import com.yydsxwh.kemiao.days.data.model.courseRemarkId
import com.yydsxwh.kemiao.days.data.model.dayRemarkId
import com.yydsxwh.kemiao.days.data.model.occurrenceRemarkId
import com.yydsxwh.kemiao.days.data.model.occurrenceKey
import com.yydsxwh.kemiao.days.data.model.upsertRemark
import com.yydsxwh.kemiao.days.data.model.upsertReminderRule
import com.yydsxwh.kemiao.days.data.model.guessTermKind
import com.yydsxwh.kemiao.days.data.model.withNewTerm
import com.yydsxwh.kemiao.days.data.model.withoutTerm
import com.yydsxwh.kemiao.days.data.model.hydrateAppData
import com.yydsxwh.kemiao.days.data.importing.ImportTooLarge
import com.yydsxwh.kemiao.days.data.importing.ImportUnsupported
import com.yydsxwh.kemiao.days.data.importing.StagedImport
import com.yydsxwh.kemiao.days.data.importing.clearImportCache
import com.yydsxwh.kemiao.days.data.importing.prepareUploadParts
import com.yydsxwh.kemiao.days.data.importing.stageImport
import com.yydsxwh.kemiao.days.data.importing.userFacingOcrError
import com.yydsxwh.kemiao.days.data.model.OcrImportResult
import com.yydsxwh.kemiao.days.data.model.hydrateTimetableOcr
import com.yydsxwh.kemiao.days.data.model.nowMillis
import com.yydsxwh.kemiao.days.data.model.parseAppDataJson
import com.yydsxwh.kemiao.days.data.model.uid
import com.yydsxwh.kemiao.days.data.model.withTombstones
import com.yydsxwh.kemiao.days.data.remote.DaysApi
import com.yydsxwh.kemiao.days.data.sync.SyncEngine
import com.yydsxwh.kemiao.days.data.sync.SyncState
import com.yydsxwh.kemiao.days.notify.ReminderScheduler
import com.yydsxwh.kemiao.days.notify.RemoteAlarmSync
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

data class DaysUiState(
    val ready: Boolean = false,
    val data: AppData = emptyData(),
    val user: SessionUser? = null,
    val admin: Boolean = false,
    val sync: SyncState = SyncState.Starting,
    val pending: Boolean = false,
    val lastSyncedAt: Long? = null,
    val query: String = "",
    val notice: String? = null,
    val error: String? = null,
    val adminPayload: String? = null,
    val importing: Boolean = false,
    val importProgress: String? = null,
    val importPreview: OcrImportResult? = null,
    val importFileName: String? = null,
)

class DaysViewModel(application: Application) : AndroidViewModel(application) {
    private val store = LocalStore(application)
    private val session = SecureSession(application)
    private val api = DaysApi(tokenProvider = { session.token() })
    private val engine = SyncEngine(api)
    private val reminders = ReminderScheduler(application)

    private val _state = MutableStateFlow(DaysUiState())
    val state: StateFlow<DaysUiState> = _state
    private var version: Long = 0
    private var syncedPrint: String? = null
    private var pushJob: Job? = null
    private var importJob: Job? = null
    private var resumeImport: StagedImport? = null
    private var resumeKind: String = "courses"

    init {
        viewModelScope.launch(Dispatchers.IO) {
            val loaded = store.load()
            version = store.version()
            _state.update { it.copy(ready = true, data = loaded) }
            reminders.reschedule(loaded)
            refreshSession()
            syncNow()
        }
    }

    fun consumeHandoff(uri: Uri?) {
        val code = uri?.getQueryParameter("handoff") ?: return
        viewModelScope.launch(Dispatchers.IO) {
            runCatching { api.consumeHandoff(code) }
                .onSuccess { (token, user) ->
                    session.save(token)
                    activateAccount(user.accountSub)
                    _state.update { it.copy(user = user, notice = "已登录 ${user.name ?: "账号中心"}") }
                    refreshSession()
                    syncNow()
                    resumeImport?.let { staged ->
                        val kind = resumeKind
                        resumeImport = null
                        recognize(staged, kind)
                    }
                }
                .onFailure { _state.update { s -> s.copy(error = "登录交接失败，请再试一次") } }
        }
    }

    fun login(activity: android.app.Activity) {
        CustomTabsIntent.Builder().build().launchUrl(activity, Uri.parse(BuildConfig.LOGIN_URL))
    }

    fun logout() {
        viewModelScope.launch(Dispatchers.IO) {
            runCatching { api.logout() }
            session.clear()
            clearImportCache(getApplication())
            resumeImport = null
            importJob?.cancel()
            store.save(_state.value.data)
            store.saveVersion(version)
            store.useAccount(null)
            val data = store.load()
            version = store.version()
            syncedPrint = null
            reminders.reschedule(data)
            _state.update {
                it.copy(
                    data = data,
                    user = null,
                    admin = false,
                    sync = SyncState.SignedOut,
                    importing = false,
                    importPreview = null,
                    importProgress = null,
                    notice = "已退出登录。本机已切回未登录数据；账号数据仍留在本机，重新登录同一账号会再打开。",
                )
            }
        }
    }

    fun setQuery(value: String) = _state.update { it.copy(query = value) }
    fun dismissNotice() = _state.update { it.copy(notice = null, error = null) }

    fun syncNow() {
        viewModelScope.launch(Dispatchers.IO) {
            _state.update { it.copy(sync = SyncState.Syncing) }
            val result = engine.reconcile(_state.value.data, version)
            applySync(result.data, result.version, result.state, result.pending)
            runCatching { RemoteAlarmSync(getApplication()).pullAndSchedule() }
        }
    }

    private suspend fun refreshSession() {
        val user = runCatching { api.session() }.getOrNull()
        val admin = if (user != null) runCatching { api.adminMe().admin }.getOrDefault(false) else false
        val sub = user?.accountSub?.takeIf { it.isNotBlank() }
        if (sub != null) activateAccount(sub)
        _state.update {
            it.copy(
                user = user,
                admin = admin,
                sync = when {
                    user == null && session.token() == null -> SyncState.SignedOut
                    user == null -> SyncState.LocalOnly
                    else -> it.sync
                },
            )
        }
    }

    /** 换账号前先把当前目录落盘，再打开这个 sub 自己的文件。不同账号不会并到同一份本地数据里。 */
    private fun activateAccount(sub: String) {
        val safe = sub.trim()
        if (safe.isEmpty() || store.currentBucket() == store.bucketId(safe)) return
        store.save(_state.value.data)
        store.saveVersion(version)
        store.adoptAnonymousIfUnclaimed(safe)
        store.useAccount(safe)
        val data = store.load()
        version = store.version()
        syncedPrint = null
        reminders.reschedule(data)
        _state.update { it.copy(data = data) }
    }

    private fun applySync(data: AppData?, nextVersion: Long?, sync: SyncState, pending: Boolean) {
        if (data != null) {
            store.save(data)
            reminders.reschedule(data)
        }
        if (nextVersion != null) {
            version = nextVersion
            store.saveVersion(nextVersion)
            if (data != null) syncedPrint = fingerprint(data)
        }
        _state.update {
            it.copy(
                data = data ?: it.data,
                sync = sync,
                pending = pending,
                lastSyncedAt = if (sync == SyncState.Synced) nowMillis() else it.lastSyncedAt,
            )
        }
    }

    private fun dropRules(data: AppData, targetType: String, id: String): AppData {
        val ruleIds = data.reminderRules.filter { it.targetType == targetType && it.targetId == id }.map { it.id }
        return withTombstones(data, ruleIds).copy(reminderRules = data.reminderRules.filter { it.targetType != targetType || it.targetId != id })
    }

    private fun commit(transform: (AppData) -> AppData) {
        val next = transform(_state.value.data)
        store.save(next)
        reminders.reschedule(next)
        _state.update { it.copy(data = next, pending = true) }
        schedulePush()
    }

    private fun schedulePush() {
        pushJob?.cancel()
        pushJob = viewModelScope.launch {
            delay(1200)
            withContext(Dispatchers.IO) {
                if (_state.value.user == null) return@withContext
                val local = _state.value.data
                if (syncedPrint == fingerprint(local)) {
                    _state.update { it.copy(pending = false) }
                    return@withContext
                }
                _state.update { it.copy(sync = SyncState.Syncing) }
                val result = engine.pushOnly(local, version)
                applySync(result.data, result.version, result.state, result.pending)
            }
        }
    }

    fun addTodo(title: String, dueDate: String?, dueTime: String?, priority: String, remind: Int) = commit { data ->
        val item = Todo(uid(), title.trim(), false, dueDate, dueTime, null, priority, remind, nowMillis())
        if (item.title.isBlank()) data else data.copy(todos = listOf(item) + data.todos)
    }
    fun toggleTodo(id: String) = commit { it.copy(todos = it.todos.map { t -> if (t.id == id) t.copy(done = !t.done) else t }) }
    fun updateTodo(item: Todo) = commit { it.copy(todos = it.todos.map { t -> if (t.id == item.id) item else t }) }
    fun removeTodo(id: String) = commit { dropRules(withTombstones(it, listOf(id)), "todo", id).copy(todos = it.todos.filter { t -> t.id != id }) }

    fun addCountdown(title: String, date: String, color: String, emoji: String, yearly: Boolean) = commit { data ->
        val item = Countdown(uid(), title.trim(), date, color.ifBlank { COUNTDOWN_COLORS.first() }, emoji.ifBlank { COUNTDOWN_EMOJIS.first() }, yearly, nowMillis())
        if (item.title.isBlank() || item.date.isBlank()) data else data.copy(countdowns = data.countdowns + item)
    }
    fun updateCountdown(item: Countdown) = commit { it.copy(countdowns = it.countdowns.map { c -> if (c.id == item.id) item else c }) }
    fun removeCountdown(id: String) = commit { dropRules(withTombstones(it, listOf(id)), "day", id).copy(countdowns = it.countdowns.filter { c -> c.id != id }) }

    fun addNote(title: String, body: String, color: String, date: String?) = commit { data ->
        val item = Note(uid(), title.trim(), body, color.ifBlank { NOTE_COLORS.first() }, false, date, nowMillis())
        if (item.title.isBlank() && item.body.isBlank()) data else data.copy(notes = listOf(item) + data.notes)
    }
    fun updateNote(item: Note) = commit { it.copy(notes = it.notes.map { n -> if (n.id == item.id) item.copy(updatedAt = nowMillis()) else n }) }
    fun removeNote(id: String) = commit { withTombstones(it, listOf(id)).copy(notes = it.notes.filter { n -> n.id != id }) }

    fun addCourse(item: Course) = commit { data ->
        val ready = item.copy(id = item.id.ifBlank { uid() }, termId = item.termId ?: data.currentTermId, createdAt = item.createdAt.takeIf { it > 0 } ?: nowMillis())
        if (ready.name.isBlank()) data else data.copy(courses = data.courses + ready)
    }
    fun updateCourse(item: Course) = commit { it.copy(courses = it.courses.map { c -> if (c.id == item.id) item else c }) }
    fun removeCourse(id: String) = commit { dropRules(withTombstones(it, listOf(id)), "course", id).copy(courses = it.courses.filter { c -> c.id != id }) }
    fun clearCourses() = commit { withTombstones(it, it.courses.map { c -> c.id }).copy(courses = emptyList()) }

    fun addExam(item: Exam) = commit { data ->
        val ready = item.copy(id = item.id.ifBlank { uid() }, createdAt = item.createdAt.takeIf { it > 0 } ?: nowMillis())
        if (ready.name.isBlank() || ready.date.isBlank()) data else data.copy(exams = (data.exams + ready).sortedBy { it.date })
    }
    fun updateExam(item: Exam) = commit { it.copy(exams = it.exams.map { e -> if (e.id == item.id) item else e }.sortedBy { e -> e.date }) }
    fun removeExam(id: String) = commit { dropRules(withTombstones(it, listOf(id)), "exam", id).copy(exams = it.exams.filter { e -> e.id != id }) }

    fun addSelf(item: SelfScheduleItem) = commit { data ->
        val ready = item.copy(id = item.id.ifBlank { uid() }, createdAt = item.createdAt.takeIf { it > 0 } ?: nowMillis())
        if (ready.title.isBlank()) data else data.copy(selfSchedules = data.selfSchedules + ready)
    }
    fun updateSelf(item: SelfScheduleItem) = commit { it.copy(selfSchedules = it.selfSchedules.map { s -> if (s.id == item.id) item else s }) }
    fun removeSelf(id: String) = commit { dropRules(withTombstones(it, listOf(id)), "self", id).copy(selfSchedules = it.selfSchedules.filter { s -> s.id != id }) }

    fun addEvent(item: CalendarEvent) = commit { data ->
        data.copy(calendarEvents = insertCalendarEvent(data.calendarEvents, item, nowMillis()))
    }
    fun updateEvent(item: CalendarEvent) = commit { data ->
        data.copy(calendarEvents = replaceCalendarEvent(data.calendarEvents, item, nowMillis()))
    }
    fun removeEvent(id: String) = commit { dropRules(withTombstones(it, listOf(id)), "event", id).copy(calendarEvents = it.calendarEvents.filter { e -> e.id != id }) }

    fun saveRemark(kind: String, body: String, date: String?, courseId: String?, startTime: String?) = commit { data ->
        val id = when (kind) {
            "day" -> dayRemarkId(date.orEmpty())
            "course" -> courseRemarkId(courseId.orEmpty())
            else -> occurrenceRemarkId(courseId.orEmpty(), date.orEmpty(), startTime.orEmpty())
        }
        val next = Remark(id, kind, date, courseId, if (kind == "occurrence") occurrenceKey(courseId.orEmpty(), date.orEmpty(), startTime.orEmpty()) else null, body)
        val remarks = upsertRemark(data.remarks, next, nowMillis())
        val courses = if (kind == "course" && !courseId.isNullOrBlank()) data.courses.map { if (it.id == courseId) it.copy(note = body) else it } else data.courses
        if (remarks === data.remarks) data else data.copy(remarks = remarks, courses = courses)
    }

    fun removeRemark(id: String) = commit { data ->
        val target = data.remarks.find { it.id == id }
        val courses = if (target?.kind == "course") data.courses.map { if (it.id == target.courseId) it.copy(note = null) else it } else data.courses
        withTombstones(data, listOf(id)).copy(remarks = data.remarks.filter { it.id != id }, courses = courses)
    }

    fun addRecurring(item: RecurringReminder) = commit { data ->
        val now = nowMillis()
        val ready = item.copy(id = item.id.ifBlank { uid() }, createdAt = now, updatedAt = now, rule = item.rule.takeIf { it.kind.isNotBlank() } ?: RecurrenceRule())
        if (ready.title.isBlank() || ready.startDate.isBlank()) data else data.copy(recurringReminders = listOf(ready) + data.recurringReminders)
    }
    fun updateRecurring(item: RecurringReminder) = commit { it.copy(recurringReminders = it.recurringReminders.map { r -> if (r.id == item.id) item.copy(updatedAt = nowMillis()) else r }) }
    fun removeRecurring(id: String) = commit { withTombstones(it, listOf(id)).copy(recurringReminders = it.recurringReminders.filter { r -> r.id != id }) }

    fun updateReminders(patch: ReminderSettings) = commit { it.copy(reminderSettings = patch) }
    fun saveReminderRule(rule: ReminderRule) = commit { data ->
        data.copy(reminderRules = upsertReminderRule(data.reminderRules, rule, System.currentTimeMillis()))
    }
    fun removeReminderRule(id: String) = commit { withTombstones(it, listOf(id)).copy(reminderRules = it.reminderRules.filter { rule -> rule.id != id }) }
    fun updateHolidaySettings(patch: HolidaySettings) = commit { it.copy(holidaySettings = patch.copy(updatedAt = System.currentTimeMillis())) }
    fun toggleHolidayFavorite(stableKey: String, region: String) = commit { data ->
        val existing = data.holidayFavorites.find { it.stableKey == stableKey }
        if (existing != null) withTombstones(data, listOf(existing.id)).copy(holidayFavorites = data.holidayFavorites.filter { it.stableKey != stableKey })
        else data.copy(holidayFavorites = data.holidayFavorites + HolidayFavorite(uid(), stableKey, region, System.currentTimeMillis()))
    }
    fun updateTimetable(patch: TimetableViewSettings) = commit { it.copy(timetableView = patch) }

    fun addTerm(kind: String = guessTermKind()) = commit { withNewTerm(it, kind) }
    fun removeTerm(id: String) = commit { withoutTerm(it, id) }
    fun updateTerm(term: Term) = commit { data ->
        val terms = data.terms.map { if (it.id == term.id) term else it }
        val current = terms.firstOrNull { it.id == data.currentTermId }
        data.copy(terms = terms, termStart = current?.startDate?.ifBlank { null })
    }
    fun setCurrentTerm(id: String) = commit { data ->
        val current = data.terms.firstOrNull { it.id == id } ?: return@commit data
        data.copy(currentTermId = id, termStart = current.startDate.ifBlank { null })
    }

    fun clearAll() = commit { emptyData() }

    fun exportJson(): String = dumpAppData(_state.value.data)

    fun importJson(text: String) {
        runCatching { hydrateAppData(parseAppDataJson(text)) }
            .onSuccess { next -> commit { next } }
            .onFailure { _state.update { s -> s.copy(error = "备份文件无效") } }
    }

    fun shareBackup(): Intent = Intent(Intent.ACTION_SEND).apply {
        type = "application/json"
        putExtra(Intent.EXTRA_TEXT, exportJson())
        putExtra(Intent.EXTRA_SUBJECT, "颗秒日事备份")
    }

    fun importBackup(context: Context, uri: Uri) {
        viewModelScope.launch(Dispatchers.IO) {
            val text = runCatching { context.contentResolver.openInputStream(uri)?.bufferedReader()?.readText() }.getOrNull()
            if (text.isNullOrBlank()) {
                _state.update { it.copy(error = "读不到备份文件") }
                return@launch
            }
            importJson(text)
            _state.update { it.copy(notice = "已导入备份，正在按现有规则同步") }
        }
    }

    fun startImport(activity: android.app.Activity, uri: Uri, kind: String) {
        importJob?.cancel()
        importJob = viewModelScope.launch(Dispatchers.IO) {
            val staged = try {
                stageImport(getApplication(), uri)
            } catch (_: ImportTooLarge) {
                _state.update { it.copy(importing = false, error = "文件过大") }
                return@launch
            } catch (_: ImportUnsupported) {
                _state.update { it.copy(importing = false, error = "格式不支持") }
                return@launch
            } catch (_: Exception) {
                _state.update { it.copy(importing = false, error = "读不到文件") }
                return@launch
            }
            _state.update { it.copy(importProgress = "已选择 ${staged.displayName}（${staged.size / 1024} KB）", error = null) }
            if (_state.value.user == null) {
                resumeImport = staged
                resumeKind = kind
                _state.update { it.copy(error = "课表识别需要先登录账号中心。登录后会自动回到导入。") }
                withContext(Dispatchers.Main) { login(activity) }
                return@launch
            }
            recognize(staged, kind)
        }
    }

    fun cancelImport() {
        importJob?.cancel()
        _state.update { it.copy(importing = false, importProgress = null, notice = "已取消导入") }
    }

    fun dismissImport() {
        _state.update { it.copy(importPreview = null, importFileName = null) }
    }

    fun confirmImport() {
        val preview = _state.value.importPreview ?: return
        commit { applyOcrImport(it, preview) }
        _state.update { it.copy(importPreview = null, importFileName = null, notice = "已写入，重复确认不会再添加同样的课") }
    }

    fun updatePreviewCourse(item: Course) {
        _state.update { state ->
            val preview = state.importPreview ?: return@update state
            state.copy(importPreview = preview.copy(courses = preview.courses.map { if (it.id == item.id) item else it }))
        }
    }

    private suspend fun recognize(staged: StagedImport, kind: String) {
        _state.update { it.copy(importing = true, importPreview = null, error = null, importFileName = staged.displayName, importProgress = "正在准备 ${staged.displayName}") }
        val parts = try {
            prepareUploadParts(staged)
        } catch (_: ImportTooLarge) {
            _state.update { it.copy(importing = false, importProgress = null, error = "文件过大") }
            return
        } catch (_: ImportUnsupported) {
            _state.update { it.copy(importing = false, importProgress = null, error = "格式不支持") }
            return
        }
        val classMinutes = _state.value.data.reminderSettings.classDefaultMinutes
        val examMinutes = _state.value.data.reminderSettings.examDefaultMinutes
        var courses = emptyList<Course>()
        var exams = emptyList<Exam>()
        var selves = emptyList<SelfScheduleItem>()
        val warnings = mutableListOf<String>()
        for ((index, part) in parts.withIndex()) {
            _state.update { it.copy(importProgress = "正在识别 ${staged.displayName} ${index + 1}/${parts.size}") }
            runCatching { api.uploadOcr(part.fileName, part.bytes, part.mime, kind) }
                .onSuccess { payload ->
                    val result = hydrateTimetableOcr(payload, classMinutes, examMinutes)
                    courses = courses + result.courses
                    exams = exams + result.exams
                    selves = selves + result.selfSchedules
                    warnings += result.warnings
                }
                .onFailure { error ->
                    val message = userFacingOcrError(error.message.orEmpty())
                    if (parts.size == 1) {
                        _state.update { it.copy(importing = false, importProgress = null, error = message) }
                        return
                    }
                    warnings += message
                }
        }
        val preview = OcrImportResult(courses, exams, selves, warnings.distinct())
        if (preview.courses.isEmpty() && preview.exams.isEmpty() && preview.selfSchedules.isEmpty()) {
            _state.update { it.copy(importing = false, importProgress = null, error = warnings.firstOrNull() ?: "未识别到课程") }
            return
        }
        _state.update { it.copy(importing = false, importProgress = null, importPreview = preview, notice = "核对预览后再写入。重试不会直接改课表。") }
    }

    fun loadAdmin() {
        viewModelScope.launch(Dispatchers.IO) {
            val text = runCatching { api.getIntegrations() }.getOrElse { it.message ?: "无法读取管理配置" }
            _state.update { it.copy(adminPayload = text) }
        }
    }

    fun testAccount() {
        viewModelScope.launch(Dispatchers.IO) {
            val text = runCatching { api.testAccount() }.getOrElse { it.message.orEmpty() }
            _state.update { it.copy(adminPayload = text, notice = "Account 探测完成") }
        }
    }

    fun testPlatform() {
        viewModelScope.launch(Dispatchers.IO) {
            val text = runCatching { api.testPlatform() }.getOrElse { it.message.orEmpty() }
            _state.update { it.copy(adminPayload = text, notice = "Platform 探测完成") }
        }
    }

}
