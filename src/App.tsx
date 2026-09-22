import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { User } from '@supabase/supabase-js'
import { AudioLines, BarChart3, Bell, Bot, CalendarDays, ChevronDown, ContactRound, FileInput, FileText, FolderKanban, LayoutDashboard, ListChecks, LogOut, Menu, ReceiptText, Search, Settings, UsersRound, X } from 'lucide-react'
import type { Workspace } from './types'
import { cloneWorkspace } from './seed'
import { configureBackend, getBackend, getCurrentUser, loadOrganizationWorkspace, saveOrganizationWorkspace, signOut, subscribeWorkspace } from './lib/backend'
import { loadRuntimeConfig, type RuntimeConfig } from './lib/runtime'
import { integrationsApi } from './lib/api'
import { canMutateArea, hasAnyWritePermission, normalizePermissions, permissionAreas, workspaceMutationError, type PermissionArea, type PermissionMatrix, type StoredPermissions } from './lib/permissions'
import { LoginScreen, SetPasswordScreen, SetupScreen } from './components/AuthSetup'
import { Dashboard, ImportCenter } from './components/CorePages'
import ClientsCenter from './components/ClientCenter'
import { CalendarPage, FilesPage } from './components/CalendarFiles'
import { ProjectsPage, ProjectWorkspace } from './components/ProjectWorkspace'
import ReportsPage from './components/Reports'
import SettingsPage from './components/Settings'
import TaskBoard from './components/TaskBoard'
import UserManagement from './components/UserManagement'

type Page = 'overview' | 'clients' | 'projects' | 'tasks' | 'calendar' | 'files' | 'reports' | 'reports-projects' | 'reports-finance' | 'ai' | 'transcription' | 'team' | 'imports' | 'settings'

const pageInfo: Record<Page, string> = {
  overview: 'לוח בקרה',
  clients: 'כל הלקוחות',
  projects: 'כל הפרויקטים',
  tasks: 'כל המשימות',
  calendar: 'יומן',
  files: 'כל הקבצים',
  reports: 'דוחות',
  'reports-projects': 'דוחות לפרויקטים',
  'reports-finance': 'דוחות פיננסיים',
  ai: 'סוכן AI',
  transcription: 'תמלול',
  team: 'משתמשים',
  imports: 'ייבוא',
  settings: 'הגדרות',
}

const navItems: { id: Page; label: string; icon: typeof LayoutDashboard }[] = [
  { id: 'overview', label: 'לוח בקרה', icon: LayoutDashboard },
  { id: 'clients', label: 'לקוחות', icon: ContactRound },
  { id: 'projects', label: 'פרויקטים', icon: FolderKanban },
  { id: 'tasks', label: 'משימות', icon: ListChecks },
  { id: 'calendar', label: 'יומן', icon: CalendarDays },
  { id: 'files', label: 'קבצים', icon: FileText },
  { id: 'reports', label: 'דוחות', icon: BarChart3 },
  { id: 'ai', label: 'סוכן AI', icon: Bot },
  { id: 'transcription', label: 'תמלול', icon: AudioLines },
  { id: 'team', label: 'משתמשים', icon: UsersRound },
  { id: 'imports', label: 'ייבוא', icon: FileInput },
  { id: 'settings', label: 'הגדרות', icon: Settings },
]

const reportSubItems: { id: Page; label: string; icon: typeof LayoutDashboard }[] = [
  { id: 'reports-projects', label: 'דוחות לפרויקטים', icon: FolderKanban },
  { id: 'reports-finance', label: 'דוחות פיננסיים', icon: ReceiptText },
]
const routePages = new Set<Page>([...navItems.map((item) => item.id), ...reportSubItems.map((item) => item.id)])

