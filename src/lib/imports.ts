import type { Contact } from '../types'
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

export async function readImportRows(buffer: ArrayBuffer, csv: boolean, kind: 'contacts' | 'tasks' = 'tasks'): Promise<Record<string, unknown>[]> {
  const XLSX = await import('@e965/xlsx')
  const workbook = csv
    ? XLSX.read(new TextDecoder('utf-8').decode(buffer), { type: 'string', raw: true })
    : XLSX.read(buffer, { type: 'array', cellDates: true })
  const firstName = workbook.SheetNames[0]
  if (!firstName) throw new Error('הקובץ לא מכיל גיליון נתונים')
  const sheet = workbook.Sheets[firstName]
  let headerRow = 0
  if (kind === 'contacts') {
    const grid = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' })
    headerRow = grid.findIndex((row) => row.some((value) => (aliases.name as readonly string[]).includes(cleanText(value).toLowerCase())))
    if (headerRow < 0) throw new Error('לא נמצאה שורת כותרות עם עמודת שם או Name')
    headerRow += XLSX.utils.decode_range(sheet['!ref'] || 'A1').s.r
  }
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '', ...(kind === 'contacts' ? { range: headerRow } : {}) })
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
