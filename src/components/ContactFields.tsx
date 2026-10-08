import { useId, useState } from 'react'
import type { Contact } from '../types'
import { contactOptions } from '../lib/contactCategories'
import { Field } from './common'

export const contactFields = [
  ['mobile', 'נייד'], ['role', 'תפקיד'], ['companyType', 'סוג חברה'],
  ['address', 'כתובת'], ['projectReferences', 'פרויקטים מהייבוא'],
  ['developer', 'שם יזם'], ['additionalContact', 'איש קשר נוסף'],
] as const

export function contactFormDetails(data: FormData) {
  return Object.fromEntries(contactFields.map(([key]) => [key, String(data.get(key) || '').trim()]))
}

export function ContactFields({ contact, contacts = [] }: { contact?: Contact; contacts?: Contact[] }) {
  const id = useId()
  return <>{contactFields.map(([key, label]) => <Field key={key} label={label}><input name={key} type={key === 'mobile' ? 'tel' : 'text'} list={key === 'role' || key === 'companyType' ? `${id}-${key}` : undefined} defaultValue={contact?.[key]} />{(key === 'role' || key === 'companyType') && <datalist id={`${id}-${key}`}>{contactOptions(contacts, key).map(value => <option key={value} value={value} />)}</datalist>}</Field>)}</>
}

export function ContactTags({ contact, contacts }: { contact?: Contact; contacts: Contact[] }) {
  const [tags, setTags] = useState(contact?.tags || []); const [value, setValue] = useState('')
  const add = (value: string) => { const next = value.split(',').map(value => value.trim()).filter(Boolean); setTags(current => [...new Set([...current, ...next])]); setValue('') }
  return <Field label="תגיות"><input name="tags" type="hidden" value={tags.join(', ')} /><div>{tags.map(tag => <button type="button" className="secondary" key={tag} aria-label={`הסרת תגית ${tag}`} onClick={() => setTags(tags.filter(value => value !== tag))}>{tag} ×</button>)}</div><select value="" aria-label="בחירת תגית קיימת" onChange={event => add(event.target.value)}><option value="">בחירת תגית קיימת</option>{contactOptions(contacts, 'tags').filter(tag => !tags.includes(tag)).map(tag => <option key={tag}>{tag}</option>)}</select><input aria-label="תגית חדשה" value={value} onChange={event => setValue(event.target.value)} placeholder="תגית חדשה" onBlur={() => add(value)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); add(value) } }} /></Field>
}
