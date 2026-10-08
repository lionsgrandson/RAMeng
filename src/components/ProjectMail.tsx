import { useEffect, useRef, useState } from 'react'
import { integrationsApi, type GmailApiMessage, type ProjectMailLink } from '../lib/api'
import type { Project, Task, Workspace } from '../types'
import type { AreaPermissions } from '../lib/permissions'
import EmailMessage, { emailAddressLabel, emailText } from './EmailMessage'
import { MailComposer } from './GoogleCommunication'
import { dateTimeLabel, EmptyState, uid, nowIso } from './common'
import DeleteButton from './RecordDelete'

export default function ProjectMail({ workspace, orgId, project, initialTask, permissions, onProject, setWorkspace, canCreateTask = false, initialCategoryFilter = '' }: {
  initialCategoryFilter?: string; setWorkspace?: React.Dispatch<React.SetStateAction<Workspace>>; canCreateTask?: boolean; workspace: Workspace; orgId: string; project?: Project; initialTask?: Task | null; permissions: AreaPermissions; onProject?: (id: string) => void
}) {
  const [categoryIds, setCategoryIds] = useState<string[]>([])
  const [categoryFilter, setCategoryFilter] = useState(initialCategoryFilter)
  const [search, setSearch] = useState('')
  const [unreadCount, setUnreadCount] = useState<number | null>(null)
  const [links, setLinks] = useState<ProjectMailLink[]>([])
  const [inbox, setInbox] = useState<GmailApiMessage[]>([])
  const [messages, setMessages] = useState<GmailApiMessage[]>([])
  const [selected, setSelected] = useState('')
  const [threadReload, setThreadReload] = useState(0)
  const [projectId, setProjectId] = useState(project?.id || '')
  const [taskId, setTaskId] = useState(initialTask?.id || '')
  const [composing, setComposing] = useState(!!initialTask)
  const [composeBusy, setComposeBusy] = useState(false)
  const [pageToken, setPageToken] = useState('')
  const [busy, setBusy] = useState(false); const [loadingThread, setLoadingThread] = useState(false)
  const [error, setError] = useState(''); const [notice, setNotice] = useState('')
  const [createdTaskId, setCreatedTaskId] = useState('')
  const [retryThread, setRetryThread] = useState('')
  const generation = useRef(0); const operation = useRef(false)
  const tasks = workspace.tasks.filter(task => task.projectId === projectId)
  const association = links.find(link => link.threadId === selected && link.orgId === orgId)
  const refresh = async (more = false) => {
    const version = ++generation.current; setBusy(true); setError('')
    try {
      const result = workspace.projects.length ? await integrationsApi.projectMailLinks() : { links: [] }
      if (version !== generation.current) return
      // Include old task links without modifying or discarding the existing records.
      const legacy = await integrationsApi.gmailLinks()
      const compatible = Object.entries(legacy.links).flatMap(([taskId, link]) => {
        const task = workspace.tasks.find(task => task.id === taskId)
        if (!task?.projectId || result.links.some(item => item.threadId === link.threadId)) return []
        return [{ orgId, projectId: task.projectId, taskId, threadId: link.threadId, subject: task.title, from: '', to: link.to, date: '', snippet: '' }]
      })
      if (version !== generation.current) return
      setLinks([...result.links, ...compatible])
      if (!project) {
        const next = await integrationsApi.inbox(more ? pageToken : '')
        if (version !== generation.current) return
        setInbox(current => more ? [...current, ...next.messages.filter(message => !current.some(item => item.id === message.id))] : next.messages)
        setPageToken(next.nextPageToken); setUnreadCount(next.unreadCount); window.dispatchEvent(new CustomEvent('rameng-mail-count', { detail: next.unreadCount }))
      }
    } catch (e) { if (version === generation.current) setError(e instanceof Error ? e.message : 'טעינת המיילים נכשלה') }
    finally { if (version === generation.current) setBusy(false) }
  }
  useEffect(() => { void refresh(); return () => { generation.current++ } }, [project?.id, orgId])
  useEffect(() => {
    const refreshMail = () => { if (!operation.current) void refresh() }
    const timer = window.setInterval(refreshMail, 60000)
    window.addEventListener('rameng-google-synced', refreshMail)
    return () => { window.clearInterval(timer); window.removeEventListener('rameng-google-synced', refreshMail) }
  }, [project?.id, orgId])
  useEffect(() => {
    let active = true; setMessages([]); setLoadingThread(!!selected)
    if (selected) void integrationsApi.gmailThread(selected, true).then(async result => {
      if (!active) return
      setMessages(result.messages)
      if (result.messages.some(message => message.unread)) {
        try { const state = await integrationsApi.readMail(selected); if (!active) return; setMessages(result.messages.map(message => ({ ...message, unread: false }))); setInbox(current => current.map(message => message.threadId === selected ? { ...message, unread: false } : message)); setLinks(current => current.map(link => link.threadId === selected ? { ...link, unread: false } : link)); if (state.unreadCount !== null) { setUnreadCount(state.unreadCount); window.dispatchEvent(new CustomEvent('rameng-mail-count', { detail: state.unreadCount })) } } catch (e) { if (active) setError(e instanceof Error ? e.message : 'סנכרון הקריאה נכשל') }
      }
    }).catch(e => { if (active) setError(e.message) }).finally(() => { if (active) setLoadingThread(false) })
    return () => { active = false }
  }, [selected, threadReload])
  const open = (threadId: string) => {
    if (composeBusy) return
    const link = links.find(item => item.threadId === threadId && item.orgId === orgId)
    setCreatedTaskId(''); setSelected(threadId); setComposing(false); setError(''); setNotice('')
    setProjectId(project?.id || link?.projectId || ''); setTaskId(link?.taskId || ''); setCategoryIds(link?.categoryIds || [])
  }
  const assign = async (threadId = selected) => {
    if (operation.current || composeBusy || !projectId || !threadId) return
    operation.current = true; setBusy(true); setError(''); setNotice('')
    try {
      const { link } = await integrationsApi.linkProjectMail({ orgId, projectId, taskId: taskId || null, categoryIds, threadId })
      setLinks(current => [...current.filter(item => item.threadId !== threadId), link]); setRetryThread(''); setNotice('ההתכתבות שויכה לפרויקט בהצלחה')
    } catch (e) { setError(e instanceof Error ? e.message : 'שמירת השיוך נכשלה') }
    finally { operation.current = false; setBusy(false) }
  }
  const baseRows = project ? links.filter(link => link.projectId === project.id && link.orgId === orgId).sort((a, b) => b.date.localeCompare(a.date)) : inbox
  const rows = baseRows.filter(row => `${row.subject} ${row.from} ${row.snippet}`.toLowerCase().includes(search.toLowerCase()) && (!categoryFilter || links.find(link => link.threadId === row.threadId)?.categoryIds?.includes(categoryFilter)))
  const availableCategories = workspace.categories.filter(category => workspace.projects.find(item => item.id === projectId)?.categoryIds?.includes(category.id))
  return <section className="card contact-mail">
    <div className="card-head"><div><h2>{project ? 'תקשורת מייל בפרויקט' : `דואר נכנס${unreadCount === null ? '' : ` (${unreadCount})`}`}</h2><small>Gmail מהחשבון שלך · שיוך התכתבות לפרויקט עם משימה אופציונלית</small></div><div><button type="button" className="secondary" disabled={busy} onClick={() => { void refresh(); setThreadReload(value => value + 1) }}>{busy ? 'טוען...' : 'רענון'}</button>{project && permissions.create && <button type="button" className="primary" disabled={composeBusy} onClick={() => { setSelected(''); setProjectId(project.id); setTaskId(''); setComposing(true) }}>מייל חדש בפרויקט</button>}</div></div>
    {error && <div className="error-banner" role="alert">{error}</div>}{notice && <div className="success-banner" role="status">{notice}</div>}
    {retryThread && <button type="button" className="secondary" disabled={busy} onClick={() => void assign(retryThread)}>המייל נשלח — ניסיון נוסף לשמירת השיוך</button>}
    <div className="toolbar"><input aria-label="חיפוש מיילים" placeholder="חיפוש מיילים" value={search} onChange={event => setSearch(event.target.value)} /><select aria-label="סינון מייל לפי מקצוע" value={categoryFilter} onChange={event => setCategoryFilter(event.target.value)}><option value="">כל המקצועות</option>{workspace.categories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}</select></div>
    <div className="contact-mail-layout"><div className="contact-thread-list">
      {rows.map(row => <button type="button" key={'id' in row ? row.id : row.threadId} className={selected === row.threadId ? 'active' : ''} onClick={() => open(row.threadId)}><strong dir="auto">{row.unread ? '● ' : ''}{emailText(row.subject) || 'ללא נושא'}</strong><small dir="auto">{emailAddressLabel(row.from)} → {emailAddressLabel(row.to)}</small><small>{dateTimeLabel(row.date)} · {row.incoming === false ? 'נשלח' : 'התקבל'} {row.unread ? '· לא נקרא' : ''}</small><p dir="auto">{emailText(row.snippet)}</p>{(() => { const link = links.find(link => link.threadId === row.threadId && link.orgId === orgId); const linkedProject = workspace.projects.find(item => item.id === link?.projectId); return linkedProject ? <small>פרויקט: {linkedProject.name}{link?.taskId ? ` · ${workspace.tasks.find(task => task.id === link.taskId)?.title || 'משימה'}` : ''}</small> : null })()}</button>)}
      {!rows.length && !busy && <EmptyState title="אין מיילים להצגה" text={project ? 'שלחו מייל חדש או שייכו התכתבות מתיבת הדואר הנכנס.' : 'אין הודעות נכנסות בחשבון Google המחובר.'} />}
      {!project && pageToken && <button type="button" className="secondary" disabled={busy} onClick={() => void refresh(true)}>הודעות נוספות</button>}
    </div><div className="contact-thread-body">
      {association && <div><p>פרויקט: {onProject ? <button type="button" className="secondary" onClick={() => onProject(association.projectId)}>{workspace.projects.find(item => item.id === association.projectId)?.name || 'פרויקט משויך'}</button> : workspace.projects.find(item => item.id === association.projectId)?.name || 'פרויקט משויך'}</p>{permissions.delete && <DeleteButton label="ביטול שיוך ההתכתבות" message="לבטל את שיוך ההתכתבות לפרויקט? הודעות Gmail יישמרו." onConfirm={() => {
        if (operation.current) return; operation.current = true; setBusy(true)
        void (async () => { try { await integrationsApi.unlinkProjectMail({ ...association, orgId }); if (association.taskId) await integrationsApi.unlinkGmailTask(association.taskId); setLinks(current => current.filter(link => link.threadId !== selected)); setNotice('השיוך בוטל') } catch (e) { setError(e instanceof Error ? e.message : 'ביטול השיוך נכשל') } finally { operation.current = false; setBusy(false) } })()
      }} />}</div>}
      {(selected || composing) && <div className="mail-assignment">
        <label>פרויקט<select aria-label="פרויקט לשיוך מייל" value={projectId} disabled={!!project || busy || composeBusy || !permissions.edit} onChange={event => { setProjectId(event.target.value); setTaskId(''); setCategoryIds([]) }}><option value="">בחירת פרויקט</option>{workspace.projects.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label>משימה (אופציונלי)<select aria-label="משימה לשיוך מייל" value={taskId} disabled={!projectId || busy || composeBusy || (!permissions.edit && !composing)} onChange={event => setTaskId(event.target.value)}><option value="">ללא משימה</option>{tasks.map(task => <option key={task.id} value={task.id}>{task.title}</option>)}</select></label>
        <div><span>מקצועות (אופציונלי)</span>{availableCategories.map(category => <label key={category.id}><input type="checkbox" disabled={!permissions.edit || busy} checked={categoryIds.includes(category.id)} onChange={event => setCategoryIds(current => event.target.checked ? [...current, category.id] : current.filter(id => id !== category.id))} />{category.name}</label>)}</div>
        {selected && permissions.edit && <button type="button" className="primary" disabled={busy || composeBusy || !projectId} onClick={() => void assign()}>שיוך לפרויקט / משימה</button>}
      </div>}
      {selected && permissions.delete && <DeleteButton label="העברה לאשפה ב-Gmail" message="להעביר את כל ההתכתבות לאשפה ב-Gmail? ניתן לשחזר אותה מהאשפה ב-Gmail." onConfirm={() => { if (operation.current) return; operation.current = true; setBusy(true); void integrationsApi.trashMail(selected).then(state => { setInbox(current => current.filter(row => row.threadId !== selected)); setSelected(''); setNotice('ההתכתבות הועברה לאשפה ב-Gmail'); if (state.unreadCount !== null) window.dispatchEvent(new CustomEvent('rameng-mail-count', { detail: state.unreadCount })); void refresh() }).catch(e => setError(e.message)).finally(() => { operation.current = false; setBusy(false) }) }} />}
      {selected && canCreateTask && setWorkspace && permissions.edit && <button type="button" className="secondary" disabled={!projectId || busy || loadingThread || !messages.length || !!createdTaskId} onClick={() => { const message = messages.at(-1)!; const id = uid('task'); setWorkspace(current => ({ ...current, tasks: [...current.tasks, { id, projectId, title: emailText(message.subject) || 'טיפול במייל', description: emailText(message.body || message.snippet), categoryIds, status: current.taskStatuses[0] || 'טרם התחיל', priority: 'רגילה', custom: {}, order: current.tasks.length + 1, createdAt: nowIso() }] })); setTaskId(id); setCreatedTaskId(id); setNotice('המשימה נוצרה. לאחר שמירתה לחצו על שיוך לפרויקט / משימה.')}}>יצירת משימה מהמייל</button>}
      {loadingThread && <p role="status">טוען התכתבות...</p>}
      {messages.map((message, index) => <EmailMessage key={message.id} message={message} initiallyCollapsed={index < messages.length - 1} />)}
      {selected && project && permissions.create && !composing && <button type="button" className="primary" disabled={loadingThread || !messages.length} onClick={() => setComposing(true)}>תשובה בפרויקט</button>}
      {composing && project && permissions.create && <MailComposer key={`${project.id}:${taskId}:${selected}`} onBusyChange={setComposeBusy} threadId={selected || undefined} draftContext={taskId ? `task:${taskId}` : `project:${project.id}:general`} projectContext={{ orgId, projectId: project.id, taskId: taskId || null, categoryIds }} contacts={workspace.contacts} to={selected ? (() => { const last = messages.filter(message => message.incoming !== false).at(-1) || messages.at(-1); const sender = last?.from || ''; return sender.match(/<([^>]+)>/)?.[1] || sender })() : tasks.find(task => task.id === taskId)?.emailTo || ''} subject={selected ? messages.at(-1)?.subject || project.name : tasks.find(task => task.id === taskId)?.title || project.name} files={workspace.files.filter(file => file.projectId === project.id)} onSent={async (result, to) => {
        if (result.associationSaved === false) { setRetryThread(result.threadId); setError('המייל נשלח, אך השיוך לא נשמר. נסו לשמור את השיוך שוב ללא שליחה נוספת.'); return }
        // Keep the confirmed reference visible while Cloudflare KV propagates to other locations.
        setLinks(current => [...current.filter(link => link.threadId !== result.threadId), { orgId, projectId: project.id, taskId: taskId || null, categoryIds, threadId: result.threadId, to, from: 'החשבון שלך', subject: result.subject || project.name, date: new Date().toISOString(), snippet: '', incoming: false }])
        setComposing(false); setNotice('המייל נשלח ונשמר בתקשורת הפרויקט'); setSelected(result.threadId); setThreadReload(value => value + 1)
      }} />}
    </div></div>
  </section>
}
