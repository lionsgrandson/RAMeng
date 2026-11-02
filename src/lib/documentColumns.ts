import type { DocumentColumn } from '../types'

export const reportColumnDefaults: DocumentColumn[] = [
  { key: 'number', label: '#', visible: true },
  { key: 'description', label: 'תיאור', visible: true },
  { key: 'status', label: 'סטטוס', visible: true },
  { key: 'treatment', label: 'לטיפול / הערות', visible: true },
  { key: 'responsible', label: 'אחראי / יעד', visible: true },
  { key: 'photos', label: 'תמונות', visible: true },
]
export const meetingColumnDefaults: DocumentColumn[] = [
  { key: 'title', label: 'משימה', visible: true },
  { key: 'category', label: 'מקצוע', visible: true },
  { key: 'assignee', label: 'אחראי', visible: true },
  { key: 'status', label: 'סטטוס', visible: true },
  { key: 'dueDate', label: 'יעד', visible: true },
  { key: 'notes', label: 'הערות לפגישה', visible: true },
]

// Older documents have no layout. Never mutate them just by opening/exporting.
export function documentColumns(value: DocumentColumn[] | undefined, defaults: DocumentColumn[]): DocumentColumn[] {
  const seen = new Set<string>()
  const columns: DocumentColumn[] = []
  for (const column of Array.isArray(value) ? value : []) {
    const known = defaults.find(item => item.key === column?.key)
    if (!known || seen.has(known.key)) continue
    seen.add(known.key)
    columns.push({ ...known, visible: column.visible !== false })
  }
  columns.push(...defaults.filter(column => !seen.has(column.key)).map(column => ({ ...column })))
  // A usable document always has at least one field.
  if (!columns.some(column => column.visible)) columns[0].visible = true
  return columns
}
