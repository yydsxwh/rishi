import { useEffect, useMemo, useRef, useState } from 'react'
import CalendarView from './components/CalendarView'
import Countdowns from './components/Countdowns'
import Notes from './components/Notes'
import Timetable from './components/Timetable'
import Today from './components/Today'
import AccountCenter from './components/AccountCenter'
import DaysSettings from './components/DaysSettings'
import { AndroidDownloadNote } from './components/AndroidDownloadNote'
import AdminIntegrations from './components/AdminIntegrations'
import { useAppStore } from './hooks/useAppStore'
import { useCloudSync } from './hooks/useCloudSync'
import { useReminders } from './hooks/useReminders'
import {
  PRIMARY_NAV,
  isAdminHash,
  parseRoute,
  routeHash,
  type PrimaryView,
  type Route,
  type TimetableTab,
} from './lib/routes'
import { productsHomeHref } from './lib/public-env'
import type { View } from './types'

function currentRoute(): Route {
  return parseRoute(typeof window === 'undefined' ? '' : window.location.hash)
}

function currentAdmin(): boolean {
  if (typeof window === 'undefined') return false
  return isAdminHash(window.location.hash, window.location.pathname)
}

export default function App() {
  const store = useAppStore()
  const sync = useCloudSync({ data: store.data, ready: store.ready, replace: store.replace })
  const reminders = useReminders(
    store.data.courses,
    store.data.exams,
    store.data.reminderSettings,
    store.data.todos,
    store.data.selfSchedules,
    store.data.calendarEvents,
    store.data.recurringReminders,
  )
  const [route, setRoute] = useState<Route>(currentRoute)
  const [query, setQuery] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)
  const [adminPage, setAdminPage] = useState(currentAdmin)
  const fileRef = useRef<HTMLInputElement>(null)

  // 浏览器前进/后退、Android 系统返回键和刷新都只经过 hashchange，
  // 所以二级页状态跟着 hash 走，不另存一份会漂移的本地状态。
  useEffect(() => {
    const onHash = () => {
      setRoute(currentRoute())
      setAdminPage(currentAdmin())
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  const go = (next: Route) => {
    setRoute(next)
    window.location.hash = routeHash(next)
  }
  const openView = (view: PrimaryView) => go({ view, timetableTab: 'week', focus: null })
  const openTimetableTab = (tab: TimetableTab) =>
    go({ view: 'timetable', timetableTab: tab, focus: null })

  /** 旧的 View id 仍在若干子组件里当跳转参数用，这里统一翻译成新路由。 */
  const openLegacy = (view: View) => go(parseRoute(`#${view}`))

  const hits = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return null
    const d = store.data
    return {
      todos: d.todos.filter((t) => t.title.toLowerCase().includes(q)),
      countdowns: d.countdowns.filter((c) => c.title.toLowerCase().includes(q)),
      notes: d.notes.filter(
        (n) => n.title.toLowerCase().includes(q) || n.body.toLowerCase().includes(q),
      ),
      courses: d.courses.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          (c.location || '').toLowerCase().includes(q) ||
          (c.teacher || '').toLowerCase().includes(q),
      ),
      exams: d.exams.filter(
        (e) => e.name.toLowerCase().includes(q) || (e.location || '').toLowerCase().includes(q),
      ),
      self: d.selfSchedules.filter(
        (s) => s.title.toLowerCase().includes(q) || (s.note || '').toLowerCase().includes(q),
      ),
      events: d.calendarEvents.filter(
        (e) =>
          e.title.toLowerCase().includes(q) ||
          (e.location || '').toLowerCase().includes(q) ||
          (e.note || '').toLowerCase().includes(q),
      ),
      recurring: d.recurringReminders.filter(
        (r) => r.title.toLowerCase().includes(q) || (r.body || '').toLowerCase().includes(q),
      ),
    }
  }, [query, store.data])

  if (adminPage) return <AdminIntegrations />

  const hitCount = hits
    ? hits.todos.length +
      hits.countdowns.length +
      hits.notes.length +
      hits.courses.length +
      hits.exams.length +
      hits.self.length +
      hits.events.length +
      hits.recurring.length
    : 0

  /** 搜索结果里点条目要能落到合并后的新页面，不能因为并栏打不开。 */
  const openFromSearch = (target: Route) => {
    setQuery('')
    go(target)
  }

  return (
    <div className="shell">
      <AndroidDownloadNote />
      <header className="topbar">
        <div className="brand">
          <span className="mark">日</span>
          <div>
            <strong>颗秒日事</strong>
            <p>青春校园 · 粉蓝火焰</p>
          </div>
        </div>
        <nav className="tabs desktop-nav" aria-label="功能">
          {PRIMARY_NAV.map((item) => (
            <button
              key={item.id}
              className={`tab ${route.view === item.id && !hits ? 'active' : ''}`}
              onClick={() => openView(item.id)}
            >
              {item.label}
            </button>
          ))}
        </nav>
        <div className="top-actions">
          <input
            className="input search"
            placeholder="搜索日程、待办、课表、考试、便签"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="搜索"
          />
          <div className="menu-wrap">
            <button className="btn ghost" onClick={() => setMenuOpen((o) => !o)} aria-expanded={menuOpen}>
              更多
            </button>
            {menuOpen && (
              <div className="menu">
                <button
                  onClick={() => {
                    store.downloadBackup()
                    setMenuOpen(false)
                  }}
                >
                  导出备份
                </button>
                <button
                  onClick={() => {
                    fileRef.current?.click()
                    setMenuOpen(false)
                  }}
                >
                  导入备份
                </button>
                <button
                  onClick={() => {
                    if (confirm('清空本机全部日事数据？此操作不可恢复。')) store.clearAll()
                    setMenuOpen(false)
                  }}
                >
                  清空本机数据
                </button>
                <a href={productsHomeHref()}>返回软件产品</a>
              </div>
            )}
          </div>
          <DaysSettings />
          <AccountCenter sync={sync} data={store.data} />
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="application/json"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) void store.importBackup(file)
            e.target.value = ''
          }}
        />
      </header>

      {reminders.banner && (
        <div className={`remind-banner ${reminders.banner.kind}`} role="status">
          <div>
            <strong>{reminders.banner.title}</strong>
            <p>{reminders.banner.body}</p>
          </div>
          <button className="btn ghost" onClick={reminders.dismiss}>
            知道了
          </button>
        </div>
      )}

      <main className="main">
        {hits ? (
          <section className="view">
            <header className="view-head">
              <h2>搜索「{query}」</h2>
              <p className="muted">{hitCount} 条结果</p>
            </header>
            <div className="card">
              <h3>
                <button
                  className="link"
                  onClick={() => openFromSearch(parseRoute('#today'))}
                >
                  周期性提醒
                </button>
              </h3>
              <ul className="mini-list">
                {hits.recurring.map((r) => (
                  <li key={r.id}>
                    {r.title}
                    {r.enabled ? '' : ' · 已暂停'}
                  </li>
                ))}
              </ul>
              <h3>
                <button className="link" onClick={() => openFromSearch(parseRoute('#calendar'))}>
                  日程
                </button>
              </h3>
              <ul className="mini-list">
                {hits.events.map((e) => (
                  <li key={e.id}>
                    {e.title} · {e.date}{' '}
                    {e.allDay ? '全天' : `${e.startTime || ''}${e.endTime ? `-${e.endTime}` : ''}`}
                  </li>
                ))}
              </ul>
              <h3>
                <button className="link" onClick={() => openFromSearch(parseRoute('#todos'))}>
                  待办
                </button>
              </h3>
              <ul className="mini-list">
                {hits.todos.map((t) => (
                  <li key={t.id}>
                    <label>
                      <input type="checkbox" checked={t.done} onChange={() => store.toggleTodo(t.id)} />
                      <span>{t.title}</span>
                    </label>
                  </li>
                ))}
              </ul>
              <h3>
                <button className="link" onClick={() => openFromSearch(parseRoute('#schedule'))}>
                  课程
                </button>
              </h3>
              <ul className="mini-list">
                {hits.courses.map((c) => (
                  <li key={c.id}>
                    {c.name} · {c.startTime}-{c.endTime} {c.location}
                  </li>
                ))}
              </ul>
              <h3>
                <button className="link" onClick={() => openFromSearch(parseRoute('#exams'))}>
                  考试
                </button>
              </h3>
              <ul className="mini-list">
                {hits.exams.map((e) => (
                  <li key={e.id}>
                    {e.name} · {e.date} {e.startTime}
                  </li>
                ))}
              </ul>
              <h3>
                <button className="link" onClick={() => openFromSearch(parseRoute('#selfschedule'))}>
                  自我管理
                </button>
              </h3>
              <ul className="mini-list">
                {hits.self.map((s) => (
                  <li key={s.id}>
                    {s.title} · {s.startTime}-{s.endTime}
                  </li>
                ))}
              </ul>
              <h3>
                <button className="link" onClick={() => openFromSearch(parseRoute('#days'))}>
                  日子
                </button>
              </h3>
              <ul className="mini-list">
                {hits.countdowns.map((c) => (
                  <li key={c.id}>
                    {c.emoji} {c.title}
                  </li>
                ))}
              </ul>
              <h3>
                <button className="link" onClick={() => openFromSearch(parseRoute('#notes'))}>
                  便签
                </button>
              </h3>
              <ul className="mini-list">
                {hits.notes.map((n) => (
                  <li key={n.id}>{n.title || n.body}</li>
                ))}
              </ul>
            </div>
          </section>
        ) : route.view === 'today' ? (
          <Today store={store} onOpen={openLegacy} focusTodos={route.focus === 'todos'} />
        ) : route.view === 'calendar' ? (
          <CalendarView store={store} />
        ) : route.view === 'timetable' ? (
          <Timetable
            store={store}
            tab={route.timetableTab}
            onTabChange={openTimetableTab}
            requestPermission={reminders.requestPermission}
            previewReminder={reminders.preview}
          />
        ) : route.view === 'days' ? (
          <Countdowns store={store} />
        ) : (
          <Notes store={store} />
        )}
      </main>

      <nav className="bottom-nav" aria-label="移动导航">
        {PRIMARY_NAV.map((item) => (
          <button
            key={item.id}
            className={route.view === item.id && !hits ? 'active' : ''}
            aria-current={route.view === item.id && !hits ? 'page' : undefined}
            onClick={() => openView(item.id)}
          >
            <span className="nav-icon" aria-hidden>
              {item.icon}
            </span>
            <span>{item.label}</span>
          </button>
        ))}
      </nav>
    </div>
  )
}
