import { useEffect, useMemo, useRef, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { BarChart3, Bell, CalendarDays, ContactRound, FileInput, FileText, FolderKanban, LayoutDashboard, ListChecks, LogOut, Menu, Search, Settings, UsersRound, X } from 'lucide-react'
import type { Workspace } from './types'
import { cloneWorkspace } from './seed'
import { configureBackend, getBackend, getCurrentUser, loadOrganizationWorkspace, saveOrganizationWorkspace, signOut, subscribeWorkspace } from './lib/backend'
import { loadRuntimeConfig, type RuntimeConfig } from './lib/runtime'
import { integrationsApi } from './lib/api'
import { LoginScreen, SetPasswordScreen, SetupScreen } from './components/AuthSetup'
import { Dashboard, ImportCenter } from './components/CorePages'
import ClientsCenter from './components/ClientCenter'
import { CalendarPage, FilesPage } from './components/CalendarFiles'
import { ProjectsPage, ProjectWorkspace } from './components/ProjectWorkspace'
import ReportsPage from './components/Reports'
import SettingsPage from './components/Settings'
import TaskBoard from './components/TaskBoard'
import UserManagement from './components/UserManagement'

type Page = 'overview' | 'clients' | 'projects' | 'tasks' | 'calendar' | 'files' | 'reports' | 'team' | 'imports' | 'settings'

const pageInfo: Record<Page, string> = {
  overview: 'סקירה',
  clients: 'כל הלקוחות',
  projects: 'כל הפרויקטים',
  tasks: 'כל המשימות',
  calendar: 'יומן כללי',
  files: 'כל הקבצים',
  reports: 'כל הדוחות',
  team: 'משתמשים',
  imports: 'ייבוא',
  settings: 'הגדרות',
}

const navItems: { id: Page; label: string; icon: typeof LayoutDashboard }[] = [
  { id: 'overview', label: 'סקירה', icon: LayoutDashboard },
  { id: 'clients', label: 'לקוחות', icon: ContactRound },
  { id: 'projects', label: 'פרויקטים', icon: FolderKanban },
  { id: 'tasks', label: 'משימות', icon: ListChecks },
  { id: 'calendar', label: 'יומן', icon: CalendarDays },
  { id: 'files', label: 'קבצים', icon: FileText },
  { id: 'reports', label: 'דוחות', icon: BarChart3 },
  { id: 'team', label: 'משתמשים', icon: UsersRound },
  { id: 'imports', label: 'ייבוא', icon: FileInput },
  { id: 'settings', label: 'הגדרות', icon: Settings },
]

type ProjectTab = 'summary' | 'tasks' | 'mail' | 'calendar' | 'drive' | 'reports' | 'files'
type AppRoute = { page: Page; projectId?: string; clientId?: string; taskId?: string; reportId?: string; reportItemId?: string; tab?: ProjectTab; attention?: boolean }
const projectTabs: ProjectTab[] = ['summary', 'tasks', 'mail', 'calendar', 'drive', 'reports', 'files']
const readAppRoute = (): AppRoute | null => {
  if (!window.location.hash.startsWith('#app?')) return null
  const params = new URLSearchParams(window.location.hash.slice(5))
  const page = params.get('page') as Page
  if (!navItems.some((item) => item.id === page)) return null
  const tab = params.get('tab') as ProjectTab
  return {
    page,
    projectId: page === 'projects' ? params.get('project') || undefined : undefined,
    clientId: page === 'clients' ? params.get('client') || undefined : undefined,
    taskId: page === 'tasks' ? params.get('task') || undefined : undefined,
    reportId: page === 'reports' ? params.get('report') || undefined : undefined,
    reportItemId: page === 'reports' ? params.get('item') || undefined : undefined,
    tab: projectTabs.includes(tab) ? tab : 'summary',
    attention: page === 'tasks' && params.get('attention') === '1',
  }
}
const writeAppRoute = (route: AppRoute) => {
  const params = new URLSearchParams({ page: route.page })
  if (route.projectId) params.set('project', route.projectId)
  if (route.clientId) params.set('client', route.clientId)
  if (route.taskId) params.set('task', route.taskId)
  if (route.reportId) params.set('report', route.reportId)
  if (route.reportItemId) params.set('item', route.reportItemId)
  if (route.projectId && route.tab && route.tab !== 'summary') params.set('tab', route.tab)
  if (route.attention) params.set('attention', '1')
  const next = `${window.location.pathname}${window.location.search}#app?${params}`
  if (`${window.location.pathname}${window.location.search}${window.location.hash}` !== next) window.history.pushState({}, '', next)
}

const roleLabel = (role: string, isDeveloper: boolean) => {
  if (isDeveloper || role === 'developer') return 'מפתח'
  if (role === 'admin' || role === 'manager') return 'מנהל'
  if (role === 'assistant') return 'עוזר/ת'
  if (role === 'inspector') return 'מפקח/ת'
  if (role === 'engineer') return 'מהנדס/ת'
  if (role === 'viewer' || role === 'reviewer') return 'סוקר/ת · צפייה בלבד'
  return role
}

const invitedFromUrl = () => {
  const params = new URLSearchParams(window.location.search)
  return params.get('invite') === '1' || window.location.hash.includes('type=invite')
}

const permissionsFor = (role: string, isDeveloper: boolean) => {
  const effectiveRole = isDeveloper ? 'developer' : role
  const admin = ['developer', 'admin', 'manager'].includes(effectiveRole)
  const operational = admin || ['assistant', 'inspector', 'engineer'].includes(effectiveRole)
  return {
    any: operational,
    contacts: admin || effectiveRole === 'assistant',
    projects: operational,
    tasks: operational,
    calendar: operational,
    files: operational,
    reports: admin || ['inspector', 'engineer'].includes(effectiveRole),
    finance: admin || effectiveRole === 'assistant',
    communication: operational,
  }
}

const changedEntity = (before: unknown, after: unknown) => {
  if (!Array.isArray(before) || !Array.isArray(after)) return undefined
  const beforeById = new Map(before.filter((item) => item && typeof item === 'object' && 'id' in item).map((item) => [String((item as { id: unknown }).id), item]))
  const afterById = new Map(after.filter((item) => item && typeof item === 'object' && 'id' in item).map((item) => [String((item as { id: unknown }).id), item]))
  const ids = new Set([...beforeById.keys(), ...afterById.keys()])
  const changed = [...ids].filter((id) => JSON.stringify(beforeById.get(id)) !== JSON.stringify(afterById.get(id)))
  return changed.length === 1 ? changed[0] : undefined
}

const appendAutomaticAudit = (current: Workspace, next: Workspace, actor: string): Workspace => {
  if (next.audit !== current.audit) return next
  const sections: [keyof Workspace, string][] = [
    ['contacts', 'לקוחות'], ['deals', 'עסקאות'], ['projects', 'פרויקטים'], ['tasks', 'משימות'],
    ['events', 'יומן'], ['files', 'קבצים'], ['quotes', 'כספים'], ['team', 'צוות'],
    ['taskColumns', 'עמודות משימות'], ['taskStatuses', 'סטטוסים'], ['checklistTemplates', 'תבניות'],
    ['reports', 'דוחות'], ['reportTemplates', 'תבניות דוח'], ['clientNotes', 'תקשורת'], ['settings', 'הגדרות'],
  ]
  const changed = sections.filter(([key]) => JSON.stringify(current[key]) !== JSON.stringify(next[key]))
  if (!changed.length) return next
  const entries = changed.map(([key, label]) => ({
    id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    at: new Date().toISOString(),
    actor,
    action: `עדכון ${label}`,
    entity: label,
    entityId: changedEntity(current[key], next[key]),
  }))
  return { ...next, audit: [...entries, ...(current.audit || [])].slice(0, 1000) }
}

export default function App() {
  const [runtime, setRuntime] = useState<RuntimeConfig | null>(null)
  const [user, setUser] = useState<User | null | undefined>(undefined)
  const [workspace, setWorkspace] = useState<Workspace>(cloneWorkspace())
  const [orgId, setOrgId] = useState('local')
  const [role, setRole] = useState('')
  const [isDeveloper, setIsDeveloper] = useState(false)
  const [developerResolved, setDeveloperResolved] = useState(false)
  const [inviteMode, setInviteMode] = useState(invitedFromUrl)
  const [loaded, setLoaded] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [page, setPage] = useState<Page>('overview')
  const [selectedProject, setSelectedProject] = useState<string | null>(null)
  const [projectTab, setProjectTab] = useState<ProjectTab>('summary')
  const [selectedClient, setSelectedClient] = useState<string | null>(null)
  const [selectedTask, setSelectedTask] = useState<string | null>(null)
  const [selectedReport, setSelectedReport] = useState<string | null>(null)
  const [selectedReportItem, setSelectedReportItem] = useState<string | null>(null)
  const [attentionMode, setAttentionMode] = useState(false)
  const [createIntent, setCreateIntent] = useState<Page | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error' | 'conflict'>('idle')
  const workspaceVersionRef = useRef(0)
  const localRevisionRef = useRef(0)
  const dirtyRef = useRef(false)
  const pendingSaveSnapshotRef = useRef('')
  const lastSavedSnapshotRef = useRef('')
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve())

  const applyRoute = (route: AppRoute, record = true) => {
    setPage(route.page)
    setSelectedProject(route.projectId || null)
    setProjectTab(route.tab || 'summary')
    setSelectedClient(route.clientId || null)
    setSelectedTask(route.taskId || null)
    setSelectedReport(route.reportId || null)
    setSelectedReportItem(route.reportItemId || null)
    setAttentionMode(Boolean(route.attention))
    setCreateIntent(null)
    setSidebarOpen(false)
    if (record) writeAppRoute(route)
  }

  useEffect(() => {
    const restore = () => applyRoute(readAppRoute() || { page: 'overview' }, false)
    restore()
    window.addEventListener('popstate', restore)
    window.addEventListener('hashchange', restore)
    return () => { window.removeEventListener('popstate', restore); window.removeEventListener('hashchange', restore) }
  }, [])

  useEffect(() => {
    void loadRuntimeConfig().then((config) => {
      configureBackend(config)
      setRuntime(config)
      if (!config.configured) { setUser(null); return }
      void getCurrentUser().then(setUser)
      const backend = getBackend()
      if (backend) {
        const { data } = backend.auth.onAuthStateChange((_event, session) => setUser(session?.user || null))
        return () => data.subscription.unsubscribe()
      }
    })
  }, [])

  useEffect(() => {
    setDeveloperResolved(false)
    if (role === 'developer') { setIsDeveloper(true); setDeveloperResolved(true); return }
    if (!user || !runtime) { setIsDeveloper(false); return }
    const email = String(user.email || '').toLowerCase()
    if ((runtime.developerEmails || []).includes(email)) {
      setIsDeveloper(true)
      setDeveloperResolved(true)
      return
    }
    let active = true
    void integrationsApi.adminConfig()
      .then((config) => { if (active) { setIsDeveloper(Boolean(config.supabaseUrl)); setDeveloperResolved(true) } })
      .catch(() => { if (active) { setIsDeveloper(false); setDeveloperResolved(true) } })
    return () => { active = false }
  }, [user?.id, runtime, role])

  useEffect(() => {
    if (!user) { setLoaded(false); setRole(''); return }
    let active = true
    setLoadError('')
    void loadOrganizationWorkspace(user.id).then((result) => {
      if (!active) return
      setOrgId(result.orgId)
      setRole(result.role)
      setWorkspace(result.workspace)
      workspaceVersionRef.current = result.version
      localRevisionRef.current = 0
      dirtyRef.current = false
      pendingSaveSnapshotRef.current = ''
      lastSavedSnapshotRef.current = JSON.stringify(result.workspace)
      setLoaded(true)
    }).catch((error) => { if (active) setLoadError(error instanceof Error ? error.message : 'טעינת הנתונים נכשלה') })
    return () => { active = false }
  }, [user?.id])

  const canManageUsers = isDeveloper || role === 'developer' || role === 'admin' || role === 'manager'
  const canViewAdminData = isDeveloper || ['developer', 'admin', 'manager'].includes(role)
  const permissions = permissionsFor(role, isDeveloper)
  const canEdit = permissions.any
  const editableSetWorkspace: typeof setWorkspace = (action) => {
    if (!canEdit) return
    setWorkspace((current) => {
      const next = typeof action === 'function' ? action(current) : action
      if (next === current || JSON.stringify(next) === JSON.stringify(current)) return current
      localRevisionRef.current += 1
      dirtyRef.current = true
      return appendAutomaticAudit(current, next, user?.email || 'משתמש')
    })
  }

  useEffect(() => {
    if (!loaded || !developerResolved) return
    if ((page === 'settings' && !isDeveloper) || ((page === 'team' || page === 'imports') && !canManageUsers)) {
      setPage('overview')
      window.history.replaceState({}, '', `${window.location.pathname}${window.location.search}#app?page=overview`)
    }
  }, [page, isDeveloper, canManageUsers, loaded, developerResolved])

  useEffect(() => {
    if (!loaded || !user || !canEdit || !dirtyRef.current) return
    setSaveState('saving')
    const snapshot = workspace
    const revision = localRevisionRef.current
    const serialized = JSON.stringify(snapshot)
    const timer = window.setTimeout(() => {
      saveQueueRef.current = saveQueueRef.current.catch(() => undefined).then(async () => {
        pendingSaveSnapshotRef.current = serialized
        try {
          const result = await saveOrganizationWorkspace(orgId, user.id, snapshot, workspaceVersionRef.current)
          workspaceVersionRef.current = result.version
          lastSavedSnapshotRef.current = serialized
          pendingSaveSnapshotRef.current = ''
          if (revision === localRevisionRef.current) {
            dirtyRef.current = false
            setSaveState('saved')
            window.setTimeout(() => setSaveState((current) => current === 'saved' ? 'idle' : current), 1200)
          }
        } catch (error) {
          pendingSaveSnapshotRef.current = ''
          setSaveState(error instanceof Error && error.name === 'WorkspaceConflictError' ? 'conflict' : 'error')
        }
      })
    }, 650)
    return () => window.clearTimeout(timer)
  }, [workspace, loaded, user?.id, orgId, canEdit])

  useEffect(() => {
    if (saveState !== 'saving') return
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [saveState])

  useEffect(() => {
    if (!loaded || !orgId) return
    const channel = subscribeWorkspace(orgId, (incoming, version) => setWorkspace((current) => {
      const versioned = version >= 0
      if (versioned && version <= workspaceVersionRef.current) return current
      const serialized = JSON.stringify(incoming)
      if (serialized === pendingSaveSnapshotRef.current || serialized === lastSavedSnapshotRef.current) {
        if (versioned) workspaceVersionRef.current = version
        return current
      }
      if (dirtyRef.current) {
        if (versioned) setSaveState('conflict')
        return current
      }
      if (versioned) workspaceVersionRef.current = version
      lastSavedSnapshotRef.current = serialized
      return JSON.stringify(current) === serialized ? current : incoming
    }))
    return () => { if (channel) void getBackend()?.removeChannel(channel) }
  }, [loaded, orgId])

  const urgentCount = useMemo(() => workspace.tasks.filter((task) => !['בוצע', 'סגור'].includes(task.status) && (task.status === 'דורש מעקב' || task.priority === 'דחופה' || (task.followUpDate && new Date(task.followUpDate).getTime() < Date.now()))).length, [workspace.tasks])
  const searchResults = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return []
    return [
      ...workspace.projects.filter((item) => `${item.name} ${item.address}`.toLowerCase().includes(q)).slice(0, 5).map((item) => ({ id: item.id, type: 'פרויקט', label: item.name, detail: item.address, action: () => openProject(item.id) })),
      ...workspace.tasks.filter((item) => `${item.title} ${item.description || ''}`.toLowerCase().includes(q)).slice(0, 5).map((item) => ({ id: item.id, type: 'משימה', label: item.title, detail: workspace.projects.find((project) => project.id === item.projectId)?.name || '', action: () => openTask(item.id) })),
      ...workspace.contacts.filter((item) => `${item.name} ${item.company || ''} ${item.email || ''}`.toLowerCase().includes(q)).slice(0, 5).map((item) => ({ id: item.id, type: 'לקוח', label: item.name, detail: item.company || item.email || '', action: () => openClient(item.id) })),
      ...workspace.reports.filter((item) => `${item.title} ${item.siteAddress}`.toLowerCase().includes(q)).slice(0, 3).map((item) => ({ id: item.id, type: 'דוח', label: item.title, detail: workspace.projects.find((project) => project.id === item.projectId)?.name || '', action: () => openReport(item.id) })),
    ].slice(0, 10)
  }, [search, workspace])

  const openPage = (next: Page, create = false) => {
    applyRoute({ page: next })
    setCreateIntent(create ? next : null)
  }
  const openProject = (id: string, tab: ProjectTab = 'summary') => applyRoute({ page: 'projects', projectId: id, tab })
  const openClient = (id: string) => applyRoute({ page: 'clients', clientId: id })
  const openTask = (id: string) => applyRoute({ page: 'tasks', taskId: id })
  const openReport = (id: string, itemId: string | null = null) => applyRoute({ page: 'reports', reportId: id, reportItemId: itemId || undefined })
  const openUrgent = () => applyRoute({ page: 'tasks', attention: true })

  if (!runtime) return <div className="app-loading"><img src="/rameng-mark.svg" alt="ר.א.ם הנדסה" /><span>טוען מערכת...</span></div>
  if (!runtime.configured) return <SetupScreen />
  if (user === undefined) return <div className="app-loading"><img src="/rameng-mark.svg" alt="ר.א.ם הנדסה" /><span>בודק התחברות...</span></div>
  if (!user) return <LoginScreen onSuccess={() => void getCurrentUser().then(setUser)} />
  if (inviteMode) return <SetPasswordScreen onSuccess={() => {
    const url = new URL(window.location.href)
    url.searchParams.delete('invite')
    url.searchParams.delete('code')
    url.hash = ''
    window.history.replaceState({}, '', `${url.pathname}${url.search}`)
    setInviteMode(false)
  }} />
  if (loadError) return <div className="auth-screen"><section className="login-card"><h1>לא ניתן לטעון את סביבת העבודה</h1><div className="error-banner">{loadError}</div><p>ודאו שהגדרת מסד הנתונים הושלמה ושיש למשתמש הרשאה למערכת.</p><button className="secondary" onClick={() => window.location.reload()}>ניסיון מחדש</button></section></div>
  if (!loaded) return <div className="app-loading"><img src="/rameng-mark.svg" alt="ר.א.ם הנדסה" /><span>טוען פרויקטים...</span></div>

  if (selectedProject) return <div className={`app-shell project-mode ${!canEdit ? 'read-only-mode' : ''}`}><Sidebar page={page} setPage={(next) => openPage(next)} workspace={workspace} open={sidebarOpen} setOpen={setSidebarOpen} user={user} onLogout={() => void signOut()} isDeveloper={isDeveloper} canManageUsers={canManageUsers} /><div className="main"><Topbar search={search} setSearch={setSearch} searchResults={searchResults} urgentCount={urgentCount} onMenu={() => setSidebarOpen(true)} onAttention={openUrgent} saveState={saveState} canEdit={canEdit} /><main className="page-wrap project-page-wrap"><ProjectWorkspace key={selectedProject} projectId={selectedProject} initialTab={projectTab} workspace={workspace} setWorkspace={editableSetWorkspace} orgId={orgId} canEditProject={permissions.projects} canEditTasks={permissions.tasks} canEditCalendar={permissions.calendar} canEditFiles={permissions.files} canEditReports={permissions.reports} canEditMail={permissions.communication} onBack={() => openPage('projects')} onClient={openClient} onTabChange={(tab) => { setProjectTab(tab); writeAppRoute({ page: 'projects', projectId: selectedProject, tab }) }} /></main></div></div>

  return <div className={`app-shell ${!canEdit ? 'read-only-mode' : ''}`}>
    <Sidebar page={page} setPage={(next) => openPage(next)} workspace={workspace} open={sidebarOpen} setOpen={setSidebarOpen} user={user} onLogout={() => void signOut()} isDeveloper={isDeveloper} canManageUsers={canManageUsers} />
    <div className="main">
      <Topbar search={search} setSearch={setSearch} searchResults={searchResults} urgentCount={urgentCount} onMenu={() => setSidebarOpen(true)} onAttention={openUrgent} saveState={saveState} canEdit={canEdit} />
      <main className="page-wrap">
        <header className="page-heading"><h1>{pageInfo[page]}</h1>{(role || isDeveloper) && <span className="role-badge">{roleLabel(role, isDeveloper)}</span>}</header>
        {page === 'overview' && <Dashboard workspace={workspace} onProject={openProject} onTask={openTask} onReport={openReport} onPage={(next) => openPage(next)} onCreate={(next) => openPage(next, true)} onUrgent={openUrgent} canCreate={{ clients: permissions.contacts, projects: permissions.projects, tasks: permissions.tasks, reports: permissions.reports, calendar: permissions.calendar }} />}
        {page === 'clients' && <ClientsCenter key={createIntent === 'clients' ? 'new-client' : 'clients'} startCreating={createIntent === 'clients'} workspace={workspace} setWorkspace={editableSetWorkspace} selectedClientId={selectedClient} onSelectClient={(id) => id ? openClient(id) : openPage('clients')} onProject={openProject} canEditContacts={permissions.contacts} canEditProjects={permissions.projects} canEditTasks={permissions.tasks} canEditCommunication={permissions.communication} canEditFinance={permissions.finance} isAdmin={canViewAdminData} actor={user.email || 'משתמש'} />}
        {page === 'projects' && <ProjectsPage key={createIntent === 'projects' ? 'new-project' : 'projects'} startCreating={createIntent === 'projects'} workspace={workspace} setWorkspace={editableSetWorkspace} onOpen={openProject} canEdit={permissions.projects} />}
        {page === 'tasks' && <section className="card board-card"><TaskBoard key={createIntent === 'tasks' ? 'new-task' : selectedTask || 'tasks'} startCreating={createIntent === 'tasks'} workspace={workspace} setWorkspace={editableSetWorkspace} canEdit={permissions.tasks} focusTaskId={selectedTask} attentionOnly={attentionMode} onClearAttention={() => openPage('tasks')} onProject={openProject} onEmail={(task) => { if (task.projectId) openProject(task.projectId) }} /></section>}
        {page === 'calendar' && <CalendarPage key={createIntent === 'calendar' ? 'new-event' : 'calendar'} startCreating={createIntent === 'calendar'} workspace={workspace} setWorkspace={editableSetWorkspace} canEdit={permissions.calendar} onProject={openProject} onTask={openTask} />}
        {page === 'files' && <FilesPage workspace={workspace} setWorkspace={editableSetWorkspace} orgId={orgId} canEdit={permissions.files} onProject={openProject} onTask={openTask} />}
        {page === 'reports' && <ReportsPage key={createIntent === 'reports' ? 'new-report' : selectedReport || 'reports'} startCreating={createIntent === 'reports'} workspace={workspace} setWorkspace={editableSetWorkspace} orgId={orgId} canEdit={permissions.reports} initialReportId={selectedReport} focusItemId={selectedReportItem} onProject={openProject} onSelectReport={(id) => id ? openReport(id) : openPage('reports')} />}
        {page === 'team' && canManageUsers && <UserManagement orgId={orgId} canManage={canManageUsers} isDeveloper={isDeveloper} workspace={workspace} setWorkspace={editableSetWorkspace} />}
        {page === 'imports' && canManageUsers && <ImportCenter workspace={workspace} setWorkspace={editableSetWorkspace} />}
        {page === 'settings' && isDeveloper && <SettingsPage workspace={workspace} setWorkspace={editableSetWorkspace} />}
      </main>
    </div>
  </div>
}

