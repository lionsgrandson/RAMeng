import { lazy, Suspense, useEffect, useRef, useState, type FormEvent } from 'react'
import { Mail, Paperclip, RefreshCw, Send, X } from 'lucide-react'
import { integrationsApi, type GmailApiMessage, type GmailThreadSummary, type GoogleCalendarEvent, type MailAttachment, type MailDraft, type MailProjectContext, type MailSendResult } from '../lib/api'
import { getCurrentUser } from '../lib/backend'
import { fileAttachment, MAX_ATTACHMENT_BYTES, storedAttachment } from '../lib/googleFiles'
import type { Contact, FileRecord } from '../types'
import EmailMessage, { emailAddressLabel, emailText } from './EmailMessage'
import { dateTimeLabel, EmptyState } from './common'
const RichTextEditor = lazy(() => import('./RichTextEditor'))

export function MailComposer({ to = '', subject = '', threadId, files = [], onSent, draftContext, projectContext, contacts = [], onBusyChange }: { onBusyChange?: (busy: boolean) => void; projectContext?: MailProjectContext; contacts?: Contact[]; draftContext?: string; to?: string; subject?: string; threadId?: string; files?: FileRecord[]; onSent?: (result: MailSendResult, to: string) => Promise<void> | void }) {
  const [html, setHtml] = useState('<p></p>'); const [text, setText] = useState(''); const [signatureLoaded, setSignatureLoaded] = useState(false)
  const [attachments, setAttachments] = useState<MailAttachment[]>([])
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [sent, setSent] = useState(false)
  const [recipient, setRecipient] = useState(to); const [mailSubject, setMailSubject] = useState(subject)
  const [loadAttempt, setLoadAttempt] = useState(0)
  const [draftStatus, setDraftStatus] = useState(''); const [minimized, setMinimized] = useState(false)
  const context = draftContext ? `compose:${draftContext}:${threadId || 'new'}` : `compose:${threadId || 'new'}:${to.toLowerCase()}:${subject}`
  const dirty = useRef(false); const sending = useRef(false); const mounted = useRef(true)
  useEffect(() => { onBusyChange?.(busy); return () => onBusyChange?.(false) }, [busy, onBusyChange])
  const markDirty = () => { dirty.current = true; setDraftStatus('ממתין לשמירת הטיוטה...') }
  const ownerId = useRef('')
  const draftId = useRef(''); const queue = useRef<Promise<unknown>>(Promise.resolve())
  const snapshot = useRef<MailDraft>({ key: context, to, subject, body: '', html: '', threadId, attachments: [] })
  snapshot.current = { key: context, to: recipient, subject: mailSubject, body: text, html, threadId, attachments, ownerId: ownerId.current }
  const persist = () => {
    if (!dirty.current || sending.current) return queue.current
    const draft = { ...snapshot.current }; dirty.current = false
    if (mounted.current) setDraftStatus('שומר טיוטה...')
    queue.current = queue.current.catch(() => {}).then(async () => {
      try { const result = await integrationsApi.saveMailDraft({ ...draft, draftId: draftId.current }); draftId.current = result.draft.draftId || ''; if (!result.draft.synced) dirty.current = true; if (mounted.current) setDraftStatus(result.draft.synced ? 'הטיוטה נשמרה במערכת וב-Gmail' : 'הטיוטה נשמרה במערכת · סנכרון Gmail ממתין') }
      catch { dirty.current = true; if (mounted.current) setDraftStatus('שמירת הטיוטה נכשלה · ניסיון חוזר בעוד רגע') }
    })
    return queue.current
  }
  useEffect(() => {
    let active = true; mounted.current = true; setSignatureLoaded(false)
    void getCurrentUser().then(async (user) => { if (!user) throw new Error('Authentication required'); ownerId.current = user.id; return integrationsApi.mailDraft(context) }).then(async ({ draft }) => {
      if (!active) return
      if (draft) { setRecipient(draft.to); setMailSubject(draft.subject); setHtml(draft.html); setText(draft.body); setAttachments(draft.attachments || []); draftId.current = draft.draftId || ''; setDraftStatus('טיוטה שמורה שוחזרה'); setSignatureLoaded(true); return }
      const signature = await integrationsApi.mailSignature()
      if (active && signature.enabled && signature.html) { setHtml('<p></p><p>—</p>' + signature.html); setText(new DOMParser().parseFromString(signature.html, 'text/html').body.textContent || '') }
      if (active) setSignatureLoaded(true)
    }).catch(() => { if (active) setError('לא ניתן לטעון טיוטה או חתימה. נסו לפתוח שוב לפני תחילת הכתיבה.') })
    return () => { active = false; mounted.current = false; void persist() }
  }, [context, loadAttempt])
  useEffect(() => { if (!signatureLoaded || !dirty.current || busy) return; const timer = window.setTimeout(() => void persist(), 900); return () => window.clearTimeout(timer) }, [recipient, mailSubject, html, attachments, signatureLoaded, busy])
  useEffect(() => { const timer = window.setInterval(() => { if (dirty.current && !sending.current) void persist() }, 10000); return () => window.clearInterval(timer) }, [])
  const add = async (getFiles: () => Promise<MailAttachment[]>) => {
    setBusy(true); setError('')
    try { const added = await getFiles(); markDirty(); setAttachments((current) => { const next = [...current, ...added]; if (next.length > 10 || next.reduce((total, file) => total + file.data.length * 3 / 4, 0) > MAX_ATTACHMENT_BYTES) { setError('ניתן לצרף עד 10 קבצים ובסך הכול עד 18 MB'); return current } return next }) } catch (e) { setError(e instanceof Error ? e.message : 'צירוף הקובץ נכשל') } finally { setBusy(false) }
  }
  const send = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (busy || sending.current) return
    const form = event.currentTarget; const data = new FormData(form); const recipient = String(data.get('to') || '')
    const saving = persist(); sending.current = true
    setBusy(true); setError(''); setSent(false)
    try {
      await saving; await queue.current
      const result = await integrationsApi.sendMail({ to: recipient, subject: String(data.get('subject') || ''), body: text || (html.includes('<img') ? 'תמונה' : ''), html, threadId, attachments, draftKey: context, draftId: draftId.current, ownerId: ownerId.current, ...projectContext })
      // Sending succeeded even if refreshing the view fails. Never offer a resend for a refresh failure.
      dirty.current = false; draftId.current = ''; setDraftStatus(''); form.reset(); setAttachments([]); setHtml('<p></p>'); setText(''); setSent(true)
      if (result.associationSaved === false) setError('המייל נשלח, אך שמירת השיוך לפרויקט נכשלה. השתמשו בניסיון השיוך הנוסף; אין לשלוח שוב.')
      try { await onSent?.({ ...result, subject: String(data.get('subject') || '') }, recipient) } catch { setError('המייל נשלח. רענון או שיוך ההתכתבות נכשל; לחצו על סנכרון. אין לשלוח שוב.') }
    } catch (e) { setError(e instanceof Error ? e.message : 'שליחת המייל נכשלה') } finally { sending.current = false; setBusy(false) }
  }
  return <form className="mail-compose" onSubmit={(event) => void send(event)}>
    <div className="card-head"><strong>כתיבת מייל</strong><button type="button" className="secondary" aria-expanded={!minimized} onClick={() => setMinimized(!minimized)}>{minimized ? 'הרחבת המייל' : 'מזעור המייל'}</button></div>
    {!signatureLoaded && error && <button type="button" className="secondary" onClick={() => { setError(''); setLoadAttempt((value) => value + 1) }}>ניסיון טעינה נוסף</button>}
    <small role="status">{draftStatus}</small><div hidden={minimized}>
    {error && <div className="error-banner" role="alert">{error}</div>}{sent && <div className="success-banner" role="status">המייל נשלח בהצלחה</div>}
    <label className="inline-control-label"><span>נמען</span><input name="to" type="email" dir="ltr" list={`mail-contacts-${ownerId.current}`} required disabled={!signatureLoaded || busy} value={recipient} onChange={(event) => { markDirty(); setRecipient(event.target.value) }} /><datalist id={`mail-contacts-${ownerId.current}`}>{contacts.filter(contact => contact.email).map(contact => <option key={contact.id} value={contact.email}>{contact.name}</option>)}</datalist><small>אפשר להזין כל כתובת מייל, גם ללא איש קשר במערכת</small></label>
    <label className="inline-control-label"><span>נושא</span><input name="subject" required disabled={!signatureLoaded || busy} value={mailSubject} onChange={(event) => { markDirty(); setMailSubject(event.target.value) }} /></label>
    <div className="mail-body-label"><strong>תוכן ההודעה</strong><Suspense fallback={<p>טוען עורך...</p>}><RichTextEditor label="תוכן ההודעה" value={html} disabled={busy || !signatureLoaded} onChange={(html, text) => { markDirty(); setHtml(html); setText(text) }} /></Suspense></div>
    <div className="attachment-controls"><label className="secondary file-label"><Paperclip /> צירוף קבצים<input aria-label="צירוף קבצים למייל" type="file" multiple disabled={busy} onChange={(event) => { const selected = Array.from(event.target.files || []); event.target.value = ''; void add(() => Promise.all(selected.map((file) => fileAttachment(file, file.name)))) }} /></label>
    {files.length > 0 && <label className="inline-control-label"><span>קובץ מהמערכת</span><select disabled={busy} defaultValue="" onChange={(event) => { const file = files.find((item) => item.id === event.target.value); event.target.value = ''; if (file) void add(async () => [await storedAttachment(file)]) }}><option value="">בחירת קובץ לצירוף</option>{files.map((file) => <option key={file.id} value={file.id}>{file.name}</option>)}</select></label>}<small>עד 10 קבצים, 18 MB בסך הכול</small></div>
    <div className="attachment-list">{attachments.map((file, index) => <span key={`${index}-${file.name}`}>{file.name}<button type="button" className="icon-btn" aria-label={`הסרת קובץ מצורף ${file.name}`} disabled={busy} onClick={() => { markDirty(); setAttachments((current) => current.filter((_, i) => i !== index)) }}><X /></button></span>)}</div>
    <button className="primary" disabled={busy || !signatureLoaded || (!text.trim() && !html.includes('<img'))}><Send /> {busy ? sending.current ? 'שולח...' : 'מעבד...' : threadId ? 'שליחה באותה התכתבות' : 'שליחת מייל'}</button>
    </div>
  </form>
}

