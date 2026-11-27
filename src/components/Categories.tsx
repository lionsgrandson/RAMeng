import { useState } from 'react'
import type { Workspace } from '../types'
import { renameProfession, taskProfessionIds } from '../lib/taskProfession'
import { uid } from './common'
import CreatableSelect from './CreatableSelect'
import { useRecordCreation } from './BusinessSelect'
import { createProfession } from '../lib/inlineChoices'
import { choiceKey, normalizeChoice } from '../lib/businessOptions'

export function CategoryPicker({ workspace, setWorkspace, projectId, value, onChange, disabled = false }: { workspace: Workspace; setWorkspace?: React.Dispatch<React.SetStateAction<Workspace>>; projectId?: string; value: string[]; onChange: (ids: string[]) => void; disabled?: boolean }) {
  const project = workspace.projects.find(item => item.id === projectId)
  const canCreate = useRecordCreation()
  return <div className="category-picker">{workspace.categories.filter(category => !projectId || project?.categoryIds?.includes(category.id)).map(category => <label key={category.id}><input type="checkbox" disabled={disabled} checked={value.includes(category.id)} onChange={event => onChange(event.target.checked ? [...value, category.id] : value.filter(id => id !== category.id))} />{category.name}</label>)}{setWorkspace && !disabled && canCreate('tasks') && <CreatableSelect label="מקצוע" ariaLabel="הוספת מקצוע לקובץ" value="" emptyOption={{value:'',label:'בחירת מקצוע'}} options={workspace.categories.map(category=>({value:category.id,label:category.name}))} onCreate={name=>{const id=uid('category');setWorkspace(current=>createProfession(current,name,id,projectId));return id}} onValueChange={id=>onChange([...new Set([...value,id])])} />}</div>
}

export function CategoryManager({ workspace, setWorkspace, projectId, canEdit, canDelete = false }: { workspace: Workspace; setWorkspace: React.Dispatch<React.SetStateAction<Workspace>>; projectId?: string; canEdit: boolean; canDelete?: boolean }) {
  const [name, setName] = useState(''); const [error, setError] = useState('')
  const project = workspace.projects.find(item => item.id === projectId)
  const add = () => {
    try {
      const trimmed = normalizeChoice(name)
      if (workspace.categories.some(category => choiceKey(category.name) === choiceKey(trimmed))) { setError('יש להזין שם מקצוע ייחודי'); return }
      const id = uid('category')
      setWorkspace(current => createProfession(current, trimmed, id, projectId))
      setName(''); setError('')
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'שם מקצוע אינו תקין') }
  }
  return <details className="card category-manager"><summary>{project ? 'בחירת תחומי עבודה לפרויקט' : 'ניהול תחומי עבודה (מקצועות)'}</summary>{error && <p role="alert">{error}</p>}{canEdit && <div className="inline-create"><input placeholder="למשל: חשמל, אדריכלות, קונסטרוקציה" aria-label="שם מקצוע חדש" value={name} onChange={event => setName(event.target.value)} /><button type="button" className="secondary" onClick={add}>הוספת מקצוע</button></div>}
    {workspace.categories.map(category => <div className="inline-create" key={category.id}>{project && <label><input aria-label={`שיוך ${category.name} לפרויקט`} type="checkbox" disabled={!canEdit} checked={project.categoryIds?.includes(category.id) || false} onChange={event => {
      if (!event.target.checked && (workspace.tasks.some(task => task.projectId === projectId && taskProfessionIds(task, workspace).includes(category.id)) || workspace.files.some(file => file.projectId === projectId && file.categoryIds?.includes(category.id)))) { setError('המקצוע משויך למשימות או לקבצים בפרויקט. הסירו קודם את השיוכים.'); return }
      setWorkspace(current => ({ ...current, projects: current.projects.map(item => item.id === projectId ? { ...item, categoryIds: event.target.checked ? [...(item.categoryIds || []), category.id] : item.categoryIds?.filter(id => id !== category.id) } : item) }))
    }} />שיוך לפרויקט זה</label>}<input aria-label={`שם מקצוע ${category.name}`} disabled={!canEdit} defaultValue={category.name} onBlur={event => { const value = event.target.value.trim(); if (!value || workspace.categories.some(item => item.id !== category.id && item.name === value)) { event.target.value = category.name; setError('שם המקצוע חייב להיות ייחודי ולא ריק'); return } if (value !== category.name) setWorkspace(current => renameProfession(current, category.id, value)) }} />{canDelete && <button className="secondary" type="button" onClick={() => {
      // Keep linked records intact. Categories in use can be renamed, but not removed.
      if (workspace.projects.some(item => item.categoryIds?.includes(category.id)) || workspace.tasks.some(item => taskProfessionIds(item, workspace).includes(category.id)) || workspace.files.some(item => item.categoryIds?.includes(category.id))) { setError('המקצוע נמצא בשימוש. אפשר לשנות את שמו.'); return }
      setWorkspace(current => ({ ...current, categories: current.categories.filter(item => item.id !== category.id) }))
    }}>מחיקה</button>}</div>)}
  </details>
}
