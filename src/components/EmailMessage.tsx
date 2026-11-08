import { useMemo, useState } from 'react'
import { integrationsApi, type GmailApiMessage } from '../lib/api'
import { dateTimeLabel } from './common'
import { safeMailHtml } from '../lib/mailHtml'

export function emailText(value: string) { const doc = new DOMParser().parseFromString(value.replace(/</g, '&lt;').replace(/>/g, '&gt;'), 'text/html'); return doc.body.textContent || '' }
export function emailAddressLabel(value: string) { return emailText(value).replace(/["']/g, '').replace(/[\u200e\u200f]/g, '').replace(/<([^>]+)>/g, ' ($1)').replace(/^\s*\(([^)]+)\)\s*$/, '$1').trim() }

export default function EmailMessage({ message, initiallyCollapsed = false }: { message: GmailApiMessage; initiallyCollapsed?: boolean }) {
  const [collapsed, setCollapsed] = useState(initiallyCollapsed)
  const [images, setImages] = useState(false)
  const [inlineImages, setInlineImages] = useState<Record<string, string>>({}); const [imageError, setImageError] = useState(''); const [imageBusy, setImageBusy] = useState(false)
  const [downloadId, setDownloadId] = useState('')
  const download = async (partId: string) => {
    setDownloadId(partId); setImageError('')
    try {
      const file = await integrationsApi.mailAttachment(message.id, partId)
      const bytes = Uint8Array.from(atob(file.data.replace(/-/g, '+').replace(/_/g, '/')), char => char.charCodeAt(0))
      const url = URL.createObjectURL(new Blob([bytes], { type: 'application/octet-stream' }))
      const link = document.createElement('a'); link.href = url; link.download = file.name; link.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 30000)
    } catch (error) { setImageError(error instanceof Error ? error.message : 'הורדת הקובץ נכשלה') }
    finally { setDownloadId('') }
  }
  const content = useMemo(() => {
    if (message.htmlBody) {
      const source = message.htmlBody.replace(/src=(["'])cid:([^"']+)\1/gi, (match, _quote, cid) => inlineImages[cid] ? `src="${inlineImages[cid]}"` : match)
      const doc = new DOMParser().parseFromString(safeMailHtml(source, images), 'text/html')
      const quoted: string[] = []
      doc.querySelectorAll('.gmail_quote, .yahoo_quoted, blockquote, #divRplyFwdMsg').forEach((element) => { if (!doc.body.contains(element)) return; if (element.id === 'divRplyFwdMsg') { let next = element.nextSibling; while (next) { const item = next; next = item.nextSibling; quoted.push(item instanceof Element ? item.outerHTML : item.textContent || ''); item.remove() } } quoted.push(element.outerHTML); element.remove() })
      return { html: doc.body.innerHTML, quotedHtml: quoted.join(''), text: '', quotedText: '' }
    }
    const text = emailText(message.body || message.snippet)
    const match = /(?:\n|^)(?:From:|מאת:|On .+wrote:|בתאריך .+כתב|_{5,}|-{5,}.*(?:Original|Forwarded)|>)/im.exec(text)
    return { html: '', quotedHtml: '', text: match ? text.slice(0, match.index).trim() : text, quotedText: match ? text.slice(match.index).trim() : '' }
  }, [message, images, inlineImages])
  return <article className="email-message"><header><strong dir="auto">{emailAddressLabel(message.from)}</strong><time>{dateTimeLabel(message.date)}</time><details className="email-recipients"><summary>נמענים</summary><div dir="auto">אל: {emailAddressLabel(message.to)}</div>{message.cc && <div dir="auto">העתק: {emailAddressLabel(message.cc)}</div>}</details></header><h3 dir="auto">{emailText(message.subject)}</h3>
    <button type="button" className="secondary" aria-expanded={!collapsed} onClick={() => setCollapsed(!collapsed)}>{collapsed ? 'הצגת המייל' : 'מזעור המייל'}</button><div hidden={collapsed}>
    {content.html ? <div className="email-html" dir="auto" dangerouslySetInnerHTML={{ __html: content.html }} /> : <div className="email-plain" dir="auto">{content.text}</div>}
    {(content.quotedHtml || content.quotedText) && <details><summary>הצגת תוכן מצוטט מהודעות קודמות</summary>{content.quotedHtml ? <div className="email-html" dir="auto" dangerouslySetInnerHTML={{ __html: content.quotedHtml }} /> : <div className="email-plain">{content.quotedText}</div>}</details>}
    {imageError && <div className="error-banner" role="alert">{imageError}</div>}
    {!!message.attachments?.length && <div className="email-attachments" aria-label="קבצים מצורפים">{message.attachments.map(file => <button type="button" className="secondary" key={file.id} disabled={!!downloadId} onClick={() => void download(file.id)}><span dir="auto">{file.name}</span> · {Math.ceil(file.size / 1024)} KB · {downloadId === file.id ? 'מוריד...' : 'הורדה'}</button>)}<a href={`https://mail.google.com/mail/u/0/#all/${encodeURIComponent(message.threadId)}`} target="_blank" rel="noreferrer">פתיחת ההתכתבות ב-Gmail</a></div>}
    {!images && /<img\b/i.test(message.htmlBody || '') && <button type="button" className="secondary" disabled={imageBusy} onClick={() => { setImageBusy(true); setImageError(''); void (async () => { if (/cid:/i.test(message.htmlBody || '')) setInlineImages((await integrationsApi.mailImages(message.id)).images); setImages(true) })().catch((e) => setImageError(e.message)).finally(() => setImageBusy(false)) }}>{imageBusy ? 'טוען תמונות...' : 'הצגת תמונות בהודעה'}</button>}
    </div>
  </article>
}
