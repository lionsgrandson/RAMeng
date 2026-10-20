import { useContext, useEffect, useRef, useState } from 'react'
import { WorkspaceSaveContext } from './WorkspaceSave'
import { integrationsApi, type GmailApiMessage, type ProjectMailLink } from '../lib/api'
import type { Project, Task, Workspace } from '../types'
import type { AreaPermissions } from '../lib/permissions'
import EmailMessage, { emailAddressLabel, emailText } from './EmailMessage'
import { MailComposer } from './GoogleCommunication'
import { dateTimeLabel, EmptyState, uid, nowIso } from './common'
import DeleteButton from './RecordDelete'
import CommunicationJournal from './CommunicationJournal'
import { getCurrentUser } from '../lib/backend'
import { Modal } from './common'

export default function ProjectMail({ workspace, orgId, project, initialTask, permissions, onProject, setWorkspace, canCreateTask = false, initialCategoryFilter = '', onTask }: {
  onTask?: (id: string) => void; initialCategoryFilter?: string; setWorkspace?: React.Dispatch<React.SetStateAction<Workspace>>; canCreateTask?: boolean; workspace: Workspace; orgId: string; project?: Project; initialTask?: Task | null; permissions: AreaPermissions; onProject?: (id: string) => void
}) {
  const [showJournal, setShowJournal] = useState(false)
  const [actionableOnly, setActionableOnly] = useState(false)
  const [emailDraft, setEmailDraft] = useState<{ message: GmailApiMessage; mailboxUserId: string } | null>(null)
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
  const [composing, setComposing] = useState(false)
  const [composeBusy, setComposeBusy] = useState(false)
  const [pageToken, setPageToken] = useState('')
  const [busy, setBusy] = useState(false); const [loadingThread, setLoadingThread] = useState(false)
  const [error, setError] = useState(''); const [notice, setNotice] = useState('')
  const [createdTaskId, setCreatedTaskId] = useState('')
  const [retryThread, setRetryThread] = useState('')
  const savedWorkspace = useContext(WorkspaceSaveContext)
  const initialOpened = useRef(false)
  const linkedCreatedTask = useRef('')
  const pendingCreatedLink = useRef<{ threadId: string; projectId: string; taskId: string; categoryIds: string[] } | null>(null)
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
      const compatible: ProjectMailLink[] = Object.entries(legacy.links).flatMap(([taskId, link]) => {
        const task = workspace.tasks.find(task => task.id === taskId)
        if (!task?.projectId || result.links.some(item => item.threadId === link.threadId)) return []
        return [{ orgId, projectId: task.projectId, taskId, threadId: link.threadId, subject: task.title, from: '', to: link.to, date: '', snippet: '' }]
      })
      if (version !== generation.current) return
      setLinks([...result.links, ...compatible])
      if (initialTask && !initialOpened.current) {
        initialOpened.current = true
        const linked = [...result.links, ...compatible].find(link => link.taskId === initialTask.id && link.orgId === orgId)
        if (linked) { setSelected(linked.threadId); setCategoryIds(linked.categoryIds || []); setComposing(false) }
        else { setComposing(true); setNotice('למשימה עדיין אין התכתבות מקושרת. אפשר לשלוח מייל חדש או לבחור התכתבות קיימת.') }
      }
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
  const assign = async (threadId = selected, target = { projectId, taskId, categoryIds }) => {
    if (operation.current || composeBusy || !target.projectId || !threadId) return
    operation.current = true; setBusy(true); setError(''); setNotice('')
    try {
      const { link } = await integrationsApi.linkProjectMail({ orgId, ...target, taskId: target.taskId || null, threadId })
      setLinks(current => [...current.filter(item => item.threadId !== threadId), link]); setRetryThread(''); setNotice('ההתכתבות שויכה לפרויקט בהצלחה')
    } catch (e) { setError(e instanceof Error ? e.message : 'שמירת השיוך נכשלה') }
    finally { operation.current = false; setBusy(false) }
  }
  useEffect(() => {
    // The server validates task references. Associate only after the task save
    // succeeds, retaining the explicit retry button if provider storage fails.
    if (busy || composeBusy || operation.current || !createdTaskId || savedWorkspace.dirty || savedWorkspace.state !== 'saved' || linkedCreatedTask.current === createdTaskId) return
    const target = pendingCreatedLink.current
    if (!target) return
    linkedCreatedTask.current = createdTaskId
    void assign(target.threadId, target)
  }, [createdTaskId, savedWorkspace.dirty, savedWorkspace.state, busy, composeBusy])
  const reviewEmailTask = async () => {
    const message = messages.at(-1)
    if (!message || busy || !projectId) return
    setBusy(true); setError('')
    try {
      const actor = await getCurrentUser()
      if (!actor) throw new Error('נדרשת התחברות')
      const existing = workspace.tasks.find(task => task.sourceEmail?.messageId === message.id && task.sourceEmail.mailboxUserId === actor.id)
      if (existing) { setNotice(`כבר קיימת משימה מהודעה זו: ${existing.title}`); return }
      setEmailDraft({message,mailboxUserId:actor.id})
    } catch (e) { setError(e instanceof Error ? e.message : 'לא ניתן להכין את המשימה') }
    finally { setBusy(false) }
  }
  const baseRows = project ? links.filter(link => link.projectId === project.id && link.orgId === orgId).sort((a, b) => b.date.localeCompare(a.date)) : inbox
  const [readFilter, setReadFilter] = useState('all')
  const rows = baseRows.filter(row => (!actionableOnly || /לטיפול|נא |נדרש|בקשה|אישור|follow.?up|please|action|request/i.test(`${row.subject} ${row.snippet}`)) && `${row.subject} ${row.from} ${row.to} ${row.snippet}`.toLowerCase().includes(search.toLowerCase()) && (readFilter === 'all' || (readFilter === 'unread' ? row.unread : !row.unread)) && (!categoryFilter || links.find(link => link.threadId === row.threadId)?.categoryIds?.includes(categoryFilter)))
  const availableCategories = workspace.categories.filter(category => workspace.projects.find(item => item.id === projectId)?.categoryIds?.includes(category.id))
  return <section className={`card contact-mail mailbox ${selected || composing ? 'mailbox-reading' : ''}`}>
    <div className="card-head"><div><h2>{project ? 'תקשורת מייל בפרויקט' : `דואר נכנס${unreadCount === null ? '' : ` (${unreadCount})`}`}</h2><small>Gmail מהחשבון שלך · שיוך התכתבות לפרויקט עם משימה אופציונלית</small></div><div><button type="button" className="secondary" disabled={busy} onClick={() => { void refresh(); setThreadReload(value => value + 1) }}>{busy ? 'טוען...' : 'רענון'}</button>{project && permissions.create && <button type="button" className="primary" disabled={composeBusy} onClick={() => { setSelected(''); setProjectId(project.id); setTaskId(''); setComposing(true) }}>מייל חדש בפרויקט</button>}</div></div>
    <div className="page-action-row"><button type="button" className="secondary" aria-expanded={showJournal} onClick={() => setShowJournal(value => !value)}>יומן תקשורת ארגוני</button><button type="button" className="secondary" aria-pressed={actionableOnly} onClick={() => setActionableOnly(value => !value)}>מיילים מוצעים לטיפול (לפי מילות מפתח)</button></div>
    {actionableOnly && <p>הצעות לפי מילים בנושא ובתקציר בלבד. בדקו את ההודעה ואשרו ידנית כל משימה.</p>}
    {showJournal && <CommunicationJournal orgId={orgId} workspace={workspace} projectId={project?.id} selectedThreadId={selected} canShare={permissions.create} />}
    {error && <div className="error-banner" role="alert">{error}</div>}{notice && <div className="success-banner" role="status">{notice}</div>}
    {retryThread && <button type="button" className="secondary" disabled={busy} onClick={() => void assign(retryThread)}>המייל נשלח — ניסיון נוסף לשמירת השיוך</button>}
    <div className="toolbar"><input aria-label="חיפוש מיילים" placeholder="חיפוש לפי שולח, נמען, נושא או תוכן" value={search} onChange={event => setSearch(event.target.value)} /><select aria-label="סינון לפי מצב קריאה" value={readFilter} onChange={event => setReadFilter(event.target.value)}><option value="all">כל ההודעות</option><option value="unread">לא נקראו</option><option value="read">נקראו</option></select><select aria-label="סינון מייל לפי מקצוע" value={categoryFilter} onChange={event => setCategoryFilter(event.target.value)}><option value="">כל המקצועות</option>{workspace.categories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}</select><small>{rows.length} הודעות מוצגות</small></div>
    <div className="contact-mail-layout"><div className="contact-thread-list">
      {rows.map(row => <button type="button" key={'id' in row ? row.id : row.threadId} className={`mailbox-row ${row.unread ? 'unread' : 'read'} ${selected === row.threadId ? 'active' : ''}`} aria-pressed={selected === row.threadId} onClick={() => open(row.threadId)}><strong className="mailbox-subject" dir="auto">{row.unread ? '● ' : ''}{emailText(row.subject) || 'ללא נושא'}</strong><small className="mailbox-sender" dir="auto">{emailAddressLabel(row.from)} → {emailAddressLabel(row.to)}</small><small className="mailbox-date">{dateTimeLabel(row.date)} · {row.incoming === false ? 'נשלח' : 'התקבל'} {row.unread ? '· לא נקרא' : ''}</small><p className="mailbox-preview" dir="auto">{emailText(row.snippet)}</p>{(() => { const link = links.find(link => link.threadId === row.threadId && link.orgId === orgId); const linkedProject = workspace.projects.find(item => item.id === link?.projectId); return linkedProject ? <small>פרויקט: {linkedProject.name}{link?.taskId ? ` · ${workspace.tasks.find(task => task.id === link.taskId)?.title || 'משימה'}` : ''}</small> : null })()}</button>)}
      {!rows.length && !busy && <EmptyState title="אין מיילים להצגה" text={project ? 'שלחו מייל חדש או שייכו התכתבות מתיבת הדואר הנכנס.' : 'אין הודעות נכנסות בחשבון Google המחובר.'} />}
      {!project && pageToken && <button type="button" className="secondary" disabled={busy} onClick={() => void refresh(true)}>הודעות נוספות</button>}
    </div><div className="contact-thread-body" hidden={!selected && !composing}>{selected && <div className="mail-thread-toolbar"><button type="button" className="secondary" disabled={composeBusy} onClick={() => { setSelected(''); setComposing(false) }}>חזרה לרשימת המיילים</button><strong>שרשור מלא · {messages.length} הודעות</strong></div>}
      {association && <div><p>פרויקט: {onProject ? <button type="button" className="secondary" onClick={() => onProject(association.projectId)}>{workspace.projects.find(item => item.id === association.projectId)?.name || 'פרויקט משויך'}</button> : workspace.projects.find(item => item.id === association.projectId)?.name || 'פרויקט משויך'}</p>{permissions.delete && <DeleteButton label="ביטול שיוך ההתכתבות" message="לבטל את שיוך ההתכתבות לפרויקט? הודעות Gmail יישמרו." onConfirm={() => {
        if (operation.current) return; operation.current = true; setBusy(true)
        void (async () => { try { await integrationsApi.unlinkProjectMail({ ...association, orgId }); if (association.taskId) await integrationsApi.unlinkGmailTask(association.taskId); setLinks(current => current.filter(link => link.threadId !== selected)); setNotice('השיוך בוטל') } catch (e) { setError(e instanceof Error ? e.message : 'ביטול השיוך נכשל') } finally { operation.current = false; setBusy(false) } })()
      }} />}</div>}
      {(selected || composing) && <div className="mail-assignment">
        <label>פרויקט<select aria-label="פרויקט לשיוך מייל" value={projectId} disabled={!!project || busy || composeBusy || !permissions.edit} onChange={event => { setProjectId(event.target.value); setTaskId(''); setCategoryIds([]) }}><option value="">בחירת פרויקט</option>{workspace.projects.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label>משימה (אופציונלי)<select aria-label="משימה לשיוך מייל" value={taskId} disabled={!projectId || busy || composeBusy || (!permissions.edit && !composing)} onChange={event => setTaskId(event.target.value)}><option value="">ללא משימה</option>{tasks.map(task => <option key={task.id} value={task.id}>{task.title}</option>)}</select></label>
        <div><span>מקצועות / קטגוריות (אופציונלי)</span><small className="field-help">תחום העבודה של ההתכתבות, למשל חשמל או אינסטלציה. השיוך מאפשר לרכז מיילים, משימות וקבצים לפי מקצוע בפרויקט.</small>{availableCategories.map(category => <label key={category.id}><input type="checkbox" disabled={!permissions.edit || busy} checked={categoryIds.includes(category.id)} onChange={event => setCategoryIds(current => event.target.checked ? [...current, category.id] : current.filter(id => id !== category.id))} />{category.name}</label>)}</div>
        {selected && permissions.edit && <button type="button" className="primary" disabled={busy || composeBusy || !projectId} onClick={() => void assign()}>שיוך לפרויקט / משימה</button>}
      </div>}
      {selected && permissions.delete && <DeleteButton label="העברה לאשפה ב-Gmail" message="להעביר את כל ההתכתבות לאשפה ב-Gmail? ניתן לשחזר אותה מהאשפה ב-Gmail." onConfirm={() => { if (operation.current) return; operation.current = true; setBusy(true); void integrationsApi.trashMail(selected).then(state => { setInbox(current => current.filter(row => row.threadId !== selected)); setSelected(''); setNotice('ההתכתבות הועברה לאשפה ב-Gmail'); if (state.unreadCount !== null) window.dispatchEvent(new CustomEvent('rameng-mail-count', { detail: state.unreadCount })); void refresh() }).catch(e => setError(e.message)).finally(() => { operation.current = false; setBusy(false) }) }} />}
      {association?.taskId && onTask && <button type="button" className="primary" onClick={() => onTask(association.taskId!)}>פתיחת המשימה המקושרת: {workspace.tasks.find(task => task.id === association.taskId)?.title || 'משימה'}</button>}
      {selected && canCreateTask && setWorkspace && permissions.edit && <button type="button" className="secondary" disabled={!projectId || busy || loadingThread || !messages.length || !!createdTaskId} onClick={() => void reviewEmailTask()}>יצירת משימה מהמייל</button>}
      {emailDraft && setWorkspace && <Modal title="בדיקה ואישור משימה מהמייל" onClose={() => setEmailDraft(null)}><form className="form-grid" onSubmit={event => {
        event.preventDefault()
        const form = new FormData(event.currentTarget)
        const chosenProject = String(form.get('projectId'))
        const existing = workspace.tasks.find(task => task.sourceEmail?.messageId === emailDraft.message.id && task.sourceEmail.mailboxUserId === emailDraft.mailboxUserId)
        if (existing) { setNotice(`כבר קיימת משימה מהודעה זו: ${existing.title}`); setEmailDraft(null); return }
        const id = uid('task')
        const source = {provider:'gmail' as const,messageId:emailDraft.message.id,threadId:selected,mailboxUserId:emailDraft.mailboxUserId,importedAt:nowIso()}
        const task: Task = {id,projectId:chosenProject,title:String(form.get('title')).trim(),description:String(form.get('description') || ''),assigneeId:String(form.get('assigneeId') || '') || undefined,dueDate:String(form.get('dueDate') || '') || undefined,sourceEmail:source,gmailThreadId:selected,categoryIds:chosenProject === projectId ? categoryIds : [],status:workspace.taskStatuses[0] || 'טרם התחיל',priority:'רגילה',custom:{},order:workspace.tasks.length+1,createdAt:nowIso()}
        setWorkspace(current => ({...current,tasks:[...current.tasks,task]}))
        pendingCreatedLink.current={threadId:selected,projectId:chosenProject,taskId:id,categoryIds:task.categoryIds || []}
        setProjectId(chosenProject); setTaskId(id); setCreatedTaskId(id); setEmailDraft(null)
        setNotice('המשימה אושרה ונוצרה. ההתכתבות תשויך לאחר שמירת המשימה.')
      }}>
        <p>בדקו את התוכן לפני שמירתו במשימה משותפת. לא נשלח תוכן לספק AI. מקור: <bdi>{emailDraft.message.id}</bdi></p>
        <label>כותרת המשימה<input name="title" required defaultValue={emailText(emailDraft.message.subject) || 'טיפול במייל'} /></label>
        <label>תיאור המשימה<textarea name="description" rows={6} defaultValue={emailText(emailDraft.message.body || emailDraft.message.snippet)} /></label>
        <label>פרויקט למשימה<select name="projectId" required defaultValue={projectId}>{workspace.projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
        <label>אחראי למשימה<select name="assigneeId" defaultValue=""><option value="">ללא אחראי</option>{workspace.team.filter(member => member.active && !member.external).map(member => <option key={member.id} value={member.id}>{member.name}</option>)}</select></label>
        <label>תאריך יעד<input type="date" name="dueDate" /></label>
        <div className="form-actions"><button type="button" className="secondary" onClick={() => setEmailDraft(null)}>ביטול</button><button type="submit" className="primary">אישור ויצירת משימה</button></div>
      </form></Modal>}

      {loadingThread && <p role="status">טוען התכתבות...</p>}
      {messages.map((message) => <EmailMessage key={message.id} message={message} initiallyCollapsed={false} />)}
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
