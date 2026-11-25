import { useState, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import { Modal } from './common'

export interface DropdownOption { value: string; label: string }
export interface CreationField { key: string; label: string; required?: boolean; type?: 'text' | 'email' }

type Props = {
  label: string
  options: DropdownOption[]
  name?: string
  value?: string
  defaultValue?: string
  onValueChange?: (value: string) => void
  onCreate?: (name: string, details: Record<string, string>) => string
  extraFields?: CreationField[]
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
  disabled = false, required = false, className, ariaLabel, emptyOption,
}: Props) {
  const [localValue, setLocalValue] = useState(defaultValue ?? emptyOption?.value ?? options[0]?.value ?? '')
  const [creating, setCreating] = useState(false)
  const [draft, setDraft] = useState('')
  const [error, setError] = useState('')
  const [optimistic, setOptimistic] = useState<DropdownOption | null>(null)
  const selected = value === undefined ? localValue : value
  const choices = emptyOption ? [emptyOption, ...options] : options
  const hasSelected = choices.some(option => option.value === selected)
  const choose = (next: string) => {
    if (value === undefined) setLocalValue(next)
    onValueChange?.(next)
  }
  const save = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const trimmed = draft.normalize('NFC').trim().replace(/\s+/g, ' ')
    if (!trimmed || trimmed.length > 100 || /[\u0000-\u001f\u007f]/.test(trimmed)) {
      setError('יש להזין שם תקין באורך 1–100 תווים')
      return
    }
    const existing = choices.find(option => option.label.normalize('NFC').trim().toLocaleLowerCase('he-IL') === trimmed.toLocaleLowerCase('he-IL'))
    try {
      const details = Object.fromEntries(new FormData(event.currentTarget).entries()) as Record<string, string>
      const next = existing?.value ?? onCreate?.(trimmed, details)
      if (!next) throw new Error('לא ניתן ליצור את הפריט')
      setOptimistic({ value: next, label: existing?.label || trimmed })
      choose(next)
      setCreating(false)
      setDraft('')
      setError('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'יצירת הפריט נכשלה')
    }
  }

  return <>
    <select
      name={name} className={className} aria-label={ariaLabel || label}
      value={selected} disabled={disabled} required={required}
      onChange={event => {
        if (event.target.value === ADD_NEW) { setError(''); setCreating(true); return }
        choose(event.target.value)
      }}
    >
      {choices.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
      {selected && !hasSelected && <option value={selected}>{optimistic?.value === selected ? optimistic.label : selected}</option>}
      {onCreate && !disabled && <option value={ADD_NEW}>+ הוספת פריט חדש</option>}
    </select>
    {creating && onCreate && createPortal(
      <Modal title={`הוספת ${label}`} onClose={() => { setCreating(false); setError('') }}>
        <form className="form-grid" onSubmit={save} dir="rtl">
          <label className="field"><span>שם {label}</span><input required autoFocus maxLength={100} value={draft} onChange={event => setDraft(event.target.value)} /></label>
          {extraFields.map(field => <label className="field" key={field.key}><span>{field.label}</span><input name={field.key} type={field.type || 'text'} required={field.required} /></label>)}
          {error && <p role="alert" className="error-banner">{error}</p>}
          <div className="form-actions">
            <button type="button" className="secondary" onClick={() => { setCreating(false); setError('') }}>ביטול</button>
            <button className="primary" type="submit">הוספה ובחירה</button>
          </div>
        </form>
      </Modal>, document.body)}
  </>
}

export const textChoices = (values: string[]): DropdownOption[] => values.map(value => ({ value, label: value }))
