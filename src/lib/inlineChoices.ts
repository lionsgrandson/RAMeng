import { normalizeChoice, choiceKey } from './businessOptions'
import type { Workspace } from '../types'

const normalize = normalizeChoice
const same = (left: string, right: string) => choiceKey(left) === choiceKey(right)

export function createTaskStatus(workspace: Workspace, name: string): Workspace {
  const value = normalize(name)
  if (!value) throw new Error('חובה להזין סטטוס')
  return workspace.taskStatuses.some(status => same(status, value)) ? workspace : {
    ...workspace, taskStatuses: [...workspace.taskStatuses, value],
  }
}

export function createProfession(workspace: Workspace, name: string, newId: string, projectId?: string): Workspace {
  const value = normalize(name)
  if (!value) throw new Error('חובה להזין מקצוע')
  const existing = workspace.categories.find(category => same(category.name, value))
  const id = existing?.id || newId
  return {
    ...workspace,
    categories: existing ? workspace.categories : [...workspace.categories, { id, name: value }],
    projects: projectId ? workspace.projects.map(project => project.id === projectId && !project.categoryIds?.includes(id)
      ? { ...project, categoryIds: [...(project.categoryIds || []), id] } : project) : workspace.projects,
  }
}

export function createColumnOption(workspace: Workspace, columnId: string, name: string): Workspace {
  const value = normalize(name)
  if (!value) throw new Error('חובה להזין ערך')
  if (!workspace.taskColumns.some(column => column.id === columnId)) throw new Error('העמודה אינה זמינה')
  if (workspace.taskColumns.find(column => column.id === columnId)?.type === 'status') return createTaskStatus(workspace, value)
  return { ...workspace, taskColumns: workspace.taskColumns.map(column => {
    if (column.id !== columnId || column.options?.some(option => same(option, value))) return column
    return { ...column, options: [...(column.options || []), value] }
  }) }
}

export const projectStatuses = (workspace: Workspace) =>
  [...new Set(['בתכנון', 'בביצוע', 'בהמתנה', 'הושלם', 'מוקפא', ...workspace.projects.map(project => project.status)])]
export const contactStatuses = (workspace: Workspace) =>
  [...new Set(['ליד', 'פעיל', 'בהמתנה', 'לא פעיל', ...workspace.contacts.map(contact => contact.status)])]
