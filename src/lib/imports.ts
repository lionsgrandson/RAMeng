import type { Contact, Task } from '../types'
import { normalizeContactCategories } from './contactCategories'

const dateColumns = ['תאריך התחלה', 'תאריך סיום', 'מועד מעקב']
const cleanText = (value: unknown) => String(value ?? '').replace(/[\u200e\u200f\u202a-\u202e\ufeff]/g, '').trim()
const aliases = {
  name: ['שם', 'שם מלא', 'name'], company: ['חברה', 'שם חברה', 'company'],
  phone: ['טלפון', 'phone'], mobile: ['נייד', 'mobile'], email: ['מייל', 'email'],
  role: ['תפקיד', 'role'], companyType: ['סוג חברה'], address: ['כתובת', 'address'],
  projectReferences: ['פרויקט', 'שם פרויקט'], developer: ['שם יזם'], additionalContact: ['קשר'], notes: ['הערות', 'notes'],
} as const

export function mapContactImportRows(rows: Record<string, unknown>[]): Omit<Contact, 'id' | 'createdAt'>[] {
  return rows.flatMap((row) => {
    const entries = Object.entries(row).map(([key, value]) => [cleanText(key).toLowerCase(), cleanText(value)] as const)
    const get = (field: keyof typeof aliases) => entries.find(([key, value]) => value && (aliases[field] as readonly string[]).includes(key))?.[1] || ''
    const name = get('name')
    if (!name || /^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(name) || ['name', 'שם'].includes(name.toLowerCase())) return []
    const phone = (field: 'phone' | 'mobile') => {
      const value = get(field)
      // Excel numeric cells lose the zero in local Israeli numbers.
      return /^\d{8,9}$/.test(value) ? `0${value}` : value
    }
    const known = new Set<string>(Object.values(aliases).flat())
    const importDetails = Object.fromEntries(entries.filter(([key, value]) => value && !known.has(key)))
    const lawyer = entries.some(([key]) => key === 'שם חברה') && entries.some(([key]) => key === 'שם פרויקט')
    return [{ name, company: get('company'), phone: phone('phone'), mobile: phone('mobile'), email: get('email'), role: get('role') || (lawyer ? 'עורך דין' : ''), companyType: get('companyType'), address: get('address'), projectReferences: get('projectReferences'), developer: get('developer'), additionalContact: get('additionalContact'), notes: get('notes'), importDetails, status: 'פעיל', tags: lawyer ? ['עורכי דין'] : [] }]
  })
}

export function appendUniqueContacts(existing: Contact[], incoming: Contact[]): { contacts: Contact[]; added: number; skipped: number } {
  const key = (source: Contact) => { const contact = normalizeContactCategories(source); return JSON.stringify({
    fields: [contact.name, contact.company, contact.phone, contact.mobile, contact.email, contact.role, contact.companyType, contact.address, contact.projectReferences, contact.developer, contact.additionalContact, contact.notes, contact.status].map((value) => cleanText(value)),
    tags: [...contact.tags].sort(), details: Object.entries(contact.importDetails || {}).filter(([key, value]) => value && key !== 'סיווג מקורי לפני נרמול').sort(([a], [b]) => a.localeCompare(b)),
  }) }
  const seen = new Set(existing.map(key))
  const added = incoming.filter((contact) => { const identity = key(contact); if (seen.has(identity)) return false; seen.add(identity); return true })
  return { contacts: [...existing, ...added], added: added.length, skipped: incoming.length - added.length }
}


/** Match only stable imported task fields, not mutable status or assignment.
 * Existing tasks retain their IDs, history and current status on repeated imports.
 */
export function appendUniqueTasks(existing: Task[], incoming: Task[]): { tasks: Task[]; added: number; skipped: number } {
  const normalized = (value: unknown) => cleanText(value).replace(/\s+/g, ' ').toLocaleLowerCase()
  const identity = (task: Task) => JSON.stringify([
    normalized(task.projectId), normalized(task.title), normalized(task.description),
    normalized(task.startDate), normalized(task.dueDate), normalized(task.followUpDate),
    normalized(task.emailTo),
  ])
  const seen = new Set(existing.map(identity))
  const added: Task[] = []
  for (const task of incoming) {
    if (!task.title.trim()) continue
    const key = identity(task)
    if (seen.has(key)) continue
    seen.add(key)
    added.push(task)
  }
  return { tasks: [...existing, ...added], added: added.length, skipped: incoming.length - added.length }
}

export async function readImportRows(buffer: ArrayBuffer, csv: boolean, kind: 'contacts' | 'tasks' = 'tasks'): Promise<Record<string, unknown>[]> {
  const XLSX = await import('@e965/xlsx')
  const workbook = csv
    ? XLSX.read(new TextDecoder('utf-8').decode(buffer), { type: 'string', raw: true })
    : XLSX.read(buffer, { type: 'array', cellDates: true })
  // Skip cover/instructions sheets and collect valid rows from every data worksheet.
  // A file with no recognized column headers is rejected rather than silently imported.
  const rows: Record<string, unknown>[] = []
  let recognizedSheets = 0
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName]
    if (!sheet?.['!ref']) continue
    const grid = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' })
    const headers: readonly string[] = kind === 'contacts' ? aliases.name : ['משימה', 'title', 'task']
    const firstHeader = grid.findIndex((line) => line.some((cell) => headers.includes(cleanText(cell).toLowerCase())))
    if (firstHeader < 0) continue
    recognizedSheets++
    const headerRow = firstHeader + XLSX.utils.decode_range(sheet['!ref']).s.r
    rows.push(...XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '', range: headerRow }))
  }
  if (!recognizedSheets) throw new Error(kind === 'contacts' ? 'לא נמצאה שורת כותרות עם עמודת שם או Name' : 'לא נמצאה עמודת משימה, title או Task')
  if (!rows.length) throw new Error('לא נמצאו שורות לייבוא')
  for (const row of rows) {
    for (const column of kind === 'tasks' ? dateColumns : []) {
      const value = row[column]
      if (value === undefined || value === '') continue
      let year: number, month: number, day: number
      if (value instanceof Date) { year = value.getFullYear(); month = value.getMonth() + 1; day = value.getDate() }
      else if (typeof value === 'number') {
        const parsed = XLSX.SSF.parse_date_code(value)
        if (!parsed) throw new Error(`תאריך לא תקין בעמודה ${column}`)
        year = parsed.y; month = parsed.m; day = parsed.d
      } else {
        const text = String(value).trim()
        const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/)
        const local = text.match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{4})$/)
        if (iso) { year = Number(iso[1]); month = Number(iso[2]); day = Number(iso[3]) }
        else if (local) { year = Number(local[3]); month = Number(local[2]); day = Number(local[1]) }
        else throw new Error(`תאריך לא תקין בעמודה ${column}. השתמשו בפורמט יום/חודש/שנה.`)
      }
      const date = new Date(Date.UTC(year, month - 1, day))
      if (date.getUTCFullYear() !== year || date.getUTCMonth() + 1 !== month || date.getUTCDate() !== day) throw new Error(`תאריך לא תקין בעמודה ${column}`)
      row[column] = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    }
  }
  return rows
}
