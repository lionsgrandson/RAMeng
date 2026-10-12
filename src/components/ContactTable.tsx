import { useContext, useState } from 'react'
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
  const configured = display.contactColumns.map(key => contactTableColumns.find(column => column.key === key)).filter((column): column is typeof contactTableColumns[number] => !!column)
  const columns = configured.filter(column => !display.hiddenContactColumns.includes(column.key))
  const headers = columns.map(column => column.label)
  const rows = contacts.map(contact => columns.map(column => contact[column.key] || ''))
  const move = (key: string, direction: number) => {
    const next = [...display.contactColumns]; const index = next.indexOf(key); const target = index + direction
    if (target < 0 || target >= next.length) return
    ;[next[index], next[target]] = [next[target], next[index]]; display.update({ contactColumns: next })
  }
  return <div><div className="toolbar"><button className="secondary" disabled={!columns.length} onClick={() => downloadTable(title, headers, rows)}>ייצוא CSV</button><button className="secondary" disabled={!columns.length} onClick={() => { try { printTable(title, headers, rows) } catch (e) { setError((e as Error).message) } }}>הדפסה / PDF</button></div>
    {error && <p role="alert">{error}</p>}
    <details><summary>עמודות אנשי קשר</summary><p>נשמר לחשבון שלך בדפדפן, כמו צפיפות וקיבוץ משימות.</p>{configured.map((column, index) => <div className="toolbar" key={column.key}><label><input type="checkbox" checked={!display.hiddenContactColumns.includes(column.key)} onChange={event => display.update({ hiddenContactColumns: event.target.checked ? display.hiddenContactColumns.filter(key => key !== column.key) : [...display.hiddenContactColumns, column.key] })} />{column.label}</label><button className="secondary" disabled={index === 0} aria-label={`הזזת ${column.label} מוקדם יותר`} onClick={() => move(column.key, -1)}>↑</button><button className="secondary" disabled={index === configured.length - 1} aria-label={`הזזת ${column.label} מאוחר יותר`} onClick={() => move(column.key, 1)}>↓</button></div>)}</details>
    <div className="table-scroll"><table className="data-table project-contacts-table"><thead><tr>{columns.map(column => <th key={column.key}>{column.label}</th>)}</tr></thead><tbody>{contacts.map(contact => <tr key={contact.id}>{columns.map(column => <td key={column.key}>{column.key === 'name' && onContact ? <button className="text-button" onClick={() => onContact(contact.id)}>{contact.name}</button> : contact[column.key] || '—'}</td>)}</tr>)}{!contacts.length && <tr><td colSpan={Math.max(1, columns.length)}>אין אנשי קשר להצגה</td></tr>}</tbody></table></div></div>
}
