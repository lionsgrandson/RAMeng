import { useMemo, useState, type FormEvent } from 'react'
import * as XLSX from '@e965/xlsx'
import { AlertTriangle, ArrowLeft, ArrowRight, BriefcaseBusiness, CalendarDays, CircleDollarSign, FileSpreadsheet, ListChecks, Plus, Search, Sparkles, Upload, UsersRound } from 'lucide-react'
import type { Contact, Deal, DealStage, Quote, TeamMember, Workspace } from '../types'
import { integrationsApi } from '../lib/api'
import { Chip, EmptyState, Field, Modal, dateLabel, money, nowIso, uid } from './common'

type DashboardPage = 'clients' | 'projects' | 'tasks' | 'calendar' | 'reports'
export function Dashboard({ workspace, onProject, onTask, onReport, onPage, onCreate, onUrgent, canCreate }: { workspace: Workspace; onProject: (id: string) => void; onTask: (id: string) => void; onReport: (reportId: string, itemId: string) => void; onPage: (page: DashboardPage) => void; onCreate: (page: DashboardPage) => void; onUrgent: () => void; canCreate: Partial<Record<DashboardPage, boolean>> }) {
  const openTasks = workspace.tasks.filter((task) => !['בוצע', 'סגור'].includes(task.status))
  const urgentTasks = openTasks.filter((task) => task.status === 'דורש מעקב' || task.priority === 'דחופה' || (task.followUpDate && new Date(task.followUpDate).getTime() < Date.now()))
  const openReportItems = workspace.reports.flatMap((report) => report.sections.flatMap((section) => section.items.map((item) => ({ ...item, report })))).filter((item) => !['בוצע', 'תקין', 'סגור'].includes(item.status))
  const activeProjects = [...workspace.projects].filter((project) => project.status !== 'הושלם').sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const upcoming = workspace.events.filter((event) => new Date(event.start).getTime() >= Date.now()).length

  return <>
    {Object.values(canCreate).some(Boolean) && <div className="dashboard-actions" aria-label="פעולות מהירות"><span>מה רוצים לעשות?</span>{canCreate.tasks && <button type="button" className="primary" onClick={() => onCreate('tasks')}><Plus /> משימה חדשה</button>}{canCreate.projects && <button type="button" className="secondary" onClick={() => onCreate('projects')}><Plus /> פרויקט חדש</button>}{canCreate.clients && <button type="button" className="secondary" onClick={() => onCreate('clients')}><Plus /> לקוח חדש</button>}{canCreate.reports && <button type="button" className="secondary" onClick={() => onCreate('reports')}><Plus /> דוח חדש</button>}{canCreate.calendar && <button type="button" className="secondary" onClick={() => onCreate('calendar')}><Plus /> אירוע חדש</button>}</div>}
    <div className="metric-grid dashboard-metrics">
      <button type="button" className="metric card metric-link" onClick={() => onPage('projects')}><span className="metric-icon brand"><BriefcaseBusiness /></span><div><small>פרויקטים</small><strong>{activeProjects.length}</strong></div></button>
      <button type="button" className="metric card metric-link" onClick={onUrgent}><span className="metric-icon warn"><AlertTriangle /></span><div><small>משימות לטיפול</small><strong>{urgentTasks.length}</strong></div></button>
      <button type="button" className="metric card metric-link" onClick={() => onPage('tasks')}><span className="metric-icon good"><ListChecks /></span><div><small>משימות</small><strong>{openTasks.length}</strong></div></button>
      <button type="button" className="metric card metric-link" onClick={() => onPage('calendar')}><span className="metric-icon neutral"><CalendarDays /></span><div><small>יומן</small><strong>{upcoming}</strong></div></button>
    </div>
    <div className="dashboard-grid compact-dashboard">
      <section className="card"><div className="card-head"><h2>פרויקטים אחרונים</h2><button type="button" className="text-button" onClick={() => onPage('projects')}>כל הפרויקטים</button></div><div className="card-body project-health-list">{activeProjects.length ? activeProjects.slice(0, 10).map((project) => {
        const tasks = openTasks.filter((task) => task.projectId === project.id)
        const urgent = tasks.filter((task) => task.priority === 'דחופה' || task.status === 'דורש מעקב').length
        return <button className="project-health" key={project.id} onClick={() => onProject(project.id)}><div className="project-health-main"><strong>{project.address || project.name}</strong><span>{project.name}</span></div><div className="project-progress-cell"><div className="progress"><i style={{ width: `${project.progress}%` }} /></div><span>{project.progress}%</span></div><div className={`project-task-count ${urgent ? 'urgent' : ''}`}><b>{tasks.length}</b><span>משימות</span>{urgent > 0 && <small>{urgent} לטיפול</small>}</div></button>
      }) : <EmptyState title="אין פרויקטים" text="צרו פרויקט ראשון." />}</div></section>
      <section className="card"><div className="card-head"><h2>דורש טיפול</h2><button type="button" className="text-button" onClick={onUrgent}>כל המשימות לטיפול</button></div><div className="card-body attention-list">{[
        ...urgentTasks.slice(0, 6).map((task) => ({ id: task.id, title: task.title, text: dateLabel(task.followUpDate), tone: 'bad' as const, action: () => onTask(task.id) })),
        ...openReportItems.slice(0, 6).map((item) => ({ id: `${item.report.id}-${item.id}`, title: item.description, text: item.report.title, tone: 'warn' as const, action: () => onReport(item.report.id, item.id) })),
      ].slice(0, 10).map((item) => <button type="button" className="attention-item attention-action" key={item.id} onClick={item.action}><span className={`dot ${item.tone}`} /><div><strong>{item.title}</strong><small>{item.text}</small></div><ArrowLeft aria-hidden="true" /></button>)}{!urgentTasks.length && !openReportItems.length && <EmptyState title="הכול מעודכן" text="אין כרגע פריטים דחופים." />}</div></section>
    </div>
  </>
}

