import type { PermissionArea } from './permissions'

// Only business vocabularies belong here. Security and technical enums never do.
export const businessFamilies = {
  project_status: { area: 'projects', defaults: ['בתכנון', 'בביצוע', 'בהמתנה', 'הושלם', 'מוקפא'] },
  contact_status: { area: 'contacts', defaults: ['ליד', 'פעיל', 'בהמתנה', 'לא פעיל'] },
  priority: { area: 'tasks', defaults: ['נמוכה', 'רגילה', 'גבוהה', 'דחופה'] },
  report_status: { area: 'reports', defaults: ['פתוח', 'לא תקין', 'בוצע חלקית', 'לא בוצע', 'תקין', 'בוצע', 'סגור'] },
  plan_status: { area: 'files', defaults: ['טיוטה', 'לעיון', 'לאישור', 'מאושרת', 'לביצוע', 'מבוטלת', 'עדות (As Made)'] },
  quote_status: { area: 'finance', defaults: ['טיוטה', 'נשלחה', 'אושרה', 'נדחתה', 'שולמה חלקית', 'שולמה'] },
  contact_role: { area: 'contacts', defaults: [] },
  company_type: { area: 'contacts', defaults: [] },
  contact_tag: { area: 'contacts', defaults: [] },
} satisfies Record<string, { area: PermissionArea; defaults: string[] }>
export type BusinessFamily = keyof typeof businessFamilies
export interface BusinessOption { family: BusinessFamily; value: string }

export function normalizeChoice(value: string) {
  const normalized = value.normalize('NFC').trim().replace(/\s+/gu, ' ')
  if (!normalized || [...normalized].length > 100 || /[\u0000-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/u.test(normalized)
    || normalized.startsWith('__') || ['הכל', 'ללא'].includes(normalized)) {
    throw new Error('יש להזין שם תקין באורך 1–100 תווים, שאינו ערך מערכת שמור')
  }
  return normalized
}
export const choiceKey = (value: string) => value.normalize('NFC').trim().replace(/\s+/gu, ' ').toLocaleLowerCase('he-IL')
export function uniqueChoices(values: string[]) {
  const keys = new Set<string>()
  return values.filter(value => { if (!value || keys.has(choiceKey(value))) return false; keys.add(choiceKey(value)); return true })
}
