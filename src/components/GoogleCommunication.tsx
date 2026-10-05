import { lazy, Suspense, useEffect, useRef, useState, type FormEvent } from 'react'
import { Mail, Paperclip, RefreshCw, Send, X } from 'lucide-react'
import { integrationsApi, type GmailApiMessage, type GmailThreadSummary, type GoogleCalendarEvent, type MailAttachment } from '../lib/api'
import { fileAttachment, MAX_ATTACHMENT_BYTES, storedAttachment } from '../lib/googleFiles'
import type { Contact, FileRecord } from '../types'
const RichTextEditor = lazy(() => import('./RichTextEditor'))
import EmailMessage, { emailAddressLabel, emailText } from './EmailMessage'
import { dateTimeLabel, EmptyState } from './common'

export function MailComposer({ to = '', subject = '', threadId, files = [], onSent }: { to?: string; subject?: string; threadId?: string; files?: FileRecord[]; onSent?: (result: { id: string; threadId: string }, to: string) => Promise<void> | void }) {
  const [html, setHtml] = useState('<p></p>'); const [text, setText] = useState(''); const [signatureLoaded, setSignatureLoaded] = useState(false)
  useEffect(() => { let active = true; void integrationsApi.mailSignature().then((signature) => { if (active && signature.enabled && signature.html) { setHtml('<p></p><p>—</p>' + signature.html); setText(new DOMParser().parseFromString(signature.html, 'text/html').body.textContent || '') } }).catch(() => { if (active) setError('לא ניתן לטעון את החתימה. ניתן לכתוב ולשלוח ללא חתימה.') }).finally(() => { if (active) setSignatureLoaded(true) }); return () => { active = false } }, [])
  const [attachments, setAttachments] = useState<MailAttachment[]>([])
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [sent, setSent] = useState(false)
  const add = async (getFiles: () => Promise<MailAttachment[]>) => {
    setBusy(true); setError('')
    try { const added = await getFiles(); setAttachments((current) => { const next = [...current, ...added]; if (next.length > 10 || next.reduce((total, file) => total + file.data.length * 3 / 4, 0) > MAX_ATTACHMENT_BYTES) { setError('ניתן לצרף עד 10 קבצים ובסך הכול עד 18 MB'); return current } return next }) } catch (e) { setError(e instanceof Error ? e.message : 'צירוף הקובץ נכשל') } finally { setBusy(false) }
  }
  const send = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (busy) return
    const form = event.currentTarget; const data = new FormData(form); const recipient = String(data.get('to') || '')
    setBusy(true); setError(''); setSent(false)
    try {
      const result = await integrationsApi.sendMail({ to: recipient, subject: String(data.get('subject') || ''), body: text || (html.includes('<img') ? 'תמונה' : ''), html, threadId, attachments })
      // Sending succeeded even if refreshing the view fails. Never offer a resend for a refresh failure.
      form.reset(); setAttachments([]); setHtml('<p></p>'); setText(''); setSent(true)
      try { await onSent?.(result, recipient) } catch { setError('המייל נשלח. רענון ההתכתבות נכשל; לחצו על סנכרון.') }
    } catch (e) { setError(e instanceof Error ? e.message : 'שליחת המייל נכשלה') } finally { setBusy(false) }
  }
  return <form className="mail-compose" onSubmit={(event) => void send(event)}>
    {error && <div className="error-banner" role="alert">{error}</div>}{sent && <div className="success-banner" role="status">המייל נשלח בהצלחה</div>}
    <label className="inline-control-label"><span>נמען</span><input name="to" type="email" required defaultValue={to} /></label>
    <label className="inline-control-label"><span>נושא</span><input name="subject" required defaultValue={subject} /></label>
    <div className="mail-body-label"><strong>תוכן ההודעה</strong><Suspense fallback={<p>טוען עורך...</p>}><RichTextEditor label="תוכן ההודעה" value={html} disabled={busy || !signatureLoaded} onChange={(html, text) => { setHtml(html); setText(text) }} /></Suspense></div>
    <div className="attachment-controls"><label className="secondary file-label"><Paperclip /> צירוף קבצים<input aria-label="צירוף קבצים למייל" type="file" multiple disabled={busy} onChange={(event) => { const selected = Array.from(event.target.files || []); event.target.value = ''; void add(() => Promise.all(selected.map((file) => fileAttachment(file, file.name)))) }} /></label>
    {files.length > 0 && <label className="inline-control-label"><span>קובץ מהמערכת</span><select disabled={busy} defaultValue="" onChange={(event) => { const file = files.find((item) => item.id === event.target.value); event.target.value = ''; if (file) void add(async () => [await storedAttachment(file)]) }}><option value="">בחירת קובץ לצירוף</option>{files.map((file) => <option key={file.id} value={file.id}>{file.name}</option>)}</select></label>}<small>עד 10 קבצים, 18 MB בסך הכול</small></div>
    <div className="attachment-list">{attachments.map((file, index) => <span key={`${index}-${file.name}`}>{file.name}<button type="button" className="icon-btn" aria-label={`הסרת קובץ מצורף ${file.name}`} disabled={busy} onClick={() => setAttachments((current) => current.filter((_, i) => i !== index))}><X /></button></span>)}</div>
    <button className="primary" disabled={busy || !signatureLoaded || (!text.trim() && !html.includes('<img'))}><Send /> {busy ? 'מעבד...' : threadId ? 'שליחה באותה התכתבות' : 'שליחת מייל'}</button>
  </form>
}