export function ClientsPage({ workspace, setWorkspace }: { workspace: Workspace; setWorkspace: React.Dispatch<React.SetStateAction<Workspace>> }) {
  const [editing, setEditing] = useState<Contact | null>(null)
  const [query, setQuery] = useState('')
  const rows = workspace.contacts.filter((contact) => !query || `${contact.name} ${contact.company || ''} ${contact.email || ''} ${contact.phone || ''}`.toLowerCase().includes(query.toLowerCase()))
  const save = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const data = new FormData(event.currentTarget)
    const next: Contact = { id: editing?.id || uid('contact'), name: String(data.get('name') || ''), company: String(data.get('company') || ''), phone: String(data.get('phone') || ''), email: String(data.get('email') || ''), status: String(data.get('status') || 'פעיל') as Contact['status'], tags: String(data.get('tags') || '').split(',').map((value) => value.trim()).filter(Boolean), notes: String(data.get('notes') || ''), createdAt: editing?.createdAt || nowIso() }
    setWorkspace((current) => ({ ...current, contacts: editing?.id ? current.contacts.map((item) => item.id === editing.id ? next : item) : [...current.contacts, next] })); setEditing(null)
  }
  return <section className="card"><div className="card-head"><div><h2>לקוחות ולידים</h2><p>אנשי קשר, פרטי תקשורת, תגיות והערות</p></div><button className="primary" onClick={() => setEditing({ id: '', name: '', status: 'פעיל', tags: [], createdAt: nowIso() })}><Plus /> לקוח חדש</button></div><div className="list-toolbar"><div className="search-box"><Search /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="חיפוש לקוח..." /></div></div><div className="table-scroll"><table className="data-table"><thead><tr><th>שם</th><th>חברה</th><th>טלפון</th><th>מייל</th><th>סטטוס</th><th>תגיות</th></tr></thead><tbody>{rows.map((contact) => <tr key={contact.id} onClick={() => setEditing(contact)} className="click-row"><td><strong>{contact.name}</strong></td><td>{contact.company}</td><td>{contact.phone}</td><td>{contact.email}</td><td><Chip tone={contact.status === 'פעיל' ? 'good' : 'neutral'}>{contact.status}</Chip></td><td>{contact.tags.join(', ')}</td></tr>)}</tbody></table>{!rows.length && <EmptyState title="אין לקוחות להצגה" text="הוסיפו לקוח ידנית או ייבאו קובץ Excel/CSV." />}</div>
    {editing && <Modal title={editing.id ? 'עריכת לקוח' : 'לקוח חדש'} onClose={() => setEditing(null)}><form className="form-grid" onSubmit={save}><Field label="שם"><input name="name" required defaultValue={editing.name} /></Field><Field label="חברה"><input name="company" defaultValue={editing.company} /></Field><Field label="טלפון"><input name="phone" defaultValue={editing.phone} /></Field><Field label="מייל"><input name="email" type="email" defaultValue={editing.email} /></Field><Field label="סטטוס"><select name="status" defaultValue={editing.status}><option>ליד</option><option>פעיל</option><option>בהמתנה</option><option>לא פעיל</option></select></Field><Field label="תגיות"><input name="tags" defaultValue={editing.tags.join(', ')} placeholder="יזם, דיירים, קבלן" /></Field><Field label="הערות"><textarea name="notes" defaultValue={editing.notes} rows={4} /></Field><div className="form-actions"><button className="secondary" type="button" onClick={() => setEditing(null)}>ביטול</button><button className="primary" type="submit">שמירה</button></div></form></Modal>}
  </section>
}

