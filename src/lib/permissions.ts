import type { Workspace } from '../types'

export const permissionAreas = ['contacts', 'projects', 'tasks', 'calendar', 'files', 'reports', 'finance', 'communication'] as const
export const permissionActions = ['view', 'create', 'edit', 'status', 'delete'] as const

export type PermissionArea = typeof permissionAreas[number]
export type PermissionAction = typeof permissionActions[number]
export type AreaPermissions = Record<PermissionAction, boolean>
export type PermissionMatrix = Record<PermissionArea, AreaPermissions>
export type StoredPermissions = Partial<Record<PermissionArea, Partial<AreaPermissions>>>

export const permissionAreaLabels: Record<PermissionArea, string> = {
  contacts: 'לקוחות ואנשי קשר',
  projects: 'פרויקטים',
  tasks: 'משימות',
  calendar: 'יומן',
  files: 'קבצים',
  reports: 'דוחות',
  finance: 'כספים והצעות מחיר',
  communication: 'תקשורת והערות',
}

export const permissionActionLabels: Record<PermissionAction, string> = {
  view: 'צפייה',
  create: 'הוספה',
  edit: 'עריכה',
  status: 'סטטוס',
  delete: 'מחיקה',
}

const blankArea = (): AreaPermissions => ({ view: false, create: false, edit: false, status: false, delete: false })
const fullArea = (): AreaPermissions => ({ view: true, create: true, edit: true, status: true, delete: true })
const viewArea = (): AreaPermissions => ({ view: true, create: false, edit: false, status: false, delete: false })

const matrix = (value: () => AreaPermissions): PermissionMatrix => Object.fromEntries(permissionAreas.map((area) => [area, value()])) as PermissionMatrix

export function rolePermissionPreset(role: string, isDeveloper = false): PermissionMatrix {
  const effectiveRole = isDeveloper ? 'developer' : role
  if (['developer', 'admin', 'manager'].includes(effectiveRole)) return matrix(fullArea)

  const next = matrix(viewArea)
  const editable = effectiveRole === 'assistant'
    ? ['contacts', 'projects', 'tasks', 'calendar', 'files', 'finance', 'communication'] as PermissionArea[]
    : ['inspector', 'engineer'].includes(effectiveRole)
      ? ['projects', 'tasks', 'calendar', 'files', 'reports', 'communication'] as PermissionArea[]
      : []

  editable.forEach((area) => { next[area] = fullArea() })
  return next
}

export function normalizePermissions(role: string, stored?: StoredPermissions | null, isDeveloper = false): PermissionMatrix {
  const next = rolePermissionPreset(role, isDeveloper)
  if (isDeveloper || role === 'developer' || !stored || typeof stored !== 'object') return next

  for (const area of permissionAreas) {
    const custom = stored[area]
    if (!custom || typeof custom !== 'object') continue
    for (const action of permissionActions) {
      if (typeof custom[action] === 'boolean') next[area][action] = Boolean(custom[action])
    }
    if (!next[area].view) {
      next[area].create = false
      next[area].edit = false
      next[area].status = false
      next[area].delete = false
    } else if (next[area].create || next[area].edit || next[area].status || next[area].delete) {
      next[area].view = true
    }
  }
  return next
}

export const canMutateArea = (permissions: PermissionMatrix, area: PermissionArea) =>
  permissions[area].create || permissions[area].edit || permissions[area].status || permissions[area].delete

export const hasAnyWritePermission = (permissions: PermissionMatrix) =>
  permissionAreas.some((area) => canMutateArea(permissions, area))

export function permissionSummary(permissions: PermissionMatrix) {
  const hidden = permissionAreas.filter((area) => !permissions[area].view).length
  const full = permissionAreas.filter((area) => permissionActions.every((action) => permissions[area][action])).length
  const writable = permissionAreas.filter((area) => canMutateArea(permissions, area)).length
  if (full === permissionAreas.length) return 'גישה מלאה'
  if (!writable && hidden === 0) return 'צפייה בלבד'
  if (!writable) return 'צפייה מוגבלת'
  return `${writable} תחומים לעריכה${hidden ? ` · ${hidden} מוסתרים` : ''}`
}