function Sidebar({ page, setPage, workspace, open, setOpen, user, onLogout, isDeveloper, canManageUsers }: { page: Page; setPage: (page: Page) => void; workspace: Workspace; open: boolean; setOpen: (value: boolean) => void; user: User; onLogout: () => void; isDeveloper: boolean; canManageUsers: boolean }) {
  const visibleItems = navItems.filter((item) => {
    if (item.id === 'settings') return isDeveloper
    if (item.id === 'team' || item.id === 'imports') return canManageUsers
    return true
  })

  return <>
    <div className={`sidebar-overlay ${open ? 'show' : ''}`} onClick={() => setOpen(false)} />
    <aside className={`sidebar ${open ? 'open' : ''}`}>
      <div className="brand"><img src={workspace.settings.logoUrl || '/rameng-mark.svg'} alt={workspace.settings.organizationShortName} /><div><strong>{workspace.settings.organizationShortName}</strong></div><button type="button" className="sidebar-close" onClick={() => setOpen(false)} aria-label="סגירת תפריט"><X /></button></div>
      <nav>{visibleItems.map((item) => { const Icon = item.icon; const count = item.id === 'tasks' ? workspace.tasks.filter((task) => !['בוצע', 'סגור'].includes(task.status)).length : item.id === 'projects' ? workspace.projects.filter((project) => project.status !== 'הושלם').length : 0; return <button type="button" key={item.id} className={page === item.id ? 'active' : ''} aria-current={page === item.id ? 'page' : undefined} onClick={() => setPage(item.id)}><Icon /><span>{item.label}</span>{count > 0 && <em aria-label={`${count} פריטים`}>{count}</em>}</button> })}</nav>
      <div className="sidebar-bottom"><div className="profile"><span className="avatar">{(user.email || 'R').slice(0, 2).toUpperCase()}</span><div><strong>{user.email}</strong><small>מחובר</small></div><button type="button" className="icon-btn" onClick={onLogout} title="יציאה" aria-label="יציאה"><LogOut /></button></div><a href={workspace.settings.website} target="_blank" rel="noreferrer">{workspace.settings.website.replace(/^https?:\/\//, '')}</a></div>
    </aside>
  </>
}

type SearchResult = { id: string; type: string; label: string; detail: string; action: () => void }
function Topbar({ search, setSearch, searchResults, urgentCount, onMenu, onAttention, saveState, canEdit }: { search: string; setSearch: (value: string) => void; searchResults: SearchResult[]; urgentCount: number; onMenu: () => void; onAttention: () => void; saveState: string; canEdit: boolean }) {
  const [activeIndex, setActiveIndex] = useState(0)
  const openResult = (result: SearchResult) => { result.action(); setSearch(''); setActiveIndex(0) }
  return <header className="topbar">
    <button type="button" className="mobile-menu icon-btn" onClick={onMenu} aria-label="פתיחת תפריט"><Menu /></button>
    <div className="global-search">
      <Search aria-hidden="true" />
      <input value={search} onChange={(e) => { setSearch(e.target.value); setActiveIndex(0) }} onKeyDown={(e) => { if (e.key === 'Escape') setSearch(''); if (e.key === 'ArrowDown' && searchResults.length) { e.preventDefault(); setActiveIndex((index) => (index + 1) % searchResults.length) }; if (e.key === 'ArrowUp' && searchResults.length) { e.preventDefault(); setActiveIndex((index) => (index - 1 + searchResults.length) % searchResults.length) }; if (e.key === 'Enter' && searchResults.length) { e.preventDefault(); openResult(searchResults[Math.min(activeIndex, searchResults.length - 1)]) } }} placeholder="חיפוש..." aria-label="חיפוש במערכת" role="combobox" aria-autocomplete="list" aria-expanded={Boolean(search)} aria-controls="global-search-results" aria-activedescendant={search && searchResults.length ? `search-result-${Math.min(activeIndex, searchResults.length - 1)}` : undefined} />
      {search && <button type="button" className="search-clear" onClick={() => setSearch('')} aria-label="ניקוי חיפוש"><X /></button>}
      {search && <div className="search-results" id="global-search-results" role="listbox">{searchResults.map((result, index) => <button type="button" role="option" id={`search-result-${index}`} aria-selected={index === activeIndex} key={`${result.type}-${result.id}`} onMouseEnter={() => setActiveIndex(index)} onClick={() => openResult(result)}><span>{result.type}</span><div><strong>{result.label}</strong><small>{result.detail}</small></div></button>)}{!searchResults.length && <div className="search-empty">לא נמצאו תוצאות</div>}</div>}
    </div>
    <div className={`save-state save-indicator ${!canEdit ? 'readonly' : saveState}`} role="status" aria-live="polite">{!canEdit ? 'צפייה בלבד' : saveState === 'saving' ? 'שומר...' : saveState === 'saved' ? 'נשמר' : saveState === 'conflict' ? 'גרסה חדשה קיימת — רענון נדרש' : saveState === 'error' ? 'שגיאת שמירה' : ''}</div>
    <button type="button" className="notification icon-btn" title={`${urgentCount} נושאים דורשים טיפול`} aria-label={urgentCount ? `${urgentCount} נושאים דורשים טיפול` : 'אין נושאים דחופים'} onClick={onAttention}><Bell />{urgentCount > 0 && <i aria-hidden="true">{urgentCount > 9 ? '9+' : urgentCount}</i>}</button>
  </header>
}
