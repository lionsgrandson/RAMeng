import { useState } from 'react'
import type { Workspace } from '../types'
import { uid } from './common'

export function CategoryPicker({ workspace, projectId, value, onChange, disabled = false }: { workspace: Workspace; projectId?: string; value: string[]; onChange: (ids: string[]) => void; disabled?: boolean }) {
  const project = workspace.projects.find(item => item.id === projectId)
  return <div className="category-picker">{workspace.categories.filter(category => !projectId || project?.categoryIds?.includes(category.id)).map(category => <label key={category.id}><input type="checkbox" disabled={disabled} checked={value.includes(category.id)} onChange={event => onChange(event.target.checked ? [...value, category.id] : value.filter(id => id !== category.id))} />{category.name}</label>)}</div>
}

export function CategoryManager({ workspace, setWorkspace, projectId, canEdit, canDelete = false }: { workspace: Workspace; setWorkspace: React.Dispatch<React.SetStateAction<Workspace>>; projectId?: string; canEdit: boolean; canDelete?: boolean }) {
  const [name, setName] = useState(''); const [error, setError] = useState('')
  const project = workspace.projects.find(item => item.id === projectId)
  const add = () => {
    const trimmed = name.trim()
    if (!trimmed || workspace.categories.some(category => category.name.trim() === trimmed)) { setError('יש להזין שם מקצוע ייחודי'); return }
    const id = uid('category')
    setWorkspace(current => ({ ...current, categories: [...current.categories, { id, name: trimmed }], projects: current.projects.map(item => item.id === projectId ? { ...item, categoryIds: [...(item.categoryIds || []), id] } : item) }))
    setName(''); setError('')
  }
  return <details className="card category-manager"><summary>ניהול מקצועות וקטגוריות</summary>{error && <p role="alert">{error}</p>}{canEdit && <div className="inline-create"><input aria-label="שם מקצוע חדש" value={name} onChange={event => setName(event.target.value)} /><button type="button" className="secondary" onClick={add}>הוספת מקצוע</button></div>}
    {workspace.categories.map(category => <div className="inline-create" key={category.id}>{project && <label><input aria-label={`שיוך ${category.name} לפרויקט`} type="checkbox" disabled={!canEdit} checked={project.categoryIds?.includes(category.id) || false} onChange={event => {
      if (!event.target.checked && (workspace.tasks.some(task => task.projectId === projectId && task.categoryIds?.includes(category.id)) || workspace.files.some(file => file.projectId === projectId && file.categoryIds?.includes(category.id)))) { setError('המקצוע משויך למשימות או לקבצים בפרויקט. הסירו קודם את השיוכים.'); return }
      setWorkspace(current => ({ ...current, projects: current.projects.map(item => item.id === projectId ? { ...item, categoryIds: event.target.checked ? [...(item.categoryIds || []), category.id] : item.categoryIds?.filter(id => id !== category.id) } : item) }))
    }} />בפרויקט</label>}<input aria-label={`שם מקצוע ${category.name}`} disabled={!canEdit} defaultValue={category.name} onBlur={event => { const value = event.target.value.trim(); if (!value || workspace.categories.some(item => item.id !== category.id && item.name === value)) { event.target.value = category.name; setError('שם המקצוע חייב להיות ייחודי ולא ריק'); return } if (value !== category.name) setWorkspace(current => ({ ...current, categories: current.categories.map(item => item.id === category.id ? { ...item, name: value } : item) })) }} />{canDelete && <button className="secondary" type="button" onClick={() => {
      // Keep linked records intact. Categories in use can be renamed, but not removed.
      if (workspace.projects.some(item => item.categoryIds?.includes(category.id)) || workspace.tasks.some(item => item.categoryIds?.includes(category.id)) || workspace.files.some(item => item.categoryIds?.includes(category.id))) { setError('המקצוע נמצא בשימוש. אפשר לשנות את שמו.'); return }
      setWorkspace(current => ({ ...current, categories: current.categories.filter(item => item.id !== category.id) }))
    }}>מחיקה</button>}</div>)}
  </details>
}
