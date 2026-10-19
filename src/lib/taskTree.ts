import type { Task } from '../types'

/** Iterative traversal keeps deeply nested or cyclic legacy data visible and searchable. */
export function taskTreeRows(tasks: Task[], matches: (task: Task) => boolean): { task: Task; depth: number }[] {
  const byId = new Map(tasks.map(task => [task.id, task]))
  const children = new Map<string | undefined, Task[]>()
  for (const task of tasks) {
    const parent = task.parentId && task.parentId !== task.id && byId.has(task.parentId) ? task.parentId : undefined
    const list = children.get(parent) || []
    list.push(task); children.set(parent, list)
  }
  for (const list of children.values()) list.sort((a, b) => a.order - b.order)
  const included = new Set<string>()
  for (const task of tasks) {
    if (!matches(task)) continue
    let current: Task | undefined = task
    while (current && !included.has(current.id)) { included.add(current.id); current = byId.get(current.parentId || '') }
  }
  const rows: { task: Task; depth: number }[] = []
  const visited = new Set<string>()
  const walk = (roots: Task[]) => {
    const stack = roots.map(task => ({ task, depth: 0 })).reverse()
    while (stack.length) {
      const row = stack.pop()!
      if (visited.has(row.task.id)) continue
      visited.add(row.task.id)
      if (included.has(row.task.id)) rows.push(row)
      for (const task of [...(children.get(row.task.id) || [])].reverse()) stack.push({ task, depth: row.depth + 1 })
    }
  }
  walk(children.get(undefined) || [])
  // Corrupt cycles have no root. Render them once without changing persisted data.
  walk(tasks.filter(task => !visited.has(task.id)))
  return rows
}