const stages: DealStage[] = ['חדש', 'פגישה', 'הצעה', 'משא ומתן', 'זכייה', 'נסגר']
export function PipelinePage({ workspace, setWorkspace }: { workspace: Workspace; setWorkspace: React.Dispatch<React.SetStateAction<Workspace>> }) {
  const [adding, setAdding] = useState(false)
  const move = (deal: Deal, delta: number) => { const index = stages.indexOf(deal.stage); const stage = stages[Math.max(0, Math.min(stages.length - 1, index + delta))]; setWorkspace((current) => ({ ...current, deals: current.deals.map((item) => item.id === deal.id ? { ...item, stage } : item) })) }
  const submit = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const data = new FormData(event.currentTarget); setWorkspace((current) => ({ ...current, deals: [...current.deals, { id: uid('deal'), title: String(data.get('title') || ''), contactId: String(data.get('contactId') || '') || undefined, amount: Number(data.get('amount') || 0), stage: 'חדש', probability: 20, nextAction: String(data.get('nextAction') || '') }] })); setAdding(false) }
  return <><div className="page-action-row"><button className="primary" onClick={() => setAdding(true)}><Plus /> הזדמנות חדשה</button></div><div className="kanban">{stages.map((stage) => <section className="kanban-column" key={stage}><header><strong>{stage}</strong><span>{workspace.deals.filter((deal) => deal.stage === stage).length}</span></header><div>{workspace.deals.filter((deal) => deal.stage === stage).map((deal) => <article className="deal-card" key={deal.id}><strong>{deal.title}</strong><p>{workspace.contacts.find((contact) => contact.id === deal.contactId)?.name || 'ללא לקוח'}</p><b>{money(deal.amount)}</b><small>{deal.nextAction || 'לא הוגדרה פעולה הבאה'}</small><footer><button className="icon-btn" disabled={stage === stages[0]} onClick={() => move(deal, -1)}><ArrowRight /></button><button className="icon-btn" disabled={stage === stages[stages.length - 1]} onClick={() => move(deal, 1)}><ArrowLeft /></button></footer></article>)}</div></section>)}</div>{adding && <Modal title="הזדמנות חדשה" onClose={() => setAdding(false)}><form className="form-grid" onSubmit={submit}><Field label="שם ההזדמנות"><input name="title" required /></Field><Field label="לקוח"><select name="contactId"><option value="">ללא</option>{workspace.contacts.map((contact) => <option key={contact.id} value={contact.id}>{contact.name}</option>)}</select></Field><Field label="סכום"><input name="amount" type="number" min="0" /></Field><Field label="פעולה הבאה"><input name="nextAction" /></Field><div className="form-actions"><button className="primary">שמירה</button></div></form></Modal>}</>
}

