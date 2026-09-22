import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { ArrowRight, CalendarDays, ExternalLink, FileText, FolderKanban, HardDrive, ListChecks, Mail, Plus, RefreshCw, Send, Settings2 } from 'lucide-react'
import { integrationsApi, type GmailApiMessage, type GoogleDriveFile } from '../lib/api'
import type { CalendarEvent, Project, ProjectStatus, Task, Workspace } from '../types'
import type { AreaPermissions } from '../lib/permissions'
import { Chip, EmptyState, Field, Modal, dateLabel, dateTimeLabel, nowIso, uid } from './common'
import TaskBoard from './TaskBoard'
import ReportsPage from './Reports'
import { FilesPage } from './CalendarFiles'
import AddressAutocomplete from './AddressAutocomplete'
import ClientMultiPicker from './ClientMultiPicker'

export function ProjectsPage({ workspace, setWorkspace, onOpen, startCreating = false, canEdit = true }: { workspace: Workspace; setWorkspace: React.Dispatch<React.SetStateAction<Workspace>>; onOpen: (id: string) => void; startCreating?: boolean; canEdit?: boolean }) {
  const [adding, setAdding] = useState(startCreating && canEdit)
  const [search, setSearch] = useState('')
  const [addressFilter, setAddressFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('הכל')
  const [managerFilter, setManagerFilter] = useState('הכל')
  const [clientFilter, setClientFilter] = useState('הכל')
  const [dateField, setDateField] = useState<'start' | 'target' | 'created'>('start')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const filteredProjects = useMemo(() => {
    const general = search.trim().toLowerCase()
    const address = addressFilter.trim().toLowerCase()
    return workspace.projects.filter((project) => {
      const clientNames = project.clientIds.map((id) => workspace.contacts.find((contact) => contact.id === id)?.name || '').join(' ')
      const haystack = `${project.name} ${project.address || ''} ${clientNames}`.toLowerCase()
      if (general && !haystack.includes(general)) return false
      if (address && !(project.address || '').toLowerCase().includes(address)) return false
      if (statusFilter !== 'הכל' && project.status !== statusFilter) return false
      if (managerFilter !== 'הכל') {
        if (managerFilter === '__none__' && project.managerId) return false
        if (managerFilter !== '__none__' && project.managerId !== managerFilter) return false
      }
      if (clientFilter !== 'הכל') {
        if (clientFilter === '__none__' && project.clientIds.length) return false
        if (clientFilter !== '__none__' && !project.clientIds.includes(clientFilter)) return false
      }
      const selectedDate = dateField === 'start' ? project.startDate : dateField === 'target' ? project.targetDate : project.createdAt.slice(0, 10)
      if (dateFrom && (!selectedDate || selectedDate < dateFrom)) return false
      if (dateTo && (!selectedDate || selectedDate > dateTo)) return false
      return true
    })
  }, [workspace.projects, workspace.contacts, search, addressFilter, statusFilter, managerFilter, clientFilter, dateField, dateFrom, dateTo])

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const address = String(data.get('address') || '').trim()
    if (!address) return
    const project: Project = {
      id: uid('project'),
      name: String(data.get('name') || '').trim(),
      address,
      clientIds: data.getAll('clientIds').map(String),
      managerId: String(data.get('managerId') || '') || undefined,
      status: String(data.get('status') || 'בתכנון') as ProjectStatus,
      startDate: String(data.get('startDate') || '') || undefined,
      targetDate: String(data.get('targetDate') || '') || undefined,
      progress: 0,
      notes: String(data.get('notes') || ''),
      createdAt: nowIso(),
    }
    setWorkspace((current) => ({ ...current, projects: [...current.projects, project] }))
    setAdding(false)
    onOpen(project.id)
  }

  return <>
    <div className="projects-page-toolbar card">
      <div className="projects-filter-grid">
        <label className="project-filter-field"><span>חיפוש פרויקט</span><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="שם פרויקט, כתובת או לקוח" /></label>
        <label className="project-filter-field"><span>כתובת</span><input value={addressFilter} onChange={(e) => setAddressFilter(e.target.value)} placeholder="סינון לפי רחוב, עיר או כתובת" /></label>
        <label className="project-filter-field"><span>סטטוס</span><select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}><option>הכל</option><option>בתכנון</option><option>בביצוע</option><option>בהמתנה</option><option>הושלם</option><option>מוקפא</option></select></label>
        <label className="project-filter-field"><span>מנהל פרויקט</span><select value={managerFilter} onChange={(e) => setManagerFilter(e.target.value)}><option value="הכל">כל המנהלים</option><option value="__none__">ללא מנהל</option>{workspace.team.filter((member) => member.active).map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select></label>
        <label className="project-filter-field"><span>לקוח</span><select value={clientFilter} onChange={(e) => setClientFilter(e.target.value)}><option value="הכל">כל הלקוחות</option><option value="__none__">ללא לקוח</option>{workspace.contacts.map((contact) => <option key={contact.id} value={contact.id}>{contact.name}</option>)}</select></label>
        <label className="project-filter-field"><span>תאריך לפי</span><select value={dateField} onChange={(e) => setDateField(e.target.value as 'start' | 'target' | 'created')}><option value="start">תאריך התחלה</option><option value="target">תאריך יעד</option><option value="created">תאריך יצירה</option></select></label>
        <label className="project-filter-field"><span>מתאריך</span><input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} /></label>
        <label className="project-filter-field"><span>עד תאריך</span><input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} /></label>
        <div className="project-filter-actions"><button type="button" className="secondary compact-filter-clear" onClick={() => { setSearch(''); setAddressFilter(''); setStatusFilter('הכל'); setManagerFilter('הכל'); setClientFilter('הכל'); setDateFrom(''); setDateTo('') }}>ניקוי סינון</button><span>{filteredProjects.length} מתוך {workspace.projects.length} פרויקטים</span>{canEdit && <button className="primary" onClick={() => setAdding(true)}><Plus /> פרויקט חדש</button>}</div>
      </div>
    </div>

    <div className="project-card-grid">{filteredProjects.map((project) => {
      const open = workspace.tasks.filter((task) => task.projectId === project.id && !['בוצע', 'סגור'].includes(task.status)).length
      const reports = workspace.reports.filter((report) => report.projectId === project.id).length
      const missingAddress = !project.address?.trim()
      return <button className={`project-card card ${missingAddress ? 'missing-address' : ''}`} key={project.id} onClick={() => onOpen(project.id)}>
        <div className="project-card-top"><span><FolderKanban /></span><Chip tone={project.status === 'בביצוע' ? 'good' : project.status === 'מוקפא' ? 'bad' : 'brand'}>{project.status}</Chip></div>
        <span className="project-site-label">פרויקט</span>
        <h2>{project.name || 'פרויקט בנייה'}</h2>
        <p className="project-card-address">{project.address || 'חסרה כתובת'}</p>
        {missingAddress && <span className="address-required-warning">יש לעדכן כתובת לפני המשך ניהול הפרויקט</span>}
        <div className="progress"><i style={{ width: `${project.progress}%` }} /></div>
        <div className="project-card-stats"><span><b>{project.progress}%</b> התקדמות</span><span><b>{open}</b> משימות פתוחות</span><span><b>{reports}</b> דוחות</span></div>
      </button>
    })}{!filteredProjects.length && <div className="card project-empty"><EmptyState title={workspace.projects.length ? 'לא נמצאו פרויקטים' : 'אין פרויקטים'} text={workspace.projects.length ? 'שנו את החיפוש או מסנני הכתובת והסטטוס.' : 'כל פרויקט מרכז משימות, מיילים, פגישות, דוחות, תמונות ומסמכים.'} action={!workspace.projects.length && canEdit ? <button className="primary" onClick={() => setAdding(true)}><Plus /> יצירת פרויקט ראשון</button> : undefined} /></div>}</div>

    {canEdit && adding && <Modal title="פרויקט חדש" onClose={() => setAdding(false)} wide><form className="form-grid two-col" onSubmit={submit}>
      <Field label="שם הפרויקט"><input name="name" required /></Field>
      <Field label="כתובת *" hint="שדה חובה — התחילו להקליד ובחרו כתובת מההצעות"><AddressAutocomplete name="address" required existingAddresses={workspace.projects.map((item) => item.address)} placeholder="רחוב, מספר, עיר" /></Field>
      <Field label="סטטוס"><select name="status"><option>בתכנון</option><option>בביצוע</option><option>בהמתנה</option><option>הושלם</option><option>מוקפא</option></select></Field>
      <Field label="מנהל פרויקט"><select name="managerId"><option value="">לא משויך</option>{workspace.team.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select></Field>
      <Field label="תאריך התחלה"><input name="startDate" type="date" /></Field>
      <Field label="יעד"><input name="targetDate" type="date" /></Field>
      <div className="field client-picker-field full"><span>לקוחות</span><ClientMultiPicker contacts={workspace.contacts} name="clientIds" /><small>אפשר לחפש ולבחור מספר לקוחות</small></div>
      <Field label="הערות"><textarea name="notes" rows={4} /></Field>
      <div className="form-actions full"><button className="primary">יצירת פרויקט</button></div>
    </form></Modal>}
  </>
}