const workspaceArea: Partial<Record<keyof Workspace, PermissionArea>> = {
  contacts: 'contacts',
  deals: 'contacts',
  projects: 'projects',
  tasks: 'tasks',
  taskColumns: 'tasks',
  taskStatuses: 'tasks',
  checklistTemplates: 'tasks',
  events: 'calendar',
  files: 'files',
  reports: 'reports',
  reportTemplates: 'reports',
  quotes: 'finance',
  clientNotes: 'communication',
}

const isObject = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value)

function onlyStatusChanged(before: unknown, after: unknown, key = ''): boolean {
  if (JSON.stringify(before) === JSON.stringify(after)) return true
  if (key === 'status') return true

  if (Array.isArray(before) && Array.isArray(after)) {
    if (before.length !== after.length) return false
    return before.every((value, index) => onlyStatusChanged(value, after[index]))
  }

  if (isObject(before) && isObject(after)) {
    const keys = new Set([...Object.keys(before), ...Object.keys(after)])
    return [...keys].every((childKey) => onlyStatusChanged(before[childKey], after[childKey], childKey))
  }

  return false
}

function arrayOperations(before: unknown[], after: unknown[]) {
  const identifiable = [...before, ...after].every((item) => isObject(item) && typeof item.id !== 'undefined')
  if (!identifiable) {
    return {
      created: after.length > before.length,
      deleted: after.length < before.length,
      edited: JSON.stringify(before) !== JSON.stringify(after),
      statusOnly: false,
    }
  }

  const beforeById = new Map(before.map((item) => [String((item as Record<string, unknown>).id), item]))
  const afterById = new Map(after.map((item) => [String((item as Record<string, unknown>).id), item]))
  const created = [...afterById.keys()].some((id) => !beforeById.has(id))
  const deleted = [...beforeById.keys()].some((id) => !afterById.has(id))
  let edited = false
  let statusOnly = true

  for (const [id, oldItem] of beforeById) {
    const newItem = afterById.get(id)
    if (!newItem || JSON.stringify(oldItem) === JSON.stringify(newItem)) continue
    edited = true
    if (!onlyStatusChanged(oldItem, newItem)) statusOnly = false
  }

  return { created, deleted, edited, statusOnly: edited && statusOnly }
}

export function workspaceMutationError(
  before: Workspace,
  after: Workspace,
  permissions: PermissionMatrix,
  options: { canManageUsers: boolean; isDeveloper: boolean },
): string | null {
  const keys = Object.keys(after) as (keyof Workspace)[]
  for (const key of keys) {
    if (JSON.stringify(before[key]) === JSON.stringify(after[key])) continue
    if (key === 'audit') continue
    if (key === 'team') {
      if (!options.canManageUsers) return 'אין הרשאה לשנות את צוות המשתמשים'
      continue
    }
    if (key === 'settings') {
      if (!options.isDeveloper) return 'אין הרשאה לשנות הגדרות מערכת'
      continue
    }

    const area = workspaceArea[key]
    if (!area) return `אין הרשאה לשנות את אזור ${String(key)}`
    const allowed = permissions[area]

    const oldValue = before[key]
    const newValue = after[key]
    if (Array.isArray(oldValue) && Array.isArray(newValue)) {
      const ops = arrayOperations(oldValue, newValue)
      if (ops.created && !allowed.create) return `אין הרשאת הוספה באזור ${permissionAreaLabels[area]}`
      if (ops.deleted && !allowed.delete) return `אין הרשאת מחיקה באזור ${permissionAreaLabels[area]}`
      if (ops.edited) {
        if (ops.statusOnly) {
          if (!allowed.status && !allowed.edit) return `אין הרשאה לשנות סטטוס באזור ${permissionAreaLabels[area]}`
        } else if (!allowed.edit) {
          return `אין הרשאת עריכה באזור ${permissionAreaLabels[area]}`
        }
      }
      continue
    }

    if (!allowed.edit) return `אין הרשאת עריכה באזור ${permissionAreaLabels[area]}`
  }
  return null
}
