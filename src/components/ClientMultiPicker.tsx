import { useMemo, useState } from 'react'
import { Search, UserRound, X } from 'lucide-react'
import type { Contact } from '../types'

type Props = {
  contacts: Contact[]
  selectedIds?: string[]
  defaultSelectedIds?: string[]
  onChange?: (ids: string[]) => void
  name?: string
}

export default function ClientMultiPicker({ contacts, selectedIds, defaultSelectedIds = [], onChange, name = 'clientIds' }: Props) {
  const controlled = selectedIds !== undefined
  const [internal, setInternal] = useState(defaultSelectedIds)
  const [query, setQuery] = useState('')
  const value = controlled ? selectedIds! : internal
  const selected = new Set(value)

  const update = (next: string[]) => {
    if (!controlled) setInternal(next)
    onChange?.(next)
  }

  const toggle = (id: string) => {
    const next = selected.has(id) ? value.filter((item) => item !== id) : [...value, id]
    update(next)
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return contacts.filter((contact) => !q || `${contact.name} ${contact.company || ''} ${contact.email || ''} ${contact.phone || ''}`.toLowerCase().includes(q))
  }, [contacts, query])

  const selectedContacts = value.map((id) => contacts.find((contact) => contact.id === id)).filter(Boolean) as Contact[]

  return <div className="client-multi-picker">
    {value.map((id) => <input key={id} type="hidden" name={name} value={id} />)}
    <div className="client-picker-search"><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="חיפוש לפי שם, חברה, מייל או טלפון" aria-label="חיפוש לקוחות" /></div>
    {selectedContacts.length > 0 && <div className="client-picker-selected" aria-label="לקוחות שנבחרו">{selectedContacts.map((contact) => <button type="button" key={contact.id} onClick={() => toggle(contact.id)}><UserRound /><span>{contact.name}</span><X /></button>)}</div>}
    <div className="client-picker-list">{filtered.map((contact) => {
      const active = selected.has(contact.id)
      return <label key={contact.id} className={active ? 'client-picker-option selected' : 'client-picker-option'}>
        <input type="checkbox" checked={active} onChange={() => toggle(contact.id)} />
        <span className="client-picker-avatar">{contact.name.slice(0, 2)}</span>
        <span className="client-picker-copy"><strong>{contact.name}</strong><small>{contact.company || contact.email || contact.phone || 'ללא פרטים נוספים'}</small></span>
        <span className="client-picker-state">{active ? 'נבחר' : 'בחירה'}</span>
      </label>
    })}{!filtered.length && <div className="client-picker-empty">לא נמצאו לקוחות מתאימים.</div>}</div>
  </div>
}
