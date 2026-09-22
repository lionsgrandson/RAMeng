import { useMemo, useState, type Dispatch, type FormEvent, type SetStateAction } from 'react'
import { ArrowRight, BarChart3, CalendarDays, ExternalLink, FileText, FolderKanban, LayoutDashboard, ListChecks, Mail, Plus, Search, Settings2 } from 'lucide-react'
import type { ClientNote, Contact, Project, ProjectStatus, Task, Workspace } from '../types'
import type { AreaPermissions } from '../lib/permissions'
import { Chip, EmptyState, Field, Modal, StoredFileLink, confirmDelete, dateLabel, dateTimeLabel, money, nowIso, uid } from './common'

type Props = {
  workspace: Workspace
  setWorkspace: Dispatch<SetStateAction<Workspace>>
  selectedClientId: string | null
  onSelectClient: (id: string | null) => void
  onProject: (id: string) => void
  canEditContacts: boolean
  canEditProjects: boolean
  canEditTasks: boolean
  canEditCommunication: boolean
  canEditFinance: boolean
  contactPermissions?: AreaPermissions
  projectPermissions?: AreaPermissions
  taskPermissions?: AreaPermissions
  communicationPermissions?: AreaPermissions
  financePermissions?: AreaPermissions
  calendarPermissions?: AreaPermissions
  filePermissions?: AreaPermissions
  isAdmin: boolean
  actor: string
  startCreating?: boolean
}

type ClientTab = 'overview' | 'projects' | 'tasks' | 'timeline' | 'messages' | 'files' | 'finance' | 'activity'

const CLIENT_TASK_COLORS = [
  { id: '', label: 'ללא צבע', hex: '#d5dbd6' },
  { id: 'red', label: 'אדום', hex: '#d65a5a' },
  { id: 'orange', label: 'כתום', hex: '#dc8b3d' },
  { id: 'yellow', label: 'צהוב', hex: '#d5b63f' },
  { id: 'green', label: 'ירוק', hex: '#4f9a68' },
  { id: 'blue', label: 'כחול', hex: '#4f78c8' },
  { id: 'purple', label: 'סגול', hex: '#7d62bd' },
  { id: 'gray', label: 'אפור', hex: '#7d8780' },
] as const
const clientTaskColor = (id?: string) => CLIENT_TASK_COLORS.find((item) => item.id === (id || '')) || CLIENT_TASK_COLORS[0]

export default function ClientsCenter(props: Props) {
  if (!props.selectedClientId) return <ClientDirectory {...props} />
  return <ClientWorkspace {...props} clientId={props.selectedClientId} />
}

function ClientDirectory({ workspace, setWorkspace, onSelectClient, canEditContacts, contactPermissions, projectPermissions, taskPermissions, actor, startCreating = false }: Props) {
  const contactAccess: AreaPermissions = contactPermissions || { view: true, create: canEditContacts, edit: canEditContacts, status: canEditContacts, delete: canEditContacts }
  const [query, setQuery] = useState('')
  const [adding, setAdding] = useState(startCreating && contactAccess.create)
  const rows = useMemo(() => workspace.contacts.filter((contact) => {
    const q = query.trim().toLowerCase()
    return !q || `${contact.name} ${contact.company || ''} ${contact.email || ''} ${contact.phone || ''}`.toLowerCase().includes(q)
  }), [workspace.contacts, query])

  const createClient = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const next: Contact = {
      id: uid('contact'),
      name: String(data.get('name') || ''),
      company: String(data.get('company') || ''),
      phone: String(data.get('phone') || ''),
      email: String(data.get('email') || ''),
      status: String(data.get('status') || 'פעיל'),
      tags: String(data.get('tags') || '').split(',').map((value) => value.trim()).filter(Boolean),
      notes: String(data.get('notes') || ''),
      createdAt: nowIso(),
    }
    setWorkspace((current) => ({
      ...current,
      contacts: [...current.contacts, next],
      audit: [{ id: uid('audit'), at: nowIso(), actor, action: 'יצירת לקוח', entity: 'לקוח', entityId: next.id }, ...(current.audit || [])],
    }))
    setAdding(false)
    onSelectClient(next.id)
  }

  return <section className="clients-center">
    <div className="client-directory-head">
      <h2>לקוחות</h2>
      {contactAccess.create && <button type="button" className="primary" onClick={() => setAdding(true)}><Plus /> לקוח חדש</button>}
    </div>
    <label className="client-directory-search search-box labeled-search"><span>חיפוש לקוחות</span><div><Search /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="שם, חברה, מייל או טלפון" aria-label="חיפוש לקוחות" /></div></label>
    <div className="client-card-grid">
      {rows.map((contact) => {
        const projects = workspace.projects.filter((project) => project.clientIds.includes(contact.id))
        const projectIds = new Set(projects.map((project) => project.id))
        const openTasks = workspace.tasks.filter((task) => task.projectId && projectIds.has(task.projectId) && !['בוצע', 'סגור'].includes(task.status)).length
        return <button type="button" className="client-card card" key={contact.id} onClick={() => onSelectClient(contact.id)}>
          <div className="client-card-top"><span className="avatar large">{contact.name.slice(0, 2)}</span><Chip tone={contact.status === 'פעיל' ? 'good' : contact.status === 'ליד' ? 'brand' : 'neutral'}>{contact.status}</Chip></div>
          <h3>{contact.name}</h3>
          <p>{contact.company || 'לקוח פרטי'}</p>
          <div className="client-contact-lines"><span>{contact.phone || 'ללא טלפון'}</span><span>{contact.email || 'ללא מייל'}</span></div>
          <div className="client-card-stats">{(projectPermissions?.view ?? true) && <span><b>{projects.length}</b> פרויקטים</span>}{(taskPermissions?.view ?? true) && <span><b>{openTasks}</b> משימות פתוחות</span>}</div>
        </button>
      })}
      {!rows.length && <div className="card client-empty"><EmptyState title="אין לקוחות להצגה" text={query ? 'לא נמצאה התאמה לחיפוש.' : 'הוסיפו לקוח כדי להתחיל לרכז את כל הפעילות שלו במקום אחד.'} /></div>}
    </div>
    {adding && <Modal title="לקוח חדש" onClose={() => setAdding(false)}><form className="form-grid" onSubmit={createClient}>
      <Field label="שם"><input name="name" required autoFocus /></Field>
      <Field label="חברה"><input name="company" /></Field>
      <Field label="טלפון"><input name="phone" type="tel" autoComplete="tel" /></Field>
      <Field label="מייל"><input name="email" type="email" autoComplete="email" /></Field>
      <Field label="סטטוס"><select name="status"><option>ליד</option><option>פעיל</option><option>בהמתנה</option><option>לא פעיל</option></select></Field>
      <Field label="תגיות"><input name="tags" placeholder="יזם, קבלן, דיירים" /></Field>
      <Field label="הערות"><textarea name="notes" rows={4} /></Field>
      <div className="form-actions"><button className="secondary" type="button" onClick={() => setAdding(false)}>ביטול</button><button className="primary">שמירה</button></div>
    </form></Modal>}
  </section>
}