export default function ContactMail({ contacts, canSend, files = [], subject = '' }: { contacts: Contact[]; canSend: boolean; files?: FileRecord[]; subject?: string }) {
  const emailsKey = [...new Set(contacts.map((contact) => contact.email?.trim().toLowerCase()).filter(Boolean))].sort().join(',')
  const [threads, setThreads] = useState<GmailThreadSummary[]>([]); const [messages, setMessages] = useState<GmailApiMessage[]>([])
  const [selected, setSelected] = useState(''); const [pageToken, setPageToken] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [composing, setComposing] = useState(false)
  const [sent, setSent] = useState(false)
  const generation = useRef(0)
  const sync = async (more = false) => {
    const version = ++generation.current; setBusy(true); setError('')
    try { const result = await integrationsApi.contactMail(emailsKey.split(','), more ? pageToken : ''); if (version !== generation.current) return; setThreads((current) => more ? [...current, ...result.threads.filter((thread) => !current.some((item) => item.id === thread.id))] : result.threads); setPageToken(result.nextPageToken) }
    catch (e) { if (version === generation.current) setError(e instanceof Error ? e.message : 'סנכרון Gmail נכשל') } finally { if (version === generation.current) setBusy(false) }
  }
  useEffect(() => { setThreads([]); setSelected(''); setMessages([]); setPageToken(''); setComposing(false); setSent(false); if (emailsKey) void sync(); return () => { generation.current++ } }, [emailsKey])
  useEffect(() => { let active = true; setMessages([]); if (selected) { setBusy(true); void integrationsApi.gmailThread(selected).then((result) => { if (active) setMessages(result.messages) }).catch((e) => { if (active) setError(e.message) }).finally(() => { if (active) setBusy(false) }) } return () => { active = false } }, [selected])
  return <section className="card contact-mail">
    <div className="card-head"><div><h2>{contacts.length > 1 ? 'מיילים של הלקוחות' : 'מיילים של הלקוח'}</h2><small>Gmail מהחשבון שלך בלבד · {emailsKey || 'אין כתובת מייל ללקוח'}</small></div><div>{emailsKey && <button className="secondary" disabled={busy} onClick={() => void sync()}><RefreshCw /> {busy ? 'מסנכרן...' : 'סנכרון מיילים'}</button>}{canSend && <button className="primary" onClick={() => { setSent(false); setSelected(''); setComposing(true) }}><Mail /> מייל חדש</button>}</div></div>
    {error && <div className="error-banner" role="alert">{error}</div>}
    {sent && <div className="success-banner" role="status">המייל נשלח בהצלחה</div>}
    <div className="contact-mail-layout"><div className="contact-thread-list">{threads.map((thread) => <button type="button" key={thread.id} className={selected === thread.id ? 'active' : ''} onClick={() => { setSelected(thread.id); setComposing(false) }}><strong>{thread.subject || 'ללא נושא'}</strong><small>{emailAddressLabel(thread.from)} · {dateTimeLabel(thread.date)}</small><p>{emailText(thread.snippet)}</p></button>)}{!threads.length && !busy && <EmptyState title="אין מיילים להצגה" text={emailsKey ? 'לא נמצאו התכתבויות עם הלקוחות בחשבון Google שלך.' : 'הוסיפו כתובת מייל בכרטיס הלקוח כדי לסנכרן.'} />}{pageToken && <button type="button" className="secondary" disabled={busy} onClick={() => void sync(true)}>מיילים נוספים</button>}</div>
    <div className="contact-thread-body">{messages.map((message) => <EmailMessage key={message.id} message={message} />)}
      {(composing || selected) && canSend && <MailComposer key={`${emailsKey}:${selected}:${composing}`} to={selected ? (() => { const sender = messages.at(-1)?.from.match(/<([^>]+)>/)?.[1] || messages.at(-1)?.from; return contacts.find((contact) => contact.email?.toLowerCase() === sender?.toLowerCase())?.email || emailsKey.split(',')[0] || '' })() : emailsKey.split(',')[0] || ''} subject={selected ? threads.find((thread) => thread.id === selected)?.subject || subject : subject} threadId={selected || undefined} files={files} onSent={async (result) => { setSent(true); setSelected(result.threadId); setComposing(false); const thread = await integrationsApi.gmailThread(result.threadId); setMessages(thread.messages); await sync() }} />}
    </div></div>
  </section>
}