export default function ContactMail({ contacts, canSend, files = [], subject = '', contextKey }: { contextKey?: string; contacts: Contact[]; canSend: boolean; files?: FileRecord[]; subject?: string }) {
  const emailsKey = [...new Set(contacts.map((contact) => contact.email?.trim().toLowerCase()).filter(Boolean))].sort().join(',')
  const [threads, setThreads] = useState<GmailThreadSummary[]>([]); const [messages, setMessages] = useState<GmailApiMessage[]>([])
  const [selected, setSelected] = useState(''); const [pageToken, setPageToken] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [composing, setComposing] = useState(false)
  const [sent, setSent] = useState(false); const [listHidden, setListHidden] = useState(false); const [expandedList, setExpandedList] = useState(false)
  const generation = useRef(0)
  const sync = async (more = false, force = false) => {
    const version = ++generation.current; setBusy(true); setError('')
    try { const result = await integrationsApi.contactMail(emailsKey.split(','), more ? pageToken : '', force); if (version !== generation.current) return; setThreads((current) => more ? [...current, ...result.threads.filter((thread) => !current.some((item) => item.id === thread.id))] : result.threads); setPageToken(result.nextPageToken); if (force && selected) { const thread = await integrationsApi.gmailThread(selected, true); if (version === generation.current) setMessages(thread.messages) } }
    catch (e) { if (version === generation.current) setError(e instanceof Error ? e.message : 'סנכרון Gmail נכשל') } finally { if (version === generation.current) setBusy(false) }
  }
  useEffect(() => { const refresh = () => { if (emailsKey) void sync(); if (selected) void integrationsApi.gmailThread(selected).then((result) => setMessages(result.messages)).catch(() => {}) }; window.addEventListener('rameng-google-synced', refresh); return () => window.removeEventListener('rameng-google-synced', refresh) }, [emailsKey, selected])
  useEffect(() => { setThreads([]); setSelected(''); setMessages([]); setPageToken(''); setComposing(false); setSent(false); if (emailsKey) void sync(); return () => { generation.current++ } }, [emailsKey])
  useEffect(() => { let active = true; setMessages([]); if (selected) { setBusy(true); void integrationsApi.gmailThread(selected, true).then(async result => { if (!active) return; setMessages(result.messages); if (result.messages.some(message => message.unread)) { const state = await integrationsApi.readMail(selected); if (!active) return; setMessages(result.messages.map(message => ({ ...message, unread: false }))); if (state.unreadCount !== null) window.dispatchEvent(new CustomEvent('rameng-mail-count', { detail: state.unreadCount })); await sync(false, true) } }).catch((e) => { if (active) setError(e.message) }).finally(() => { if (active) setBusy(false) }) } return () => { active = false } }, [selected])
  return <section className="card contact-mail">
    <div className="card-head"><div><h2>{contacts.length > 1 ? 'מיילים של הלקוחות' : 'מיילים של הלקוח'}</h2><small>Gmail מהחשבון שלך בלבד · {emailsKey || 'אין כתובת מייל ללקוח'}</small></div><div>{emailsKey && <button className="secondary" disabled={busy} onClick={() => void sync(false, true)}><RefreshCw /> {busy ? 'מסנכרן...' : 'סנכרון מיילים'}</button>}{canSend && <button className="primary" onClick={() => { setSent(false); setSelected(''); setComposing(true) }}><Mail /> מייל חדש</button>}</div></div>
    {error && <div className="error-banner" role="alert">{error}</div>}
    {sent && <div className="success-banner" role="status">המייל נשלח בהצלחה</div>}
    <button type="button" className="secondary" aria-expanded={!listHidden} onClick={() => setListHidden(!listHidden)}>{listHidden ? 'הצגת רשימת מיילים' : 'הסתרת רשימת מיילים'} ({threads.length})</button>
    <div className="contact-mail-layout"><div className="contact-thread-list" hidden={listHidden}>{(expandedList ? threads : threads.slice(0, 5)).map((thread) => <button type="button" key={thread.id} className={selected === thread.id ? 'active' : ''} onClick={() => { setSelected(thread.id); setComposing(false) }}><strong>{thread.subject || 'ללא נושא'}</strong><small>{emailAddressLabel(thread.from)} · {dateTimeLabel(thread.date)}</small><p>{emailText(thread.snippet)}</p></button>)}{!threads.length && !busy && <EmptyState title="אין מיילים להצגה" text={emailsKey ? 'לא נמצאו התכתבויות עם הלקוחות בחשבון Google שלך.' : 'הוסיפו כתובת מייל בכרטיס הלקוח כדי לסנכרן.'} />}{threads.length > 5 && <button type="button" className="secondary" onClick={() => setExpandedList(!expandedList)}>{expandedList ? 'הצגת פחות מיילים' : `הצגת כל ${threads.length} המיילים`}</button>}{pageToken && <button type="button" className="secondary" disabled={busy} onClick={() => void sync(true)}>מיילים נוספים</button>}</div>
    <div className="contact-thread-body">{messages.map((message, index) => <EmailMessage key={message.id} message={message} initiallyCollapsed={index < messages.length - 1} />)}
      {(composing || (selected && messages.length > 0)) && canSend && <MailComposer draftContext={contextKey || `contacts:${contacts.map((contact) => contact.id).sort().join(',')}:${subject}`} key={`${emailsKey}:${selected}:${composing}`} to={selected ? (() => { const sender = messages.at(-1)?.from.match(/<([^>]+)>/)?.[1] || messages.at(-1)?.from; return contacts.find((contact) => contact.email?.toLowerCase() === sender?.toLowerCase())?.email || emailsKey.split(',')[0] || '' })() : emailsKey.split(',')[0] || ''} subject={selected ? threads.find((thread) => thread.id === selected)?.subject || subject : subject} threadId={selected || undefined} files={files} onSent={async (result) => { setSent(true); setSelected(result.threadId); setComposing(false); const thread = await integrationsApi.gmailThread(result.threadId, true); setMessages(thread.messages); await sync(false, true) }} />}
    </div></div>
  </section>
}

