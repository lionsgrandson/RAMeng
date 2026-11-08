import type { Task, TaskColumn, Workspace } from '../types'
export const isProfessionColumn = (column: TaskColumn) => column.key.startsWith('custom.') && /מקצוע|profession/i.test(`${column.label} ${column.key}`)
export function taskProfessionIds(task: Task, workspace: Workspace): string[] {
  if (task.professionId) return workspace.categories.some(item => item.id === task.professionId) ? [task.professionId] : []
  const legacy = workspace.taskColumns.filter(isProfessionColumn).map(column => task.custom?.[column.key.slice(7)]).filter(Boolean)
  return [...new Set([...workspace.categories.filter(category => legacy.includes(category.name)).map(category => category.id), ...(task.categoryIds || [])])]
}
export function taskProfessionName(task: Task, workspace: Workspace) {
  if (!task.professionId) {
    const legacy = workspace.taskColumns.filter(isProfessionColumn).map(column => task.custom?.[column.key.slice(7)]).find(Boolean)
    if (legacy) return legacy
  }
  const id = taskProfessionIds(task, workspace)[0]
  return workspace.categories.find(category => category.id === id)?.name || workspace.taskColumns.filter(isProfessionColumn).map(column => task.custom?.[column.key.slice(7)]).find(Boolean) || ''
}
export function withTaskProfession(task: Task, id: string, workspace: Workspace): Task {
  const profession = workspace.categories.find(category => category.id === id)
  const project = workspace.projects.find(project => project.id === task.projectId)
  return { ...task, professionId: profession?.id || undefined, categoryIds: profession && (!task.projectId || project?.categoryIds?.includes(id)) ? [id] : [], custom: { ...task.custom, ...Object.fromEntries(workspace.taskColumns.filter(isProfessionColumn).map(column => [column.key.slice(7), profession?.name || ''])) } }
}

export function renameProfession(workspace: Workspace, id: string, name: string): Workspace {
  const previous = workspace.categories.find(category => category.id === id)
  return { ...workspace, categories: workspace.categories.map(category => category.id === id ? { ...category, name } : category), tasks: workspace.tasks.map(task => {
    const replacements = workspace.taskColumns.filter(isProfessionColumn).filter(column => previous && task.custom?.[column.key.slice(7)] === previous.name).map(column => [column.key.slice(7), name])
    return replacements.length ? { ...task, custom: { ...task.custom, ...Object.fromEntries(replacements) } } : task
  }) }
}
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
