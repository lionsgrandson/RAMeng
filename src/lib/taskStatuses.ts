import type { Workspace } from '../types'

export const coreTaskStatuses = new Set(['טרם התחיל', 'בטיפול', 'ממתין לגורם חיצוני', 'דורש מעקב', 'בוצע חלקית', 'בוצע', 'סגור'])

/** Rename or retire a custom status atomically; never orphan existing tasks. */
export function replaceTaskStatus(workspace: Workspace, source: string, target: string, remove = false): Workspace {
  const name = target.trim()
  if (coreTaskStatuses.has(source) || !workspace.taskStatuses.includes(source)) throw new Error('לא ניתן לשנות סטטוס מובנה')
  if (!name || name === source) throw new Error('יש לבחור סטטוס חלופי')
  if (remove ? !workspace.taskStatuses.includes(name) : workspace.taskStatuses.includes(name)) throw new Error('הסטטוס החלופי אינו תקין')
  return { ...workspace,
    taskStatuses: remove ? workspace.taskStatuses.filter(value => value !== source) : workspace.taskStatuses.map(value => value === source ? name : value),
    tasks: workspace.tasks.map(task => task.status === source ? { ...task, status: name,
      completedAt: ['בוצע', 'סגור'].includes(name) ? task.completedAt || new Date().toISOString() : undefined,
    } : task),
  }
}
