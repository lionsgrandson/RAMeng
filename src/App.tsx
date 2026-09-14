import { useEffect, useMemo, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { BarChart3, Bell, CalendarDays, ChevronDown, ContactRound, FileInput, FileText, FolderKanban, LayoutDashboard, ListChecks, LogOut, Menu, Search, Settings, UsersRound, X } from 'lucide-react'
import type { Workspace } from './types'
import { cloneWorkspace } from './seed'
import { configureBackend, getBackend, getCurrentUser, loadOrganizationWorkspace, saveOrganizationWorkspace, signOut, subscribeWorkspace } from './lib/backend'
import { loadRuntimeConfig, type RuntimeConfig } from './lib/runtime'
import { integrationsApi } from './lib/api'
import { LoginScreen, SetPasswordScreen, SetupScreen } from './components/AuthSetup'
import { ClientsPage, Dashboard, ImportCenter } from './components/CorePages'
import { CalendarPage, FilesPage } from './components/CalendarFiles'
import { ProjectsPage, ProjectWorkspace } from './components/ProjectWorkspace'
import ReportsPage from './components/Reports'
import SettingsPage from './components/Settings'
import TaskBoard from './components/TaskBoard'
import UserManagement from './components/UserManagement'

type Page = 'overview' | 'clients' | 'projects' | 'tasks' | 'calendar' | 'files' | 'reports' | 'team' | 'imports' | 'settings'

const pageInfo: Record<Page, [string, string]> = {
  overview: ['מרכז שליטה', 'תמונת מצב של פרויקטים, משימות, פיקוח ומועדים.'],
  clients: ['לקוחות ולידים', 'אנשי קשר, פעילות ומידע עסקי במקום אחד.'],
  projects: ['פרויקטים', 'כל פרויקט מנוהל בנפרד עם משימות, מיילים, פגישות, דוחות ומסמכים.'],
  tasks: ['משימות ומעקב', 'משימות, תתי משימות, אחראים, סטטוסים ותאריכים.'],
  calendar: ['יומן', 'פגישות, תאריכי יעד ומועדי מעקב.'],
  files: ['קבצים ומסמכים', 'תכניות, תמונות ומסמכי פרויקט.'],
  reports: ['דוחות פיקוח', 'יצירה, מעקב והפקה של דוחות פיקוח לפי פרויקט.'],
  team: ['משתמשים והרשאות', 'ניהול משתמשים, תפקידים והרשאות גישה.'],
  imports: ['ייבוא מידע', 'ייבוא לקוחות ומשימות מקבצי Excel ו-CSV.'],
  settings: ['הגדרות מפתח', 'פרטי החברה וחיבורי המערכת.'],
}

const navGroups: { label: string; items: { id: Page; label: string; icon: typeof LayoutDashboard }[] }[] = [
  { label: 'עבודה', items: [{ id: 'overview', label: 'מרכז שליטה', icon: LayoutDashboard }, { id: 'clients', label: 'לקוחות ולידים', icon: ContactRound }] },
  { label: 'פרויקטים', items: [{ id: 'projects', label: 'פרויקטים', icon: FolderKanban }, { id: 'tasks', label: 'משימות', icon: ListChecks }, { id: 'calendar', label: 'יומן', icon: CalendarDays }, { id: 'files', label: 'קבצים', icon: FileText }] },
  { label: 'פיקוח', items: [{ id: 'reports', label: 'דוחות פיקוח', icon: BarChart3 }] },
  { label: 'מערכת', items: [{ id: 'team', label: 'משתמשים והרשאות', icon: UsersRound }, { id: 'imports', label: 'ייבוא', icon: FileInput }, { id: 'settings', label: 'הגדרות מפתח', icon: Settings }] },
]

const roleLabel = (role: string, isDeveloper: boolean) => {
  if (isDeveloper || role === 'developer') return 'מפתח'
  if (role === 'admin' || role === 'manager') return 'מנהל'
  if (role === 'assistant') return 'עוזר/ת'
  if (role === 'inspector') return 'מפקח/ת'
  if (role === 'engineer') return 'מהנדס/ת'
  if (role === 'viewer') return 'צפייה בלבד'
  return role
}

const invitedFromUrl = () => {
  const params = new URLSearchParams(window.location.search)
  return params.get('invite') === '1' || window.location.hash.includes('type=invite')
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
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [quickOpen, setQuickOpen] = useState(false)
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')

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
      setLoaded(true)
    }).catch((error) => { if (active) setLoadError(error instanceof Error ? error.message : 'טעינת הנתונים נכשלה') })
    return () => { active = false }
  }, [user?.id])

  const canManageUsers = isDeveloper || role === 'developer' || role === 'admin' || role === 'manager'
  const canEdit = isDeveloper || role === 'developer' || role !== 'viewer'
  const editableSetWorkspace: typeof setWorkspace = (action) => {
    if (!canEdit) return
    setWorkspace(action)
  }

  useEffect(() => {
    if (page === 'settings' && !isDeveloper) setPage('overview')
    if ((page === 'team' || page === 'imports') && !canManageUsers) setPage('overview')
  }, [page, isDeveloper, canManageUsers])

  useEffect(() => {
    if (!loaded || !user || !canEdit) return
    const timer = window.setTimeout(() => {
      setSaveState('saving')
      void saveOrganizationWorkspace(orgId, user.id, workspace)
        .then(() => { setSaveState('saved'); window.setTimeout(() => setSaveState('idle'), 1200) })
        .catch(() => setSaveState('error'))
    }, 650)
    return () => window.clearTimeout(timer)
  }, [workspace, loaded, user?.id, orgId, canEdit])

  useEffect(() => {
    if (!loaded || !orgId) return
    const channel = subscribeWorkspace(orgId, (incoming) => setWorkspace((current) => JSON.stringify(current) === JSON.stringify(incoming) ? current : incoming))
    return () => { if (channel) void getBackend()?.removeChannel(channel) }
  }, [loaded, orgId])

  const urgentCount = useMemo(() => workspace.tasks.filter((task) => !['בוצע', 'סגור'].includes(task.status) && (task.status === 'דורש מעקב' || task.priority === 'דחופה' || (task.followUpDate && new Date(task.followUpDate).getTime() < Date.now()))).length, [workspace.tasks])
  const searchResults = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return []
    return [
      ...workspace.projects.filter((item) => `${item.name} ${item.address}`.toLowerCase().includes(q)).slice(0, 5).map((item) => ({ id: item.id, type: 'פרויקט', label: item.name, detail: item.address, action: () => { setSelectedProject(item.id); setPage('projects') } })),
      ...workspace.tasks.filter((item) => `${item.title} ${item.description || ''}`.toLowerCase().includes(q)).slice(0, 5).map((item) => ({ id: item.id, type: 'משימה', label: item.title, detail: workspace.projects.find((project) => project.id === item.projectId)?.name || '', action: () => setPage('tasks') })),
      ...workspace.contacts.filter((item) => `${item.name} ${item.company || ''} ${item.email || ''}`.toLowerCase().includes(q)).slice(0, 5).map((item) => ({ id: item.id, type: 'לקוח', label: item.name, detail: item.company || item.email || '', action: () => setPage('clients') })),
    ].slice(0, 10)
  }, [search, workspace])

  if (!runtime) return <div className="app-loading"><img src="/rameng-mark.svg" /><span>טוען מערכת...</span></div>
  if (!runtime.configured) return <SetupScreen />
  if (user === undefined) return <div className="app-loading"><img src="/rameng-mark.svg" /><span>בודק התחברות...</span></div>
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
  if (!loaded) return <div className="app-loading"><img src="/rameng-mark.svg" /><span>טוען פרויקטים...</span></div>

  if (selectedProject) return <div className="app-shell project-mode"><Sidebar page={page} setPage={(next) => { setSelectedProject(null); setPage(next) }} workspace={workspace} open={sidebarOpen} setOpen={setSidebarOpen} user={user} onLogout={() => void signOut()} isDeveloper={isDeveloper} canManageUsers={canManageUsers} /><div className="main"><Topbar search={search} setSearch={setSearch} searchResults={searchResults} urgentCount={urgentCount} onMenu={() => setSidebarOpen(true)} quickOpen={quickOpen} setQuickOpen={setQuickOpen} setPage={(next) => { setSelectedProject(null); setPage(next) }} saveState={saveState} canEdit={canEdit} /><main className="page-wrap project-page-wrap"><ProjectWorkspace projectId={selectedProject} workspace={workspace} setWorkspace={editableSetWorkspace} orgId={orgId} onBack={() => { setSelectedProject(null); setPage('projects') }} /></main></div></div>

  return <div className="app-shell">
    <Sidebar page={page} setPage={(next) => { setPage(next); setSidebarOpen(false) }} workspace={workspace} open={sidebarOpen} setOpen={setSidebarOpen} user={user} onLogout={() => void signOut()} isDeveloper={isDeveloper} canManageUsers={canManageUsers} />
    <div className="main">
      <Topbar search={search} setSearch={setSearch} searchResults={searchResults} urgentCount={urgentCount} onMenu={() => setSidebarOpen(true)} quickOpen={quickOpen} setQuickOpen={setQuickOpen} setPage={setPage} saveState={saveState} canEdit={canEdit} />
      <main className="page-wrap">
        <header className="page-heading"><div><span className="eyebrow">ר.א.ם הנדסה · מערכת ניהול</span><h1>{pageInfo[page][0]}</h1><p>{pageInfo[page][1]}</p></div>{(role || isDeveloper) && <span className="role-badge">{roleLabel(role, isDeveloper)}</span>}</header>
        {page === 'overview' && <Dashboard workspace={workspace} onProject={(id) => setSelectedProject(id)} />}
        {page === 'clients' && <ClientsPage workspace={workspace} setWorkspace={editableSetWorkspace} />}
        {page === 'projects' && <ProjectsPage workspace={workspace} setWorkspace={editableSetWorkspace} onOpen={(id) => setSelectedProject(id)} />}
        {page === 'tasks' && <section className="card board-card"><TaskBoard workspace={workspace} setWorkspace={editableSetWorkspace} onEmail={(task) => { if (task.projectId) { setSelectedProject(task.projectId); setPage('projects') } }} /></section>}
        {page === 'calendar' && <CalendarPage workspace={workspace} setWorkspace={editableSetWorkspace} />}
        {page === 'files' && <FilesPage workspace={workspace} setWorkspace={editableSetWorkspace} orgId={orgId} />}
        {page === 'reports' && <ReportsPage workspace={workspace} setWorkspace={editableSetWorkspace} orgId={orgId} />}
        {page === 'team' && canManageUsers && <UserManagement orgId={orgId} canManage={canManageUsers} isDeveloper={isDeveloper} workspace={workspace} setWorkspace={editableSetWorkspace} />}
        {page === 'imports' && canManageUsers && <ImportCenter workspace={workspace} setWorkspace={editableSetWorkspace} />}
        {page === 'settings' && isDeveloper && <SettingsPage workspace={workspace} setWorkspace={editableSetWorkspace} />}
      </main>
    </div>
  </div>
}