type ProjectTab = 'summary' | 'tasks' | 'mail' | 'calendar' | 'drive' | 'reports' | 'files'
export function ProjectWorkspace({ projectId, workspace, setWorkspace, orgId, onBack, onClient, onTabChange, initialTab = 'summary', canEditProject = true, canEditTasks = true, canEditCalendar = true, canEditFiles = true, canEditReports = true, canEditMail = true, projectPermissions, taskPermissions, calendarPermissions, filePermissions, reportPermissions, communicationPermissions }: { projectId: string; workspace: Workspace; setWorkspace: React.Dispatch<React.SetStateAction<Workspace>>; orgId: string; onBack: () => void; onClient?: (id: string) => void; onTabChange?: (tab: ProjectTab) => void; initialTab?: ProjectTab; canEditProject?: boolean; canEditTasks?: boolean; canEditCalendar?: boolean; canEditFiles?: boolean; canEditReports?: boolean; canEditMail?: boolean; projectPermissions?: AreaPermissions; taskPermissions?: AreaPermissions; calendarPermissions?: AreaPermissions; filePermissions?: AreaPermissions; reportPermissions?: AreaPermissions; communicationPermissions?: AreaPermissions }) {
  const projectAccess: AreaPermissions = projectPermissions || { view: true, create: canEditProject, edit: canEditProject, status: canEditProject, delete: canEditProject }
  const taskAccess: AreaPermissions = taskPermissions || { view: true, create: canEditTasks, edit: canEditTasks, status: canEditTasks, delete: canEditTasks }
  const calendarAccess: AreaPermissions = calendarPermissions || { view: true, create: canEditCalendar, edit: canEditCalendar, status: canEditCalendar, delete: canEditCalendar }
  const fileAccess: AreaPermissions = filePermissions || { view: true, create: canEditFiles, edit: canEditFiles, status: canEditFiles, delete: canEditFiles }
  const reportAccess: AreaPermissions = reportPermissions || { view: true, create: canEditReports, edit: canEditReports, status: canEditReports, delete: canEditReports }
  const communicationAccess: AreaPermissions = communicationPermissions || { view: true, create: canEditMail, edit: canEditMail, status: canEditMail, delete: canEditMail }
  const canUpdateProject = projectAccess.edit
  const canStatusProject = projectAccess.status || projectAccess.edit
  const project = workspace.projects.find((item) => item.id === projectId)
  const tabAllowed = (candidate: ProjectTab) => candidate === 'summary'
    || (candidate === 'tasks' && taskAccess.view)
    || (candidate === 'mail' && communicationAccess.view)
    || (candidate === 'calendar' && calendarAccess.view)
    || ((candidate === 'drive' || candidate === 'files') && fileAccess.view)
    || (candidate === 'reports' && reportAccess.view)
  const [tab, setTab] = useState<ProjectTab>(tabAllowed(initialTab) ? initialTab : 'summary')
  useEffect(() => setTab(tabAllowed(initialTab) ? initialTab : 'summary'), [initialTab, taskAccess.view, communicationAccess.view, calendarAccess.view, fileAccess.view, reportAccess.view])
  const selectTab = (next: ProjectTab) => { if (!tabAllowed(next)) return; setTab(next); onTabChange?.(next) }
  const [emailTask, setEmailTask] = useState<Task | null>(null)
  const [focusedTaskId, setFocusedTaskId] = useState<string | null>(null)
  const [editingDetails, setEditingDetails] = useState(false)
  if (!project) return <EmptyState title="הפרויקט לא נמצא" text="ייתכן שהפרויקט נמחק או שהמידע השתנה." action={<button className="secondary" onClick={onBack}>חזרה</button>} />
  const tasks = workspace.tasks.filter((task) => task.projectId === project.id); const events = workspace.events.filter((event) => event.projectId === project.id); const files = workspace.files.filter((file) => file.projectId === project.id); const reports = workspace.reports.filter((report) => report.projectId === project.id)
  const open = tasks.filter((task) => !['בוצע', 'סגור'].includes(task.status)); const attention = open.filter((task) => task.status === 'דורש מעקב' || task.priority === 'דחופה' || (task.followUpDate && new Date(task.followUpDate).getTime() < Date.now())); const openReportItems = reports.flatMap((report) => report.sections.flatMap((section) => section.items)).filter((item) => !['תקין', 'בוצע', 'סגור'].includes(item.status))
  const patchProject = (patch: Partial<Project>) => {
    if ('address' in patch && !String(patch.address || '').trim()) return
    setWorkspace((current) => ({ ...current, projects: current.projects.map((item) => item.id === project.id ? { ...item, ...patch } : item) }))
  }
  const tabs: [ProjectTab, string, typeof FolderKanban][] = ([
    ['summary', 'סקירה', FolderKanban],
    ['tasks', 'משימות', ListChecks],
    ['mail', 'מייל', Mail],
    ['calendar', 'יומן', CalendarDays],
    ['drive', 'דרייב', HardDrive],
    ['reports', 'דוחות', FileText],
    ['files', 'קבצים', FileText],
  ] as [ProjectTab, string, typeof FolderKanban][]).filter(([id]) => tabAllowed(id))
  return <div className="project-workspace"><div className="project-header card"><div className="project-header-top"><button type="button" className="back-button" onClick={onBack}><ArrowRight /> פרויקטים</button>{canUpdateProject && <button type="button" className={editingDetails ? 'secondary project-edit-button active' : 'primary project-edit-button'} aria-expanded={editingDetails} onClick={() => setEditingDetails((value) => !value)}><Settings2 /> {editingDetails ? 'סיום עריכה' : 'עריכת פרויקט'}</button>}</div><div className="project-title"><div className="project-title-main"><span className="project-site-label">פרויקט</span><h1>{project.name || 'פרויקט בנייה'}</h1><p className="project-title-address">{project.address || 'חסרה כתובת'}</p><p className="project-title-manager">מנהל: {workspace.team.find((member) => member.id === project.managerId)?.name || 'לא משויך'}</p></div>{(canUpdateProject || canStatusProject) && <div className="project-quick-controls">{canStatusProject && <label className="project-quick-field"><span>סטטוס</span><select value={project.status} onChange={(e) => patchProject({ status: e.target.value as ProjectStatus })}><option>בתכנון</option><option>בביצוע</option><option>בהמתנה</option><option>הושלם</option><option>מוקפא</option></select></label>}{canUpdateProject && <label className="project-quick-field project-progress-field"><span>התקדמות</span><div className="progress-input"><input type="number" min="0" max="100" value={project.progress} onChange={(e) => patchProject({ progress: Math.max(0, Math.min(100, Number(e.target.value))) })} /><b>%</b></div></label>}</div>}</div><nav className="project-tabs" role="tablist" aria-label="חלקי הפרויקט">{tabs.map(([id, label, Icon]) => <button type="button" role="tab" aria-selected={tab === id} key={id} className={tab === id ? 'active' : ''} onClick={() => selectTab(id)}><Icon /><span>{label}</span></button>)}</nav></div>{!project.address.trim() && <div className="missing-address-banner" role="alert"><strong>לפרויקט הזה חסרה כתובת.</strong><span>כתובת היא שדה חובה ומשמשת כמזהה הראשי של אתר הבנייה. יש לעדכן אותה בפרטי הפרויקט.</span></div>}{project.clientIds.length > 0 && <div className="context-links project-client-links"><span>לקוחות:</span>{project.clientIds.map((id) => { const client = workspace.contacts.find((item) => item.id === id); return client && <button type="button" key={id} onClick={() => onClient?.(id)}>{client.name}</button> })}</div>}
    {canUpdateProject && editingDetails && <section className="card settings-card"><div className="card-head"><h2>פרטי הפרויקט</h2><button type="button" className="secondary" onClick={() => setEditingDetails(false)}>סגירה</button></div><div className="settings-form"><Field label="שם הפרויקט"><input value={project.name} onChange={(e) => patchProject({ name: e.target.value })} /></Field><Field label="כתובת *" hint="כתובת חובה לכל פרויקט — התחילו להקליד ובחרו מההצעות"><AddressAutocomplete value={project.address} required existingAddresses={workspace.projects.filter((item) => item.id !== project.id).map((item) => item.address)} onValueChange={(address) => patchProject({ address })} placeholder="רחוב, מספר, עיר" /></Field><Field label="מנהל פרויקט"><select value={project.managerId || ''} onChange={(e) => patchProject({ managerId: e.target.value || undefined })}><option value="">לא משויך</option>{workspace.team.filter((member) => member.active).map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select></Field><Field label="תאריך התחלה"><input type="date" value={project.startDate || ''} onChange={(e) => patchProject({ startDate: e.target.value || undefined })} /></Field><Field label="תאריך יעד"><input type="date" value={project.targetDate || ''} onChange={(e) => patchProject({ targetDate: e.target.value || undefined })} /></Field><div className="field client-picker-field"><span>לקוחות משויכים</span><ClientMultiPicker contacts={workspace.contacts} selectedIds={project.clientIds} onChange={(clientIds) => patchProject({ clientIds })} /><small>חפשו וסמנו את הלקוחות המשויכים לפרויקט</small></div><Field label="הערות"><textarea rows={5} value={project.notes || ''} onChange={(e) => patchProject({ notes: e.target.value })} /></Field></div></section>}
    {tab === 'summary' && <div className="project-summary"><div className="metric-grid project-summary-metrics">{taskAccess.view && <button type="button" className="metric card metric-link project-summary-metric tasks" onClick={() => selectTab('tasks')}><span className="metric-icon good"><ListChecks /></span><div><small>משימות</small><strong>{open.length}</strong><span className="metric-note">{attention.length} לטיפול</span></div></button>}{reportAccess.view && <button type="button" className="metric card metric-link project-summary-metric reports" onClick={() => selectTab('reports')}><span className="metric-icon warn"><FileText /></span><div><small>פיקוח</small><strong>{openReportItems.length}</strong><span className="metric-note">{reports.length} דוחות</span></div></button>}{calendarAccess.view && <button type="button" className="metric card metric-link project-summary-metric calendar" onClick={() => selectTab('calendar')}><span className="metric-icon neutral"><CalendarDays /></span><div><small>יומן</small><strong>{events.length}</strong><span className="metric-note">{events.filter((event) => new Date(event.start).getTime() > Date.now()).length} קרובים</span></div></button>}{fileAccess.view && <button type="button" className="metric card metric-link project-summary-metric files" onClick={() => selectTab('files')}><span className="metric-icon brand"><HardDrive /></span><div><small>קבצים</small><strong>{files.length}</strong><span className="metric-note">{project.driveFolderId ? 'Drive מחובר' : 'ללא Drive'}</span></div></button>}</div>{project.notes && <section className="card"><div className="card-head"><h2>הערות</h2>{canUpdateProject && <button type="button" className="secondary" onClick={() => setEditingDetails(true)}>עריכה</button>}</div><div className="card-body"><p className="project-notes">{project.notes}</p></div></section>}{taskAccess.view && <section className="card"><div className="card-head"><h2>פתוח</h2></div><div className="summary-open-list">{open.slice(0, 12).map((task) => <button key={task.id} onClick={() => { setFocusedTaskId(task.id); selectTab('tasks') }}><div><strong>{task.title}</strong><small>{workspace.team.find((member) => member.id === task.assigneeId)?.name || 'ללא אחראי'} · התחלה {dateLabel(task.startDate)}</small></div><Chip tone={task.status === 'דורש מעקב' || task.priority === 'דחופה' ? 'bad' : 'brand'}>{task.status}</Chip><span>{dateLabel(task.followUpDate || task.dueDate)}</span></button>)}{!open.length && <EmptyState title="אין משימות פתוחות" text="הפרויקט מעודכן ואין כרגע משימות פתוחות." />}</div></section>}</div>}
    {tab === 'tasks' && taskAccess.view && <section className="card board-card"><TaskBoard workspace={workspace} setWorkspace={setWorkspace} projectId={project.id} permissions={taskAccess} focusTaskId={focusedTaskId} onEmail={communicationAccess.view ? (task) => { setEmailTask(task); selectTab('mail') } : undefined} /></section>}
    {tab === 'mail' && communicationAccess.view && <ProjectMail project={project} workspace={workspace} setWorkspace={setWorkspace} initialTask={emailTask} canSend={communicationAccess.create} canLink={taskAccess.edit} />}
    {tab === 'calendar' && calendarAccess.view && <ProjectCalendar project={project} workspace={workspace} setWorkspace={setWorkspace} canEdit={calendarAccess.create} />}
    {tab === 'drive' && fileAccess.view && <ProjectDrive project={project} workspace={workspace} setWorkspace={setWorkspace} canCreateFolder={fileAccess.create && projectAccess.edit} />}
    {tab === 'reports' && reportAccess.view && <ReportsPage workspace={workspace} setWorkspace={setWorkspace} orgId={orgId} projectId={project.id} permissions={reportAccess} canUploadFiles={fileAccess.create} />}
    {tab === 'files' && fileAccess.view && <FilesPage workspace={workspace} setWorkspace={setWorkspace} orgId={orgId} projectId={project.id} permissions={fileAccess} />}
  </div>
}

function ProjectMail({ project, workspace, setWorkspace, initialTask, canSend, canLink }: { project: Project; workspace: Workspace; setWorkspace: React.Dispatch<React.SetStateAction<Workspace>>; initialTask: Task | null; canSend: boolean; canLink: boolean }) {
  const eligible = workspace.tasks.filter((task) => task.projectId === project.id); const [selectedId, setSelectedId] = useState(initialTask?.id || eligible[0]?.id || ''); const selected = workspace.tasks.find((task) => task.id === selectedId); const [messages, setMessages] = useState<GmailApiMessage[]>([]); const [loading, setLoading] = useState(false); const [searching, setSearching] = useState(false); const [searchResults, setSearchResults] = useState<{ id: string; snippet: string; subject?: string; from?: string }[]>([]); const [error, setError] = useState('')
  const updateTask = (id: string, patch: Partial<Task>) => setWorkspace((current) => ({ ...current, tasks: current.tasks.map((task) => task.id === id ? { ...task, ...patch } : task) }))
  const load = async (threadId: string) => { setLoading(true); setError(''); try { const result = await integrationsApi.gmailThread(threadId); setMessages(result.messages) } catch (e) { setError(e instanceof Error ? e.message : 'לא ניתן לטעון את ההתכתבות') } finally { setLoading(false) } }
  useEffect(() => { if (selected?.gmailThreadId) void load(selected.gmailThreadId); else setMessages([]) }, [selectedId, selected?.gmailThreadId])
  const send = async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); if (!selected) return; const data = new FormData(event.currentTarget); const to = String(data.get('to') || selected.emailTo || ''); const subject = String(data.get('subject') || selected.title); const body = String(data.get('body') || ''); setLoading(true); setError(''); try { const result = await integrationsApi.sendMail({ to, subject, body, threadId: selected.gmailThreadId }); if (canLink) updateTask(selected.id, { emailTo: to, gmailThreadId: result.threadId }); event.currentTarget.reset(); await load(result.threadId) } catch (e) { setError(e instanceof Error ? e.message : 'שליחת המייל נכשלה') } finally { setLoading(false) } }
  const search = async () => { setSearching(true); setError(''); try { const clientEmails = project.clientIds.map((id) => workspace.contacts.find((contact) => contact.id === id)?.email).filter(Boolean); const query = [`"${project.name}"`, ...clientEmails.map((email) => `from:${email} OR to:${email}`)].filter(Boolean).join(' OR '); const result = await integrationsApi.gmailSearch(query); setSearchResults(result.threads) } catch (e) { setError(e instanceof Error ? e.message : 'חיפוש Gmail נכשל') } finally { setSearching(false) } }
  return <section className="mail-workspace card"><aside><div className="mail-aside-head"><strong>התכתבויות לפי משימה</strong>{canLink && <button type="button" className="secondary compact-action" onClick={() => void search()} title="איתור מיילים בפרויקט"><RefreshCw /> איתור מיילים</button>}</div>{eligible.map((task) => <button type="button" key={task.id} className={task.id === selectedId ? 'active' : ''} aria-pressed={task.id === selectedId} onClick={() => setSelectedId(task.id)}><Mail /><span><strong>{task.title}</strong><small>{task.gmailThreadId ? 'התכתבות מחוברת' : task.emailTo || 'טרם נשלח מייל'}</small></span></button>)}{!eligible.length && <div className="table-empty">אין משימות בפרויקט.</div>}</aside><main>{error && <div className="error-banner">{error}</div>}{selected ? <><div className="mail-main-head"><h2>{selected.title}</h2>{selected.gmailThreadId && <Chip tone="good">מחובר</Chip>}</div>{canLink && searchResults.length > 0 && <div className="mail-search-results"><strong>מיילים רלוונטיים שנמצאו</strong>{searchResults.slice(0, 8).map((thread) => <button type="button" key={thread.id} onClick={() => { updateTask(selected.id, { gmailThreadId: thread.id }); setSearchResults([]) }}><div><b>{thread.subject || 'ללא נושא'}</b><small>{thread.from}</small><p>{thread.snippet}</p></div><span>שיוך למשימה</span></button>)}</div>}<div className="thread-list">{loading && !messages.length ? <div className="table-empty">טוען התכתבות...</div> : messages.map((message) => <article key={message.id}><header><strong>{message.from}</strong><span>{dateTimeLabel(message.date)}</span></header><h3>{message.subject}</h3><p>{message.body || message.snippet}</p></article>)}{!messages.length && selected.gmailThreadId && !loading && <div className="table-empty">לא נמצאו הודעות ב-thread.</div>}</div>{canSend && <form className="mail-compose" onSubmit={(e) => void send(e)}><label className="inline-control-label"><span>נמען</span><input name="to" type="email" required autoComplete="email" defaultValue={selected.emailTo || ''} placeholder="name@example.com" /></label><label className="inline-control-label"><span>נושא</span><input name="subject" required defaultValue={selected.title} /></label><label className="inline-control-label mail-body-label"><span>תוכן ההודעה</span><textarea name="body" rows={6} required placeholder="כתיבת הודעה..." /></label><button className="primary" disabled={loading}><Send /> {loading ? 'שולח...' : selected.gmailThreadId ? 'שליחה באותה התכתבות' : 'שליחת מייל'}</button></form>}</> : <EmptyState title="בחרו משימה" text="המיילים בפרויקט משויכים למשימות כדי שכל התכתבות תישאר בהקשר הנכון." />}</main></section>
}

