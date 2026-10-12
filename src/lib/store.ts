import { CALENDAR_EVENT_COLORS, COURSE_COLORS, COUNTDOWN_COLORS, COUNTDOWN_EMOJIS, NOTE_COLORS, SELF_SCHEDULE_COLORS, STORAGE_KEY, defaultReminderSettings, type AppData, type CalendarEvent, type Countdown, type Course, type Exam, type ExamKind, type HolidayFavorite, type HolidaySettings, type Note, type Priority, type RecurrenceKind, type RecurrenceRule, type RecurrenceUnit, type RecurringReminder, type ReminderRule, type ReminderSettings, type SelfScheduleItem, type Term, type TimetableViewSettings, type Todo } from '../types'
import { defaultHolidaySettings } from './holidays/query'
import { hydrateRemarks } from './remarks'
import { currentAcademicYearStart, defaultTimetableView, defaultWeekCount, guessTermKind } from './terms'
export function createTerm(extras: Partial<Term> = {}): Term { const kind=extras.kind??guessTermKind(); return { id:extras.id??uid(), yearStart:extras.yearStart??currentAcademicYearStart(), kind, title:extras.title, startDate:extras.startDate??'', weekCount:extras.weekCount??defaultWeekCount(kind) } }
const UNITS: RecurrenceUnit[] = ['day', 'week', 'month', 'year']
const KINDS: RecurrenceKind[] = ['interval', 'term', 'season', 'onThisDay']

/** 旧备份没有 recurringReminders 时补空数组，不改更老的字段。 */
export function hydrateRecurrenceRule(raw: unknown): RecurrenceRule {
  const rule = raw && typeof raw === 'object' ? (raw as RecurrenceRule) : ({} as RecurrenceRule)
  const kind = KINDS.includes(rule.kind as RecurrenceKind) ? (rule.kind as RecurrenceKind) : 'interval'
  const interval = typeof rule.interval === 'number' && Number.isInteger(rule.interval) && rule.interval > 0 ? rule.interval : 1
  const unit = UNITS.includes(rule.unit as RecurrenceUnit) ? (rule.unit as RecurrenceUnit) : 'year'
  return {
    kind,
    interval,
    unit,
    termPhase: rule.termPhase === 'beforeEnd' ? 'beforeEnd' : rule.termPhase === 'afterStart' ? 'afterStart' : undefined,
    offsetDays: typeof rule.offsetDays === 'number' ? rule.offsetDays : undefined,
    season: typeof rule.season === 'string' ? rule.season : undefined,
    eventKey: typeof rule.eventKey === 'string' ? rule.eventKey : undefined,
  }
}

export function hydrateRecurringReminder(raw: Partial<RecurringReminder> | null | undefined): RecurringReminder | null {
  if (!raw || typeof raw.id !== 'string' || typeof raw.title !== 'string' || typeof raw.startDate !== 'string') return null
  const endDate = typeof raw.endDate === 'string' && raw.endDate ? raw.endDate : undefined
  const neverEnds = raw.neverEnds === true || !endDate
  return {
    id: raw.id,
    title: raw.title,
    body: typeof raw.body === 'string' && raw.body ? raw.body : undefined,
    startDate: raw.startDate,
    remindTime: typeof raw.remindTime === 'string' && raw.remindTime ? raw.remindTime : undefined,
    rule: hydrateRecurrenceRule(raw.rule),
    endDate: neverEnds ? undefined : endDate,
    neverEnds,
    enabled: raw.enabled !== false,
    createdAt: typeof raw.createdAt === 'number' ? raw.createdAt : 0,
    updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : typeof raw.createdAt === 'number' ? raw.createdAt : 0,
  }
}