export function ContactCalendar({ contacts }: { contacts: Contact[] }) {
  const key = contacts.map((contact) => contact.email?.trim().toLowerCase()).filter(Boolean).sort().join(',')
  const [from, setFrom] = useState(new Date(Date.now() - 365 * 86400000).toISOString().slice(0, 10)); const [to, setTo] = useState(new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10))
  const [events, setEvents] = useState<GoogleCalendarEvent[]>([]); const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const version = useRef(0)
  const sync = async (force = false) => { const current = ++version.current; setBusy(true); setError(''); try { const result = await integrationsApi.contactCalendar(key.split(','), `${from}T00:00:00`, `${to}T23:59:59`, force); if (current === version.current) setEvents(result.items) } catch (e) { if (current === version.current) setError(e instanceof Error ? e.message : 'סנכרון יומן נכשל') } finally { if (current === version.current) setBusy(false) } }
  useEffect(() => { const refresh = () => { if (key) void sync() }; window.addEventListener('rameng-google-synced', refresh); return () => window.removeEventListener('rameng-google-synced', refresh) }, [key, from, to])
  useEffect(() => { setEvents([]); if (key) void sync(); return () => { version.current++ } }, [key])
  return <section className="card contact-calendar"><div className="card-head"><div><h2>אירועי Google של הלקוח</h2><small>אירועים שבהם כתובת הלקוח היא משתתף, מארגן או יוצר · מוצגים לך בלבד</small></div><button className="secondary" disabled={!key || busy} onClick={() => void sync(true)}><RefreshCw /> {busy ? 'מסנכרן...' : 'סנכרון יומן'}</button></div><div className="inline-create"><label>מתאריך<input aria-label="אירועי הלקוח מתאריך" type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label><label>עד תאריך<input aria-label="אירועי הלקוח עד תאריך" type="date" value={to} onChange={(event) => setTo(event.target.value)} /></label></div>{error && <div className="error-banner" role="alert">{error}</div>}<div className="client-timeline">{events.map((event) => <article key={event.id}><span className="timeline-dot event" /><div><small>{dateTimeLabel(event.start)}</small><strong>{event.summary}</strong>{event.location && <p>{event.location}</p>}{event.htmlLink && <a href={event.htmlLink} target="_blank" rel="noreferrer">פתיחה ביומן Google</a>}</div></article>)}{!events.length && !busy && <div className="table-empty">{key ? 'אין אירועים קשורים בטווח התאריכים שנבחר.' : 'הוסיפו כתובת מייל ללקוח כדי לסנכרן אירועים.'}</div>}</div></section>
}
