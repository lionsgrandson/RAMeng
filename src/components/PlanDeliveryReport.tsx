import { useState } from 'react'
import type { GoogleDriveFile } from '../lib/api'
import { downloadTable, printTable } from '../lib/tableExport'
import { dateTimeLabel } from './common'

export default function PlanDeliveryReport({ files, projectName }: { files: GoogleDriveFile[]; projectName: string }) {
  const [error, setError] = useState('')
  const headers = ['שם קובץ', 'תאריך שינוי ב-Drive', 'סטטוס']
  const rows = files.map(file => [file.name, file.modifiedTime ? dateTimeLabel(file.modifiedTime) : 'לא זמין', 'נבחר לדוח — לא אישור מסירה'])
  const title = `טופס מסירת תוכניות — ${projectName}`
  return <section className="card"><h3>טופס מסירת תוכניות</h3><p>נבחרו {files.length} קבצים לדוח. יצירת הדוח אינה שולחת קבצים ואינה מעניקה גישה. לשיתוף השתמשו בפעולת השיתוף של כל קובץ.</p><div className="toolbar"><button className="secondary" disabled={!files.length} onClick={() => downloadTable(title, headers, rows)}>ייצוא טופס CSV</button><button className="secondary" disabled={!files.length} onClick={() => { try { printTable(title, headers, rows, 'רשימת קבצים נבחרים; אין בדוח אישור שהקבצים נשלחו או נמסרו.') } catch (e) { setError((e as Error).message) } }}>הדפסת טופס / PDF</button></div>{error && <p role="alert">{error}</p>}<div className="table-scroll"><table className="data-table"><thead><tr>{headers.map(header => <th key={header}>{header}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={files[index].id}>{row.map((cell, i) => <td key={i}>{cell}</td>)}</tr>)}</tbody></table></div></section>
}