function hydrateTimetableView(raw?: Partial<TimetableViewSettings>): TimetableViewSettings { const base=defaultTimetableView(); if(!raw||typeof raw!=='object')return base; const hiddenHours=Array.isArray(raw.hiddenHours)?raw.hiddenHours.filter(h=>Number.isInteger(h)&&h>=0&&h<=23):base.hiddenHours; const hiddenWeekdays=Array.isArray(raw.hiddenWeekdays)?raw.hiddenWeekdays.filter(d=>d>=1&&d<=7):base.hiddenWeekdays; return {weekStartsOn:raw.weekStartsOn===7?7:1,showOffWeekCourses:Boolean(raw.showOffWeekCourses),hiddenHours:hiddenHours.length===24?base.hiddenHours:hiddenHours,hiddenWeekdays:hiddenWeekdays.length===7?[]:hiddenWeekdays,classPeriods:Array.isArray(raw.classPeriods)&&raw.classPeriods.length>0?raw.classPeriods.map(p=>({start:p.start,end:p.end})):base.classPeriods} }
const TARGETS = ['todo', 'event', 'exam', 'course', 'self', 'day', 'holiday', 'recurring'] as const
function hydrateReminderRules(raw: unknown): ReminderRule[] {
  if (!Array.isArray(raw)) return []
  return raw.flatMap((item) => {
    const rule = item as Partial<ReminderRule>
    if (!rule || typeof rule.id !== 'string' || typeof rule.targetId !== 'string') return []
    if (!TARGETS.includes(rule.targetType as (typeof TARGETS)[number])) return []
    return [{
      id: rule.id,
      targetType: rule.targetType as ReminderRule['targetType'],
      targetId: rule.targetId,
      delivery: rule.delivery === 'alarm' ? 'alarm' : 'notification',
      triggerMode: rule.triggerMode === 'absolute' ? 'absolute' : 'relative',
      triggerAt: typeof rule.triggerAt === 'string' ? rule.triggerAt : undefined,
      offsetMinutes: typeof rule.offsetMinutes === 'number' ? rule.offsetMinutes : undefined,
      timezone: typeof rule.timezone === 'string' && rule.timezone ? rule.timezone : 'Asia/Shanghai',
      enabled: rule.enabled === true,
      snoozeMinutes: typeof rule.snoozeMinutes === 'number' ? rule.snoozeMinutes : 5,
      vibrationEnabled: rule.vibrationEnabled !== false,
      createdAt: typeof rule.createdAt === 'number' ? rule.createdAt : 0,
      updatedAt: typeof rule.updatedAt === 'number' ? rule.updatedAt : 0,
      revision: typeof rule.revision === 'number' ? rule.revision : 1,
    }]
  })
}
function hydrateHolidaySettings(raw: unknown): HolidaySettings {
  const base = defaultHolidaySettings()
  const item = raw && typeof raw === 'object' ? raw as Partial<HolidaySettings> : {}
  return {
    showCn: typeof item.showCn === 'boolean' ? item.showCn : base.showCn,
    showUs: typeof item.showUs === 'boolean' ? item.showUs : base.showUs,
    showPublic: typeof item.showPublic === 'boolean' ? item.showPublic : true,
    showTraditional: typeof item.showTraditional === 'boolean' ? item.showTraditional : true,
    showAdjusted: typeof item.showAdjusted === 'boolean' ? item.showAdjusted : true,
    updatedAt: typeof item.updatedAt === 'number' ? item.updatedAt : 0,
  }
}
function hydrateHolidayFavorites(raw: unknown): HolidayFavorite[] {
  if (!Array.isArray(raw)) return []
  return raw.flatMap((item) => {
    const fav = item as Partial<HolidayFavorite>
    if (!fav || typeof fav.stableKey !== 'string') return []
    return [{ id: typeof fav.id === 'string' ? fav.id : fav.stableKey, stableKey: fav.stableKey, region: fav.region === 'US' ? 'US' as const : 'CN' as const, createdAt: typeof fav.createdAt === 'number' ? fav.createdAt : 0 }]
  })
}
function hydrateTombstones(raw: unknown): { id: string; deletedAt: number }[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((item): item is { id: string; deletedAt: number } => Boolean(item && typeof item.id === 'string' && typeof item.deletedAt === 'number'))
}

