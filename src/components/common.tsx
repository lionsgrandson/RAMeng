import { useEffect, useId, useRef, type ReactNode } from 'react'
import { Inbox, X } from 'lucide-react'

export const uid = (prefix = 'id') => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
export const nowIso = () => new Date().toISOString()
export const dateInput = (value?: string) => value ? value.slice(0, 10) : ''
export const dateLabel = (value?: string) => value ? new Intl.DateTimeFormat('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(value)) : 'ללא תאריך'
export const dateTimeLabel = (value?: string) => value ? new Intl.DateTimeFormat('he-IL', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value)) : ''
export const money = (value = 0) => new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 }).format(value)

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
        const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'))
        if (!focusable.length) return
        const first = focusable[0]
        const last = focusable[focusable.length - 1]
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
      }
    }
    document.addEventListener('keydown', onKeyDown)
    window.setTimeout(() => {
      const target = dialogRef.current?.querySelector<HTMLElement>('.modal-content input:not([disabled]), .modal-content select:not([disabled]), .modal-content textarea:not([disabled]), .modal-content button:not([disabled])')
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
