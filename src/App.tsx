import { useEffect, useMemo, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { BarChart3, Bell, BriefcaseBusiness, CalendarDays, ChevronDown, CircleDollarSign, ContactRound, FileInput, FileText, FolderKanban, LayoutDashboard, ListChecks, LogOut, Menu, Search, Settings, Sparkles, UsersRound, X } from 'lucide-react'
import type { Workspace } from './types'
import { cloneWorkspace } from './seed'
import { configureBackend, getBackend, getCurrentUser, loadOrganizationWorkspace, saveOrganizationWorkspace, signOut, subscribeWorkspace } from './lib/backend'
import { loadRuntimeConfig, type RuntimeConfig } from './lib/runtime'
import { LoginScreen, SetupScreen } from './components/AuthSetup'
import { AIStudio, ClientsPage, Dashboard, FinancePage, ImportCenter, PipelinePage, TeamPage } from './components/CorePages'
import { CalendarPage, FilesPage } from './components/CalendarFiles'
import { ProjectsPage, ProjectWorkspace } from './components/ProjectWorkspace'
import ReportsPage from './components/Reports'
import SettingsPage from './components/Settings'
import TaskBoard from './components/TaskBoard'

type Page = 'overview' | 'clients' | 'pipeline' | 'projects' | 'tasks' | 'calendar' | 'files' | 'finance' | 'reports' | 'ai' | 'team' | 'imports' | 'settings'

const pageInfo: Record<Page, [string, string]> = {
  overview: ['מרכז שליטה', 'תמונת מצב ברורה של פרויקטים, משימות, פיקוח ומועדים.'],
  clients: ['לקוחות ולידים', 'כל אנשי הקשר, הפעילות והמידע העסקי במקום אחד.'],
  pipeline: ['צינור מכירות', 'מעקב אחר הזדמנויות, הצעות ופעולה הבאה.'],
  projects: ['פרויקטים', 'כל פרויקט מנוהל בנפרד עם משימות, מיילים, פגישות, דוחות ומסמכים.'],
  tasks: ['משימות ומעקב', 'לוח עבודה גמיש עם משימות, תתי משימות, אחראים, סטטוסים ותאריכים.'],
  calendar: ['יומן', 'פגישות, תאריכי יעד, מועדי מעקב וסנכרון Google Calendar.'],
  files: ['קבצים ומסמכים', 'תכניות, חוזים, תמונות ומסמכי פרויקט.'],
  finance: ['הצעות וחיובים', 'מעקב אחר הצעות מחיר, סכומים וסטטוסי תשלום.'],
  reports: ['דוחות פיקוח', 'יצירה, מעקב והפקה של דוחות פיקוח במספר פורמטים.'],
  ai: ['סטודיו AI', 'ניסוח מקצועי של הערות, סיכומים וטקסטים.'],
  team: ['צוות', 'אחריות, תפקידים ושיוך עבודה.'],
  imports: ['ייבוא מידע', 'ייבוא לקוחות ומשימות מקבצי Excel ו-CSV.'],
  settings: ['מנהל מערכת', 'מיתוג, חיבורים, תבניות ותשתיות.'],
}

const navGroups: { label: string; items: { id: Page; label: string; icon: typeof LayoutDashboard }[] }[] = [
  { label: 'עבודה', items: [{ id: 'overview', label: 'מרכז שליטה', icon: LayoutDashboard }, { id: 'clients', label: 'לקוחות ולידים', icon: ContactRound }, { id: 'pipeline', label: 'צינור מכירות', icon: BriefcaseBusiness }] },
  { label: 'פרויקטים', items: [{ id: 'projects', label: 'פרויקטים', icon: FolderKanban }, { id: 'tasks', label: 'משימות', icon: ListChecks }, { id: 'calendar', label: 'יומן', icon: CalendarDays }, { id: 'files', label: 'קבצים', icon: FileText }] },
  { label: 'דוחות וכספים', items: [{ id: 'reports', label: 'דוחות פיקוח', icon: BarChart3 }, { id: 'finance', label: 'הצעות וחיובים', icon: CircleDollarSign }, { id: 'ai', label: 'AI', icon: Sparkles }] },
  { label: 'מערכת', items: [{ id: 'team', label: 'צוות', icon: UsersRound }, { id: 'imports', label: 'ייבוא', icon: FileInput }, { id: 'settings', label: 'מנהל מערכת', icon: Settings }] },
]

export default function App() {
  const [runtime, setRuntime] = useState<RuntimeConfig | null>(null)
  const [user, setUser] = useState<User | null | undefined>(undefined)
  const [workspace, setWorkspace] = useState<Workspace>(cloneWorkspace())
  const [orgId, setOrgId] = useState('local')
  const [role, setRole] = useState('admin')
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
    if (!user) { setLoaded(false); return }
    let active = true; setLoadError('')
    void loadOrganizationWorkspace(user.id).then((result) => {
      if (!active) return
      setOrgId(result.orgId); setRole(result.role); setWorkspace(result.workspace); setLoaded(true)
    }).catch((error) => { if (active) setLoadError(error instanceof Error ? error.message : 'טעינת הנתונים נכשלה') })
    return () => { active = false }
  }, [user?.id])

  useEffect(() => {
    if (!loaded || !user) return
    const timer = window.setTimeout(() => {
      setSaveState('saving')
      void saveOrganizationWorkspace(orgId, user.id, workspace).then(() => { setSaveState('saved'); window.setTimeout(() => setSaveState('idle'), 1200) }).catch(() => setSaveState('error'))
    }, 650)
    return () => window.clearTimeout(timer)
  }, [workspace, loaded, user?.id, orgId])

  useEffect(() => {
    if (!loaded || !orgId) return
    const channel = subscribeWorkspace(orgId, (incoming) => setWorkspace((current) => JSON.stringify(current) === JSON.stringify(incoming) ? current : incoming))
    return () => { if (channel) void getBackend()?.removeChannel(channel) }
  }, [loaded, orgId])

  const urgentCount = useMemo(() => workspace.tasks.filter((task) => !['בוצע', 'סגור'].includes(task.status) && (task.status === 'דורש מעקב' || task.priority === 'דחופה' || (task.followUpDate && new Date(task.followUpDate).getTime() < Date.now()))).length, [workspace.tasks])
  const searchResults = useMemo(() => {
    const q = search.trim().toLowerCase(); if (!q) return []
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
  if (loadError) return <div className="auth-screen"><section className="login-card"><h1>לא ניתן לטעון את סביבת העבודה</h1><div className="error-banner">{loadError}</div><p>אם זה המשתמש הראשון, ודאו שהרצתם את קובץ ה-SQL של Supabase. אם כבר קיים מנהל אחר, הוא צריך לצרף את המשתמש לארגון.</p><button className="secondary" onClick={() => window.location.reload()}>ניסיון מחדש</button></section></div>
  if (!loaded) return <div className="app-loading"><img src="/rameng-mark.svg" /><span>טוען פרויקטים...</span></div>

  if (selectedProject) return <div className="app-shell project-mode"><Sidebar page={page} setPage={(next) => { setSelectedProject(null); setPage(next) }} workspace={workspace} open={sidebarOpen} setOpen={setSidebarOpen} user={user} onLogout={() => void signOut()} /><div className="main"><Topbar search={search} setSearch={setSearch} searchResults={searchResults} urgentCount={urgentCount} onMenu={() => setSidebarOpen(true)} quickOpen={quickOpen} setQuickOpen={setQuickOpen} setPage={(next) => { setSelectedProject(null); setPage(next) }} saveState={saveState} /><main className="page-wrap project-page-wrap"><ProjectWorkspace projectId={selectedProject} workspace={workspace} setWorkspace={setWorkspace} orgId={orgId} onBack={() => { setSelectedProject(null); setPage('projects') }} /></main></div></div>

  return <div className="app-shell"><Sidebar page={page} setPage={(next) => { setPage(next); setSidebarOpen(false) }} workspace={workspace} open={sidebarOpen} setOpen={setSidebarOpen} user={user} onLogout={() => void signOut()} /><div className="main"><Topbar search={search} setSearch={setSearch} searchResults={searchResults} urgentCount={urgentCount} onMenu={() => setSidebarOpen(true)} quickOpen={quickOpen} setQuickOpen={setQuickOpen} setPage={setPage} saveState={saveState} /><main className="page-wrap"><header className="page-heading"><div><span className="eyebrow">ר.א.ם הנדסה · מערכת ניהול</span><h1>{pageInfo[page][0]}</h1><p>{pageInfo[page][1]}</p></div>{role && <span className="role-badge">{role === 'admin' ? 'מנהל מערכת' : role}</span>}</header>{page === 'overview' && <Dashboard workspace={workspace} onProject={(id) => setSelectedProject(id)} />}{page === 'clients' && <ClientsPage workspace={workspace} setWorkspace={setWorkspace} />}{page === 'pipeline' && <PipelinePage workspace={workspace} setWorkspace={setWorkspace} />}{page === 'projects' && <ProjectsPage workspace={workspace} setWorkspace={setWorkspace} onOpen={(id) => setSelectedProject(id)} />}{page === 'tasks' && <section className="card board-card"><TaskBoard workspace={workspace} setWorkspace={setWorkspace} onEmail={(task) => { if (task.projectId) { setSelectedProject(task.projectId); setPage('projects') } }} /></section>}{page === 'calendar' && <CalendarPage workspace={workspace} setWorkspace={setWorkspace} />}{page === 'files' && <FilesPage workspace={workspace} setWorkspace={setWorkspace} orgId={orgId} />}{page === 'finance' && <FinancePage workspace={workspace} setWorkspace={setWorkspace} />}{page === 'reports' && <ReportsPage workspace={workspace} setWorkspace={setWorkspace} orgId={orgId} />}{page === 'ai' && <AIStudio />}{page === 'team' && <TeamPage workspace={workspace} setWorkspace={setWorkspace} />}{page === 'imports' && <ImportCenter workspace={workspace} setWorkspace={setWorkspace} />}{page === 'settings' && <SettingsPage workspace={workspace} setWorkspace={setWorkspace} />}</main></div></div>
}

function Sidebar({ page, setPage, workspace, open, setOpen, user, onLogout }: { page: Page; setPage: (page: Page) => void; workspace: Workspace; open: boolean; setOpen: (value: boolean) => void; user: User; onLogout: () => void }) {
  return <><div className={`sidebar-overlay ${open ? 'show' : ''}`} onClick={() => setOpen(false)} /><aside className={`sidebar ${open ? 'open' : ''}`}><div className="brand"><img src={workspace.settings.logoUrl || '/rameng-mark.svg'} /><div><strong>{workspace.settings.organizationShortName}</strong><span>ניהול ופיקוח</span></div><button className="sidebar-close" onClick={() => setOpen(false)}><X /></button></div><nav>{navGroups.map((group) => <div className="nav-group" key={group.label}><span className="nav-label">{group.label}</span>{group.items.map((item) => { const Icon = item.icon; const count = item.id === 'tasks' ? workspace.tasks.filter((task) => !['בוצע', 'סגור'].includes(task.status)).length : item.id === 'projects' ? workspace.projects.filter((project) => project.status === 'בביצוע').length : 0; return <button key={item.id} className={page === item.id ? 'active' : ''} onClick={() => setPage(item.id)}><Icon /><span>{item.label}</span>{count > 0 && <em>{count}</em>}</button> })}</div>)}</nav><div className="sidebar-footer"><div className="profile"><span className="avatar">{(user.email || 'R').slice(0, 2).toUpperCase()}</span><div><strong>{user.email}</strong><small>מחובר</small></div><button className="icon-btn" onClick={onLogout} title="יציאה"><LogOut /></button></div><a href={workspace.settings.website} target="_blank" rel="noreferrer">{workspace.settings.website.replace(/^https?:\/\//, '')}</a></div></aside></>
}

type SearchResult = { id: string; type: string; label: string; detail: string; action: () => void }
function Topbar({ search, setSearch, searchResults, urgentCount, onMenu, quickOpen, setQuickOpen, setPage, saveState }: { search: string; setSearch: (value: string) => void; searchResults: SearchResult[]; urgentCount: number; onMenu: () => void; quickOpen: boolean; setQuickOpen: (value: boolean) => void; setPage: (page: Page) => void; saveState: string }) {
  return <header className="topbar"><button className="mobile-menu icon-btn" onClick={onMenu}><Menu /></button><div className="global-search"><Search /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="חיפוש בפרויקטים, משימות ולקוחות..." />{search && <button className="search-clear" onClick={() => setSearch('')}><X /></button>}{search && <div className="search-results">{searchResults.map((result) => <button key={`${result.type}-${result.id}`} onClick={() => { result.action(); setSearch('') }}><span>{result.type}</span><div><strong>{result.label}</strong><small>{result.detail}</small></div></button>)}{!searchResults.length && <div>לא נמצאו תוצאות</div>}</div>}</div><div className={`save-indicator ${saveState}`}>{saveState === 'saving' ? 'שומר...' : saveState === 'saved' ? 'נשמר' : saveState === 'error' ? 'שגיאת שמירה' : ''}</div><button className="notification icon-btn" title={`${urgentCount} נושאים דורשים טיפול`} onClick={() => setPage('overview')}><Bell />{urgentCount > 0 && <i>{urgentCount > 9 ? '9+' : urgentCount}</i>}</button><div className="quick-wrap"><button className="primary quick-button" onClick={() => setQuickOpen(!quickOpen)}>חדש <ChevronDown /></button>{quickOpen && <div className="quick-menu"><button onClick={() => { setPage('projects'); setQuickOpen(false) }}><FolderKanban /> פרויקט חדש</button><button onClick={() => { setPage('clients'); setQuickOpen(false) }}><ContactRound /> לקוח חדש</button><button onClick={() => { setPage('tasks'); setQuickOpen(false) }}><ListChecks /> משימה חדשה</button><button onClick={() => { setPage('reports'); setQuickOpen(false) }}><BarChart3 /> דוח פיקוח</button></div>}</div></header>
}
