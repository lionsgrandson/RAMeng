import type { TaskColumn } from '../types'

export const taskSystemColumns: TaskColumn[] = [
  { id: 'col-time', key: 'scheduledTime', label: 'שעה (ירושלים)', type: 'time', visible: true, removable: false, width: 110 },
  { id: 'col-select', key: '__select', label: 'בחירה לסיכום פגישה', type: 'text', visible: true, removable: false, width: 80 },
  { id: 'col-categories', key: '__categories', label: 'מקצועות', type: 'text', visible: true, removable: false, width: 160 },
  { id: 'col-completed', key: '__completed', label: 'בוצע', type: 'text', visible: true, removable: false, width: 70 },
  { id: 'col-color', key: '__color', label: 'קטלוג', type: 'text', visible: true, removable: false, width: 110 },
  { id: 'col-project', key: '__project', label: 'פרויקט', type: 'text', visible: true, removable: false, width: 180 },
  { id: 'col-actions', key: '__actions', label: 'פעולות', type: 'text', visible: true, removable: false, width: 160 },
]

// Derive defaults without writing on page load. The first settings edit saves
// the complete order alongside the existing columns in the workspace document.
export function normalizeTaskColumns(columns: TaskColumn[]) {
  const normalized = columns.map(column => {
    if (column.key === 'emailTo' && column.label === 'תיבת מייל') return { ...column, label: 'מייל לקוח' }
    if (column.key === 'followUpDate' && column.label === 'מועד מעקב / סיום') return { ...column, label: 'מועד מעקב' }
    if (column.key === 'dueDate' && column.label === 'תאריך יעד') return { ...column, label: 'תאריך סיום' }
    return { ...column }
  })
  if (!normalized.some(column => column.key === 'dueDate')) {
    const follow = normalized.findIndex(column => column.key === 'followUpDate')
    normalized.splice(follow < 0 ? normalized.length : follow, 0, { id: 'col-due', key: 'dueDate', label: 'תאריך סיום', type: 'date', visible: true, removable: false, width: 145 })
  }
  const missing = taskSystemColumns.filter(column => !normalized.some(item => item.key === column.key))
  if (!normalized.some(column => taskSystemColumns.some(system => system.key === column.key))) {
    return [...missing.filter(column => column.key !== '__actions').map(column => ({ ...column })), ...normalized, ...missing.filter(column => column.key === '__actions').map(column => ({ ...column }))]
  }
  return [...normalized, ...missing.map(column => ({ ...column }))]
}

export function visibleTaskColumns(columns: TaskColumn[], projectId?: string) {
  return normalizeTaskColumns(columns).filter(column => column.visible && (column.key !== '__select' || !!projectId) && (column.key !== '__project' || !projectId))
}

// Legacy pixel widths become proportional percentages without rewriting saved data.
export function percentageTaskColumns(columns: TaskColumn[]) {
  const legacyTotal = columns.reduce((sum, column) => sum + (column.width && column.width > 0 ? column.width : 160), 0)
  const weights = columns.map(column => Number.isFinite(column.widthPercent) && column.widthPercent! > 0 ? column.widthPercent! : (column.width && column.width > 0 ? column.width : 160) / legacyTotal * 100)
  const total = weights.reduce((sum, width) => sum + width, 0)
  return columns.map((column, index) => ({ ...column, widthPercent: weights[index] / total * 100 }))
}

export function resizeTaskColumn(columns: TaskColumn[], id: string, percent: number) {
  if (!Number.isFinite(percent) || percent < 1 || percent > 99) return columns
  const list = percentageTaskColumns(normalizeTaskColumns(columns))
  const target = list.find(column => column.id === id)
  if (!target) return columns
  const otherTotal = 100 - target.widthPercent
  return list.map(column => ({ ...column, widthPercent: column.id === id ? percent : column.widthPercent / otherTotal * (100 - percent) }))
}

export function moveTaskColumn(columns: TaskColumn[], id: string, direction: -1 | 1) {
  const list = normalizeTaskColumns(columns)
  const index = list.findIndex(column => column.id === id)
  const next = index + direction
  if (index < 0 || next < 0 || next >= list.length) return columns
  ;[list[index], list[next]] = [list[next], list[index]]
  return list
}
