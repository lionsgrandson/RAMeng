import type { TaskColumn, Workspace } from '../types'
export const isProfessionColumn = (column: TaskColumn) => column.key.startsWith('custom.') && /מקצוע|profession/i.test(`${column.label} ${column.key}`)
export function taskColumnChoices(column: TaskColumn, workspace: Workspace) {
  return isProfessionColumn(column) ? workspace.categories.map(category => category.name) : column.options
}
export function professionValues(workspace: Workspace, column: TaskColumn) {
  const key = column.key.slice(7)
  return [...new Set(workspace.tasks.map(task => task.custom?.[key]).filter(Boolean))].filter(value => !workspace.categories.some(category => category.name === value))
}
export function normalizeProfessionValue(workspace: Workspace, column: TaskColumn, source: string, target: string) {
  if (!isProfessionColumn(column) || !source || !workspace.categories.some(category => category.name === target)) return workspace
  const key = column.key.slice(7)
  return { ...workspace, tasks: workspace.tasks.map(task => task.custom?.[key] === source ? { ...task, custom: { ...task.custom, [key]: target } } : task) }
}