function ClientWorkspace({ workspace, setWorkspace, onSelectClient, onProject, canEditContacts, canEditProjects, canEditTasks, canEditCommunication, canEditFinance, contactPermissions, projectPermissions, taskPermissions, communicationPermissions, financePermissions, calendarPermissions, filePermissions, isAdmin, actor, clientId }: Props & { clientId: string }) {
  const contactAccess: AreaPermissions = contactPermissions || { view: true, create: canEditContacts, edit: canEditContacts, status: canEditContacts, delete: canEditContacts }
  const projectAccess: AreaPermissions = projectPermissions || { view: true, create: canEditProjects, edit: canEditProjects, status: canEditProjects, delete: canEditProjects }
  const taskAccess: AreaPermissions = taskPermissions || { view: true, create: canEditTasks, edit: canEditTasks, status: canEditTasks, delete: canEditTasks }
  const communicationAccess: AreaPermissions = communicationPermissions || { view: true, create: canEditCommunication, edit: canEditCommunication, status: canEditCommunication, delete: canEditCommunication }
  const financeAccess: AreaPermissions = financePermissions || { view: true, create: canEditFinance, edit: canEditFinance, status: canEditFinance, delete: canEditFinance }
  const calendarAccess: AreaPermissions = calendarPermissions || { view: true, create: false, edit: false, status: false, delete: false }
  const fileAccess: AreaPermissions = filePermissions || { view: true, create: false, edit: false, status: false, delete: false }
  const canUpdateContacts = contactAccess.edit
  const canStatusContacts = contactAccess.status || contactAccess.edit
  const canCreateProjects = projectAccess.create
  const canUpdateProjects = projectAccess.edit
  const canStatusProjects = projectAccess.status || projectAccess.edit
  const canCreateTasks = taskAccess.create
  const canUpdateTasks = taskAccess.edit
  const canStatusTasks = taskAccess.status || taskAccess.edit
  const canCreateCommunication = communicationAccess.create
  const canUpdateCommunication = communicationAccess.edit
  const canDeleteCommunication = communicationAccess.delete
  const canUpdateFinance = financeAccess.edit
  const canStatusFinance = financeAccess.status || financeAccess.edit
  const [tab, setTab] = useState<ClientTab>('overview')
  const [editingClient, setEditingClient] = useState(false)
  const [addingProject, setAddingProject] = useState(false)
  const [addingTask, setAddingTask] = useState(false)
  const [addingNoteKind, setAddingNoteKind] = useState<ClientNote['kind'] | null>(null)
  const [editingNote, setEditingNote] = useState<ClientNote | null>(null)
  const [editingTask, setEditingTask] = useState<Task | null>(null)
  const canEditAnything = canUpdateContacts || canStatusContacts || canCreateProjects || canUpdateProjects || canStatusProjects || canCreateTasks || canUpdateTasks || canStatusTasks || canCreateCommunication || canUpdateCommunication || canDeleteCommunication || canUpdateFinance || canStatusFinance
  const contact = workspace.contacts.find((item) => item.id === clientId)

  if (!contact) return <section className="card"><EmptyState title="הלקוח לא נמצא" text="ייתכן שהלקוח נמחק או שהמידע השתנה." action={<button type="button" className="secondary" onClick={() => onSelectClient(null)}>חזרה ללקוחות</button>} /></section>

  const projects = workspace.projects.filter((project) => project.clientIds.includes(contact.id))
  const projectIds = new Set(projects.map((project) => project.id))
  const tasks = workspace.tasks.filter((task) => task.projectId && projectIds.has(task.projectId))
  const openTasks = tasks.filter((task) => !['בוצע', 'סגור'].includes(task.status))
  const events = workspace.events.filter((event) => event.projectId && projectIds.has(event.projectId))
  const files = workspace.files.filter((file) => file.projectId && projectIds.has(file.projectId))
  const quotes = workspace.quotes.filter((quote) => quote.contactId === contact.id || (quote.projectId && projectIds.has(quote.projectId)))
  const notes = (workspace.clientNotes || []).filter((note) => note.contactId === contact.id)
  const relevantIds = new Set<string>([contact.id, ...projects.map((project) => project.id), ...tasks.map((task) => task.id)])
  const clientAudit = (workspace.audit || []).filter((entry) => entry.entityId ? relevantIds.has(entry.entityId) : false)

  const patchContact = (patch: Partial<Contact>) => setWorkspace((current) => ({
    ...current,
    contacts: current.contacts.map((item) => item.id === contact.id ? { ...item, ...patch } : item),
  }))

  const patchProject = (id: string, patch: Partial<Project>) => setWorkspace((current) => ({
    ...current,
    projects: current.projects.map((item) => item.id === id ? { ...item, ...patch } : item),
  }))

  const patchTask = (id: string, patch: Partial<Task>) => setWorkspace((current) => ({
    ...current,
    tasks: current.tasks.map((item) => item.id === id ? { ...item, ...patch } : item),
  }))

  const audit = (current: Workspace, action: string, entity: string, entityId: string): Workspace => ({
    ...current,
    audit: [{ id: uid('audit'), at: nowIso(), actor, action, entity, entityId }, ...(current.audit || [])].slice(0, 1000),
  })

  const saveClient = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!canUpdateContacts) return
    const data = new FormData(event.currentTarget)
    const next = {
      name: String(data.get('name') || ''),
      company: String(data.get('company') || ''),
      phone: String(data.get('phone') || ''),
      email: String(data.get('email') || ''),
      status: String(data.get('status') || 'פעיל'),
      tags: String(data.get('tags') || '').split(',').map((value) => value.trim()).filter(Boolean),
      notes: String(data.get('notes') || ''),
    }
    setWorkspace((current) => audit({ ...current, contacts: current.contacts.map((item) => item.id === contact.id ? { ...item, ...next } : item) }, 'עריכת פרטי לקוח', 'לקוח', contact.id))
    setEditingClient(false)
  }

  const createProject = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!canCreateProjects) return
    const data = new FormData(event.currentTarget)
    const project: Project = {
      id: uid('project'),
      name: String(data.get('name') || ''),
      address: String(data.get('address') || ''),
      clientIds: [contact.id],
      managerId: String(data.get('managerId') || '') || undefined,
      status: String(data.get('status') || 'בתכנון') as ProjectStatus,
      startDate: String(data.get('startDate') || '') || undefined,
      targetDate: String(data.get('targetDate') || '') || undefined,
      progress: 0,
      notes: String(data.get('notes') || ''),
      createdAt: nowIso(),
    }
    setWorkspace((current) => audit({ ...current, projects: [...current.projects, project] }, 'יצירת פרויקט ללקוח', 'פרויקט', project.id))
    setAddingProject(false)
  }

  const createTask = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!canCreateTasks) return
    const data = new FormData(event.currentTarget)
    const task: Task = {
      id: uid('task'),
      projectId: String(data.get('projectId') || '') || undefined,
      title: String(data.get('title') || ''),
      description: String(data.get('description') || ''),
      assigneeId: String(data.get('assigneeId') || '') || undefined,
      status: String(data.get('status') || workspace.taskStatuses[0] || 'טרם התחיל'),
      priority: String(data.get('priority') || 'רגילה') as Task['priority'],
      followUpDate: String(data.get('followUpDate') || '') || undefined,
      colorTag: String(data.get('colorTag') || '') || undefined,
      custom: {},
      order: workspace.tasks.length + 1,
      createdAt: nowIso(),
    }
    setWorkspace((current) => audit({ ...current, tasks: [...current.tasks, task] }, 'יצירת משימה מכרטיס לקוח', 'משימה', task.id))
    setAddingTask(false)
  }

  const saveNote = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (editingNote ? !canUpdateCommunication : !canCreateCommunication) return
    const data = new FormData(event.currentTarget)
    const body = String(data.get('body') || '').trim()
    if (!body) return
    const projectId = String(data.get('projectId') || '') || undefined
    if (editingNote) {
      setWorkspace((current) => audit({
        ...current,
        clientNotes: (current.clientNotes || []).map((note) => note.id === editingNote.id ? { ...note, body, projectId } : note),
      }, editingNote.kind === 'message' ? 'עריכת הודעה פנימית' : 'עריכת עדכון ציר זמן', editingNote.kind === 'message' ? 'הודעה פנימית' : 'ציר זמן', editingNote.id))
      setEditingNote(null)
      return
    }
    if (!addingNoteKind) return
    const note: ClientNote = { id: uid('client-note'), contactId: contact.id, projectId, kind: addingNoteKind, body, createdAt: nowIso(), createdBy: actor }
    setWorkspace((current) => audit({ ...current, clientNotes: [note, ...(current.clientNotes || [])] }, note.kind === 'message' ? 'הוספת הודעה פנימית' : 'הוספת עדכון ציר זמן', note.kind === 'message' ? 'הודעה פנימית' : 'ציר זמן', note.id))
    setAddingNoteKind(null)
  }

  const saveTaskDetails = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!editingTask || (!canUpdateTasks && !canStatusTasks)) return
    const data = new FormData(event.currentTarget)
    const status = String(data.get('status') || editingTask.status)
    if (!canUpdateTasks) {
      setWorkspace((current) => audit({
        ...current,
        tasks: current.tasks.map((task) => task.id === editingTask.id ? {
          ...task,
          status,
          completedAt: ['בוצע', 'סגור'].includes(status) ? (task.completedAt || nowIso()) : undefined,
        } : task),
      }, 'שינוי סטטוס משימה מכרטיס לקוח', 'משימה', editingTask.id))
      setEditingTask(null)
      return
    }
    const custom = { ...editingTask.custom }
    workspace.taskColumns.filter((column) => column.key.startsWith('custom.')).forEach((column) => {
      custom[column.key.slice(7)] = String(data.get(`custom-${column.id}`) || '')
    })
    const next: Partial<Task> = {
      projectId: String(data.get('projectId') || '') || undefined,
      title: String(data.get('title') || '').trim(),
      description: String(data.get('description') || '').trim() || undefined,
      assigneeId: String(data.get('assigneeId') || '') || undefined,
      status,
      priority: String(data.get('priority') || 'רגילה') as Task['priority'],
      startDate: String(data.get('startDate') || '') || undefined,
      dueDate: String(data.get('dueDate') || '') || undefined,
      followUpDate: String(data.get('followUpDate') || '') || undefined,
      emailTo: String(data.get('emailTo') || '') || undefined,
      colorTag: String(data.get('colorTag') || '') || undefined,
      custom,
      completedAt: ['בוצע', 'סגור'].includes(status) ? (editingTask.completedAt || nowIso()) : undefined,
    }
    setWorkspace((current) => audit({ ...current, tasks: current.tasks.map((task) => task.id === editingTask.id ? { ...task, ...next } : task) }, 'עריכת משימה מכרטיס לקוח', 'משימה', editingTask.id))
    setEditingTask(null)
  }

  const removeNote = (note: ClientNote) => {
    if (!canDeleteCommunication || !confirmDelete(note.kind === 'message' ? 'ההודעה' : 'העדכון')) return
    setWorkspace((current) => audit({ ...current, clientNotes: (current.clientNotes || []).filter((item) => item.id !== note.id) }, note.kind === 'message' ? 'מחיקת הודעה פנימית' : 'מחיקת עדכון ציר זמן', note.kind === 'message' ? 'הודעה פנימית' : 'ציר זמן', note.id))
  }

  const tabs: { id: ClientTab; label: string; icon: typeof LayoutDashboard }[] = [
    { id: 'overview', label: 'סקירה', icon: LayoutDashboard },
    ...(projectAccess.view ? [{ id: 'projects' as ClientTab, label: 'פרויקטים', icon: FolderKanban }] : []),
    ...(taskAccess.view ? [{ id: 'tasks' as ClientTab, label: 'משימות', icon: ListChecks }] : []),
    ...((communicationAccess.view || calendarAccess.view || taskAccess.view) ? [{ id: 'timeline' as ClientTab, label: 'ציר זמן', icon: CalendarDays }] : []),
    ...(communicationAccess.view ? [{ id: 'messages' as ClientTab, label: 'תקשורת', icon: Mail }] : []),
    ...(fileAccess.view ? [{ id: 'files' as ClientTab, label: 'קבצים', icon: FileText }] : []),
    ...(financeAccess.view ? [{ id: 'finance' as ClientTab, label: 'כספים', icon: BarChart3 }] : []),
    ...(isAdmin ? [{ id: 'activity' as ClientTab, label: 'פעילות', icon: ListChecks }] : []),
  ]

  const timeline = [
    ...notes.filter((note) => note.kind === 'timeline').map((note) => ({ id: note.id, at: note.createdAt, title: 'עדכון פנימי', text: note.body, type: 'note' as const, note })),
    ...events.map((event) => ({ id: event.id, at: event.start, title: event.title, text: `${dateTimeLabel(event.start)}${event.location ? ` · ${event.location}` : ''}`, type: 'event' as const })),
    ...tasks.filter((task) => task.followUpDate || task.dueDate).map((task) => ({ id: task.id, at: task.followUpDate || task.dueDate || task.createdAt, title: task.title, text: `${task.status} · ${workspace.projects.find((project) => project.id === task.projectId)?.name || ''}`, type: 'task' as const })),
  ].sort((a, b) => String(b.at).localeCompare(String(a.at)))

  return <section className="client-workspace">
    <header className="client-workspace-header card">
      <button type="button" className="back-button" onClick={() => onSelectClient(null)}><ArrowRight /> לקוחות</button>
      <div className="client-title-row">
        <div className="client-identity"><span className="avatar large">{contact.name.slice(0, 2)}</span><div><h1>{contact.name}</h1><p>{contact.company || 'לקוח פרטי'} · {contact.phone || 'ללא טלפון'} · {contact.email || 'ללא מייל'}</p></div></div>
        <div className="client-header-actions">{canStatusContacts ? <select className="compact-select" aria-label="סטטוס לקוח" value={contact.status} onChange={(e) => patchContact({ status: e.target.value })}><option>ליד</option><option>פעיל</option><option>בהמתנה</option><option>לא פעיל</option></select> : <Chip tone={contact.status === 'פעיל' ? 'good' : contact.status === 'ליד' ? 'brand' : 'neutral'}>{contact.status}</Chip>}{canUpdateContacts && <button type="button" className="secondary" onClick={() => setEditingClient(true)}><Settings2 /> עריכה</button>}</div>
      </div>
      {!canEditAnything && <div className="read-only-banner">צפייה בלבד</div>}
      <nav className="client-tabs" role="tablist" aria-label="חלקי כרטיס הלקוח">{tabs.map((item) => { const Icon = item.icon; return <button type="button" role="tab" aria-selected={tab === item.id} key={item.id} className={tab === item.id ? 'active' : ''} onClick={() => setTab(item.id)}><Icon /><span>{item.label}</span></button> })}</nav>
    </header>

    {tab === 'overview' && <div className="client-overview-grid">
      <section className="card client-metrics">
        {projectAccess.view && <button type="button" onClick={() => setTab('projects')}><small>פרויקטים</small><strong>{projects.length}</strong><span>{projects.filter((project) => project.status === 'בביצוע').length} בביצוע</span></button>}
        {taskAccess.view && <button type="button" onClick={() => setTab('tasks')}><small>משימות</small><strong>{openTasks.length}</strong><span>{openTasks.filter((task) => task.priority === 'דחופה' || task.status === 'דורש מעקב').length} דורשות טיפול</span></button>}
        {calendarAccess.view && <button type="button" onClick={() => setTab('timeline')}><small>אירועים</small><strong>{events.length}</strong><span>{events.filter((event) => new Date(event.start).getTime() > Date.now()).length} עתידיים</span></button>}
        {fileAccess.view && <button type="button" onClick={() => setTab('files')}><small>קבצים</small><strong>{files.length}</strong><span>{financeAccess.view ? `${quotes.length} מסמכים כספיים` : 'מסמכי פרויקט'}</span></button>}
      </section>
      <section className="card"><div className="card-head"><h2>פרטי קשר</h2>{canUpdateContacts && <button type="button" className="secondary" onClick={() => setEditingClient(true)}>עריכה</button>}</div><div className="client-detail-list"><div><span>טלפון</span><strong>{contact.phone ? <a href={`tel:${contact.phone}`}>{contact.phone}</a> : '—'}</strong></div><div><span>מייל</span><strong>{contact.email ? <a href={`mailto:${contact.email}`}>{contact.email}</a> : '—'}</strong></div><div><span>חברה</span><strong>{contact.company || '—'}</strong></div><div><span>תגיות</span><strong>{contact.tags.length ? contact.tags.join(', ') : '—'}</strong></div></div>{contact.notes && <div className="client-notes-block"><strong>הערות</strong><p>{contact.notes}</p></div>}</section>
      {projectAccess.view && <section className="card"><div className="card-head"><h2>פרויקטים</h2>{canCreateProjects && <button type="button" className="primary" onClick={() => setAddingProject(true)}><Plus /> פרויקט</button>}</div><div className="compact-project-list">{projects.slice(0, 5).map((project) => <button key={project.id} onClick={() => onProject(project.id)}><div><strong>{project.name}</strong><small>{project.address || 'ללא כתובת'}</small></div><Chip tone={project.status === 'בביצוע' ? 'good' : 'brand'}>{project.status}</Chip></button>)}{!projects.length && <EmptyState title="אין פרויקטים ללקוח" text="ניתן ליצור פרויקט ישירות מכרטיס הלקוח." />}</div></section>}
      {taskAccess.view && <section className="card"><div className="card-head"><h2>לטיפול</h2></div><div className="compact-task-list">{openTasks.slice(0, 6).map((task) => <button type="button" key={task.id} onClick={() => setEditingTask(task)}><div><strong>{task.title}</strong><small>{workspace.projects.find((project) => project.id === task.projectId)?.name || ''}</small></div><Chip tone={task.priority === 'דחופה' || task.status === 'דורש מעקב' ? 'bad' : 'brand'}>{task.status}</Chip></button>)}{!openTasks.length && <div className="table-empty">אין משימות פתוחות.</div>}</div></section>}
    </div>}

    {tab === 'projects' && projectAccess.view && <section className="card"><div className="card-head"><h2>פרויקטים</h2>{canCreateProjects && <button type="button" className="primary" onClick={() => setAddingProject(true)}><Plus /> פרויקט חדש</button>}</div><div className="client-project-list">{projects.map((project) => <article key={project.id}>
      <div className="client-project-main"><div><strong>{project.name}</strong><small>{project.address || 'ללא כתובת'}</small></div><button type="button" className="secondary" onClick={() => onProject(project.id)}><FolderKanban /> פתיחה</button></div>
      <div className="client-project-fields">
        {canStatusProjects ? <label>סטטוס<select value={project.status} onChange={(e) => patchProject(project.id, { status: e.target.value as ProjectStatus })}><option>בתכנון</option><option>בביצוע</option><option>בהמתנה</option><option>הושלם</option><option>מוקפא</option></select></label> : <div><span>סטטוס</span><strong>{project.status}</strong></div>}
        {canUpdateProjects ? <label>התקדמות<input type="number" min="0" max="100" value={project.progress} onChange={(e) => patchProject(project.id, { progress: Math.max(0, Math.min(100, Number(e.target.value))) })} /></label> : <div><span>התקדמות</span><strong>{project.progress}%</strong></div>}
        {canUpdateProjects ? <label>יעד<input type="date" value={project.targetDate || ''} onChange={(e) => patchProject(project.id, { targetDate: e.target.value || undefined })} /></label> : <div><span>יעד</span><strong>{dateLabel(project.targetDate)}</strong></div>}
      </div>
    </article>)}{!projects.length && <EmptyState title="אין פרויקטים" text="הלקוח עדיין לא משויך לפרויקט." />}</div></section>}

    {tab === 'tasks' && taskAccess.view && <section className="card"><div className="card-head"><h2>משימות</h2>{canCreateTasks && projects.length > 0 && <button type="button" className="primary" onClick={() => setAddingTask(true)}><Plus /> משימה חדשה</button>}</div><div className="client-task-table">{tasks.map((task) => <article key={task.id} style={{ borderInlineStartColor: clientTaskColor(task.colorTag).hex }}>
      <div className="client-task-title"><span>שם משימה</span>{canUpdateTasks ? <input aria-label={`שם משימה ${task.title}`} value={task.title} onChange={(e) => patchTask(task.id, { title: e.target.value })} /> : <strong>{task.title}</strong>}<small>{workspace.projects.find((project) => project.id === task.projectId)?.name || 'ללא פרויקט'}</small><button type="button" className="text-button" onClick={() => setEditingTask(task)}>כל הפרטים</button></div>
      <label className="inline-control-label"><span>סטטוס</span>{canStatusTasks ? <select value={task.status} onChange={(e) => patchTask(task.id, { status: e.target.value })}>{workspace.taskStatuses.map((status) => <option key={status}>{status}</option>)}</select> : <Chip tone={task.status === 'דורש מעקב' ? 'bad' : 'brand'}>{task.status}</Chip>}</label>
      <label className="inline-control-label"><span>אחראי</span>{canUpdateTasks ? <select value={task.assigneeId || ''} onChange={(e) => patchTask(task.id, { assigneeId: e.target.value || undefined })}><option value="">ללא אחראי</option>{workspace.team.filter((member) => member.active).map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select> : <span>{workspace.team.find((member) => member.id === task.assigneeId)?.name || 'ללא אחראי'}</span>}</label>
      <label className="inline-control-label"><span>מעקב</span>{canUpdateTasks ? <input type="date" value={task.followUpDate || ''} onChange={(e) => patchTask(task.id, { followUpDate: e.target.value || undefined })} /> : <span>{dateLabel(task.followUpDate || task.dueDate)}</span>}</label>
      <label className="inline-control-label color-label"><span>צבע</span>{canUpdateTasks ? <select value={task.colorTag || ''} onChange={(e) => patchTask(task.id, { colorTag: e.target.value || undefined })}>{CLIENT_TASK_COLORS.map((item) => <option key={item.id || 'none'} value={item.id}>{item.label}</option>)}</select> : <span className="color-readonly"><i style={{ backgroundColor: clientTaskColor(task.colorTag).hex }} />{clientTaskColor(task.colorTag).label}</span>}</label>
    </article>)}{!tasks.length && <EmptyState title="אין משימות ללקוח" text={projects.length ? 'הוסיפו משימה לאחד הפרויקטים.' : 'כדי ליצור משימה ללקוח יש ליצור קודם פרויקט.'} />}</div></section>}

    {tab === 'timeline' && (communicationAccess.view || calendarAccess.view || taskAccess.view) && <section className="card"><div className="card-head"><h2>ציר זמן</h2>{canCreateCommunication && <button type="button" className="primary" onClick={() => setAddingNoteKind('timeline')}><Plus /> עדכון</button>}</div><div className="client-timeline">{timeline.map((item) => <article key={`${item.type}-${item.id}`}><span className={`timeline-dot ${item.type}`} /><div><small>{dateTimeLabel(item.at)}</small><strong>{item.title}</strong><p>{item.text}</p>{item.type === 'note' && (canUpdateCommunication || canDeleteCommunication) && <div className="timeline-actions">{canUpdateCommunication && <button type="button" className="text-button" onClick={() => setEditingNote(item.note)}>עריכה</button>}{canDeleteCommunication && <button type="button" className="text-button danger-text" onClick={() => removeNote(item.note)}>מחיקה</button>}</div>}</div></article>)}{!timeline.length && <EmptyState title="ציר הזמן ריק" text="הוסיפו עדכון או צרו משימות ואירועים בפרויקטים." />}</div></section>}

    {tab === 'messages' && communicationAccess.view && <div className="client-message-grid">
      <section className="card"><div className="card-head"><h2>הודעות פנימיות</h2>{canCreateCommunication && <button type="button" className="primary" onClick={() => setAddingNoteKind('message')}><Plus /> הודעה</button>}</div><div className="internal-message-list">{notes.filter((note) => note.kind === 'message').map((note) => <article key={note.id}><header><strong>{note.createdBy}</strong><span>{dateTimeLabel(note.createdAt)}</span></header><p>{note.body}</p>{note.projectId && <small>{workspace.projects.find((project) => project.id === note.projectId)?.name}</small>}{(canUpdateCommunication || canDeleteCommunication) && <footer>{canUpdateCommunication && <button type="button" className="text-button" onClick={() => setEditingNote(note)}>עריכה</button>}{canDeleteCommunication && <button type="button" className="text-button danger-text" onClick={() => removeNote(note)}>מחיקה</button>}</footer>}</article>)}{!notes.some((note) => note.kind === 'message') && <div className="table-empty">אין עדיין הודעות פנימיות.</div>}</div></section>
      <section className="card"><div className="card-head"><h2>מייל</h2></div><div className="communication-list">{tasks.filter((task) => task.emailTo || task.gmailThreadId).map((task) => <article key={task.id}><div><Mail /><span><strong>{task.title}</strong><small>{task.emailTo || 'ללא כתובת'}{task.gmailThreadId ? ' · Thread מחובר' : ''}</small></span></div>{task.projectId && <button type="button" className="secondary" onClick={() => onProject(task.projectId!)}>פתיחה</button>}</article>)}{!tasks.some((task) => task.emailTo || task.gmailThreadId) && <div className="table-empty">אין התכתבויות מקושרות כרגע.</div>}</div></section>
    </div>}

    {tab === 'files' && fileAccess.view && <section className="card"><div className="card-head"><h2>קבצים</h2></div><div className="client-file-list">{files.map((file) => <StoredFileLink key={file.id} file={file}><span className="file-icon"><FileText /></span><div><strong>{file.name}</strong><small>{workspace.projects.find((project) => project.id === file.projectId)?.name || ''} · {dateLabel(file.uploadedAt)}</small></div><ExternalLink /></StoredFileLink>)}{!files.length && <EmptyState title="אין קבצים" text="קבצים שיועלו לפרויקטים של הלקוח יופיעו כאן אוטומטית." />}</div></section>}

    {tab === 'finance' && financeAccess.view && <section className="card"><div className="card-head"><h2>כספים</h2></div><div className="client-finance-list">{quotes.map((quote) => <article key={quote.id}><div><strong>{quote.title}</strong><small>{quote.number} · {workspace.projects.find((project) => project.id === quote.projectId)?.name || contact.name}</small></div><b>{money(quote.amount)}</b>{canUpdateFinance ? <label className="inline-control-label"><span>שולם</span><input type="number" min="0" value={quote.paidAmount} onChange={(e) => setWorkspace((current) => ({ ...current, quotes: current.quotes.map((item) => item.id === quote.id ? { ...item, paidAmount: Number(e.target.value) } : item) }))} /></label> : <span>שולם {money(quote.paidAmount)}</span>}{canStatusFinance ? <label className="inline-control-label"><span>סטטוס תשלום</span><select value={quote.status} onChange={(e) => setWorkspace((current) => ({ ...current, quotes: current.quotes.map((item) => item.id === quote.id ? { ...item, status: e.target.value as typeof quote.status } : item) }))}><option>טיוטה</option><option>נשלחה</option><option>אושרה</option><option>נדחתה</option><option>שולמה חלקית</option><option>שולמה</option></select></label> : <Chip tone={quote.status === 'שולמה' ? 'good' : 'brand'}>{quote.status}</Chip>}</article>)}{!quotes.length && <EmptyState title="אין מסמכים כספיים" text="מסמכים שמקושרים ללקוח או לפרויקט שלו יופיעו כאן." />}</div></section>}

    {tab === 'activity' && isAdmin && <section className="card"><div className="card-head"><h2>פעילות</h2></div><div className="client-audit-list">{clientAudit.map((entry) => <article key={entry.id}><span><ListChecks /></span><div><strong>{entry.action}</strong><small>{entry.actor} · {entry.entity} · {dateTimeLabel(entry.at)}</small></div></article>)}{!clientAudit.length && <div className="table-empty">אין עדיין רשומות פעילות ללקוח הזה.</div>}</div></section>}

    {canUpdateContacts && editingClient && <Modal title="עריכת לקוח" onClose={() => setEditingClient(false)}><form className="form-grid" onSubmit={saveClient}>
      <Field label="שם"><input name="name" required defaultValue={contact.name} /></Field>
      <Field label="חברה"><input name="company" defaultValue={contact.company} /></Field>
      <Field label="טלפון"><input name="phone" type="tel" autoComplete="tel" defaultValue={contact.phone} /></Field>
      <Field label="מייל"><input name="email" type="email" autoComplete="email" defaultValue={contact.email} /></Field>
      <Field label="סטטוס"><select name="status" defaultValue={contact.status}><option>ליד</option><option>פעיל</option><option>בהמתנה</option><option>לא פעיל</option></select></Field>
      <Field label="תגיות"><input name="tags" defaultValue={contact.tags.join(', ')} /></Field>
      <Field label="הערות"><textarea name="notes" rows={5} defaultValue={contact.notes} /></Field>
      <div className="form-actions"><button className="secondary" type="button" onClick={() => setEditingClient(false)}>ביטול</button><button className="primary">שמירה</button></div>
    </form></Modal>}

    {canCreateProjects && addingProject && <Modal title="פרויקט חדש ללקוח" onClose={() => setAddingProject(false)} wide><form className="form-grid two-col" onSubmit={createProject}>
      <Field label="שם הפרויקט"><input name="name" required /></Field><Field label="כתובת"><input name="address" /></Field>
      <Field label="סטטוס"><select name="status"><option>בתכנון</option><option>בביצוע</option><option>בהמתנה</option><option>הושלם</option><option>מוקפא</option></select></Field>
      <Field label="מנהל פרויקט"><select name="managerId"><option value="">לא משויך</option>{workspace.team.filter((member) => member.active).map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select></Field>
      <Field label="תאריך התחלה"><input name="startDate" type="date" /></Field><Field label="יעד"><input name="targetDate" type="date" /></Field>
      <Field label="הערות"><textarea name="notes" rows={4} /></Field>
      <div className="form-actions full"><button className="secondary" type="button" onClick={() => setAddingProject(false)}>ביטול</button><button className="primary">יצירת פרויקט</button></div>
    </form></Modal>}

    {canCreateTasks && addingTask && <Modal title="משימה חדשה" onClose={() => setAddingTask(false)}><form className="form-grid" onSubmit={createTask}>
      <Field label="פרויקט"><select name="projectId" required><option value="">בחירת פרויקט</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></Field>
      <Field label="משימה"><input name="title" required /></Field>
      <Field label="סטטוס"><select name="status">{workspace.taskStatuses.map((status) => <option key={status}>{status}</option>)}</select></Field>
      <Field label="עדיפות"><select name="priority"><option>נמוכה</option><option>רגילה</option><option>גבוהה</option><option>דחופה</option></select></Field>
      <Field label="צבע / קטלוג"><select name="colorTag"><option value="">ללא צבע</option>{CLIENT_TASK_COLORS.filter((item) => item.id).map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></Field>
      <Field label="אחראי"><select name="assigneeId"><option value="">ללא אחראי</option>{workspace.team.filter((member) => member.active).map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select></Field>
      <Field label="מועד מעקב"><input name="followUpDate" type="date" /></Field>
      <Field label="תיאור"><textarea name="description" rows={4} /></Field>
      <div className="form-actions"><button className="secondary" type="button" onClick={() => setAddingTask(false)}>ביטול</button><button className="primary">שמירה</button></div>
    </form></Modal>}

    {editingTask && <Modal title={(canUpdateTasks || canStatusTasks) ? 'פרטי משימה ועריכה' : 'פרטי משימה'} onClose={() => setEditingTask(null)} wide><form className="form-grid two-col" onSubmit={saveTaskDetails}>
      <Field label="פרויקט"><select name="projectId" defaultValue={editingTask.projectId || ''} disabled={!canUpdateTasks}><option value="">ללא פרויקט</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></Field>
      <Field label="שם המשימה"><input name="title" required defaultValue={editingTask.title} disabled={!canUpdateTasks} /></Field>
      <Field label="סטטוס"><select name="status" defaultValue={editingTask.status} disabled={!canStatusTasks}>{workspace.taskStatuses.map((status) => <option key={status}>{status}</option>)}</select></Field>
      <Field label="עדיפות"><select name="priority" defaultValue={editingTask.priority} disabled={!canUpdateTasks}><option>נמוכה</option><option>רגילה</option><option>גבוהה</option><option>דחופה</option></select></Field>
      <Field label="צבע / קטלוג"><select name="colorTag" defaultValue={editingTask.colorTag || ''} disabled={!canUpdateTasks}>{CLIENT_TASK_COLORS.map((item) => <option key={item.id || 'none'} value={item.id}>{item.label}</option>)}</select></Field>
      <Field label="אחראי"><select name="assigneeId" defaultValue={editingTask.assigneeId || ''} disabled={!canUpdateTasks}><option value="">ללא אחראי</option>{workspace.team.filter((member) => member.active).map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select></Field>
      <Field label="תאריך התחלה"><input name="startDate" type="date" defaultValue={editingTask.startDate || ''} disabled={!canUpdateTasks} /></Field>
      <Field label="יעד"><input name="dueDate" type="date" defaultValue={editingTask.dueDate || ''} disabled={!canUpdateTasks} /></Field>
      <Field label="מועד מעקב"><input name="followUpDate" type="date" defaultValue={editingTask.followUpDate || ''} disabled={!canUpdateTasks} /></Field>
      <Field label="מייל"><input name="emailTo" type="email" defaultValue={editingTask.emailTo || ''} disabled={!canUpdateTasks} /></Field>
      {workspace.taskColumns.filter((column) => column.key.startsWith('custom.')).map((column) => <Field key={column.id} label={column.label}><input name={`custom-${column.id}`} defaultValue={editingTask.custom[column.key.slice(7)] || ''} disabled={!canUpdateTasks} /></Field>)}
      <Field label="תיאור"><textarea name="description" rows={5} defaultValue={editingTask.description || ''} disabled={!canUpdateTasks} /></Field>
      <div className="form-actions full"><button type="button" className="secondary" onClick={() => setEditingTask(null)}>סגירה</button>{(canUpdateTasks || canStatusTasks) && <button className="primary">שמירת שינויים</button>}</div>
    </form></Modal>}

    {((addingNoteKind && canCreateCommunication) || (editingNote && canUpdateCommunication)) && <Modal title={editingNote ? (editingNote.kind === 'message' ? 'עריכת הודעה פנימית' : 'עריכת עדכון') : (addingNoteKind === 'message' ? 'הודעה פנימית חדשה' : 'עדכון חדש לציר הזמן')} onClose={() => { setAddingNoteKind(null); setEditingNote(null) }}><form className="form-grid" onSubmit={saveNote}>
      <Field label="פרויקט (אופציונלי)"><select name="projectId" defaultValue={editingNote?.projectId || ''}><option value="">כללי ללקוח</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></Field>
      <Field label="תוכן"><textarea name="body" rows={6} required defaultValue={editingNote?.body || ''} autoFocus /></Field>
      <div className="form-actions"><button className="secondary" type="button" onClick={() => { setAddingNoteKind(null); setEditingNote(null) }}>ביטול</button><button className="primary">שמירה</button></div>
    </form></Modal>}
  </section>
}
