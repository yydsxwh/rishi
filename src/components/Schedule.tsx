import { useEffect, useMemo, useState } from 'react'
import type { AppStore } from '../hooks/useAppStore'
import { HolidayBoards, HolidaySettingsCard } from './HolidaySection'
import { ReminderRulesEditor } from './ReminderRulesEditor'
import { nextWeekdayStart } from '../lib/reminder-rules'
import type { DueReminder } from '../lib/reminders'
import { daysUntil, toISODate, startOfToday } from '../lib/dates'
import {
  WEEKDAY_LABELS,
  durationMinutes,
  formatDuration,
  jsWeekday,
  normalizeClockInput,
  setPeriodTable,
} from '../lib/periods'
import { TIMETABLE_ACCEPT } from '../lib/file-kinds'
import { importTimetableAny, type ImportFocus } from '../lib/import-any'
import { hiddenHoursAroundCourses, inferClassPeriods } from '../lib/period-infer'
import { upcomingExams } from '../lib/reminders'
import { sampleExamCsv, sampleGridCsv, sortExams, type TimetableImportResult } from '../lib/timetable-import'
import { termLabel } from '../lib/terms'
import {
  courseInTeachingWeek,
  courseInTerm,
  shiftWeek,
  startOfWeek,
  teachingWeekNumber,
  weekRangeLabel,
  weekStartForTeachingWeek,
} from '../lib/week-grid'
import { EXAM_KIND_LABEL, type Course, type Exam, type ExamKind } from '../types'
import DeviceHealthCard from './DeviceHealthCard'
import FriendWake from './FriendWake'
import LocationGuard from './LocationGuard'
import ScheduleSettings from './ScheduleSettings'
import WeekTimetable from './WeekTimetable'

function TimeInput({
  value,
  onChange,
  label,
}: {
  value: string
  onChange: (next: string) => void
  label: string
}) {
  return (
    <input
      className="input slim"
      type="text"
      inputMode="numeric"
      placeholder="08:00"
      value={value}
      aria-label={label}
      onChange={(e) => onChange(e.target.value)}
      onBlur={() => {
        const parsed = normalizeClockInput(value)
        if (parsed) onChange(parsed)
      }}
    />
  )
}

export type ScheduleTab = 'week' | 'exams' | 'remind'
type Tab = ScheduleTab