export function FinancePage({ workspace, setWorkspace }: { workspace: Workspace; setWorkspace: React.Dispatch<React.SetStateAction<Workspace>> }) {
  const [adding, setAdding] = useState(false)
  const total = workspace.quotes.reduce((sum, quote) => sum + quote.amount, 0); const paid = workspace.quotes.reduce((sum, quote) => sum + quote.paidAmount, 0)
  const submit = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const data = new FormData(event.currentTarget); const quote: Quote = { id: uid('quote'), number: String(data.get('number') || `R-${new Date().getFullYear()}-${workspace.quotes.length + 1}`), title: String(data.get('title') || ''), amount: Number(data.get('amount') || 0), status: 'טיוטה', issuedAt: new Date().toISOString().slice(0, 10), paidAmount: 0, contactId: String(data.get('contactId') || '') || undefined, projectId: String(data.get('projectId') || '') || undefined }; setWorkspace((current) => ({ ...current, quotes: [...current.quotes, quote] })); setAdding(false) }
  return <><div className="metric-grid two"><article className="metric card"><span className="metric-icon brand"><CircleDollarSign /></span><div><small>הצעות / חיובים</small><strong>{money(total)}</strong><p>{workspace.quotes.length} מסמכים</p></div></article><article className="metric card"><span className="metric-icon good"><CircleDollarSign /></span><div><small>שולם</small><strong>{money(paid)}</strong><p>{money(Math.max(0, total - paid))} פתוח</p></div></article></div><section className="card"><div className="card-head"><div><h2>הצעות מחיר וחיובים</h2><p>ניהול מסמכים וסטטוס תשלום</p></div><button className="primary" onClick={() => setAdding(true)}><Plus /> מסמך חדש</button></div><div className="table-scroll"><table className="data-table"><thead><tr><th>מספר</th><th>כותרת</th><th>לקוח / פרויקט</th><th>סכום</th><th>שולם</th><th>סטטוס</th></tr></thead><tbody>{workspace.quotes.map((quote) => <tr key={quote.id}><td>{quote.number}</td><td><strong>{quote.title}</strong></td><td>{workspace.projects.find((project) => project.id === quote.projectId)?.name || workspace.contacts.find((contact) => contact.id === quote.contactId)?.name}</td><td>{money(quote.amount)}</td><td><input className="cell-input money-input" type="number" value={quote.paidAmount} onChange={(e) => setWorkspace((current) => ({ ...current, quotes: current.quotes.map((item) => item.id === quote.id ? { ...item, paidAmount: Number(e.target.value) } : item) }))} /></td><td><select className="cell-input" value={quote.status} onChange={(e) => setWorkspace((current) => ({ ...current, quotes: current.quotes.map((item) => item.id === quote.id ? { ...item, status: e.target.value as Quote['status'] } : item) }))}><option>טיוטה</option><option>נשלחה</option><option>אושרה</option><option>נדחתה</option><option>שולמה חלקית</option><option>שולמה</option></select></td></tr>)}</tbody></table>{!workspace.quotes.length && <EmptyState title="אין מסמכים פיננסיים" text="ניתן לשמור הצעות מחיר, סכומים וסטטוסי תשלום במערכת." />}</div></section>{adding && <Modal title="מסמך פיננסי חדש" onClose={() => setAdding(false)}><form className="form-grid" onSubmit={submit}><Field label="כותרת"><input name="title" required /></Field><Field label="מספר"><input name="number" placeholder="נוצר אוטומטית אם ריק" /></Field><Field label="סכום"><input name="amount" type="number" min="0" required /></Field><Field label="לקוח"><select name="contactId"><option value="">ללא</option>{workspace.contacts.map((contact) => <option key={contact.id} value={contact.id}>{contact.name}</option>)}</select></Field><Field label="פרויקט"><select name="projectId"><option value="">ללא</option>{workspace.projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></Field><div className="form-actions"><button className="primary">שמירה</button></div></form></Modal>}</>
}

