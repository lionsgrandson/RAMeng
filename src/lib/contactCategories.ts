import type { Contact, Workspace } from '../types'

const roles: Record<string, string> = { 'יזמים': 'יזם', 'יזם': 'יזם', 'יועצים': 'יועץ', 'יועץ': 'יועץ', 'עורכי דין': 'עורך דין', 'עורך דין': 'עורך דין', 'עו״ד': 'עורך דין', 'עו"ד': 'עורך דין', 'קבלנים': 'קבלן', 'קבלן': 'קבלן', 'אדריכלים': 'אדריכל', 'אדריכל': 'אדריכל', 'מהנדסים': 'מהנדס', 'מהנדס': 'מהנדס' }
export const categoryText = (value: string) => value.normalize('NFKC').replace(/[\u200e\u200f\ufeff]/g, '').replace(/\s+/g, ' ').trim()
export const canonicalRole = (value: string) => roles[categoryText(value)] || categoryText(value)
export function normalizeContactCategories<T extends Pick<Contact, 'role' | 'companyType' | 'tags' | 'importDetails'>>(contact: T): T {
  const originalRole = contact.role || ''; let role = canonicalRole(originalRole)
  let companyType = categoryText(contact.companyType || '')
  const originalTags = contact.tags || []
  const tags = [...new Set(originalTags.map(categoryText).filter(Boolean))].filter(tag => {
    const inferred = roles[tag]
    if (!inferred || (role && role !== inferred)) return true
    role ||= inferred
    return false
  })
  if (roles[companyType] && (!role || role === roles[companyType])) { role ||= roles[companyType]; companyType = '' }
  if (role === originalRole && companyType === (contact.companyType || '') && JSON.stringify(tags) === JSON.stringify(originalTags)) return contact
  // Keep the source values for reversibility; never overwrite an existing backup.
  return { ...contact, role, companyType, tags, importDetails: { ...contact.importDetails, 'סיווג מקורי לפני נרמול': contact.importDetails?.['סיווג מקורי לפני נרמול'] || JSON.stringify({ role: originalRole, companyType: contact.companyType || '', tags: originalTags }) } }
}
export function normalizeWorkspaceCategories(workspace: Workspace): Workspace {
  return { ...workspace, contacts: workspace.contacts.map(normalizeContactCategories) }
}
export function contactOptions(contacts: Contact[], field: 'role' | 'companyType' | 'tags') {
  return [...new Set(contacts.flatMap(contact => field === 'tags' ? contact.tags : [contact[field] || '']).map(value => field === 'role' ? canonicalRole(value) : categoryText(value)).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'he'))
}