function ProjectCalendar({ project, workspace, setWorkspace, canEdit }: { project: Project; workspace: Workspace; setWorkspace: React.Dispatch<React.SetStateAction<Workspace>>; canEdit: boolean }) {
  const events = workspace.events.filter((event) => event.projectId === project.id).sort((a, b) => a.start.localeCompare(b.start)); const [addingTask, setAddingTask] = useState(''); const [error, setError] = useState('')
  const createFromTask = async () => {
    const task = workspace.tasks.find((item) => item.id === addingTask); if (!task) return
    const start = task.followUpDate ? new Date(`${task.followUpDate}T09:00:00`).toISOString() : task.dueDate ? new Date(`${task.dueDate}T09:00:00`).toISOString() : new Date(Date.now() + 86400000).toISOString()
    const localId = uid('event')
    const localEvent: CalendarEvent = { id: localId, projectId: project.id, taskId: task.id, title: task.title, start, notes: task.description }
    setWorkspace((current) => ({ ...current, events: [...current.events, localEvent] })); setAddingTask(''); setError('')
    try {
      const google = await integrationsApi.createCalendarEvent({ summary: `${project.name}: ${task.title}`, start, description: task.description })
      setWorkspace((current) => ({ ...current, events: current.events.map((event) => event.id === localId ? { ...event, googleEventId: google.id, googleHtmlLink: google.htmlLink } : event) }))
    } catch (e) {
      setError(`התזכורת נשמרה במערכת. Google Calendar לא עודכן: ${e instanceof Error ? e.message : 'שגיאה לא ידועה'}`)
    }
  }
  return <section className="card project-module-card project-calendar-card"><div className="card-head"><h2>יומן</h2>{canEdit && <div className="inline-create"><label className="inline-control-label"><span>משימה לתזכורת</span><select aria-label="בחירת משימה לתזכורת" value={addingTask} onChange={(e) => setAddingTask(e.target.value)}><option value="">בחירת משימה</option>{workspace.tasks.filter((task) => task.projectId === project.id).map((task) => <option key={task.id} value={task.id}>{task.title}</option>)}</select></label><button type="button" className="secondary" disabled={!addingTask} onClick={() => void createFromTask()}><CalendarDays /> יצירה ביומן</button></div>}</div>{error && <div className="error-banner">{error}</div>}<div className="calendar-list">{events.map((event) => <article key={event.id}><div className="calendar-date"><strong>{new Date(event.start).getDate()}</strong><span>{new Intl.DateTimeFormat('he-IL', { month: 'short' }).format(new Date(event.start))}</span></div><div><strong>{event.title}</strong><small>{dateTimeLabel(event.start)}{event.location ? ` · ${event.location}` : ''}</small></div>{event.googleHtmlLink && <a className="icon-btn" href={event.googleHtmlLink} target="_blank" rel="noreferrer" aria-label={`פתיחת ${event.title} ב-Google Calendar`}><ExternalLink /></a>}</article>)}{!events.length && <EmptyState title="אין אירועים בפרויקט" text="ניתן ליצור פגישה או תזכורת ישירות ממשימה." />}</div></section>
}

