import BusinessSelect from './BusinessSelect'
import { useState } from 'react'
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
  return <>{contactFields.map(([key, label]) => <Field key={key} label={label}><>{key === "role" || key === "companyType" ? <BusinessSelect family={key === "role" ? "contact_role" : "company_type"} label={label} name={key} defaultValue={contact?.[key] || ""} legacy={contactOptions(contacts,key)} emptyOption={{value:"",label:"ללא"}} /> : <input name={key} type={key === "mobile" ? "tel" : "text"} defaultValue={contact?.[key]} />}</></Field>)}</>
}

export function ContactTags({ contact, contacts }: { contact?: Contact; contacts: Contact[] }) {
  const [tags, setTags] = useState(contact?.tags || []); const [value, setValue] = useState('')
  const add = (value: string) => { const next = value.split(',').map(value => value.trim()).filter(Boolean); setTags(current => [...new Set([...current, ...next])]); setValue('') }
  return <Field label="תגיות"><input name="tags" type="hidden" value={tags.join(', ')} /><div>{tags.map(tag => <button type="button" className="secondary" key={tag} aria-label={`הסרת תגית ${tag}`} onClick={() => setTags(tags.filter(value => value !== tag))}>{tag} ×</button>)}</div><BusinessSelect family="contact_tag" label="תגית" ariaLabel="בחירת תגית קיימת" value="" onValueChange={add} legacy={contactOptions(contacts,"tags")} emptyOption={{value:"",label:"בחירת תגית קיימת"}} /><input aria-label="תגית חדשה" value={value} onChange={event => setValue(event.target.value)} placeholder="תגית חדשה" onBlur={() => add(value)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); add(value) } }} /></Field>
}
