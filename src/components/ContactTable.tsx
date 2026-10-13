import { useContext, useEffect, useState } from 'react'
import type { Contact } from '../types'
import { DisplayContext } from './DisplaySettings'
import { downloadTable, printTable } from '../lib/tableExport'

export const contactTableColumns = [
  { key: 'name', label: 'שם' }, { key: 'role', label: 'תפקיד / מקצוע' }, { key: 'company', label: 'חברה' },
  { key: 'phone', label: 'טלפון' }, { key: 'mobile', label: 'נייד' }, { key: 'email', label: 'מייל' }, { key: 'address', label: 'כתובת' },
] as const

export default function ContactTable({ contacts, title = 'אנשי קשר', onContact }: { contacts: Contact[]; title?: string; onContact?: (id: string) => void }) {
  const display = useContext(DisplayContext)
  const [error, setError] = useState('')
  const [page, setPage] = useState(0)
  const pageSize = 25
  const lastPage = Math.max(0, Math.ceil(contacts.length / pageSize) - 1)
  const currentPage = Math.min(page, lastPage)
  useEffect(() => setPage(0), [contacts])
  const visibleContacts = contacts.slice(currentPage * pageSize, (currentPage + 1) * pageSize)
  const configured = display.contactColumns.map(key => contactTableColumns.find(column => column.key === key)).filter((column): column is typeof contactTableColumns[number] => !!column)
  const columns = configured.filter(column => !display.hiddenContactColumns.includes(column.key))
  const headers = columns.map(column => column.label)
  const rows = contacts.map(contact => columns.map(column => contact[column.key] || ''))
  const move = (key: string, direction: number) => {
    const next = [...display.contactColumns]; const index = next.indexOf(key); const target = index + direction
    if (target < 0 || target >= next.length) return
    ;[next[index], next[target]] = [next[target], next[index]]; display.update({ contactColumns: next })
  }
  const pagination = <nav className="contact-pagination" aria-label="עמודי אנשי קשר"><span role="status">{contacts.length ? `${currentPage * pageSize + 1}–${Math.min((currentPage + 1) * pageSize, contacts.length)} מתוך ${contacts.length} אנשי קשר` : 'אין אנשי קשר להצגה'}</span><button type="button" className="secondary" disabled={!currentPage} onClick={() => setPage(currentPage - 1)}>הקודם</button><span>עמוד {currentPage + 1} מתוך {lastPage + 1}</span><button type="button" className="secondary" disabled={currentPage >= lastPage} onClick={() => setPage(currentPage + 1)}>הבא</button></nav>
  return <div className="contact-table-panel"><div className="toolbar"><button className="secondary" disabled={!columns.length} onClick={() => downloadTable(title, headers, rows)}>ייצוא CSV</button><button className="secondary" disabled={!columns.length} onClick={() => { try { printTable(title, headers, rows) } catch (e) { setError((e as Error).message) } }}>הדפסה / PDF</button><span className="field-help">הייצוא כולל את כל אנשי הקשר המסוננים. לחצו על שם או על פתיחת כרטיס לפרטים.</span></div>
    {error && <p role="alert">{error}</p>}
    <details><summary>עמודות אנשי קשר</summary><p>נשמר לחשבון שלך בדפדפן, כמו צפיפות וקיבוץ משימות.</p>{configured.map((column, index) => <div className="toolbar" key={column.key}><label><input type="checkbox" checked={!display.hiddenContactColumns.includes(column.key)} onChange={event => display.update({ hiddenContactColumns: event.target.checked ? display.hiddenContactColumns.filter(key => key !== column.key) : [...display.hiddenContactColumns, column.key] })} />{column.label}</label><button className="secondary" disabled={index === 0} aria-label={`הזזת ${column.label} מוקדם יותר`} onClick={() => move(column.key, -1)}>↑</button><button className="secondary" disabled={index === configured.length - 1} aria-label={`הזזת ${column.label} מאוחר יותר`} onClick={() => move(column.key, 1)}>↓</button></div>)}</details>
    {pagination}
    <div className="table-scroll" tabIndex={0} aria-label="טבלת אנשי קשר — גלילה אופקית"><table className="data-table project-contacts-table"><thead><tr>{columns.map(column => <th key={column.key}>{column.label}</th>)}{onContact && <th>כרטיס איש קשר</th>}</tr></thead><tbody>{visibleContacts.map(contact => <tr key={contact.id}>{columns.map(column => <td key={column.key} data-contact-column={column.key}>{column.key === 'name' && onContact ? <button type="button" className="contact-name-link" onClick={() => onContact(contact.id)}><bdi>{contact.name}</bdi></button> : <bdi dir={['phone', 'mobile', 'email'].includes(column.key) ? 'ltr' : 'auto'}>{contact[column.key] || '—'}</bdi>}</td>)}{onContact && <td><button type="button" className="secondary contact-open-button" aria-label={`פתיחת כרטיס ${contact.name}`} onClick={() => onContact(contact.id)}>פתיחת כרטיס ←</button></td>}</tr>)}{!contacts.length && <tr><td colSpan={Math.max(1, columns.length + (onContact ? 1 : 0))}>אין אנשי קשר להצגה</td></tr>}</tbody></table></div>
    {contacts.length > pageSize && pagination}</div>
}
