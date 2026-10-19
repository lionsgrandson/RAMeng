import { useMemo, useState } from 'react'
import { Search, UserRound, X } from 'lucide-react'
import type { Contact } from '../types'

type Props = {
  label?: string
  contacts: Contact[]
  selectedIds?: string[]
  defaultSelectedIds?: string[]
  onChange?: (ids: string[]) => void
  onContact?: (id: string) => void
  name?: string
}

export default function ClientMultiPicker({ contacts, selectedIds, defaultSelectedIds = [], onChange, onContact, name = 'clientIds', label = 'לקוחות' }: Props) {
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
    <div className="client-picker-search"><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="חיפוש לפי שם, חברה, מייל או טלפון" aria-label={`חיפוש ${label}`} /></div>
    {selectedContacts.length > 0 && <div className="client-picker-selected" aria-label={`${label} שנבחרו`}>{selectedContacts.map((contact) => <span className="selected-contact-chip" key={contact.id}><button type="button" onClick={() => onContact ? onContact(contact.id) : toggle(contact.id)}><UserRound /><bdi>{contact.name}</bdi></button><button type="button" aria-label={`הסרת ${contact.name} מהבחירה`} onClick={() => toggle(contact.id)}><X /></button></span>)}</div>}
    <div className="client-picker-list">{filtered.map((contact) => {
      const active = selected.has(contact.id)
      return <label key={contact.id} className={active ? 'client-picker-option selected' : 'client-picker-option'}>
        <input type="checkbox" checked={active} onChange={() => toggle(contact.id)} />
        <span className="client-picker-avatar">{contact.name.slice(0, 2)}</span>
        <span className="client-picker-copy"><strong>{contact.name}</strong><small>{contact.company || contact.email || contact.phone || 'ללא פרטים נוספים'}</small></span>
        <span className="client-picker-state">{active ? 'נבחר' : 'בחירה'}</span>
        {onContact && <button type="button" className="contact-name-link" aria-label={`פתיחת כרטיס ${contact.name}`} onClick={event => { event.preventDefault(); event.stopPropagation(); onContact(contact.id) }}>פתיחת כרטיס</button>}
      </label>
    })}{!filtered.length && <div className="client-picker-empty">לא נמצאו {label} מתאימים.</div>}</div>
  </div>
}
