import type { ReactNode } from 'react'
import { Inbox, X } from 'lucide-react'

export const uid = (prefix = 'id') => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
export const nowIso = () => new Date().toISOString()
export const dateInput = (value?: string) => value ? value.slice(0, 10) : ''
export const dateLabel = (value?: string) => value ? new Intl.DateTimeFormat('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(value)) : 'ללא תאריך'
export const dateTimeLabel = (value?: string) => value ? new Intl.DateTimeFormat('he-IL', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value)) : ''
export const money = (value = 0) => new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 }).format(value)

export function Modal({ title, children, onClose, wide = false }: { title: string; children: ReactNode; onClose: () => void; wide?: boolean }) {
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <section className={`modal-card ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true">
      <header><h2>{title}</h2><button className="icon-btn" onClick={onClose} aria-label="סגירה"><X /></button></header>
      <div className="modal-content">{children}</div>
    </section>
  </div>
}

export function EmptyState({ title, text, action }: { title: string; text: string; action?: ReactNode }) {
  return <div className="empty-state"><div className="empty-mark"><Inbox /></div><h3>{title}</h3><p>{text}</p>{action}</div>
}

export function Chip({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'good' | 'warn' | 'bad' | 'brand' }) {
  return <span className={`chip ${tone}`}>{children}</span>
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return <label className="field"><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>
}