type ProjectTab = 'summary' | 'tasks' | 'mail' | 'calendar' | 'drive' | 'reports' | 'files'
type AppRoute = { page: Page; projectId?: string; clientId?: string; taskId?: string; reportId?: string; reportItemId?: string; tab?: ProjectTab; attention?: boolean }
const projectTabs: ProjectTab[] = ['summary', 'tasks', 'mail', 'calendar', 'drive', 'reports', 'files']
const readAppRoute = (): AppRoute | null => {
  if (!window.location.hash.startsWith('#app?')) return null
  const params = new URLSearchParams(window.location.hash.slice(5))
  const page = params.get('page') as Page
  if (!routePages.has(page)) return null
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

const pagePermissionArea: Partial<Record<Page, PermissionArea>> = {
  clients: 'contacts',
  projects: 'projects',
  tasks: 'tasks',
  calendar: 'calendar',
  files: 'files',
  reports: 'reports',
  'reports-projects': 'reports',
  'reports-finance': 'finance',
  ai: 'communication',
  transcription: 'communication',
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
  const [customPermissions, setCustomPermissions] = useState<StoredPermissions | null>(null)
  const [permissionNotice, setPermissionNotice] = useState('')
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
    let active = true
    let unsubscribeAuth: (() => void) | undefined

    void loadRuntimeConfig().then((config) => {
      if (!active) return

      configureBackend(config)
      setRuntime(config)

      if (!config.configured) {
        setUser(null)
        return
      }

      void getCurrentUser().then((currentUser) => {
        if (active) setUser(currentUser)
      })

      const backend = getBackend()
      if (backend) {
        const { data } = backend.auth.onAuthStateChange((_event, session) => {
          if (active) setUser(session?.user || null)
        })
        unsubscribeAuth = () => data.subscription.unsubscribe()
      }
    })

    return () => {
      active = false
      unsubscribeAuth?.()
    }
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
    const brand = workspace.settings.brandColor || '#75927c'
    document.documentElement.style.setProperty('--brand', brand)
  }, [workspace.settings.brandColor])

  useEffect(() => {
    if (!user) { setLoaded(false); setRole(''); setCustomPermissions(null); return }
    let active = true
    setLoadError('')
    void loadOrganizationWorkspace(user.id).then((result) => {
      if (!active) return
      setOrgId(result.orgId)
      setRole(result.role)
      setCustomPermissions(result.permissions)
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
  const permissions = useMemo(() => normalizePermissions(role, customPermissions, isDeveloper), [role, customPermissions, isDeveloper])
  const canViewAdminData = (isDeveloper || ['developer', 'admin', 'manager'].includes(role)) && permissionAreas.every((area) => permissions[area].view)
  const canEdit = hasAnyWritePermission(permissions) || canManageUsers || isDeveloper
  const canViewPage = (target: Page) => {
    if (target === 'overview') return true
    if (target === 'settings') return isDeveloper
    if (target === 'team' || target === 'imports') return canManageUsers
    const area = pagePermissionArea[target]
    return area ? permissions[area].view : true
  }
  const visibleWorkspace = useMemo<Workspace>(() => ({
    ...workspace,
    contacts: permissions.contacts.view ? workspace.contacts : [],
    deals: permissions.contacts.view ? workspace.deals : [],
    projects: permissions.projects.view ? workspace.projects : [],
    tasks: permissions.tasks.view ? workspace.tasks : [],
    taskColumns: permissions.tasks.view ? workspace.taskColumns : [],
    taskStatuses: permissions.tasks.view ? workspace.taskStatuses : [],
    checklistTemplates: permissions.tasks.view ? workspace.checklistTemplates : [],
    events: permissions.calendar.view ? workspace.events : [],
    files: permissions.files.view ? workspace.files : [],
    reports: permissions.reports.view ? workspace.reports : [],
    reportTemplates: permissions.reports.view ? workspace.reportTemplates : [],
    quotes: permissions.finance.view ? workspace.quotes : [],
    clientNotes: permissions.communication.view ? workspace.clientNotes : [],
    audit: canViewAdminData ? workspace.audit : [],
  }), [workspace, permissions, canViewAdminData])
  const editableSetWorkspace: typeof setWorkspace = (action) => {
    if (!canEdit) return
    setWorkspace((current) => {
      const next = typeof action === 'function' ? action(current) : action
      if (next === current || JSON.stringify(next) === JSON.stringify(current)) return current
      const permissionError = workspaceMutationError(current, next, permissions, { canManageUsers, isDeveloper })
      if (permissionError) {
        window.setTimeout(() => setPermissionNotice(permissionError), 0)
        return current
      }
      window.setTimeout(() => setPermissionNotice(''), 0)
      localRevisionRef.current += 1
      dirtyRef.current = true
      return appendAutomaticAudit(current, next, user?.email || 'משתמש')
    })
  }

  useEffect(() => {
    if (!loaded || !developerResolved) return
    if (!canViewPage(page)) {
      setPage('overview')
      setSelectedProject(null)
      setSelectedClient(null)
      setSelectedTask(null)
      setSelectedReport(null)
      setSelectedReportItem(null)
      setProjectTab('summary')
      setAttentionMode(false)
      setCreateIntent(null)
      window.history.replaceState({}, '', `${window.location.pathname}${window.location.search}#app?page=overview`)
    }
  }, [page, isDeveloper, canManageUsers, loaded, developerResolved, permissions])

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

  const urgentCount = useMemo(() => visibleWorkspace.tasks.filter((task) => !['בוצע', 'סגור'].includes(task.status) && (task.status === 'דורש מעקב' || task.priority === 'דחופה' || (task.followUpDate && new Date(task.followUpDate).getTime() < Date.now()))).length, [visibleWorkspace.tasks])
  const searchResults = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return []
    return [
      ...visibleWorkspace.projects.filter((item) => `${item.name} ${item.address}`.toLowerCase().includes(q)).slice(0, 5).map((item) => ({ id: item.id, type: 'פרויקט', label: item.name, detail: item.address, action: () => openProject(item.id) })),
      ...visibleWorkspace.tasks.filter((item) => `${item.title} ${item.description || ''}`.toLowerCase().includes(q)).slice(0, 5).map((item) => ({ id: item.id, type: 'משימה', label: item.title, detail: visibleWorkspace.projects.find((project) => project.id === item.projectId)?.name || '', action: () => openTask(item.id) })),
      ...visibleWorkspace.contacts.filter((item) => `${item.name} ${item.company || ''} ${item.email || ''}`.toLowerCase().includes(q)).slice(0, 5).map((item) => ({ id: item.id, type: 'לקוח', label: item.name, detail: item.company || item.email || '', action: () => openClient(item.id) })),
      ...visibleWorkspace.reports.filter((item) => `${item.title} ${item.siteAddress}`.toLowerCase().includes(q)).slice(0, 3).map((item) => ({ id: item.id, type: 'דוח', label: item.title, detail: visibleWorkspace.projects.find((project) => project.id === item.projectId)?.name || '', action: () => openReport(item.id) })),
    ].slice(0, 10)
  }, [search, visibleWorkspace])

  const openPage = (next: Page, create = false) => {
    if (!canViewPage(next)) {
      setPermissionNotice('אין הרשאת צפייה באזור הזה')
      return
    }
    applyRoute({ page: next })
    setCreateIntent(create ? next : null)
  }
  const openProject = (id: string, tab: ProjectTab = 'summary') => permissions.projects.view ? applyRoute({ page: 'projects', projectId: id, tab }) : setPermissionNotice('אין הרשאת צפייה בפרויקטים')
  const openClient = (id: string) => permissions.contacts.view ? applyRoute({ page: 'clients', clientId: id }) : setPermissionNotice('אין הרשאת צפייה בלקוחות')
  const openTask = (id: string) => permissions.tasks.view ? applyRoute({ page: 'tasks', taskId: id }) : setPermissionNotice('אין הרשאת צפייה במשימות')
  const openReport = (id: string, itemId: string | null = null) => permissions.reports.view ? applyRoute({ page: 'reports', reportId: id, reportItemId: itemId || undefined }) : setPermissionNotice('אין הרשאת צפייה בדוחות')
  const openUrgent = () => permissions.tasks.view ? applyRoute({ page: 'tasks', attention: true }) : setPermissionNotice('אין הרשאת צפייה במשימות')

  if (!runtime) return <div className="app-loading"><img src="/ram-engineering-logo.png" alt="ר.א.ם הנדסה" /><span>טוען מערכת...</span></div>
  if (!runtime.configured) return <SetupScreen />
  if (user === undefined) return <div className="app-loading"><img src="/ram-engineering-logo.png" alt="ר.א.ם הנדסה" /><span>בודק התחברות...</span></div>
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
  if (!loaded) return <div className="app-loading"><img src="/ram-engineering-logo.png" alt="ר.א.ם הנדסה" /><span>טוען פרויקטים...</span></div>

  if (selectedProject) return <div className={`app-shell project-mode ${!canEdit ? 'read-only-mode' : ''}`}><Sidebar page={page} setPage={(next) => openPage(next)} workspace={visibleWorkspace} permissions={permissions} open={sidebarOpen} setOpen={setSidebarOpen} user={user} onLogout={() => void signOut()} isDeveloper={isDeveloper} canManageUsers={canManageUsers} /><div className="main"><Topbar search={search} setSearch={setSearch} searchResults={searchResults} urgentCount={urgentCount} onMenu={() => setSidebarOpen(true)} onAttention={openUrgent} saveState={saveState} canEdit={canEdit} /><main className="page-wrap project-page-wrap">{permissionNotice && <div className="error-banner permission-notice" role="alert">{permissionNotice}</div>}<ProjectWorkspace key={selectedProject} projectId={selectedProject} initialTab={projectTab} workspace={visibleWorkspace} setWorkspace={editableSetWorkspace} orgId={orgId} projectPermissions={permissions.projects} taskPermissions={permissions.tasks} calendarPermissions={permissions.calendar} filePermissions={permissions.files} reportPermissions={permissions.reports} communicationPermissions={permissions.communication} onBack={() => openPage('projects')} onClient={permissions.contacts.view ? openClient : undefined} onTabChange={(tab) => { setProjectTab(tab); writeAppRoute({ page: 'projects', projectId: selectedProject, tab }) }} /></main></div></div>

  return <div className={`app-shell ${!canEdit ? 'read-only-mode' : ''}`}>
    <Sidebar page={page} setPage={(next) => openPage(next)} workspace={visibleWorkspace} permissions={permissions} open={sidebarOpen} setOpen={setSidebarOpen} user={user} onLogout={() => void signOut()} isDeveloper={isDeveloper} canManageUsers={canManageUsers} />
    <div className="main">
      <Topbar search={search} setSearch={setSearch} searchResults={searchResults} urgentCount={urgentCount} onMenu={() => setSidebarOpen(true)} onAttention={openUrgent} saveState={saveState} canEdit={canEdit} />
      <main className="page-wrap">
        <header className="page-heading"><h1>{pageInfo[page]}</h1>{(role || isDeveloper) && <span className="role-badge">{roleLabel(role, isDeveloper)}</span>}</header>
        {permissionNotice && <div className="error-banner permission-notice" role="alert">{permissionNotice}</div>}
        {page === 'overview' && <Dashboard workspace={visibleWorkspace} onProject={openProject} onTask={openTask} onReport={openReport} onPage={(next) => openPage(next)} onCreate={(next) => openPage(next, true)} onUrgent={openUrgent} canCreate={{ clients: permissions.contacts.create, projects: permissions.projects.create, tasks: permissions.tasks.create, reports: permissions.reports.create, calendar: permissions.calendar.create }} />}
        {page === 'clients' && <ClientsCenter key={createIntent === 'clients' ? 'new-client' : 'clients'} startCreating={createIntent === 'clients' && permissions.contacts.create} workspace={visibleWorkspace} setWorkspace={editableSetWorkspace} selectedClientId={selectedClient} onSelectClient={(id) => id ? openClient(id) : openPage('clients')} onProject={openProject} canEditContacts={canMutateArea(permissions, 'contacts')} canEditProjects={canMutateArea(permissions, 'projects')} canEditTasks={canMutateArea(permissions, 'tasks')} canEditCommunication={canMutateArea(permissions, 'communication')} canEditFinance={canMutateArea(permissions, 'finance')} contactPermissions={permissions.contacts} projectPermissions={permissions.projects} taskPermissions={permissions.tasks} communicationPermissions={permissions.communication} financePermissions={permissions.finance} calendarPermissions={permissions.calendar} filePermissions={permissions.files} isAdmin={canViewAdminData} actor={user.email || 'משתמש'} />}
        {page === 'projects' && <ProjectsPage key={createIntent === 'projects' ? 'new-project' : 'projects'} startCreating={createIntent === 'projects' && permissions.projects.create} workspace={visibleWorkspace} setWorkspace={editableSetWorkspace} onOpen={openProject} canEdit={permissions.projects.create} />}
        {page === 'tasks' && <section className="card board-card"><TaskBoard key={createIntent === 'tasks' ? 'new-task' : selectedTask || 'tasks'} startCreating={createIntent === 'tasks' && permissions.tasks.create} workspace={visibleWorkspace} setWorkspace={editableSetWorkspace} permissions={permissions.tasks} focusTaskId={selectedTask} attentionOnly={attentionMode} onClearAttention={() => openPage('tasks')} onProject={permissions.projects.view ? openProject : undefined} onEmail={permissions.communication.view && permissions.projects.view ? (task) => { if (task.projectId) openProject(task.projectId, 'mail') } : undefined} /></section>}
        {page === 'calendar' && <CalendarPage key={createIntent === 'calendar' ? 'new-event' : 'calendar'} startCreating={createIntent === 'calendar' && permissions.calendar.create} workspace={visibleWorkspace} setWorkspace={editableSetWorkspace} permissions={permissions.calendar} onProject={permissions.projects.view ? openProject : undefined} onTask={permissions.tasks.view ? openTask : undefined} />}
        {page === 'files' && <FilesPage workspace={visibleWorkspace} setWorkspace={editableSetWorkspace} orgId={orgId} permissions={permissions.files} onProject={permissions.projects.view ? openProject : undefined} onTask={permissions.tasks.view ? openTask : undefined} />}
        {page === 'reports' && <ReportsPage key={createIntent === 'reports' ? 'new-report' : selectedReport || 'reports'} startCreating={createIntent === 'reports' && permissions.reports.create} workspace={visibleWorkspace} setWorkspace={editableSetWorkspace} orgId={orgId} permissions={permissions.reports} canUploadFiles={permissions.files.create} initialReportId={selectedReport} focusItemId={selectedReportItem} onProject={permissions.projects.view ? openProject : undefined} onSelectReport={(id) => id ? openReport(id) : openPage('reports')} />}
        {page === 'reports-projects' && <ReportsPage workspace={visibleWorkspace} setWorkspace={editableSetWorkspace} orgId={orgId} permissions={permissions.reports} canUploadFiles={permissions.files.create} onProject={permissions.projects.view ? openProject : undefined} />}
        {page === 'reports-finance' && <FinancialReports workspace={visibleWorkspace} />}
        {page === 'ai' && <ModulePlaceholder icon={<Bot />} title="סוכן AI" text="המודול נוסף לניווט ומוכן לחיבור לזרימות העבודה של ראם. חיבור פעולות AI בפועל ייעשה רק לפי האפיון המאושר." />}
        {page === 'transcription' && <ModulePlaceholder icon={<AudioLines />} title="תמלול" text="המודול נוסף לניווט כנקודת כניסה לתמלול פגישות והקלטות. תהליך התמלול והפקת המשימות יחובר לפי האפיון המאושר." />}
        {page === 'team' && canManageUsers && <UserManagement orgId={orgId} canManage={canManageUsers} isDeveloper={isDeveloper} workspace={workspace} setWorkspace={editableSetWorkspace} />}
        {page === 'imports' && canManageUsers && <ImportCenter workspace={workspace} setWorkspace={editableSetWorkspace} />}
        {page === 'settings' && isDeveloper && <SettingsPage workspace={workspace} setWorkspace={editableSetWorkspace} />}
      </main>
    </div>
  </div>
}

function Sidebar({ page, setPage, workspace, permissions, open, setOpen, user, onLogout, isDeveloper, canManageUsers }: { page: Page; setPage: (page: Page) => void; workspace: Workspace; permissions: PermissionMatrix; open: boolean; setOpen: (value: boolean) => void; user: User; onLogout: () => void; isDeveloper: boolean; canManageUsers: boolean }) {
  const [reportsOpen, setReportsOpen] = useState(page === 'reports' || page === 'reports-projects' || page === 'reports-finance')
  const [clock, setClock] = useState(() => new Date())
  useEffect(() => {
    if (page === 'reports' || page === 'reports-projects' || page === 'reports-finance') setReportsOpen(true)
  }, [page])
  useEffect(() => {
    const timer = window.setInterval(() => setClock(new Date()), 60000)
    return () => window.clearInterval(timer)
  }, [])

  const visibleItems = navItems.filter((item) => {
    if (item.id === 'settings') return isDeveloper
    if (item.id === 'team' || item.id === 'imports') return canManageUsers
    if (item.id === 'reports') return permissions.reports.view || permissions.finance.view
    const area = pagePermissionArea[item.id]
    return area ? permissions[area].view : true
  })
  const visibleReportItems = reportSubItems.filter((item) => {
    const area = pagePermissionArea[item.id]
    return area ? permissions[area].view : true
  })
  const weekday = new Intl.DateTimeFormat('he-IL', { weekday: 'long' }).format(clock)
  const gregorianDate = new Intl.DateTimeFormat('he-IL-u-ca-gregory', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(clock)

  return <>
    <div className={`sidebar-overlay ${open ? 'show' : ''}`} onClick={() => setOpen(false)} />
    <aside className={`sidebar ${open ? 'open' : ''}`}>
      <div className="brand"><img src="/ram-engineering-logo.png" alt={workspace.settings.organizationShortName} /><div><strong>{workspace.settings.organizationShortName}</strong><span>RAM Engineering CRM</span></div><button type="button" className="sidebar-close" onClick={() => setOpen(false)} aria-label="סגירת תפריט"><X /></button></div>
      <div className="sidebar-date" aria-label={`${weekday}, ${gregorianDate}`}><strong>{weekday}</strong><span>{gregorianDate}</span></div>
      <nav>{visibleItems.map((item) => {
        const Icon = item.icon
        const count = item.id === 'tasks' ? workspace.tasks.filter((task) => !['בוצע', 'סגור'].includes(task.status)).length : item.id === 'projects' ? workspace.projects.filter((project) => project.status !== 'הושלם').length : 0
        if (item.id === 'reports') {
          const reportActive = page === 'reports' || page === 'reports-projects' || page === 'reports-finance'
          return <div className={`nav-group ${reportActive ? 'active' : ''}`} key={item.id}>
            <button type="button" className={reportActive ? 'active' : ''} aria-expanded={reportsOpen} onClick={() => { setReportsOpen((value) => !value); if (permissions.reports.view) setPage('reports') }}><Icon /><span>{item.label}</span><ChevronDown className={`nav-chevron ${reportsOpen ? 'open' : ''}`} /></button>
            {reportsOpen && <div className="nav-submenu">{visibleReportItems.map((sub) => { const SubIcon = sub.icon; return <button type="button" key={sub.id} className={page === sub.id ? 'active' : ''} aria-current={page === sub.id ? 'page' : undefined} onClick={() => setPage(sub.id)}><SubIcon /><span>{sub.label}</span></button> })}</div>}
          </div>
        }
        return <button type="button" key={item.id} className={page === item.id ? 'active' : ''} aria-current={page === item.id ? 'page' : undefined} onClick={() => setPage(item.id)}><Icon /><span>{item.label}</span>{count > 0 && <em aria-label={`${count} פריטים`}>{count}</em>}</button>
      })}</nav>
      <div className="sidebar-bottom"><div className="profile"><span className="avatar">{(user.email || 'R').slice(0, 2).toUpperCase()}</span><div><strong>{user.email}</strong><small>מחובר</small></div><button type="button" className="icon-btn" onClick={onLogout} title="יציאה" aria-label="יציאה"><LogOut /></button></div><a href={workspace.settings.website} target="_blank" rel="noreferrer">{workspace.settings.website.replace(/^https?:\/\//, '')}</a></div>
    </aside>
  </>
}

function FinancialReports({ workspace }: { workspace: Workspace }) {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('הכל')
  const [clientFilter, setClientFilter] = useState('הכל')
  const [projectFilter, setProjectFilter] = useState('הכל')
  const [paymentFilter, setPaymentFilter] = useState('הכל')
  const [dateField, setDateField] = useState<'issued' | 'due'>('issued')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const filteredQuotes = useMemo(() => workspace.quotes.filter((quote) => {
    const client = workspace.contacts.find((item) => item.id === quote.contactId)
    const project = workspace.projects.find((item) => item.id === quote.projectId)
    const q = search.trim().toLowerCase()
    if (q && !`${quote.number} ${quote.title} ${client?.name || ''} ${project?.name || ''} ${project?.address || ''}`.toLowerCase().includes(q)) return false
    if (statusFilter !== 'הכל' && quote.status !== statusFilter) return false
    if (clientFilter !== 'הכל') {
      if (clientFilter === '__none__' && quote.contactId) return false
      if (clientFilter !== '__none__' && quote.contactId !== clientFilter) return false
    }
    if (projectFilter !== 'הכל') {
      if (projectFilter === '__none__' && quote.projectId) return false
      if (projectFilter !== '__none__' && quote.projectId !== projectFilter) return false
    }
    const paid = Number(quote.paidAmount || 0)
    const amount = Number(quote.amount || 0)
    if (paymentFilter === 'שולם' && paid < amount) return false
    if (paymentFilter === 'חלקי' && !(paid > 0 && paid < amount)) return false
    if (paymentFilter === 'לא שולם' && paid > 0) return false
    const selectedDate = dateField === 'issued' ? quote.issuedAt : quote.dueDate
    if (dateFrom && (!selectedDate || selectedDate < dateFrom)) return false
    if (dateTo && (!selectedDate || selectedDate > dateTo)) return false
    return true
  }), [workspace.quotes, workspace.contacts, workspace.projects, search, statusFilter, clientFilter, projectFilter, paymentFilter, dateField, dateFrom, dateTo])

  const issued = filteredQuotes.reduce((sum, quote) => sum + Number(quote.amount || 0), 0)
  const paid = filteredQuotes.reduce((sum, quote) => sum + Number(quote.paidAmount || 0), 0)
  const outstanding = Math.max(0, issued - paid)
  const currency = (value: number) => new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 }).format(value)

  return <div className="financial-report-page">
    <div className="list-filter-panel finance-filter-panel card">
      <label className="list-filter-field filter-grow"><span>חיפוש</span><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="מספר, כותרת, לקוח, פרויקט או כתובת" /></label>
      <label className="list-filter-field"><span>סטטוס</span><select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}><option value="הכל">כל הסטטוסים</option>{[...new Set(workspace.quotes.map((quote) => quote.status))].map((status) => <option key={status}>{status}</option>)}</select></label>
      <label className="list-filter-field"><span>לקוח</span><select value={clientFilter} onChange={(e) => setClientFilter(e.target.value)}><option value="הכל">כל הלקוחות</option><option value="__none__">ללא לקוח</option>{workspace.contacts.map((contact) => <option key={contact.id} value={contact.id}>{contact.name}</option>)}</select></label>
      <label className="list-filter-field"><span>פרויקט</span><select value={projectFilter} onChange={(e) => setProjectFilter(e.target.value)}><option value="הכל">כל הפרויקטים</option><option value="__none__">ללא פרויקט</option>{workspace.projects.map((project) => <option key={project.id} value={project.id}>{project.address || 'כתובת חסרה'} · {project.name}</option>)}</select></label>
      <label className="list-filter-field"><span>תשלום</span><select value={paymentFilter} onChange={(e) => setPaymentFilter(e.target.value)}><option>הכל</option><option>שולם</option><option>חלקי</option><option>לא שולם</option></select></label>
      <label className="list-filter-field"><span>תאריך לפי</span><select value={dateField} onChange={(e) => setDateField(e.target.value as 'issued' | 'due')}><option value="issued">תאריך הפקה</option><option value="due">תאריך יעד</option></select></label>
      <label className="list-filter-field"><span>מתאריך</span><input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} /></label>
      <label className="list-filter-field"><span>עד תאריך</span><input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} /></label>
      <button type="button" className="secondary compact-filter-clear" onClick={() => { setSearch(''); setStatusFilter('הכל'); setClientFilter('הכל'); setProjectFilter('הכל'); setPaymentFilter('הכל'); setDateFrom(''); setDateTo('') }}>ניקוי סינון</button>
      <span className="filter-count">{filteredQuotes.length} מתוך {workspace.quotes.length} רשומות</span>
    </div>

    <div className="metric-grid finance-report-metrics">
      <article className="metric card"><div><small>מסמכים בסינון</small><strong>{filteredQuotes.length}</strong></div></article>
      <article className="metric card"><div><small>סה״כ לחיוב</small><strong>{currency(issued)}</strong></div></article>
      <article className="metric card"><div><small>שולם</small><strong>{currency(paid)}</strong></div></article>
      <article className="metric card"><div><small>יתרה פתוחה</small><strong>{currency(outstanding)}</strong></div></article>
    </div>
    <section className="card"><div className="card-head"><div><h2>מידע פיננסי</h2><p>ריכוז הצעות מחיר / חיובים קיימים במערכת. אינטגרציית חשבוניות חיצונית אינה מתווספת ללא אישור היקף.</p></div></div>
      <div className="finance-report-list">{filteredQuotes.map((quote) => {
        const client = workspace.contacts.find((item) => item.id === quote.contactId)
        const project = workspace.projects.find((item) => item.id === quote.projectId)
        return <article key={quote.id}><div><strong>{quote.number || quote.title}</strong><small>{client?.name || 'ללא לקוח'}{project ? ` · ${project.address || project.name}` : ''}</small></div><span>{quote.status}</span><b>{currency(quote.amount)}</b><span>שולם {currency(quote.paidAmount || 0)}</span></article>
      })}{!filteredQuotes.length && <div className="table-empty">{workspace.quotes.length ? 'אין רשומות שתואמות לסינון.' : 'אין כרגע נתונים פיננסיים להצגה.'}</div>}</div>
    </section>
  </div>
}

function ModulePlaceholder({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return <section className="card module-placeholder"><div className="module-placeholder-icon">{icon}</div><div><h2>{title}</h2><p>{text}</p></div></section>
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