export default function Schedule({
  store,
  requestPermission,
  previewReminder,
  tab: controlledTab,
  onTabChange,
}: {
  store: AppStore
  requestPermission: () => Promise<NotificationPermission | 'denied' | 'granted'>
  previewReminder: (item: DueReminder) => void
  /** 「时间表」父页接管二级切换时传入；独立使用时留空用自己的标签栏 */
  tab?: Tab
  onTabChange?: (next: Tab) => void
}) {
  const [innerTab, setInnerTab] = useState<Tab>('week')
  const tab = controlledTab ?? innerTab
  const setTab = (next: Tab) => {
    setInnerTab(next)
    onTabChange?.(next)
  }
  const [name, setName] = useState('')
  const [weekday, setWeekday] = useState(1)
  const [startTime, setStartTime] = useState('08:00')
  const [endTime, setEndTime] = useState('09:40')
  const [location, setLocation] = useState('')
  const [teacher, setTeacher] = useState('')
  const [status, setStatus] = useState('')
  const [importing, setImporting] = useState(false)
  const [review, setReview] = useState<TimetableImportResult | null>(null)
  const [previewUrl, setPreviewUrl] = useState('')
  const [weekMonday, setWeekMonday] = useState(() => startOfWeek(new Date(), 1))
  const [now, setNow] = useState(() => new Date())
  const [selectedId, setSelectedId] = useState<string>()
  const [showAdd, setShowAdd] = useState(false)
  const [showAddExam, setShowAddExam] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)

  const [examName, setExamName] = useState('')
  const [examKind, setExamKind] = useState<ExamKind>('final')
  const [examDate, setExamDate] = useState('')
  const [examStart, setExamStart] = useState('09:00')
  const [examEnd, setExamEnd] = useState('11:00')
  const [examLoc, setExamLoc] = useState('')

  const todayISO = toISODate(startOfToday())
  const settings = store.data.reminderSettings
  const view = store.data.timetableView
  const currentTerm = store.currentTerm
  const thisWeekStart = startOfWeek(now, view.weekStartsOn)
  const weekNo = teachingWeekNumber(weekMonday, currentTerm?.startDate, view.weekStartsOn)
  const termCourses = useMemo(
    () => store.data.courses.filter((c) => courseInTerm(c, store.data.currentTermId)),
    [store.data.courses, store.data.currentTermId],
  )
  const visibleCourses = useMemo(() => {
    return termCourses.filter((c) => {
      const onWeek = courseInTeachingWeek(c, weekNo)
      return onWeek || view.showOffWeekCourses
    })
  }, [termCourses, view.showOffWeekCourses, weekNo])
  const offWeekIds = useMemo(() => {
    const ids = new Set<string>()
    if (!view.showOffWeekCourses) return ids
    for (const course of termCourses) {
      if (!courseInTeachingWeek(course, weekNo)) ids.add(course.id)
    }
    return ids
  }, [termCourses, view.showOffWeekCourses, weekNo])
  const selected = store.data.courses.find((c) => c.id === selectedId)

  useEffect(() => {
    setWeekMonday((prev) => startOfWeek(prev, view.weekStartsOn))
  }, [view.weekStartsOn])

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000)
    return () => window.clearInterval(timer)
  }, [])

  const examsSoon = upcomingExams(store.data.exams, todayISO)
  const examsByDate = useMemo(() => sortExams(store.data.exams), [store.data.exams])

  const addManual = () => {
    if (!name.trim()) return
    const start = normalizeClockInput(startTime)
    const end = normalizeClockInput(endTime)
    if (!start || !end) {
      setStatus('请用 24 小时制填写时间，例如 08:00 和 09:40')
      return
    }
    setStartTime(start)
    setEndTime(end)
    store.addCourse(name, {
      weekday,
      startTime: start,
      endTime: end,
      location: location || undefined,
      teacher: teacher || undefined,
      remindMinutes: settings.classDefaultMinutes,
    })
    setName('')
    setTeacher('')
    setStatus(`已添加 ${name.trim()}（${formatDuration(start, end)}）`)
  }

  const addExam = () => {
    if (!examName.trim() || !examDate) return
    const start = normalizeClockInput(examStart)
    const end = examEnd.trim() ? normalizeClockInput(examEnd) : undefined
    if (!start || (examEnd.trim() && !end)) {
      setStatus('考试时间请用 24 小时制，例如 14:00-16:00，避免写成上午/下午')
      return
    }
    setExamStart(start)
    if (end) setExamEnd(end)
    store.addExam(examName, {
      kind: examKind,
      date: examDate,
      startTime: start,
      endTime: end ?? undefined,
      location: examLoc || undefined,
      remindMinutes: settings.examDefaultMinutes,
    })
    setExamName('')
    setStatus(`已登记考试 ${examName.trim()} ${examDate} ${start}${end ? `-${end}` : ''}`)
  }

  const tryClassReminder = () => {
    const course = store.data.courses[0]
    previewReminder({
      id: course?.id || 'preview-class',
      key: `preview-class:${Date.now()}`,
      title: `上课提醒 · ${course?.name || '高等数学'}`,
      body: `${course?.startTime || '08:00'}-${course?.endTime || '09:40'} ${course?.location || '教学楼A101'} · 还有 ${settings.classDefaultMinutes} 分钟，现在出发以免迟到`,
      kind: 'class',
      fireAt: Date.now(),
    })
    setStatus('已弹出上课提醒条。浏览器通知需先点「允许浏览器通知」。')
  }

  const tryExamReminder = () => {
    const exam = store.data.exams[0]
    previewReminder({
      id: exam?.id || 'preview-exam',
      key: `preview-exam:${Date.now()}`,
      title: `考试提醒 · ${exam?.name || '大学英语'}`,
      body: `${exam?.date || '今天'} ${exam?.startTime || '14:00'}${exam?.endTime ? `-${exam.endTime}` : ''} ${exam?.location || ''} · 请核对开考时间以免记错错过`,
      kind: 'exam',
      fireAt: Date.now(),
    })
    setStatus('已弹出考试提醒条。建议同时打开「考试再提前 60 分钟提醒一次」。')
  }

  const applyResult = (result: TimetableImportResult, label: string) => {
    if (result.courses.length) {
      const periods = inferClassPeriods(result.courses)
      store.updateTimetableView({
        classPeriods: periods,
        hiddenHours: hiddenHoursAroundCourses(result.courses),
      })
      setPeriodTable(periods)
    }
    store.addCourses(result.courses)
    store.addExams(result.exams)
    const bits = [
      result.courses.length ? `${result.courses.length} 门课` : '',
      result.exams.length ? `${result.exams.length} 场考试` : '',
    ].filter(Boolean)
    setStatus(
      `已从「${label}」导入 ${bits.join('、')}` +
        (result.warnings.length ? `。提示：${result.warnings.slice(0, 3).join('；')}` : ''),
    )
    setReview(null)
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl)
      setPreviewUrl('')
    }
    setTab(result.kind === 'exams' ? 'exams' : 'week')
  }

  const onImport = async (file: File, focus: ImportFocus = 'auto') => {
    setPeriodTable(view.classPeriods)
    setImporting(true)
    setStatus('')
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setPreviewUrl(file.type.startsWith('image/') ? URL.createObjectURL(file) : '')
    const hint =
      focus === 'exams'
        ? '这是教务处考试安排表，不是周课表。只抽出考试：科目、日期、开考时间、结束时间、考场、座位。返回 exams 数组。不要把星期一到星期日的课程格子当成考试。'
        : '这是教务处周课表。第一列是节次/时间，不是星期。星期一列必须 weekdayLabel=星期一 且 weekday=1，不要把节次列算进星期。优先返回 dayHeaders+slots.cells，cells[0]是星期一。教室只写房间号，单周/双周/13-16周写入 weeks。格子里印了几点就用该行钟点。'
    try {
      const result = await importTimetableAny(
        file,
        {
          classRemindMinutes: settings.classDefaultMinutes,
          examRemindMinutes: settings.examDefaultMinutes,
        },
        hint,
        focus,
      )
      if (result.source === 'ai') {
        setReview(result)
        setStatus(
          focus === 'exams'
            ? `AI 已识别 ${result.exams.length} 场考试。请核对接日期、开考时间后再写入考试表。`
            : `AI 已识别 ${result.courses.length} 门课` +
                (result.exams.length ? `、${result.exams.length} 场考试` : '') +
                '。请核对星期、地点、钟点后再写入课表。',
        )
        setTab(focus === 'exams' ? 'exams' : 'week')
      } else {
        applyResult(result, file.name)
        setTab(focus === 'exams' ? 'exams' : result.kind === 'exams' ? 'exams' : 'week')
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '导入失败')
    } finally {
      setImporting(false)
    }
  }

  const patchReviewCourse = (id: string, patch: Partial<Course>) => {
    setReview((prev) =>
      prev
        ? { ...prev, courses: prev.courses.map((c) => (c.id === id ? { ...c, ...patch } : c)) }
        : prev,
    )
  }

  const patchReviewExam = (id: string, patch: Partial<Exam>) => {
    setReview((prev) =>
      prev
        ? { ...prev, exams: prev.exams.map((exam) => (exam.id === id ? { ...exam, ...patch } : exam)) }
        : prev,
    )
  }


  const downloadSample = (kind: 'grid' | 'exam') => {
    const csv = kind === 'grid' ? sampleGridCsv() : sampleExamCsv()
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = kind === 'grid' ? '课表示例-周视图.csv' : '考试时间表示例.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <section className="view">
      <header className="view-head">
        <h2>颗秒课程表</h2>
        <p className="muted">
          课表是一张从 00:00 到 23:59 的表格。点右上角「课表设置」选学年学期、开学周数，并隐藏凌晨等不上课的行。
        </p>
      </header>

      {onTabChange ? null : (
        <div className="tabs">
          {(
            [
              ['week', '周课表'],
              ['exams', '考试时间表'],
              ['remind', '提醒'],
            ] as const
          ).map(([id, label]) => (
            <button key={id} className={`tab ${tab === id ? 'active' : ''}`} onClick={() => setTab(id)}>
              {label}
            </button>
          ))}
        </div>
      )}

      {status && <p className="import-status">{status}</p>}

      {tab === 'week' && (
        <>
          <div className="card week-toolbar">
            <div className="row wrap">
              <button
                className="btn ghost"
                disabled={Boolean(currentTerm?.startDate && weekNo != null && weekNo <= 1)}
                onClick={() => setWeekMonday((d) => shiftWeek(d, -1))}
              >
                上一周
              </button>
              <div className="week-toolbar-title">
                <strong>
                  {weekNo != null
                    ? `第 ${weekNo}${currentTerm ? ` / ${currentTerm.weekCount}` : ''} 周`
                    : '周课表'}
                  {weekMonday.getTime() === thisWeekStart.getTime() ? ' · 本周' : ''}
                </strong>
                <span className="muted">
                  {currentTerm ? termLabel(currentTerm) : ''} {weekRangeLabel(weekMonday)}
                </span>
              </div>
              <button
                className="btn ghost"
                disabled={Boolean(
                  currentTerm?.startDate && weekNo != null && weekNo >= currentTerm.weekCount,
                )}
                onClick={() => setWeekMonday((d) => shiftWeek(d, 1))}
              >
                下一周
              </button>
              <button className="btn ghost" onClick={() => setWeekMonday(thisWeekStart)}>
                回到本周
              </button>
              <button className="btn primary" onClick={() => setSettingsOpen(true)}>
                课表设置
              </button>
            </div>
            <p className="muted" style={{ margin: '8px 0 0' }}>
              拍教务处周课表，或导入 xlsx / csv。考试安排请到「考试时间表」导入。
            </p>
            <div className="row wrap" style={{ marginTop: 10 }}>
              <label className="btn primary file-btn">
                {importing ? '正在识别课表…' : '导入课表'}
                <input
                  type="file"
                  hidden
                  accept={TIMETABLE_ACCEPT}
                  disabled={importing}
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) void onImport(file, 'courses')
                    e.target.value = ''
                  }}
                />
              </label>
              <button className="btn ghost" onClick={() => setShowAdd((v) => !v)}>
                {showAdd ? '收起加课' : '加一节课'}
              </button>
              {termCourses.length === 0 && (
                <button
                  className="btn ghost"
                  onClick={() => {
                    void (async () => {
                      const res = await fetch(`${import.meta.env.BASE_URL}samples/course-grid.csv`)
                      const blob = await res.blob()
                      await onImport(new File([blob], 'course-grid.csv', { type: 'text/csv' }))
                    })()
                  }}
                >
                  载入示例课表
                </button>
              )}
              {currentTerm?.startDate ? (
                <button
                  className="btn ghost"
                  onClick={() =>
                    setWeekMonday(
                      weekStartForTeachingWeek(currentTerm.startDate, 1, view.weekStartsOn),
                    )
                  }
                >
                  第1周
                </button>
              ) : null}
            </div>
          </div>

          {showAdd && (
            <div className="card">
              <div className="row wrap">
                <input
                  className="input"
                  placeholder="课程名，例如「高等数学」"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  aria-label="课程名"
                />
                <select className="input slim" value={weekday} onChange={(e) => setWeekday(Number(e.target.value))}>
                  {WEEKDAY_LABELS.map((label, i) => (
                    <option key={label} value={i + 1}>
                      {label}
                    </option>
                  ))}
                </select>
                <TimeInput value={startTime} onChange={setStartTime} label="开始时间" />
                <TimeInput value={endTime} onChange={setEndTime} label="结束时间" />
                <input
                  className="input slim"
                  placeholder="教室"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                />
                <input
                  className="input slim"
                  placeholder="老师"
                  value={teacher}
                  onChange={(e) => setTeacher(e.target.value)}
                />
                <button className="btn primary" onClick={addManual}>
                  加到课表
                </button>
              </div>
              <p className="muted">
                当前这节时长 {formatDuration(startTime, endTime)}（{durationMinutes(startTime, endTime)} 分钟）
              </p>
            </div>
          )}

          {selected && (
            <div className="card week-detail">
              <div>
                <p className="kicker">
                  {WEEKDAY_LABELS[selected.weekday - 1]} {selected.startTime}-{selected.endTime}
                </p>
                <h3>{selected.name}</h3>
                <ReminderRulesEditor store={store} targetType="course" targetId={selected.id} startLabel={`${WEEKDAY_LABELS[selected.weekday - 1]} ${selected.startTime}`} start={nextWeekdayStart(selected.weekday, selected.startTime)} />
                <p className="muted">
                  {[selected.location, selected.teacher, selected.weeks, formatDuration(selected.startTime, selected.endTime)]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              </div>
              <div className="row wrap">
                <button
                  className="btn ghost"
                  onClick={() => {
                    store.removeCourse(selected.id)
                    setSelectedId(undefined)
                  }}
                >
                  删除这节
                </button>
                <button className="btn ghost" onClick={() => setSelectedId(undefined)}>
                  关闭
                </button>
              </div>
            </div>
          )}

          <div className="tt-wrap card">
            <WeekTimetable
              courses={visibleCourses}
              axisCourses={termCourses}
              exams={store.data.exams}
              weekStart={weekMonday}
              now={now}
              view={view}
              selectedId={selectedId}
              offWeekIds={offWeekIds}
              onSelectCourse={(course) => setSelectedId(course.id)}
              onSelectSlot={(slot) => {
                setWeekday(slot.weekday)
                setStartTime(slot.startTime)
                setEndTime(slot.endTime)
                setShowAdd(true)
                setSelectedId(undefined)
                setStatus(`已选 ${WEEKDAY_LABELS[slot.weekday - 1]} ${slot.startTime}-${slot.endTime}，补课程名后点「加到课表」`)
              }}
              onHideHour={store.toggleHiddenHour}
              onShowHours={(hours) =>
                store.updateTimetableView({
                  hiddenHours: view.hiddenHours.filter((hour) => !hours.includes(hour)),
                })
              }
              onShowWeekdays={(weekdays) =>
                store.updateTimetableView({
                  hiddenWeekdays: view.hiddenWeekdays.filter((day) => !weekdays.includes(day)),
                })
              }
            />
          </div>
          <ScheduleSettings
            store={store}
            open={settingsOpen}
            onClose={() => setSettingsOpen(false)}
          />
          {tab === 'week' && (previewUrl || review) ? (
            <div className="card">
              <h3>核对课表识别</h3>
              <p className="muted">
                拍教务处周课表或导入表格。手机原图会先压缩。请核对星期和钟点——格子里印了 8:30 就不要改成 8:00。
              </p>
              {previewUrl ? <img className="ocr-preview" src={previewUrl} alt="待识别的课表图片" /> : null}
              {review ? (
              <>
              <div className="review-table-wrap">
                <table className="review-table">
                  <thead>
                    <tr>
                      <th>课程</th>
                      <th>星期</th>
                      <th>开始</th>
                      <th>结束</th>
                      <th>时长</th>
                      <th>地点</th>
                      <th>老师</th>
                      <th>周次</th>
                    </tr>
                  </thead>
                  <tbody>
                    {review.courses.map((c) => (
                      <tr key={c.id}>
                        <td>
                          <input
                            value={c.name}
                            onChange={(e) => patchReviewCourse(c.id, { name: e.target.value })}
                          />
                        </td>
                        <td>
                          <select
                            value={c.weekday}
                            onChange={(e) =>
                              patchReviewCourse(c.id, { weekday: Number(e.target.value) })
                            }
                          >
                            {WEEKDAY_LABELS.map((label, i) => (
                              <option key={label} value={i + 1}>
                                {label}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <input
                            value={c.startTime}
                            onChange={(e) =>
                              patchReviewCourse(c.id, {
                                startTime: normalizeClockInput(e.target.value) || e.target.value,
                              })
                            }
                          />
                        </td>
                        <td>
                          <input
                            value={c.endTime}
                            onChange={(e) =>
                              patchReviewCourse(c.id, {
                                endTime: normalizeClockInput(e.target.value) || e.target.value,
                              })
                            }
                          />
                        </td>
                        <td>{formatDuration(c.startTime, c.endTime)}</td>
                        <td>
                          <input
                            value={c.location || ''}
                            onChange={(e) =>
                              patchReviewCourse(c.id, { location: e.target.value || undefined })
                            }
                          />
                        </td>
                        <td>
                          <input
                            value={c.teacher || ''}
                            onChange={(e) =>
                              patchReviewCourse(c.id, { teacher: e.target.value || undefined })
                            }
                          />
                        </td>
                        <td>
                          <input
                            value={c.weeks || ''}
                            onChange={(e) =>
                              patchReviewCourse(c.id, { weeks: e.target.value || undefined })
                            }
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {review.exams.length > 0 && (
                <ul className="mini-list">
                  {review.exams.map((exam) => (
                    <li key={exam.id}>
                      {EXAM_KIND_LABEL[exam.kind]} {exam.name} {exam.date} {exam.startTime}
                      {exam.endTime ? `-${exam.endTime}` : ''} {exam.location}
                      <button
                        className="icon-btn"
                        onClick={() =>
                          setReview((prev) =>
                            prev
                              ? { ...prev, exams: prev.exams.filter((e) => e.id !== exam.id) }
                              : prev,
                          )
                        }
                        aria-label="从核对列表去掉这场考试"
                      >
                        ✕
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <div className="row wrap">
                <button className="btn primary" onClick={() => applyResult(review, 'AI 识别')}>
                  核对无误，写入课表
                </button>
                <button
                  className="btn ghost"
                  onClick={() => {
                    setReview(null)
                    if (previewUrl) {
                      URL.revokeObjectURL(previewUrl)
                      setPreviewUrl('')
                    }
                    setStatus('已放弃这次识别结果')
                  }}
                >
                  放弃
                </button>
              </div>
              </>
              ) : null}
            </div>
          ) : null}
        </>
      )}

      {tab === 'exams' && (
        <>
          <div className="card week-toolbar">
            <h3>考试时间表</h3>
            <p className="muted">
              拍教务处考试安排，或导入 xlsx / csv。识别后按日期、开考时间排成一张表。周课表请到上一页导入。
            </p>
            <div className="row wrap">
              <label className="btn primary file-btn">
                {importing ? '正在识别考试表…' : '导入考试表'}
                <input
                  type="file"
                  hidden
                  accept={TIMETABLE_ACCEPT}
                  disabled={importing}
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) void onImport(file, 'exams')
                    e.target.value = ''
                  }}
                />
              </label>
              <button className="btn ghost" onClick={() => setShowAddExam((v) => !v)}>
                {showAddExam ? '收起登记' : '登记一场'}
              </button>
              {store.data.exams.length === 0 && (
                <button
                  className="btn ghost"
                  onClick={() => {
                    void (async () => {
                      const res = await fetch(`${import.meta.env.BASE_URL}samples/exams.csv`)
                      const blob = await res.blob()
                      await onImport(new File([blob], 'exams.csv', { type: 'text/csv' }), 'exams')
                    })()
                  }}
                >
                  载入示例考试表
                </button>
              )}
              <button className="btn ghost" onClick={() => downloadSample('exam')}>
                下载考试表示例 CSV
              </button>
            </div>
            {showAddExam && (
              <div className="row wrap" style={{ marginTop: 10 }}>
                <input
                  className="input"
                  placeholder="科目，例如「高等数学」"
                  value={examName}
                  onChange={(e) => setExamName(e.target.value)}
                />
                <select className="input slim" value={examKind} onChange={(e) => setExamKind(e.target.value as ExamKind)}>
                  {Object.entries(EXAM_KIND_LABEL).map(([k, label]) => (
                    <option key={k} value={k}>
                      {label}
                    </option>
                  ))}
                </select>
                <input className="input slim" type="date" value={examDate} onChange={(e) => setExamDate(e.target.value)} />
                <TimeInput value={examStart} onChange={setExamStart} label="开考时间" />
                <TimeInput value={examEnd} onChange={setExamEnd} label="结束时间" />
                <input
                  className="input slim"
                  placeholder="考场"
                  value={examLoc}
                  onChange={(e) => setExamLoc(e.target.value)}
                />
                <button className="btn primary" onClick={addExam}>
                  登记考试
                </button>
              </div>
            )}
            {previewUrl && tab === 'exams' ? (
              <img className="ocr-preview" src={previewUrl} alt="待识别的考试表" />
            ) : null}
            {review && review.exams.length > 0 ? (
              <div className="review-box">
                <h3>核对考试识别</h3>
                <p className="muted">核对接日期和开考时间后再写入。这一页只收考试，不会写进周课表。</p>
                <div className="review-table-wrap">
                  <table className="review-table exam-table">
                    <thead>
                      <tr>
                        <th>科目</th>
                        <th>类型</th>
                        <th>日期</th>
                        <th>开始</th>
                        <th>结束</th>
                        <th>地点</th>
                        <th>座位</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {sortExams(review.exams).map((exam) => (
                        <tr key={exam.id}>
                          <td>
                            <input
                              value={exam.name}
                              onChange={(e) => patchReviewExam(exam.id, { name: e.target.value })}
                            />
                          </td>
                          <td>
                            <select
                              value={exam.kind}
                              onChange={(e) => patchReviewExam(exam.id, { kind: e.target.value as ExamKind })}
                            >
                              {Object.entries(EXAM_KIND_LABEL).map(([k, label]) => (
                                <option key={k} value={k}>
                                  {label}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td>
                            <input
                              value={exam.date}
                              onChange={(e) => patchReviewExam(exam.id, { date: e.target.value })}
                            />
                          </td>
                          <td>
                            <input
                              value={exam.startTime}
                              onChange={(e) =>
                                patchReviewExam(exam.id, {
                                  startTime: normalizeClockInput(e.target.value) || e.target.value,
                                })
                              }
                            />
                          </td>
                          <td>
                            <input
                              value={exam.endTime || ''}
                              onChange={(e) =>
                                patchReviewExam(exam.id, {
                                  endTime: normalizeClockInput(e.target.value) || e.target.value || undefined,
                                })
                              }
                            />
                          </td>
                          <td>
                            <input
                              value={exam.location || ''}
                              onChange={(e) =>
                                patchReviewExam(exam.id, { location: e.target.value || undefined })
                              }
                            />
                          </td>
                          <td>
                            <input
                              value={exam.seat || ''}
                              onChange={(e) => patchReviewExam(exam.id, { seat: e.target.value || undefined })}
                            />
                          </td>
                          <td>
                            <button
                              className="icon-btn"
                              onClick={() =>
                                setReview((prev) =>
                                  prev ? { ...prev, exams: prev.exams.filter((e) => e.id !== exam.id) } : prev,
                                )
                              }
                              aria-label="从核对列表去掉这场考试"
                            >
                              ✕
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="row wrap">
                  <button className="btn primary" onClick={() => applyResult(review, '考试表识别')}>
                    核对无误，写入考试表
                  </button>
                  <button
                    className="btn ghost"
                    onClick={() => {
                      setReview(null)
                      if (previewUrl) {
                        URL.revokeObjectURL(previewUrl)
                        setPreviewUrl('')
                      }
                    }}
                  >
                    放弃
                  </button>
                </div>
              </div>
            ) : null}
          </div>
          <div className="card review-table-wrap">
            <table className="review-table exam-table">
              <thead>
                <tr>
                  <th>日期</th>
                  <th>星期</th>
                  <th>时间</th>
                  <th>科目</th>
                  <th>类型</th>
                  <th>地点</th>
                  <th>座位</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {examsByDate.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="muted">
                      还没有考试。点上面「导入考试表」拍教务处安排，或导入表格。
                    </td>
                  </tr>
                ) : (
                  examsByDate.map((exam) => (
                    <tr key={exam.id}>
                      <td>{exam.date}</td>
                      <td>{WEEKDAY_LABELS[jsWeekday(new Date(`${exam.date}T12:00:00`)) - 1]}</td>
                      <td>
                        {exam.startTime}
                        {exam.endTime ? `-${exam.endTime}` : ''}
                      </td>
                      <td>{exam.name}</td>
                      <td>{EXAM_KIND_LABEL[exam.kind]}</td>
                      <td>{exam.location || '—'}</td>
                      <td>{exam.seat || '—'}</td>
                      <td>
                        <button className="icon-btn" onClick={() => store.removeExam(exam.id)} aria-label="删除考试">
                          ✕
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {examsSoon.length > 0 && (
            <ul className="exam-list">
              {examsSoon.map((exam) => {
                const left = daysUntil(exam.date)
                const tone = left < 0 ? 'past' : left === 0 ? 'today' : left <= 3 ? 'soon' : ''
                return (
                  <li key={exam.id} className={`exam-card ${tone}`}>
                    <div>
                      <span className="pill">{EXAM_KIND_LABEL[exam.kind]}</span>
                      <h3>{exam.name}</h3>
                      <ReminderRulesEditor store={store} targetType="exam" targetId={exam.id} startLabel={`${exam.date} ${exam.startTime}`} start={new Date(`${exam.date}T${exam.startTime}`)} />
                      <p>
                        {exam.date} {exam.startTime}
                        {exam.endTime ? `-${exam.endTime}` : ''} · {exam.location || '地点待定'}
                        {exam.seat ? ` · 座 ${exam.seat}` : ''}
                      </p>
                      <strong>
                        {left < 0 ? '已结束' : left === 0 ? '就是今天，请再核对开考时间' : `还有 ${left} 天`}
                      </strong>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </>
      )}

      {tab === 'remind' && <FriendWake store={store} />}
      {tab === 'remind' && <LocationGuard store={store} />}
      {tab === 'remind' && <DeviceHealthCard />}
      {tab === 'remind' && <HolidaySettingsCard store={store} />}
      {tab === 'remind' && <HolidayBoards store={store} mode="remind" />}
      {tab === 'remind' && (
        <div className="card">
          <h3>上课与考试提醒</h3>
          <p className="muted">
            上课默认提前喊你出门，避免迟到；考试默认提前一天，并可再提前一小时，减少记错时间错过考试。
          </p>
          <label className="check">
            <input
              type="checkbox"
              checked={settings.enabled}
              onChange={(e) => store.updateReminderSettings({ enabled: e.target.checked })}
            />
            <span>开启提醒</span>
          </label>
          <div className="row wrap">
            <label>
              上课提前（分钟）
              <input
                className="input slim"
                type="number"
                min={0}
                value={settings.classDefaultMinutes}
                onChange={(e) =>
                  store.updateReminderSettings({ classDefaultMinutes: Number(e.target.value) || 0 })
                }
              />
            </label>
            <label>
              考试提前（分钟）
              <input
                className="input slim"
                type="number"
                min={0}
                value={settings.examDefaultMinutes}
                onChange={(e) =>
                  store.updateReminderSettings({ examDefaultMinutes: Number(e.target.value) || 0 })
                }
              />
            </label>
          </div>
          <label className="check">
            <input
              type="checkbox"
              checked={settings.examAlsoHourBefore}
              onChange={(e) => store.updateReminderSettings({ examAlsoHourBefore: e.target.checked })}
            />
            <span>考试再提前 60 分钟提醒一次</span>
          </label>
          <div className="row wrap">
            <button
              className="btn primary"
              onClick={() => {
                void requestPermission().then((perm) => {
                  setStatus(
                    perm === 'granted'
                      ? '已允许浏览器通知。把这个页面开着或固定标签，到点会弹出。'
                      : '未获得通知权限。仍可在本页顶部看到提醒条。',
                  )
                })
              }}
            >
              允许浏览器通知
            </button>
            <button className="btn ghost" onClick={tryClassReminder}>
              试响上课提醒
            </button>
            <button className="btn ghost" onClick={tryExamReminder}>
              试响考试提醒
            </button>
          </div>
          <p className="muted">默认：上课提前 {settings.classDefaultMinutes} 分钟，考试提前 {settings.examDefaultMinutes} 分钟。</p>
        </div>
      )}
    </section>
  )
}
