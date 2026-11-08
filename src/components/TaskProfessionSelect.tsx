import type { Task, Workspace } from '../types'
import { taskProfessionName, withTaskProfession } from '../lib/taskProfession'

export default function TaskProfessionSelect({ task, workspace, disabled, onChange }: { task: Task; workspace: Workspace; disabled?: boolean; onChange: (task: Task) => void }) {
  const name = taskProfessionName(task, workspace)
  return <select className="cell-input" aria-label={`מקצוע עבור ${task.title}`} disabled={disabled} value={name} onChange={event => onChange(withTaskProfession(task, workspace.categories.find(category => category.name === event.target.value)?.id || '', workspace))}><option value="">ללא מקצוע</option>{name && !workspace.categories.some(category => category.name === name) && <option>{name}</option>}{workspace.categories.map(category => <option key={category.id}>{category.name}</option>)}</select>
}
