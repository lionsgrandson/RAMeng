import { useMemo, useState, type FormEvent } from 'react'
import { CalendarPlus, ExternalLink, FileText, RefreshCw, Upload } from 'lucide-react'
import { integrationsApi } from '../lib/api'
import { uploadFile } from '../lib/backend'
import type { CalendarEvent, FileRecord, Workspace } from '../types'
import type { AreaPermissions } from '../lib/permissions'
import { Chip, EmptyState, Field, Modal, StoredFileLink, dateTimeLabel, nowIso, uid } from './common'

export function CalendarPage({ workspace, setWorkspace, onProject, onTask, startCreating = false, canEdit = true, permissions }: { workspace: Workspace; setWorkspace: React.Dispatch<React.SetStateAction<Workspace>>; onProject?: (id: string) => void; onTask?: (id: string) => void; startCreating?: boolean; canEdit?: boolean; permissions?: AreaPermissions }) {
  const calendarPermissions: AreaPermissions = permissions || { view: true, create: canEdit, edit: canEdit, status: canEdit, delete: canEdit }
  const canCreate = calendarPermissions.create
  const canSync = calendarPermissions.create && calendarPermissions.edit && calendarPermissions.delete
  const today = new Date()
  const dateKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  const [adding, setAdding] = useState(startCreating && canCreate)
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState('')
  const [eventProjectId, setEventProjectId] = useState('')
  const [eventTaskId, setEventTaskId] = useState('')
  const [month, setMonth] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1))
  const [selectedDate, setSelectedDate] = useState(() => dateKey(today))
  const [calendarSearch, setCalendarSearch] = useState('')
  const [calendarProjectFilter, setCalendarProjectFilter] = useState('הכל')
  const [calendarItemFilter, setCalendarItemFilter] = useState<'הכל' | 'אירועים' | 'משימות'>('הכל')
  const [calendarSourceFilter, setCalendarSourceFilter] = useState<'הכל' | 'Google' | 'מקומי'>('הכל')

  const sync = async () => {
    setSyncing(true)
    setError('')
    try {
      const from = new Date(Date.now() - 30 * 86400000).toISOString()
      const to = new Date(Date.now() + 180 * 86400000).toISOString()
      const { items } = await integrationsApi.calendarEvents(from, to)
      setWorkspace((current) => {
        const localByGoogle = new Map(current.events.filter((item) => item.googleEventId).map((item) => [item.googleEventId, item]))
        const imported = items.map((item) => {
          const existing = localByGoogle.get(item.id)
          return {
            ...(existing || {}),
            id: existing?.id || uid('event'),
            title: item.summary,
            start: item.start,
            end: item.end,
            location: item.location,
            googleEventId: item.id,
            googleHtmlLink: item.htmlLink,
          } satisfies CalendarEvent
        })
        const keep = current.events.filter((item) => !item.googleEventId || !items.some((google) => google.id === item.googleEventId))
        return { ...current, events: [...keep, ...imported] }
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שגיאת סנכרון')
    } finally {
      setSyncing(false)
    }
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const item: CalendarEvent = {
      id: uid('event'),
      title: String(data.get('title') || ''),
      start: new Date(String(data.get('start'))).toISOString(),
      end: data.get('end') ? new Date(String(data.get('end'))).toISOString() : undefined,
      location: String(data.get('location') || ''),
      notes: String(data.get('notes') || ''),
      projectId: eventProjectId || undefined,
      taskId: eventTaskId || undefined,
    }
    if (data.get('google') === 'on') {
      try {
        const created = await integrationsApi.createCalendarEvent({ summary: item.title, start: item.start, end: item.end, description: item.notes, location: item.location })
        item.googleEventId = created.id
        item.googleHtmlLink = created.htmlLink
      } catch (e) {
        setError(`האירוע נשמר במערכת, אבל Google Calendar לא עודכן: ${e instanceof Error ? e.message : 'שגיאה לא ידועה'}`)
      }
    }
    setWorkspace((current) => ({ ...current, events: [...current.events, item] }))
    setSelectedDate(dateKey(new Date(item.start)))
    setMonth(new Date(new Date(item.start).getFullYear(), new Date(item.start).getMonth(), 1))
    setAdding(false)
  }

  const monthStart = new Date(month.getFullYear(), month.getMonth(), 1)
  const gridStart = new Date(monthStart)
  gridStart.setDate(monthStart.getDate() - monthStart.getDay())
  const days = Array.from({ length: 42 }, (_, index) => {
    const day = new Date(gridStart)
    day.setDate(gridStart.getDate() + index)
    return day
  })
  const monthLabel = new Intl.DateTimeFormat('he-IL-u-ca-gregory', { month: 'long', year: 'numeric' }).format(month)
  const todayKey = dateKey(today)
  const weekdayLabels = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳']
  const filteredCalendarEvents = useMemo(() => workspace.events.filter((item) => {
    const project = workspace.projects.find((entry) => entry.id === item.projectId)
    const task = workspace.tasks.find((entry) => entry.id === item.taskId)
    const q = calendarSearch.trim().toLowerCase()
    if (q && !`${item.title} ${item.location || ''} ${item.notes || ''} ${project?.name || ''} ${project?.address || ''} ${task?.title || ''}`.toLowerCase().includes(q)) return false
    if (calendarProjectFilter !== 'הכל') {
      if (calendarProjectFilter === '__none__' && item.projectId) return false
      if (calendarProjectFilter !== '__none__' && item.projectId !== calendarProjectFilter) return false
    }
    if (calendarSourceFilter === 'Google' && !item.googleEventId) return false
    if (calendarSourceFilter === 'מקומי' && item.googleEventId) return false
    return true
  }), [workspace.events, workspace.projects, workspace.tasks, calendarSearch, calendarProjectFilter, calendarSourceFilter])
  const eventsFor = (key: string) => calendarItemFilter === 'משימות' ? [] : filteredCalendarEvents.filter((item) => dateKey(new Date(item.start)) === key).sort((a, b) => a.start.localeCompare(b.start))
  const selectedEvents = eventsFor(selectedDate)
  const selectedTasks = calendarItemFilter === 'אירועים' ? [] : workspace.tasks.filter((task) => {
    if (![task.startDate, task.dueDate, task.followUpDate].some((value) => value === selectedDate)) return false
    if (calendarProjectFilter !== 'הכל') {
      if (calendarProjectFilter === '__none__' && task.projectId) return false
      if (calendarProjectFilter !== '__none__' && task.projectId !== calendarProjectFilter) return false
    }
    const project = workspace.projects.find((entry) => entry.id === task.projectId)
    const q = calendarSearch.trim().toLowerCase()
    return !q || `${task.title} ${task.description || ''} ${task.emailTo || ''} ${project?.name || ''} ${project?.address || ''}`.toLowerCase().includes(q)
  })

  return <div className="calendar-page">
    <section className="card calendar-month-card">
      <div className="calendar-toolbar">
        <div><h2>יומן</h2><strong>{monthLabel}</strong></div>
        <div className="calendar-toolbar-actions">
          <button type="button" className="secondary" onClick={() => { const next = new Date(today.getFullYear(), today.getMonth(), 1); setMonth(next); setSelectedDate(todayKey) }}>היום</button>
          <button type="button" className="icon-btn" aria-label="החודש הקודם" onClick={() => setMonth((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1))}>‹</button>
          <button type="button" className="icon-btn" aria-label="החודש הבא" onClick={() => setMonth((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1))}>›</button>
          {canSync && <button type="button" className="secondary" onClick={() => void sync()} disabled={syncing}><RefreshCw /> {syncing ? 'מסנכרן...' : 'סנכרון Google'}</button>}
          {canCreate && <button type="button" className="primary" onClick={() => { setEventProjectId(''); setEventTaskId(''); setAdding(true) }}><CalendarPlus /> אירוע</button>}
        </div>
      </div>
      <div className="list-filter-panel calendar-filter-panel">
        <label className="list-filter-field filter-grow"><span>חיפוש</span><input value={calendarSearch} onChange={(e) => setCalendarSearch(e.target.value)} placeholder="אירוע, משימה, כתובת, מיקום או פרויקט" /></label>
        <label className="list-filter-field"><span>פרויקט</span><select value={calendarProjectFilter} onChange={(e) => setCalendarProjectFilter(e.target.value)}><option value="הכל">כל הפרויקטים</option><option value="__none__">ללא פרויקט</option>{workspace.projects.map((project) => <option key={project.id} value={project.id}>{project.address || 'כתובת חסרה'} · {project.name}</option>)}</select></label>
        <label className="list-filter-field"><span>סוג</span><select value={calendarItemFilter} onChange={(e) => setCalendarItemFilter(e.target.value as 'הכל' | 'אירועים' | 'משימות')}><option>הכל</option><option>אירועים</option><option>משימות</option></select></label>
        <label className="list-filter-field"><span>מקור אירוע</span><select value={calendarSourceFilter} onChange={(e) => setCalendarSourceFilter(e.target.value as 'הכל' | 'Google' | 'מקומי')} disabled={calendarItemFilter === 'משימות'}><option>הכל</option><option>Google</option><option>מקומי</option></select></label>
        <button type="button" className="secondary compact-filter-clear" onClick={() => { setCalendarSearch(''); setCalendarProjectFilter('הכל'); setCalendarItemFilter('הכל'); setCalendarSourceFilter('הכל') }}>ניקוי סינון</button>
      </div>
      {error && <div className="error-banner">{error}</div>}
      <div className="month-grid" role="grid" aria-label={`יומן ${monthLabel}`}>
        {weekdayLabels.map((label) => <div className="month-weekday" role="columnheader" key={label}>{label}</div>)}
        {days.map((day) => {
          const key = dateKey(day)
          const dayEvents = eventsFor(key)
          const inMonth = day.getMonth() === month.getMonth()
          const classes = ['month-day', inMonth ? '' : 'outside', key === todayKey ? 'today' : '', key === selectedDate ? 'selected' : ''].filter(Boolean).join(' ')
          return <button type="button" role="gridcell" aria-selected={key === selectedDate} className={classes} key={key} onClick={() => setSelectedDate(key)}>
            <span className="month-day-number">{day.getDate()}</span>
            <div className="month-day-items">{dayEvents.slice(0, 3).map((item) => <span key={item.id} title={item.title}>{item.title}</span>)}{dayEvents.length > 3 && <small>+{dayEvents.length - 3}</small>}</div>
          </button>
        })}
      </div>
    </section>

    <section className="card selected-day-card">
      <div className="card-head"><div><h2>{new Intl.DateTimeFormat('he-IL-u-ca-gregory', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(`${selectedDate}T12:00:00`))}</h2><p>אירועים ומשימות לתאריך שנבחר</p></div></div>
      <div className="selected-day-list">
        {selectedEvents.map((item) => <article key={item.id} className="selected-day-item"><div className="calendar-date"><strong>{new Intl.DateTimeFormat('he-IL', { hour: '2-digit', minute: '2-digit' }).format(new Date(item.start))}</strong><span>אירוע</span></div><div><strong>{item.title}</strong><small>{dateTimeLabel(item.start)}{item.location ? ` · ${item.location}` : ''}</small><div className="context-links">{item.projectId && onProject && <button type="button" onClick={() => onProject(item.projectId!)}>פרויקט: {workspace.projects.find((project) => project.id === item.projectId)?.address || workspace.projects.find((project) => project.id === item.projectId)?.name || 'פתיחה'}</button>}{item.taskId && onTask && <button type="button" onClick={() => onTask(item.taskId!)}>פתיחת המשימה</button>}</div></div>{item.googleEventId && <Chip tone="brand">Google</Chip>}{item.googleHtmlLink && <a className="icon-btn" href={item.googleHtmlLink} target="_blank" rel="noreferrer" aria-label={`פתיחת ${item.title} ב-Google Calendar`}><ExternalLink /></a>}</article>)}
        {selectedTasks.map((task) => <article key={task.id} className="selected-day-item task-day-item"><div className="calendar-date"><strong>משימה</strong><span>{task.status}</span></div><div><strong>{task.title}</strong><small>{task.startDate === selectedDate ? 'תאריך התחלה' : task.dueDate === selectedDate ? 'תאריך סיום' : 'מועד מעקב'}{task.emailTo ? ` · ${task.emailTo}` : ''}</small><div className="context-links">{task.projectId && onProject && <button type="button" onClick={() => onProject(task.projectId!)}>פרויקט: {workspace.projects.find((project) => project.id === task.projectId)?.address || workspace.projects.find((project) => project.id === task.projectId)?.name || 'פתיחה'}</button>}{onTask && <button type="button" onClick={() => onTask(task.id)}>פתיחת המשימה</button>}</div></div><Chip tone={['בוצע', 'סגור'].includes(task.status) ? 'good' : 'brand'}>{task.status}</Chip></article>)}
        {!selectedEvents.length && !selectedTasks.length && <EmptyState title="אין פריטים בתאריך הזה" text="בחרו יום אחר או הוסיפו אירוע חדש." />}
      </div>
    </section>

    {canCreate && adding && <Modal title="אירוע חדש" onClose={() => setAdding(false)}>
      <form className="form-grid" onSubmit={(e) => void submit(e)}>
        <Field label="כותרת"><input name="title" required /></Field>
        <Field label="התחלה"><input name="start" type="datetime-local" defaultValue={`${selectedDate}T09:00`} required /></Field>
        <Field label="סיום"><input name="end" type="datetime-local" /></Field>
        <Field label="מיקום"><input name="location" /></Field>
        <Field label="פרויקט"><select name="projectId" value={eventProjectId} onChange={(e) => { const next = e.target.value; setEventProjectId(next); const selectedTask = workspace.tasks.find((task) => task.id === eventTaskId); if (selectedTask && selectedTask.projectId !== next) setEventTaskId('') }}><option value="">ללא</option>{workspace.projects.map((project) => <option key={project.id} value={project.id}>{project.address || project.name}</option>)}</select></Field>
        <Field label="משימה"><select name="taskId" value={eventTaskId} onChange={(e) => { const next = e.target.value; setEventTaskId(next); const task = workspace.tasks.find((item) => item.id === next); if (task?.projectId) setEventProjectId(task.projectId) }}><option value="">ללא</option>{workspace.tasks.filter((task) => !eventProjectId || task.projectId === eventProjectId).map((task) => <option key={task.id} value={task.id}>{task.title}</option>)}</select></Field>
        <Field label="הערות"><textarea name="notes" rows={3} /></Field>
        <label className="check-line"><input name="google" type="checkbox" /> יצירה גם ב-Google Calendar (אם מחובר)</label>
        <div className="form-actions"><button className="primary">שמירה</button></div>
      </form>
    </Modal>}
  </div>
}

export function FilesPage({ workspace, setWorkspace, orgId, projectId, onProject, onTask, canEdit = true, permissions }: { workspace: Workspace; setWorkspace: React.Dispatch<React.SetStateAction<Workspace>>; orgId: string; projectId?: string; onProject?: (id: string) => void; onTask?: (id: string) => void; canEdit?: boolean; permissions?: AreaPermissions }) {
  const filePermissions: AreaPermissions = permissions || { view: true, create: canEdit, edit: canEdit, status: canEdit, delete: canEdit }
  const canUpload = filePermissions.create
  const [uploading, setUploading] = useState(false); const [error, setError] = useState(''); const [uploadProjectId, setUploadProjectId] = useState(projectId || ''); const [uploadTaskId, setUploadTaskId] = useState('')
  const [search, setSearch] = useState('')
  const [projectFilter, setProjectFilter] = useState(projectId || 'הכל')
  const [taskFilter, setTaskFilter] = useState('הכל')
  const [typeFilter, setTypeFilter] = useState('הכל')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const baseRecords = workspace.files.filter((file) => !projectId || file.projectId === projectId)
  const fileCategory = (file: FileRecord) => {
    const type = (file.type || '').toLowerCase()
    const name = file.name.toLowerCase()
    if (type.startsWith('image/') || /\.(png|jpe?g|gif|webp|heic)$/i.test(name)) return 'תמונות'
    if (type.includes('pdf') || name.endsWith('.pdf')) return 'PDF'
    if (type.includes('sheet') || type.includes('excel') || /\.(xlsx?|csv)$/i.test(name)) return 'גיליונות'
    if (type.includes('word') || type.includes('document') || /\.(docx?|txt|rtf)$/i.test(name)) return 'מסמכים'
    return 'אחר'
  }
  const records = useMemo(() => baseRecords.filter((file) => {
    const project = workspace.projects.find((item) => item.id === file.projectId)
    const task = workspace.tasks.find((item) => item.id === file.taskId)
    const q = search.trim().toLowerCase()
    if (q && !`${file.name} ${project?.name || ''} ${project?.address || ''} ${task?.title || ''}`.toLowerCase().includes(q)) return false
    if (!projectId && projectFilter !== 'הכל') {
      if (projectFilter === '__none__' && file.projectId) return false
      if (projectFilter !== '__none__' && file.projectId !== projectFilter) return false
    }
    if (taskFilter !== 'הכל') {
      if (taskFilter === '__none__' && file.taskId) return false
      if (taskFilter !== '__none__' && file.taskId !== taskFilter) return false
    }
    if (typeFilter !== 'הכל' && fileCategory(file) !== typeFilter) return false
    const uploaded = file.uploadedAt.slice(0, 10)
    if (dateFrom && uploaded < dateFrom) return false
    if (dateTo && uploaded > dateTo) return false
    return true
  }), [baseRecords, workspace.projects, workspace.tasks, search, projectId, projectFilter, taskFilter, typeFilter, dateFrom, dateTo])
  const availableTasks = workspace.tasks.filter((task) => (projectId || uploadProjectId) ? task.projectId === (projectId || uploadProjectId) : !task.projectId)
  const filterTasks = workspace.tasks.filter((task) => {
    const pid = projectId || (projectFilter !== 'הכל' && projectFilter !== '__none__' ? projectFilter : '')
    return pid ? task.projectId === pid : true
  })
  const add = async (file: File, chosenProjectId?: string, taskId?: string) => { setUploading(true); setError(''); try { const pid = chosenProjectId || projectId || 'general'; const result = await uploadFile(orgId, pid, file); const record: FileRecord = { id: uid('file'), projectId: pid === 'general' ? undefined : pid, taskId: taskId || undefined, name: file.name, url: result.url, storagePath: result.path, type: file.type, size: file.size, version: 1, uploadedAt: nowIso() }; setWorkspace((current) => ({ ...current, files: [record, ...current.files] })) } catch (e) { setError(e instanceof Error ? e.message : 'העלאה נכשלה') } finally { setUploading(false) } }
  const changeProject = (value: string) => { setUploadProjectId(value); setUploadTaskId('') }
  return <section className="card"><div className="card-head"><div><h2>קבצים ומסמכים</h2><p>מסמכי פרויקט, תכניות, חוזים ותמונות המשויכים לפרויקט או למשימה.</p></div>{canUpload && <div className="inline-create">{!projectId && <select aria-label="שיוך קובץ לפרויקט" value={uploadProjectId} onChange={(e) => changeProject(e.target.value)}><option value="">כללי, ללא פרויקט</option>{workspace.projects.map((project) => <option key={project.id} value={project.id}>{project.address || 'כתובת חסרה'} · {project.name}</option>)}</select>}<select aria-label="שיוך קובץ למשימה" value={uploadTaskId} onChange={(e) => setUploadTaskId(e.target.value)}><option value="">ללא שיוך למשימה</option>{availableTasks.map((task) => <option key={task.id} value={task.id}>{task.title}</option>)}</select><label className="primary file-label" tabIndex={0}><Upload /> {uploading ? 'מעלה...' : 'העלאת קובץ'}<input type="file" aria-label="בחירת קובץ להעלאה" disabled={uploading} onChange={(e) => { const file = e.target.files?.[0]; if (!file) return; void add(file, projectId || uploadProjectId || undefined, uploadTaskId || undefined); e.currentTarget.value = '' }} /></label></div>}</div>
  <div className="list-filter-panel file-filter-panel">
    <label className="list-filter-field filter-grow"><span>חיפוש</span><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="שם קובץ, פרויקט, כתובת או משימה" /></label>
    {!projectId && <label className="list-filter-field"><span>פרויקט</span><select value={projectFilter} onChange={(e) => { setProjectFilter(e.target.value); setTaskFilter('הכל') }}><option value="הכל">כל הפרויקטים</option><option value="__none__">כללי, ללא פרויקט</option>{workspace.projects.map((project) => <option key={project.id} value={project.id}>{project.address || 'כתובת חסרה'} · {project.name}</option>)}</select></label>}
    <label className="list-filter-field"><span>משימה</span><select value={taskFilter} onChange={(e) => setTaskFilter(e.target.value)}><option value="הכל">כל המשימות</option><option value="__none__">ללא משימה</option>{filterTasks.map((task) => <option key={task.id} value={task.id}>{task.title}</option>)}</select></label>
    <label className="list-filter-field"><span>סוג קובץ</span><select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}><option>הכל</option><option>PDF</option><option>תמונות</option><option>מסמכים</option><option>גיליונות</option><option>אחר</option></select></label>
    <label className="list-filter-field"><span>הועלה מתאריך</span><input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} /></label>
    <label className="list-filter-field"><span>הועלה עד תאריך</span><input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} /></label>
    <button type="button" className="secondary compact-filter-clear" onClick={() => { setSearch(''); if (!projectId) setProjectFilter('הכל'); setTaskFilter('הכל'); setTypeFilter('הכל'); setDateFrom(''); setDateTo('') }}>ניקוי סינון</button>
    <span className="filter-count">{records.length} מתוך {baseRecords.length} קבצים</span>
  </div>
  {error && <div className="error-banner">{error}</div>}<div className="file-list">{records.map((file) => <div className="linked-file-row" key={file.id}><StoredFileLink file={file}><span className="file-icon"><FileText /></span><div><strong>{file.name}</strong><small>{workspace.projects.find((project) => project.id === file.projectId)?.name || 'כללי'}{file.taskId ? ` · ${workspace.tasks.find((task) => task.id === file.taskId)?.title || 'משימה'}` : ''} · גרסה {file.version} · {new Intl.NumberFormat('he-IL', { maximumFractionDigits: 1 }).format((file.size || 0) / 1024)} KB</small></div><ExternalLink /></StoredFileLink><div className="context-links">{file.projectId && onProject ? <button type="button" onClick={() => onProject(file.projectId!)}>פרויקט: {workspace.projects.find((project) => project.id === file.projectId)?.name || 'פתיחה'}</button> : <span>כללי</span>}{file.taskId && onTask && <button type="button" onClick={() => onTask(file.taskId!)}>משימה: {workspace.tasks.find((task) => task.id === file.taskId)?.title || 'פתיחה'}</button>}</div></div>)}{!records.length && <EmptyState title="אין קבצים" text="העלו מסמכים ותכניות. כאשר Supabase מחובר, הקבצים נשמרים ב-Storage המאובטח." />}</div></section>
}
