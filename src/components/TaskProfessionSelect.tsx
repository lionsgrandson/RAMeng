import type { Task, Workspace } from '../types'
import { createProfession } from '../lib/inlineChoices'
import { taskProfessionName, withTaskProfession } from '../lib/taskProfession'
import { uid } from './common'
import CreatableSelect from './CreatableSelect'

export default function TaskProfessionSelect({
  task, workspace, setWorkspace, disabled, canCreate = false, canEditProject = false,
}: {
  task: Task
  workspace: Workspace
  setWorkspace: React.Dispatch<React.SetStateAction<Workspace>>
  disabled?: boolean
  canCreate?: boolean
  canEditProject?: boolean
}) {
  const name = taskProfessionName(task, workspace)
  const category = workspace.categories.find(item => item.name === name)
  const selection = category?.id || name || ''
  const options = workspace.categories.map(item => ({ value: item.id, label: item.name }))
  if (name && !category) options.unshift({ value: name, label: name })
  return <CreatableSelect
    className="cell-input" label="מקצוע" ariaLabel={`מקצוע עבור ${task.title}`}
    disabled={disabled} value={selection} emptyOption={{ value: '', label: 'ללא מקצוע' }}
    options={options}
    onValueChange={id => setWorkspace(current => ({
      ...current,
      tasks: current.tasks.map(item => item.id === task.id ? withTaskProfession(item, id, current) : item),
    }))}
    onCreate={canCreate && !disabled ? name => {
      const existing = workspace.categories.find(item => item.name.trim().toLocaleLowerCase('he-IL') === name.toLocaleLowerCase('he-IL'))
      const id = existing?.id || uid('category')
      setWorkspace(current => createProfession(current, name, id, canEditProject ? task.projectId : undefined))
      return id
    } : undefined}
  />
}
