import { useContext, useRef, useState, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import { Modal } from './common'
import { WorkspaceSaveContext } from './WorkspaceSave'
import { normalizeChoice, choiceKey } from '../lib/businessOptions'

export interface DropdownOption { value: string; label: string }
export interface CreationField { key: string; label: string; required?: boolean; type?: 'text' | 'email' }

type Props = {
  label: string
  options: DropdownOption[]
  name?: string
  value?: string
  defaultValue?: string
  onValueChange?: (value: string) => void
  onCreate?: (name: string, details: Record<string, string>) => string | Promise<string>
  extraFields?: CreationField[]
  allowDuplicateNames?: boolean
  disabled?: boolean
  required?: boolean
  className?: string
  ariaLabel?: string
  emptyOption?: DropdownOption
}

const ADD_NEW = '__rameng_create_new_option__'

/**
 * Creates organization-owned choices in place, without unmounting the parent form.
 * The caller is responsible for saving the new choice through setWorkspace.
 * Restricted/system-defined selectors should not receive onCreate.
 */
export default function CreatableSelect({
  label, options, name, value, defaultValue, onValueChange, onCreate, extraFields = [],
  disabled = false, required = false, className, ariaLabel, emptyOption, allowDuplicateNames = false,
}: Props) {
  const [localValue, setLocalValue] = useState(defaultValue ?? emptyOption?.value ?? options[0]?.value ?? '')
  const [creating, setCreating] = useState(false)
  const [draft, setDraft] = useState('')
  const [error, setError] = useState('')
  const [optimistic, setOptimistic] = useState<DropdownOption | null>(null)
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)
  const pending = useRef<{ key: string; value: string } | null>(null)
  const { commit } = useContext(WorkspaceSaveContext)
  const selectRef = useRef<HTMLSelectElement>(null)
  const onValueChangeRef = useRef(onValueChange)
  onValueChangeRef.current = onValueChange
  const selected = value === undefined ? localValue : value
  const choices = emptyOption ? [emptyOption, ...options] : options
  const hasSelected = choices.some(option => option.value === selected)
  const choose = (next: string) => {
    if (value === undefined) setLocalValue(next)
    onValueChangeRef.current?.(next)
  }
  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    event.stopPropagation()
    if (busyRef.current) return
    const details = Object.fromEntries(new FormData(event.currentTarget).entries()) as Record<string, string>
    busyRef.current = true; setBusy(true); setError('')
    try {
      const trimmed = normalizeChoice(draft)
      for (const field of extraFields) if (field.required && !details[field.key]?.trim()) throw new Error(`יש להזין ${field.label}`)
      // Linked records can share names; addresses/emails identify the intended record.
      const existing = extraFields.length || allowDuplicateNames ? undefined : choices.find(option => choiceKey(option.label) === choiceKey(trimmed))
      const key = JSON.stringify([trimmed, details])
      const next = existing?.value ?? (pending.current?.key === key ? pending.current.value : await onCreate?.(trimmed, details))
      if (!next) throw new Error('לא ניתן ליצור את הפריט')
      pending.current = { key, value: next }
      await commit()
      setOptimistic({ value: next, label: existing?.label || trimmed })
      choose(next)
      setCreating(false)
      setDraft('')
      setError('')
      pending.current = null
      selectRef.current?.focus()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'יצירת הפריט נכשלה')
    } finally { busyRef.current = false; setBusy(false) }
  }

  return <>
    <select
      ref={selectRef}
      name={name} className={className} aria-label={ariaLabel || label}
      value={selected} disabled={disabled} required={required}
      onChange={event => {
        if (event.target.value === ADD_NEW) { event.target.value = selected; setError(''); setCreating(true); return }
        choose(event.target.value)
      }}
    >
      {choices.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
      {selected && !hasSelected && <option value={selected}>{optimistic?.value === selected ? optimistic.label : selected}</option>}
      {onCreate && !disabled && <option value={ADD_NEW}>+ הוספת פריט חדש</option>}
    </select>
    {creating && onCreate && createPortal(
      <Modal title={`הוספת ${label}`} onClose={() => { if (!busyRef.current) { setCreating(false); setDraft(''); setError(''); pending.current = null } }}>
        <form className="form-grid" onSubmit={save} dir="rtl">
          <label className="field"><span>שם {label}</span><input required autoFocus maxLength={100} disabled={busy} value={draft} onChange={event => setDraft(event.target.value)} /></label>
          {extraFields.map(field => <label className="field" key={field.key}><span>{field.label}</span><input name={field.key} type={field.type || 'text'} required={field.required} /></label>)}
          {error && <p role="alert" className="error-banner">{error}</p>}
          <div className="form-actions">
            <button type="button" className="secondary" disabled={busy} onClick={() => { setCreating(false); setDraft(''); setError(''); pending.current = null }}>ביטול</button>
            <button className="primary" type="submit" disabled={busy}>{busy ? 'שומר...' : 'הוספה ובחירה'}</button>
          </div>
        </form>
      </Modal>, document.body)}
  </>
}

export const textChoices = (values: string[]): DropdownOption[] => values.map(value => ({ value, label: value }))
