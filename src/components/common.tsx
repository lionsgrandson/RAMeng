import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { Inbox, X } from 'lucide-react'
import type { FileRecord } from '../types'
import { refreshSignedUrl } from '../lib/backend'

export const uid = (prefix = 'id') => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
export const nowIso = () => new Date().toISOString()
export const dateInput = (value?: string) => value ? value.slice(0, 10) : ''
export const dateLabel = (value?: string) => value ? new Intl.DateTimeFormat('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(value)) : 'ללא תאריך'
export const dateTimeLabel = (value?: string) => value ? new Intl.DateTimeFormat('he-IL', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Jerusalem' }).format(new Date(value)) : ''
export const money = (value = 0) => new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 }).format(value)

export function StoredImage({ photo, alt }: { photo: { url: string; storagePath?: string }; alt: string }) {
  const [url, setUrl] = useState(photo.url)
  // Older reports stored only the signed URL. Recover its bucket-relative path
  // so those photos can also be reopened after the original token expires.
  const signedPath = photo.url.split('/storage/v1/object/sign/crm-files/')[1]?.split('?')[0]
  let storagePath = photo.storagePath
  if (!storagePath && signedPath) { try { storagePath = decodeURIComponent(signedPath) } catch { /* Keep the original URL. */ } }
  useEffect(() => {
    let active = true
    setUrl(photo.url)
    if (storagePath) void refreshSignedUrl(storagePath).then((next) => { if (active && next) setUrl(next) }).catch(() => undefined)
    return () => { active = false }
  }, [storagePath, photo.url])
  return <img src={url} alt={alt} />
}

export function StoredFileLink({ file, className, children }: { file: FileRecord; className?: string; children: ReactNode }) {
  const [resolvedUrl, setResolvedUrl] = useState(file.storagePath ? '' : file.url)

  useEffect(() => {
    let active = true
    setResolvedUrl(file.storagePath ? '' : file.url)
    if (!file.storagePath) return () => { active = false }
    void refreshSignedUrl(file.storagePath)
      .then((url) => { if (active) setResolvedUrl(url || file.url) })
      .catch(() => { if (active) setResolvedUrl(file.url) })
    return () => { active = false }
  }, [file.storagePath, file.url])

  if (!resolvedUrl) return <span className={`${className || ''} file-link-loading`.trim()} aria-busy="true">{children}</span>
  return <a className={className} href={resolvedUrl} target="_blank" rel="noreferrer" aria-label={`פתיחת הקובץ ${file.name}`}>{children}</a>
}

export function PdfReaderButton({ file }: { file: FileRecord }) {
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const desktop = !!window.ramengDesktop?.openPdfInFoxit
  if (file.type !== 'application/pdf' && !/\.pdf$/i.test(file.name)) return null
  return <div className="pdf-reader-action"><button type="button" className="secondary" disabled={busy} onClick={() => {
    setBusy(true); setNotice('')
    void (async () => {
      const url = file.storagePath ? await refreshSignedUrl(file.storagePath) : file.url
      if (!url) throw new Error('לא ניתן ליצור קישור לקובץ')
      if (desktop) { await window.ramengDesktop!.openPdfInFoxit!(url, file.name); return }
      const response = await fetch(url)
      if (!response.ok) throw new Error('הורדת ה-PDF נכשלה')
      const blob = await response.blob()
      if (!(await blob.slice(0, 5).text()).startsWith('%PDF-')) throw new Error('הקישור אינו מכיל קובץ PDF. פתחו את הקובץ בקישור הרגיל להורדה מהמקור.')
      const objectUrl = URL.createObjectURL(blob)
      const link = document.createElement('a'); link.href = objectUrl; link.download = file.name; link.click()
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60000)
      setNotice('הקובץ הורד. פתחו אותו באמצעות Foxit Reader. לפתיחה קבועה ב-Foxit הגדירו אותו כברירת המחדל לקובצי PDF ב-Windows.')
    })().catch(error => setNotice(error instanceof Error ? error.message : 'פתיחת ה-PDF נכשלה')).finally(() => setBusy(false))
  }}>{busy ? 'מכין PDF...' : desktop ? 'פתיחה ב-Foxit Reader' : 'הורדת PDF ל-Foxit Reader'}</button>{notice && <small role="status">{notice}</small>}</div>
}

export function Modal({ title, children, onClose, wide = false }: { title: string; children: ReactNode; onClose: () => void; wide?: boolean }) {
  const titleId = useId()
  const dialogRef = useRef<HTMLElement>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const oldOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCloseRef.current()
      if (event.key === 'Tab' && dialogRef.current) {
        const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')).filter((element) => element.getClientRects().length > 0)
        if (!focusable.length) return
        const first = focusable[0]
        const last = focusable[focusable.length - 1]
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
      }
    }
    document.addEventListener('keydown', onKeyDown)
    window.setTimeout(() => {
      const target = dialogRef.current?.querySelector<HTMLElement>('.modal-content input:not([disabled]):not([type="hidden"]), .modal-content select:not([disabled]), .modal-content textarea:not([disabled]), .modal-content button:not([disabled])')
        || dialogRef.current?.querySelector<HTMLElement>('button:not([disabled])')
      target?.focus()
    }, 0)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = oldOverflow
      previous?.focus()
    }
  }, [])

  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <section ref={dialogRef} className={`modal-card ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <header><h2 id={titleId}>{title}</h2><button type="button" className="icon-btn" onClick={onClose} aria-label="סגירה"><X /></button></header>
      <div className="modal-content">{children}</div>
    </section>
  </div>
}

export const confirmDelete = (label = 'הפריט') => window.confirm(`למחוק את ${label}? לא ניתן לבטל את הפעולה.`)

export function EmptyState({ title, text, action }: { title: string; text: string; action?: ReactNode }) {
  return <div className="empty-state"><div className="empty-mark"><Inbox /></div><h3>{title}</h3><p>{text}</p>{action}</div>
}

export function Chip({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'good' | 'warn' | 'bad' | 'brand' }) {
  return <span className={`chip ${tone}`}>{children}</span>
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return <label className="field"><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>
}