function hydrateAppData(parsed: Partial<AppData>): AppData { const timetableView=hydrateTimetableView(parsed.timetableView); let terms=Array.isArray(parsed.terms)?parsed.terms.filter((t):t is Term=>Boolean(t&&typeof t.id==='string')):[]; if(!terms.length)terms=[createTerm({startDate:typeof parsed.termStart==='string'?parsed.termStart:''})]; const currentTermId=typeof parsed.currentTermId==='string'&&terms.some(t=>t.id===parsed.currentTermId)?parsed.currentTermId:terms[0].id; const current=terms.find(t=>t.id===currentTermId)??terms[0]; const courses=(Array.isArray(parsed.courses)?parsed.courses:[]).map(course=>({...course,termId:course.termId||current.id,remindMinutes:typeof course.remindMinutes==='number'?course.remindMinutes:15})); const todos=(Array.isArray(parsed.todos)?parsed.todos:[]).map(t=>({...t,remindMinutes:typeof t.remindMinutes==='number'?t.remindMinutes:15})); const selfSchedules=(Array.isArray(parsed.selfSchedules)?parsed.selfSchedules:[]).map(s=>({...s,remindMinutes:typeof s.remindMinutes==='number'?s.remindMinutes:10,priority:s.priority??'medium'})); const calendarEvents=(Array.isArray(parsed.calendarEvents)?parsed.calendarEvents:[]).map(e=>({...e,allDay:Boolean(e.allDay),priority:e.priority??'medium',remindMinutes:typeof e.remindMinutes==='number'?e.remindMinutes:15,repeat:e.repeat??'none',updatedAt:typeof e.updatedAt==='number'?e.updatedAt:typeof e.createdAt==='number'?e.createdAt:0,revision:typeof e.revision==='number'?e.revision:1})); const recurringReminders=(Array.isArray(parsed.recurringReminders)?parsed.recurringReminders:[]).map(hydrateRecurringReminder).filter((item):item is RecurringReminder=>Boolean(item)); const reminderRules=hydrateReminderRules(parsed.reminderRules); const holidayFavorites=hydrateHolidayFavorites(parsed.holidayFavorites); return {todos,countdowns:Array.isArray(parsed.countdowns)?parsed.countdowns:[],notes:Array.isArray(parsed.notes)?parsed.notes:[],courses,exams:Array.isArray(parsed.exams)?parsed.exams:[],selfSchedules,calendarEvents,recurringReminders,remarks:hydrateRemarks(parsed.remarks),reminderRules,holidaySettings:hydrateHolidaySettings(parsed.holidaySettings),holidayFavorites,reminderSettings:{...defaultReminderSettings(),...(parsed.reminderSettings as ReminderSettings|undefined)},terms,currentTermId:current.id,timetableView,termStart:current.startDate||undefined,tombstones:hydrateTombstones(parsed.tombstones)} }
export const emptyData=():AppData=>hydrateAppData({}); function dataKey(): string {
  if (typeof window === "undefined") return STORAGE_KEY;
  try {
    const sub = sessionStorage.getItem("yyds.days.sub") || "";
    if (/^usr_[0-9A-HJKMNP-TV-Z]{10,}$/i.test(sub)) return `${STORAGE_KEY}:${sub}`;
  } catch {
    // 没有 sessionStorage 时继续用原来的本机键
  }
  return STORAGE_KEY;
}
export function loadData():AppData { if(typeof window==='undefined')return emptyData(); try{const key=dataKey(); let raw=window.localStorage.getItem(key); if(!raw && key!==STORAGE_KEY){ const legacy=window.localStorage.getItem(STORAGE_KEY); const mark=`${STORAGE_KEY}:migrated:${key}`; if(legacy && !window.localStorage.getItem(mark)){ window.localStorage.setItem(key, legacy); window.localStorage.setItem(mark,"1"); raw=legacy; } } if(!raw)return emptyData();return hydrateAppData(JSON.parse(raw) as Partial<AppData>)}catch{return emptyData()} } export function saveData(data:AppData):void{window.localStorage.setItem(dataKey(),JSON.stringify(data))} export function uid():string{return crypto.randomUUID()}
export function createTodo(title:string,extras:{dueDate?:string;dueTime?:string;dueEndTime?:string;priority?:Priority;remindMinutes?:number}={}):Todo{return{id:uid(),title:title.trim(),done:false,dueDate:extras.dueDate,dueTime:extras.dueTime,dueEndTime:extras.dueEndTime,priority:extras.priority??'medium',remindMinutes:extras.remindMinutes??15,createdAt:Date.now()}}
export function createCountdown(title:string,date:string,extras:{color?:string;emoji?:string;repeatYearly?:boolean}={}):Countdown{return{id:uid(),title:title.trim(),date,color:extras.color??COUNTDOWN_COLORS[0],emoji:extras.emoji??COUNTDOWN_EMOJIS[0],repeatYearly:extras.repeatYearly??false,createdAt:Date.now()}}
export function createNote(title:string,body:string,extras:{color?:string;date?:string}={}):Note{return{id:uid(),title:title.trim(),body,color:extras.color??NOTE_COLORS[0],pinned:false,date:extras.date,updatedAt:Date.now()}}
export function exportBlob(data:AppData):Blob{return new Blob([JSON.stringify(data,null,2)],{type:'application/json'})} export function parseImport(text:string):AppData{const parsed=JSON.parse(text) as Partial<AppData>;if(!parsed||typeof parsed!=='object')throw new Error('无效的备份文件');return hydrateAppData(parsed)}
export function createCourse(name:string,extras:Partial<Omit<Course,'id'|'name'|'createdAt'>>={}):Course{return{id:uid(),name:name.trim(),weekday:extras.weekday??1,startTime:extras.startTime??'08:00',endTime:extras.endTime??'09:40',location:extras.location,teacher:extras.teacher,weeks:extras.weeks,color:extras.color??COURSE_COLORS[0],remindMinutes:extras.remindMinutes??15,createdAt:Date.now(),termId:extras.termId}}
export function createExam(name:string,extras:Partial<Omit<Exam,'id'|'name'|'createdAt'>>={}):Exam{return{id:uid(),name:name.trim(),kind:(extras.kind as ExamKind|undefined)??'final',date:extras.date??'',startTime:extras.startTime??'09:00',endTime:extras.endTime,location:extras.location,seat:extras.seat,remindMinutes:extras.remindMinutes??1440,createdAt:Date.now()}}
export function createSelfSchedule(title:string,extras:Partial<Omit<SelfScheduleItem,'id'|'title'|'createdAt'>>={}):SelfScheduleItem{return{id:uid(),title:title.trim(),weekday:extras.weekday??1,startTime:extras.startTime??'08:00',endTime:extras.endTime??'09:00',color:extras.color??SELF_SCHEDULE_COLORS[0],note:extras.note,remindMinutes:extras.remindMinutes??10,priority:extras.priority??'medium',createdAt:Date.now()}}
export function createCalendarEvent(title:string,extras:Partial<Omit<CalendarEvent,'title'|'createdAt'>> & {id?:string}={}):CalendarEvent{const now=Date.now();return{id:extras.id||uid(),title:title.trim(),date:extras.date??'',startTime:extras.startTime,endTime:extras.endTime,allDay:extras.allDay??false,location:extras.location,note:extras.note,color:extras.color??CALENDAR_EVENT_COLORS[0],priority:extras.priority??'medium',remindMinutes:extras.remindMinutes??15,repeat:extras.repeat??'none',createdAt:now,updatedAt:now,revision:1}}
export function createRecurringReminder(title:string,extras:Partial<Omit<RecurringReminder,'id'|'title'|'createdAt'|'updatedAt'>>={}):RecurringReminder{const now=Date.now();const endDate=extras.endDate;const neverEnds=extras.neverEnds??!endDate;return{id:uid(),title:title.trim(),body:extras.body,startDate:extras.startDate??'',remindTime:extras.remindTime,rule:hydrateRecurrenceRule(extras.rule??{kind:'interval',interval:1,unit:'year'}),endDate:neverEnds?undefined:endDate,neverEnds,enabled:extras.enabled??true,createdAt:now,updatedAt:now}}
