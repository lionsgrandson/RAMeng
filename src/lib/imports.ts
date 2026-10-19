import type { Contact, Project, Task } from '../types'
import { normalizeContactCategories } from './contactCategories'

const dateColumns = ['תאריך התחלה', 'תאריך סיום', 'מועד מעקב']
const cleanText = (value: unknown) => String(value ?? '').replace(/[\u200e\u200f\u202a-\u202e\ufeff]/g, '').trim()
const taskAliases: Record<string, string[]> = {
  'משימה': ['משימה', 'title', 'task'],
  'פרויקט': ['פרויקט', 'שם פרויקט', 'project', 'projectid', 'project id'],
  'סטטוס': ['סטטוס', 'status'],
  'הערות': ['הערות', 'notes', 'description'],
  'תאריך התחלה': ['תאריך התחלה', 'start date', 'startdate'],
  'תאריך סיום': ['תאריך סיום', 'תאריך יעד', 'due date', 'duedate'],
  'מועד מעקב': ['מועד מעקב', 'follow up date', 'followupdate'],
  'מייל': ['מייל', 'email', 'emailto'],
}

export function validateImportFile(file: { name: string; size: number }) {
  if (!/\.(xlsx?|csv)$/i.test(file.name)) throw new Error('יש לבחור קובץ Excel או CSV')
  if (!file.size) throw new Error('הקובץ ריק')
  if (file.size > 10 * 1024 * 1024) throw new Error('גודל קובץ מרבי לייבוא: 10 MB')
}

function normalizeTaskRow(row: Record<string, unknown>) {
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(row)) {
    const normalized = cleanText(key).toLowerCase()
    const canonical = Object.keys(taskAliases).find(name => taskAliases[name].includes(normalized)) || cleanText(key)
    if (result[canonical] !== undefined && result[canonical] !== '' && value !== '' && String(result[canonical]) !== String(value)) throw new Error(`עמודות סותרות: ${canonical}`)
    if (value !== '' || result[canonical] === undefined) result[canonical] = value
  }
  return result
}
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


/** Resolve only unambiguous existing projects; never silently attach a task to the wrong site. */
export function resolveTaskProjectReference(projects: Pick<Project, 'id' | 'name'>[], reference: unknown): string | undefined {
  const query = cleanText(reference)
  if (!query) return undefined
  const matches = projects.filter((project) => project.id === query || cleanText(project.name) === query)
  if (matches.length !== 1) throw new Error(matches.length ? `נמצאו מספר פרויקטים בשם "${query}"` : `לא נמצא פרויקט בשם או מזהה "${query}"`)
  return matches[0].id
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
    const parsed = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '', range: headerRow })
    for (const original of parsed) {
      const row = kind === 'tasks' ? normalizeTaskRow(original) : original
      if (kind === 'tasks') {
        const title = cleanText(row['משימה'])
        if (!title || taskAliases['משימה'].includes(title.toLowerCase())) continue
        row['משימה'] = title
      }
      rows.push(row)
      if (rows.length > 20000) throw new Error('ניתן לייבא עד 20,000 רשומות בכל פעם')
    }
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