function ProjectDrive({ project, workspace, setWorkspace, canCreateFolder }: { project: Project; workspace: Workspace; setWorkspace: React.Dispatch<React.SetStateAction<Workspace>>; canCreateFolder: boolean }) {
  const [files, setFiles] = useState<GoogleDriveFile[]>([]); const [loading, setLoading] = useState(false); const [error, setError] = useState(''); const patchProject = (patch: Partial<Project>) => setWorkspace((current) => ({ ...current, projects: current.projects.map((item) => item.id === project.id ? { ...item, ...patch } : item) }))
  const connect = async () => { setLoading(true); setError(''); try { const folder = await integrationsApi.ensureProjectFolder({ projectId: project.id, name: `${project.name} - ${project.address || 'פרויקט'}`, parentId: workspace.settings.driveRootFolderId || undefined }); patchProject({ driveFolderId: folder.id, driveFolderUrl: folder.webViewLink }); const list = await integrationsApi.driveFiles(folder.id); setFiles(list.files) } catch (e) { setError(e instanceof Error ? e.message : 'חיבור Drive נכשל') } finally { setLoading(false) } }
  const refresh = async () => { if (!project.driveFolderId) { if (!canCreateFolder) return; return connect() }; setLoading(true); setError(''); try { const list = await integrationsApi.driveFiles(project.driveFolderId); setFiles(list.files) } catch (e) { setError(e instanceof Error ? e.message : 'טעינת קבצים נכשלה') } finally { setLoading(false) } }
  return <section className="card project-module-card project-drive-card"><div className="card-head"><h2>Google Drive</h2><div>{project.driveFolderUrl && <a className="secondary link-button" href={project.driveFolderUrl} target="_blank" rel="noreferrer" aria-label="פתיחת תיקיית הפרויקט ב-Google Drive"><ExternalLink /> פתיחת התיקייה</a>}{(project.driveFolderId || canCreateFolder) && <button type="button" className="primary" onClick={() => void refresh()} disabled={loading}><HardDrive /> {project.driveFolderId ? 'רענון' : 'יצירת תיקיית פרויקט'}</button>}</div></div>{error && <div className="error-banner">{error}</div>}<div className="drive-list">{files.map((file) => <a key={file.id} href={file.webViewLink} target="_blank" rel="noreferrer" aria-label={`פתיחת ${file.name} ב-Google Drive`}><span className="file-icon"><FileText /></span><div><strong>{file.name}</strong><small>{file.mimeType} {file.modifiedTime ? `· ${dateLabel(file.modifiedTime)}` : ''}</small></div><ExternalLink /></a>)}{!project.driveFolderId && <EmptyState title="עדיין אין תיקיית Drive" text="לחיצה אחת תיצור תיקייה בשם הפרויקט תחת תיקיית השורש שהוגדרה במערכת." />}{project.driveFolderId && !files.length && !loading && <div className="table-empty">התיקייה מחוברת. לחצו רענון להצגת קבצים.</div>}</div></section>
}
