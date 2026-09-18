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
  const [inviteMode, setInviteMode] = useState(invitedFromUrl)
  const [loaded, setLoaded] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [page, setPage] = useState<Page>('overview')
  const [selectedProject, setSelectedProject] = useState<string | null>(null)
  const [selectedClient, setSelectedClient] = useState<string | null>(null)
  const [selectedTask, setSelectedTask] = useState<string | null>(null)
  const [selectedReport, setSelectedReport] = useState<string | null>(null)
  const [selectedReportItem, setSelectedReportItem] = useState<string | null>(null)
  const [attentionMode, setAttentionMode] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error' | 'conflict'>('idle')
  const workspaceVersionRef = useRef(0)
  const localRevisionRef = useRef(0)
  const dirtyRef = useRef(false)
  const pendingSaveSnapshotRef = useRef('')
  const lastSavedSnapshotRef = useRef('')
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve())

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
    if (role === 'developer') { setIsDeveloper(true); return }
    if (!user || !runtime) { setIsDeveloper(false); return }
    const email = String(user.email || '').toLowerCase()
    if ((runtime.developerEmails || []).includes(email)) {
      setIsDeveloper(true)
      return
    }
    let active = true
    void integrationsApi.adminConfig()
      .then((config) => { if (active) setIsDeveloper(Boolean(config.supabaseUrl)) })
      .catch(() => { if (active) setIsDeveloper(false) })
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
    if (page === 'settings' && !isDeveloper) setPage('overview')
    if ((page === 'team' || page === 'imports') && !canManageUsers) setPage('overview')
  }, [page, isDeveloper, canManageUsers])

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
      if (version <= workspaceVersionRef.current) return current
      const serialized = JSON.stringify(incoming)
      if (serialized === pendingSaveSnapshotRef.current || serialized === lastSavedSnapshotRef.current) {
        workspaceVersionRef.current = version
        return current
      }
      if (dirtyRef.current) {
        setSaveState('conflict')
        return current
      }
      workspaceVersionRef.current = version
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
      ...workspace.projects.filter((item) => `${item.name} ${item.address}`.toLowerCase().includes(q)).slice(0, 5).map((item) => ({ id: item.id, type: 'פרויקט', label: item.name, detail: item.address, action: () => { setSelectedProject(item.id); setPage('projects') } })),
      ...workspace.tasks.filter((item) => `${item.title} ${item.description || ''}`.toLowerCase().includes(q)).slice(0, 5).map((item) => ({ id: item.id, type: 'משימה', label: item.title, detail: workspace.projects.find((project) => project.id === item.projectId)?.name || '', action: () => { setSelectedTask(item.id); setAttentionMode(false); setPage('tasks') } })),
      ...workspace.contacts.filter((item) => `${item.name} ${item.company || ''} ${item.email || ''}`.toLowerCase().includes(q)).slice(0, 5).map((item) => ({ id: item.id, type: 'לקוח', label: item.name, detail: item.company || item.email || '', action: () => { setSelectedClient(item.id); setPage('clients') } })),
    ].slice(0, 10)
  }, [search, workspace])

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

  if (selectedProject) return <div className={`app-shell project-mode ${!canEdit ? 'read-only-mode' : ''}`}><Sidebar page={page} setPage={(next) => { setSelectedProject(null); setSelectedTask(null); setSelectedReport(null); setSelectedReportItem(null); setAttentionMode(false); setPage(next); setSidebarOpen(false) }} workspace={workspace} open={sidebarOpen} setOpen={setSidebarOpen} user={user} onLogout={() => void signOut()} isDeveloper={isDeveloper} canManageUsers={canManageUsers} /><div className="main"><Topbar search={search} setSearch={setSearch} searchResults={searchResults} urgentCount={urgentCount} onMenu={() => setSidebarOpen(true)} setPage={(next) => { setSelectedProject(null); setPage(next) }} onAttention={() => { setSelectedProject(null); setSelectedTask(null); setAttentionMode(true); setPage('tasks') }} saveState={saveState} canEdit={canEdit} /><main className="page-wrap project-page-wrap"><ProjectWorkspace projectId={selectedProject} workspace={workspace} setWorkspace={editableSetWorkspace} orgId={orgId} canEditProject={permissions.projects} canEditTasks={permissions.tasks} canEditCalendar={permissions.calendar} canEditFiles={permissions.files} canEditReports={permissions.reports} canEditMail={permissions.communication} onBack={() => { setSelectedProject(null); setPage('projects') }} /></main></div></div>

  return <div className={`app-shell ${!canEdit ? 'read-only-mode' : ''}`}>
    <Sidebar page={page} setPage={(next) => { if (next === 'clients') setSelectedClient(null); if (next !== 'tasks') { setSelectedTask(null); setAttentionMode(false) } if (next !== 'reports') { setSelectedReport(null); setSelectedReportItem(null) } setPage(next); setSidebarOpen(false) }} workspace={workspace} open={sidebarOpen} setOpen={setSidebarOpen} user={user} onLogout={() => void signOut()} isDeveloper={isDeveloper} canManageUsers={canManageUsers} />
    <div className="main">
      <Topbar search={search} setSearch={setSearch} searchResults={searchResults} urgentCount={urgentCount} onMenu={() => setSidebarOpen(true)} setPage={(next) => { if (next === 'clients') setSelectedClient(null); if (next !== 'tasks') { setSelectedTask(null); setAttentionMode(false) } if (next !== 'reports') { setSelectedReport(null); setSelectedReportItem(null) } setPage(next) }} onAttention={() => { setSelectedTask(null); setAttentionMode(true); setPage('tasks') }} saveState={saveState} canEdit={canEdit} />
      <main className="page-wrap">
        <header className="page-heading"><h1>{pageInfo[page]}</h1>{(role || isDeveloper) && <span className="role-badge">{roleLabel(role, isDeveloper)}</span>}</header>
        {page === 'overview' && <Dashboard workspace={workspace} onProject={(id) => { setSelectedProject(id); setPage('projects') }} onTask={(id) => { setSelectedTask(id); setAttentionMode(false); setPage('tasks') }} onReport={(reportId, itemId) => { setSelectedReport(reportId); setSelectedReportItem(itemId); setPage('reports') }} />}
        {page === 'clients' && <ClientsCenter workspace={workspace} setWorkspace={editableSetWorkspace} selectedClientId={selectedClient} onSelectClient={setSelectedClient} onProject={(id) => { setSelectedProject(id); setPage('projects') }} canEditContacts={permissions.contacts} canEditProjects={permissions.projects} canEditTasks={permissions.tasks} canEditCommunication={permissions.communication} canEditFinance={permissions.finance} isAdmin={canViewAdminData} actor={user.email || 'משתמש'} />}
        {page === 'projects' && <ProjectsPage workspace={workspace} setWorkspace={editableSetWorkspace} onOpen={(id) => setSelectedProject(id)} canEdit={permissions.projects} />}
        {page === 'tasks' && <section className="card board-card"><TaskBoard workspace={workspace} setWorkspace={editableSetWorkspace} canEdit={permissions.tasks} focusTaskId={selectedTask} attentionOnly={attentionMode} onClearAttention={() => setAttentionMode(false)} onEmail={(task) => { if (task.projectId) { setSelectedProject(task.projectId); setPage('projects') } }} /></section>}
        {page === 'calendar' && <CalendarPage workspace={workspace} setWorkspace={editableSetWorkspace} canEdit={permissions.calendar} />}
        {page === 'files' && <FilesPage workspace={workspace} setWorkspace={editableSetWorkspace} orgId={orgId} canEdit={permissions.files} />}
        {page === 'reports' && <ReportsPage workspace={workspace} setWorkspace={editableSetWorkspace} orgId={orgId} canEdit={permissions.reports} initialReportId={selectedReport} focusItemId={selectedReportItem} />}
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
function Topbar({ search, setSearch, searchResults, urgentCount, onMenu, setPage, onAttention, saveState, canEdit }: { search: string; setSearch: (value: string) => void; searchResults: SearchResult[]; urgentCount: number; onMenu: () => void; setPage: (page: Page) => void; onAttention: () => void; saveState: string; canEdit: boolean }) {
  return <header className="topbar">
    <button type="button" className="mobile-menu icon-btn" onClick={onMenu} aria-label="פתיחת תפריט"><Menu /></button>
    <div className="global-search">
      <Search aria-hidden="true" />
      <input value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => { if (e.key === 'Escape') setSearch('') }} placeholder="חיפוש..." aria-label="חיפוש במערכת" role="combobox" aria-autocomplete="list" aria-expanded={Boolean(search)} aria-controls="global-search-results" />
      {search && <button type="button" className="search-clear" onClick={() => setSearch('')} aria-label="ניקוי חיפוש"><X /></button>}
      {search && <div className="search-results" id="global-search-results" role="listbox">{searchResults.map((result) => <button type="button" role="option" key={`${result.type}-${result.id}`} onClick={() => { result.action(); setSearch('') }}><span>{result.type}</span><div><strong>{result.label}</strong><small>{result.detail}</small></div></button>)}{!searchResults.length && <div className="search-empty">לא נמצאו תוצאות</div>}</div>}
    </div>
    <div className={`save-state save-indicator ${!canEdit ? 'readonly' : saveState}`} role="status" aria-live="polite">{!canEdit ? 'צפייה בלבד' : saveState === 'saving' ? 'שומר...' : saveState === 'saved' ? 'נשמר' : saveState === 'conflict' ? 'גרסה חדשה קיימת — רענון נדרש' : saveState === 'error' ? 'שגיאת שמירה' : ''}</div>
    <button type="button" className="notification icon-btn" title={`${urgentCount} נושאים דורשים טיפול`} aria-label={urgentCount ? `${urgentCount} נושאים דורשים טיפול` : 'אין נושאים דחופים'} onClick={onAttention}><Bell />{urgentCount > 0 && <i aria-hidden="true">{urgentCount > 9 ? '9+' : urgentCount}</i>}</button>
  </header>
}