function Sidebar({ page, setPage, workspace, open, setOpen, user, onLogout, isDeveloper, canManageUsers }: { page: Page; setPage: (page: Page) => void; workspace: Workspace; open: boolean; setOpen: (value: boolean) => void; user: User; onLogout: () => void; isDeveloper: boolean; canManageUsers: boolean }) {
  const visibleGroups = navGroups.map((group) => ({
    ...group,
    items: group.items.filter((item) => {
      if (item.id === 'settings') return isDeveloper
      if (item.id === 'team' || item.id === 'imports') return canManageUsers
      return true
    }),
  })).filter((group) => group.items.length)

  return <>
    <div className={`sidebar-overlay ${open ? 'show' : ''}`} onClick={() => setOpen(false)} />
    <aside className={`sidebar ${open ? 'open' : ''}`}>
      <div className="brand"><img src={workspace.settings.logoUrl || '/rameng-mark.svg'} /><div><strong>{workspace.settings.organizationShortName}</strong><span>ניהול ופיקוח</span></div><button className="sidebar-close" onClick={() => setOpen(false)}><X /></button></div>
      <nav>{visibleGroups.map((group) => <div className="nav-group" key={group.label}><span className="nav-label">{group.label}</span>{group.items.map((item) => { const Icon = item.icon; const count = item.id === 'tasks' ? workspace.tasks.filter((task) => !['בוצע', 'סגור'].includes(task.status)).length : item.id === 'projects' ? workspace.projects.filter((project) => project.status === 'בביצוע').length : 0; return <button key={item.id} className={page === item.id ? 'active' : ''} onClick={() => setPage(item.id)}><Icon /><span>{item.label}</span>{count > 0 && <em>{count}</em>}</button> })}</div>)}</nav>
      <div className="sidebar-footer"><div className="profile"><span className="avatar">{(user.email || 'R').slice(0, 2).toUpperCase()}</span><div><strong>{user.email}</strong><small>מחובר</small></div><button className="icon-btn" onClick={onLogout} title="יציאה"><LogOut /></button></div><a href={workspace.settings.website} target="_blank" rel="noreferrer">{workspace.settings.website.replace(/^https?:\/\//, '')}</a></div>
    </aside>
  </>
}

type SearchResult = { id: string; type: string; label: string; detail: string; action: () => void }
function Topbar({ search, setSearch, searchResults, urgentCount, onMenu, quickOpen, setQuickOpen, setPage, saveState, canEdit }: { search: string; setSearch: (value: string) => void; searchResults: SearchResult[]; urgentCount: number; onMenu: () => void; quickOpen: boolean; setQuickOpen: (value: boolean) => void; setPage: (page: Page) => void; saveState: string; canEdit: boolean }) {
  return <header className="topbar"><button className="mobile-menu icon-btn" onClick={onMenu}><Menu /></button><div className="global-search"><Search /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="חיפוש בפרויקטים, משימות ולקוחות..." />{search && <button className="search-clear" onClick={() => setSearch('')}><X /></button>}{search && <div className="search-results">{searchResults.map((result) => <button key={`${result.type}-${result.id}`} onClick={() => { result.action(); setSearch('') }}><span>{result.type}</span><div><strong>{result.label}</strong><small>{result.detail}</small></div></button>)}{!searchResults.length && <div>לא נמצאו תוצאות</div>}</div>}</div><div className={`save-indicator ${saveState}`}>{saveState === 'saving' ? 'שומר...' : saveState === 'saved' ? 'נשמר' : saveState === 'error' ? 'שגיאת שמירה' : ''}</div><button className="notification icon-btn" title={`${urgentCount} נושאים דורשים טיפול`} onClick={() => setPage('overview')}><Bell />{urgentCount > 0 && <i>{urgentCount > 9 ? '9+' : urgentCount}</i>}</button>{canEdit && <div className="quick-wrap"><button className="primary quick-button" onClick={() => setQuickOpen(!quickOpen)}>חדש <ChevronDown /></button>{quickOpen && <div className="quick-menu"><button onClick={() => { setPage('projects'); setQuickOpen(false) }}><FolderKanban /> פרויקט חדש</button><button onClick={() => { setPage('clients'); setQuickOpen(false) }}><ContactRound /> לקוח חדש</button><button onClick={() => { setPage('tasks'); setQuickOpen(false) }}><ListChecks /> משימה חדשה</button><button onClick={() => { setPage('reports'); setQuickOpen(false) }}><BarChart3 /> דוח פיקוח</button></div>}</div>}</header>
}