export function TeamPage({ workspace, setWorkspace }: { workspace: Workspace; setWorkspace: React.Dispatch<React.SetStateAction<Workspace>> }) {
  const [adding, setAdding] = useState(false)
  const submit = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const data = new FormData(event.currentTarget); const member: TeamMember = { id: uid('member'), name: String(data.get('name') || ''), email: String(data.get('email') || ''), role: String(data.get('role') || 'מפקח') as TeamMember['role'], active: true }; setWorkspace((current) => ({ ...current, team: [...current.team, member] })); setAdding(false) }
  return <section className="card"><div className="card-head"><div><h2>צוות והרשאות</h2><p>אחראים למשימות, תפקידים ונראות</p></div><button className="primary" onClick={() => setAdding(true)}><Plus /> איש צוות</button></div><div className="team-grid">{workspace.team.map((member) => <article className="team-card" key={member.id}><span className="avatar large">{member.name.slice(0, 2)}</span><strong>{member.name}</strong><span>{member.email}</span><Chip tone={member.active ? 'good' : 'neutral'}>{member.role}</Chip><label className="switch-line"><input type="checkbox" checked={member.active} onChange={(e) => setWorkspace((current) => ({ ...current, team: current.team.map((item) => item.id === member.id ? { ...item, active: e.target.checked } : item) }))} /> פעיל</label></article>)}{!workspace.team.length && <EmptyState title="הצוות עדיין ריק" text="הוסיפו את האנשים שיופיעו כאחראים במשימות ובדוחות." />}</div>{adding && <Modal title="איש צוות חדש" onClose={() => setAdding(false)}><form className="form-grid" onSubmit={submit}><Field label="שם"><input name="name" required /></Field><Field label="מייל"><input name="email" type="email" required /></Field><Field label="תפקיד"><select name="role"><option>מנהל</option><option>מפקח</option><option>מהנדס</option><option>משרד</option><option>צפייה</option></select></Field><div className="form-actions"><button className="primary">שמירה</button></div></form></Modal>}</section>
}