export function ContactCalendar({ contacts }: { contacts: Contact[] }) {
  const key = contacts.map((contact) => contact.email?.trim().toLowerCase()).filter(Boolean).sort().join(',')
  const [from, setFrom] = useState(new Date(Date.now() - 365 * 86400000).toISOString().slice(0, 10)); const [to, setTo] = useState(new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10))
  const [events, setEvents] = useState<GoogleCalendarEvent[]>([]); const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const version = useRef(0)
  const sync = async () => { const current = ++version.current; setBusy(true); setError(''); try { const result = await integrationsApi.contactCalendar(key.split(','), `${from}T00:00:00`, `${to}T23:59:59`); if (current === version.current) setEvents(result.items) } catch (e) { if (current === version.current) setError(e instanceof Error ? e.message : 'סנכרון יומן נכשל') } finally { if (current === version.current) setBusy(false) } }
  useEffect(() => { setEvents([]); if (key) void sync(); return () => { version.current++ } }, [key])
  return <section className="card contact-calendar"><div className="card-head"><div><h2>אירועי Google של הלקוח</h2><small>אירועים שבהם כתובת הלקוח היא משתתף, מארגן או יוצר · מוצגים לך בלבד</small></div><button className="secondary" disabled={!key || busy} onClick={() => void sync()}><RefreshCw /> {busy ? 'מסנכרן...' : 'סנכרון יומן'}</button></div><div className="inline-create"><label>מתאריך<input aria-label="אירועי הלקוח מתאריך" type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label><label>עד תאריך<input aria-label="אירועי הלקוח עד תאריך" type="date" value={to} onChange={(event) => setTo(event.target.value)} /></label></div>{error && <div className="error-banner" role="alert">{error}</div>}<div className="client-timeline">{events.map((event) => <article key={event.id}><span className="timeline-dot event" /><div><small>{dateTimeLabel(event.start)}</small><strong>{event.summary}</strong>{event.location && <p>{event.location}</p>}{event.htmlLink && <a href={event.htmlLink} target="_blank" rel="noreferrer">פתיחה ביומן Google</a>}</div></article>)}{!events.length && !busy && <div className="table-empty">{key ? 'אין אירועים קשורים בטווח התאריכים שנבחר.' : 'הוסיפו כתובת מייל ללקוח כדי לסנכרן אירועים.'}</div>}</div></section>
}
