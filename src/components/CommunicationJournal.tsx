import { useEffect, useState } from 'react'
import { integrationsApi, type JournalMessage, type JournalThread } from '../lib/api'
import type { Workspace } from '../types'

export default function CommunicationJournal({ orgId, workspace, projectId = '', selectedThreadId, canShare }: { orgId: string; workspace: Workspace; projectId?: string; selectedThreadId: string; canShare: boolean }) {
  const [threads, setThreads] = useState<JournalThread[]>([])
  const [messages, setMessages] = useState<JournalMessage[]>([])
  const [mailbox, setMailbox] = useState<{ user_id: string; active: boolean; email: string; last_sync_at?: string; last_error_code?: string } | null>(null)
  const [project, setProject] = useState(projectId)
  const [taskIds, setTaskIds] = useState<string[]>([])
  const [contactIds, setContactIds] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const refresh = async () => {
    setBusy(true); setError('')
    try { const result = await integrationsApi.communicationJournal(orgId, projectId); setMailbox(result.mailbox); setThreads(result.threads) }
    catch (e) { setError(e instanceof Error ? e.message : 'טעינת היומן נכשלה') }
    finally { setBusy(false) }
  }
  useEffect(() => { void refresh() }, [orgId, projectId])
  const sync = async (threadId: string, targetProject: string, tasks: string[], contacts: string[]) => {
    setBusy(true); setError(''); setNotice('')
    try {
      const result = await integrationsApi.shareJournalThread({ orgId, threadId, projectId: targetProject, taskIds: tasks, contactIds: contacts })
      setNotice(`נשמרו ${result.messageCount} הודעות ביומן הארגוני. הודעות קיימות עודכנו ללא שכפול.`)
      await refresh()
    } catch (e) { setError(e instanceof Error ? e.message : 'השיתוף נכשל. ניתן לנסות שוב.') }
    finally { setBusy(false) }
  }
  return <section className="card communication-journal" aria-label="יומן תקשורת ארגוני"><h3>יומן תקשורת ארגוני</h3>
    <p>הודעות שנבחרו במפורש מתיבות עסקיות מאושרות, לצפייה משותפת לפי הרשאות הארגון. הדואר הפרטי נשאר בתיבת Gmail האישית.</p>
    {!mailbox?.active && <p className="info-banner">התיבה שלך אינה מאושרת לשיתוף. נדרש אישור הלקוח לתיבה עסקית ותיעודו בידי המפתח. אין סריקה או העתקה אוטומטית של תיבות פרטיות.</p>}
    {mailbox?.active && <p>תיבה מאושרת: <bdi>{mailbox.email}</bdi> · סנכרון אחרון: {mailbox.last_sync_at ? new Date(mailbox.last_sync_at).toLocaleString('he-IL') : 'טרם בוצע'}{mailbox.last_error_code && ' · הסנכרון האחרון נכשל; ניתן לנסות שוב'}</p>}
    {error && <p className="error-banner" role="alert">{error}</p>}{notice && <p className="success-banner" role="status">{notice}</p>}
    <button type="button" className="secondary" disabled={busy} onClick={() => void refresh()}>{busy ? 'טוען...' : 'רענון היומן'}</button>
    {canShare && mailbox?.active && selectedThreadId && <fieldset disabled={busy}><legend>שיתוף ההתכתבות שנבחרה</legend>
      <p>האישור הבא ישתף את גוף ההודעות ואת פרטי הקבצים המצורפים עם משתמשי הארגון המורשים. תוכן הקבצים עצמם אינו מועתק.</p>
      <label>פרויקט ליומן<select aria-label="פרויקט ליומן" value={project} onChange={e => { setProject(e.target.value); setTaskIds([]) }}><option value="">בחירת פרויקט</option>{workspace.projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
      <label>משימות מקושרות<select aria-label="משימות מקושרות ליומן" multiple value={taskIds} onChange={e => setTaskIds(Array.from(e.target.selectedOptions, option => option.value))}>{workspace.tasks.filter(t => t.projectId === project).map(t => <option key={t.id} value={t.id}>{t.title}</option>)}</select></label>
      <label>אנשי קשר מקושרים<select aria-label="אנשי קשר מקושרים ליומן" multiple value={contactIds} onChange={e => setContactIds(Array.from(e.target.selectedOptions, option => option.value))}>{workspace.contacts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
      <button type="button" className="primary" disabled={!project} onClick={() => void sync(selectedThreadId, project, taskIds, contactIds)}>אישור ושיתוף ההתכתבות ביומן הארגוני</button>
    </fieldset>}
    <p>מוצגות עד 50 ההתכתבויות שעודכנו לאחרונה. עדכון חוזר מוסיף הודעות חדשות ושומר את ההיסטוריה הקיימת.</p>
    {threads.map(thread => <article key={thread.id}><strong>{thread.subject || 'ללא נושא'}</strong><p>{workspace.projects.find(p => p.id === thread.project_id)?.name} · {new Date(thread.synced_at).toLocaleString('he-IL')}</p>
      <p>משימות: {thread.task_ids.map(id => workspace.tasks.find(t => t.id === id)?.title || id).join(' · ') || 'ללא'}</p>
      <button type="button" className="secondary" disabled={busy} onClick={() => { setBusy(true); void integrationsApi.journalMessages(orgId, thread.id).then(result => setMessages(result.messages)).catch(e => setError(e.message)).finally(() => setBusy(false)) }}>צפייה בהודעות שנשמרו</button>
      {canShare && mailbox?.active && thread.mailbox_user_id === mailbox.user_id && <button type="button" className="secondary" disabled={busy} onClick={() => void sync(thread.gmail_thread_id, thread.project_id, thread.task_ids, thread.contact_ids)}>עדכון מהתיבה שלי</button>}
    </article>)}
    {!busy && !threads.length && <p>טרם שותפו התכתבויות ביומן.</p>}
    {messages.map(message => <article key={message.gmail_message_id}><h4>{message.subject}</h4><p dir="auto">{message.sender} → {message.recipients}{message.cc && ` · עותק: ${message.cc}`}</p><p>{message.sent_at ? new Date(message.sent_at).toLocaleString('he-IL') : 'תאריך המקור לא זמין'}</p><p style={{ whiteSpace: 'pre-wrap' }}>{message.body}</p>{message.attachment_metadata.map((file, index) => <p key={index}>קובץ מצורף: <bdi>{file.name}</bdi> ({file.size} bytes)</p>)}</article>)}
  </section>
}