export function ImportCenter({ workspace, setWorkspace }: { workspace: Workspace; setWorkspace: React.Dispatch<React.SetStateAction<Workspace>> }) {
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const importFile = async (file: File, kind: 'contacts' | 'tasks') => {
    setMessage('')
    setError('')
    try {
      const buffer = await file.arrayBuffer()
      const workbook = XLSX.read(buffer, { type: 'array' })
      const firstName = workbook.SheetNames[0]
      if (!firstName) throw new Error('הקובץ לא מכיל גיליון נתונים')
      const first = workbook.Sheets[firstName]
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(first, { defval: '' })
      if (!rows.length) throw new Error('לא נמצאו שורות לייבוא')

      if (kind === 'contacts') {
        const contacts: Contact[] = rows.map((row) => ({ id: uid('contact'), name: String(row['שם'] || row.name || row.Name || ''), company: String(row['חברה'] || row.company || ''), phone: String(row['טלפון'] || row.phone || ''), email: String(row['מייל'] || row.email || ''), status: 'פעיל', tags: [], createdAt: nowIso() })).filter((item) => item.name)
        if (!contacts.length) throw new Error('לא נמצאה עמודת שם תקינה')
        setWorkspace((current) => ({ ...current, contacts: [...current.contacts, ...contacts] }))
        setMessage(`יובאו ${contacts.length} לקוחות`)
      } else {
        const tasks = rows.map((row, index) => ({ id: uid('task'), projectId: String(row['projectId'] || '') || undefined, title: String(row['משימה'] || row.title || row.Task || ''), description: String(row['הערות'] || row.notes || ''), status: String(row['סטטוס'] || 'טרם התחיל'), priority: 'רגילה' as const, startDate: String(row['תאריך התחלה'] || '') || undefined, followUpDate: String(row['מועד מעקב'] || row['תאריך סיום'] || '') || undefined, emailTo: String(row['מייל'] || '') || undefined, custom: {}, order: workspace.tasks.length + index + 1, createdAt: nowIso() })).filter((item) => item.title)
        if (!tasks.length) throw new Error('לא נמצאה עמודת משימה תקינה')
        setWorkspace((current) => ({ ...current, tasks: [...current.tasks, ...tasks] }))
        setMessage(`יובאו ${tasks.length} משימות`)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'ייבוא הקובץ נכשל')
    }
  }

  const onPick = (event: React.ChangeEvent<HTMLInputElement>, kind: 'contacts' | 'tasks') => {
    const file = event.currentTarget.files?.[0]
    event.currentTarget.value = ''
    if (file) void importFile(file, kind)
  }

  return <div className="import-grid">
    <section className="card import-card"><span><UsersRound /></span><h2>ייבוא לקוחות</h2><p>Excel או CSV עם עמודות שם, חברה, טלפון ומייל.</p><label className="upload-button"><Upload /> בחירת קובץ<input aria-label="ייבוא קובץ לקוחות" type="file" accept=".xlsx,.xls,.csv" onChange={(e) => onPick(e, 'contacts')} /></label></section>
    <section className="card import-card"><span><ListChecks /></span><h2>ייבוא משימות</h2><p>Excel או CSV עם משימה, סטטוס, תאריכים, הערות ומייל.</p><label className="upload-button"><FileSpreadsheet /> בחירת קובץ<input aria-label="ייבוא קובץ משימות" type="file" accept=".xlsx,.xls,.csv" onChange={(e) => onPick(e, 'tasks')} /></label></section>
    {message && <div className="success-banner" role="status">{message}</div>}
    {error && <div className="error-banner" role="alert">{error}</div>}
  </div>
}

export function AIStudio() {
  const [input, setInput] = useState(''); const [output, setOutput] = useState(''); const [loading, setLoading] = useState(false); const [error, setError] = useState('')
  const run = async () => { if (!input.trim()) return; setLoading(true); setError(''); try { const result = await integrationsApi.rewrite(input, 'general'); setOutput(result.text) } catch (e) { setError(e instanceof Error ? e.message : 'שגיאה') } finally { setLoading(false) } }
  return <section className="card ai-studio"><div className="card-head"><div><h2><Sparkles /> סטודיו AI</h2><p>ניסוח, סיכום וניקוי טקסטים באמצעות OpenAI דרך השרת המאובטח.</p></div></div><div className="ai-columns"><div><label>טקסט מקור</label><textarea rows={14} value={input} onChange={(e) => setInput(e.target.value)} placeholder="הדביקו הערת פיקוח, סיכום פגישה או טקסט למייל..." /><button className="primary" disabled={loading || !input.trim()} onClick={() => void run()}>{loading ? 'מעבד...' : 'ניסוח מחדש'}</button></div><div><label>תוצאה</label><div className="ai-output">{output || 'התוצאה תופיע כאן.'}</div>{output && <button className="secondary" onClick={() => void navigator.clipboard.writeText(output)}>העתקה</button>}</div></div>{error && <div className="error-banner">{error}</div>}</section>
}
