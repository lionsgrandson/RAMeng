import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { ChevronDown, ChevronUp, Columns3, Mail, Plus, Settings2, Trash2 } from 'lucide-react'
import type { ChecklistTemplateItem, Priority, Task, TaskColumn, TaskColumnType, Workspace } from '../types'
import type { AreaPermissions } from '../lib/permissions'
import { Chip, Field, Modal, confirmDelete, dateInput, nowIso, uid } from './common'

type Props = {
  workspace: Workspace
  setWorkspace: React.Dispatch<React.SetStateAction<Workspace>>
  projectId?: string
  onEmail?: (task: Task) => void
  canEdit?: boolean
  permissions?: AreaPermissions
  focusTaskId?: string | null
  attentionOnly?: boolean
  onClearAttention?: () => void
  startCreating?: boolean
  onProject?: (id: string) => void
}

type TaskView = 'active' | 'archive'

const COMPLETED_STATUSES = ['בוצע', 'סגור']
const TASK_COLOR_OPTIONS = [
  { id: '', label: 'ללא צבע', hex: '#d5dbd6' },
  { id: 'red', label: 'אדום', hex: '#d65a5a' },
  { id: 'orange', label: 'כתום', hex: '#dc8b3d' },
  { id: 'yellow', label: 'צהוב', hex: '#d5b63f' },
  { id: 'green', label: 'ירוק', hex: '#4f9a68' },
  { id: 'blue', label: 'כחול', hex: '#4f78c8' },
  { id: 'purple', label: 'סגול', hex: '#7d62bd' },
  { id: 'gray', label: 'אפור', hex: '#7d8780' },
] as const
const taskColor = (id?: string) => TASK_COLOR_OPTIONS.find((item) => item.id === (id || '')) || TASK_COLOR_OPTIONS[0]
const isCompleted = (task: Task) => Boolean(task.completedAt) || COMPLETED_STATUSES.includes(task.status)

const fieldValue = (task: Task, column: TaskColumn) => {
  if (column.key.startsWith('custom.')) return task.custom[column.key.slice(7)] || ''
  return String((task as unknown as Record<string, unknown>)[column.key] ?? '')
}

export default function TaskBoard({ workspace, setWorkspace, projectId, onEmail, onProject, canEdit = true, permissions, focusTaskId, attentionOnly = false, onClearAttention, startCreating = false }: Props) {
  const taskPermissions: AreaPermissions = permissions || { view: true, create: canEdit, edit: canEdit, status: canEdit, delete: canEdit }
  const canCreate = taskPermissions.create
  const canUpdate = taskPermissions.edit
  const canStatus = taskPermissions.status || taskPermissions.edit
  const canDelete = taskPermissions.delete
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('הכל')
  const [projectFilter, setProjectFilter] = useState('הכל')
  const [assigneeFilter, setAssigneeFilter] = useState('הכל')
  const [colorFilter, setColorFilter] = useState('הכל')
  const [view, setView] = useState<TaskView>('active')
  const [creatingFor, setCreatingFor] = useState<{ parentId?: string } | null>(startCreating && canCreate ? {} : null)
  const [showColumns, setShowColumns] = useState(false)
  const [newColumn, setNewColumn] = useState('')
  const [newColumnType, setNewColumnType] = useState<TaskColumnType>('text')
  const [newStatus, setNewStatus] = useState('')

  const taskColumns = useMemo(() => {
    const normalized = workspace.taskColumns.map((column) => {
      if (column.key === 'emailTo' && column.label === 'תיבת מייל') return { ...column, label: 'מייל לקוח' }
      if (column.key === 'followUpDate' && column.label === 'מועד מעקב / סיום') return { ...column, label: 'מועד מעקב' }
      if (column.key === 'dueDate' && column.label === 'תאריך יעד') return { ...column, label: 'תאריך סיום' }
      return column
    })
    if (!normalized.some((column) => column.key === 'dueDate')) {
      const followIndex = normalized.findIndex((column) => column.key === 'followUpDate')
      const dueColumn: TaskColumn = { id: 'col-due', label: 'תאריך סיום', key: 'dueDate', type: 'date', visible: true, removable: false, width: 145 }
      if (followIndex >= 0) normalized.splice(followIndex, 0, dueColumn)
      else normalized.push(dueColumn)
    }
    return normalized
  }, [workspace.taskColumns])
  const visibleColumns = taskColumns.filter((column) => column.visible)

  useEffect(() => {
    if (!canUpdate) return
    const needsEmailRename = workspace.taskColumns.some((column) => column.key === 'emailTo' && column.label === 'תיבת מייל')
    const needsFollowRename = workspace.taskColumns.some((column) => column.key === 'followUpDate' && column.label === 'מועד מעקב / סיום')
    const needsDueRename = workspace.taskColumns.some((column) => column.key === 'dueDate' && column.label === 'תאריך יעד')
    const needsDueColumn = !workspace.taskColumns.some((column) => column.key === 'dueDate')
    if (!needsEmailRename && !needsFollowRename && !needsDueRename && !needsDueColumn) return
    setWorkspace((current) => {
      const columns = current.taskColumns.map((column) => {
        if (column.key === 'emailTo' && column.label === 'תיבת מייל') return { ...column, label: 'מייל לקוח' }
        if (column.key === 'followUpDate' && column.label === 'מועד מעקב / סיום') return { ...column, label: 'מועד מעקב' }
        if (column.key === 'dueDate' && column.label === 'תאריך יעד') return { ...column, label: 'תאריך סיום' }
        return column
      })
      if (!columns.some((column) => column.key === 'dueDate')) {
        const followIndex = columns.findIndex((column) => column.key === 'followUpDate')
        const dueColumn: TaskColumn = { id: 'col-due', label: 'תאריך סיום', key: 'dueDate', type: 'date', visible: true, removable: false, width: 145 }
        if (followIndex >= 0) columns.splice(followIndex, 0, dueColumn)
        else columns.push(dueColumn)
      }
      return { ...current, taskColumns: columns }
    })
  }, [canUpdate, setWorkspace, workspace.taskColumns])

  const activeCount = workspace.tasks.filter((task) => {
    if (projectId && task.projectId !== projectId) return false
    return !isCompleted(task)
  }).length
  const archivedCount = workspace.tasks.filter((task) => {
    if (projectId && task.projectId !== projectId) return false
    return isCompleted(task)
  }).length

  const filteredTasks = workspace.tasks.filter((task) => {
    if (projectId && task.projectId !== projectId) return false
    if (!projectId && projectFilter !== 'הכל') {
      if (projectFilter === '__none__' && task.projectId) return false
      if (projectFilter !== '__none__' && task.projectId !== projectFilter) return false
    }
    if (assigneeFilter !== 'הכל') {
      if (assigneeFilter === '__none__' && task.assigneeId) return false
      if (assigneeFilter !== '__none__' && task.assigneeId !== assigneeFilter) return false
    }
    if (colorFilter !== 'הכל') {
      if (colorFilter === '__none__' && task.colorTag) return false
      if (colorFilter !== '__none__' && task.colorTag !== colorFilter) return false
    }
    if (view === 'active' && isCompleted(task)) return false
    if (view === 'archive' && !isCompleted(task)) return false
    if (attentionOnly && !(task.status === 'דורש מעקב' || task.priority === 'דחופה' || (task.followUpDate && new Date(task.followUpDate).getTime() < Date.now()))) return false
    return true
  })

  const matches = (task: Task) => {
    const projectName = workspace.projects.find((project) => project.id === task.projectId)?.name || ''
    const assigneeName = workspace.team.find((member) => member.id === task.assigneeId)?.name || ''
    const haystack = `${task.title} ${task.description || ''} ${projectName} ${assigneeName}`.toLowerCase()
    return (!search || haystack.includes(search.toLowerCase())) && (statusFilter === 'הכל' || task.status === statusFilter)
  }

  const rows = useMemo(() => {
    const byParent = new Map<string, Task[]>()
    const filteredIds = new Set(filteredTasks.map((task) => task.id))
    filteredTasks.forEach((task) => {
      const key = task.parentId && filteredIds.has(task.parentId) ? task.parentId : 'root'
      byParent.set(key, [...(byParent.get(key) || []), task].sort((a, b) => a.order - b.order))
    })
    const result: { task: Task; depth: number }[] = []
    const hasMatchingDescendant = (id: string): boolean => (byParent.get(id) || []).some((child) => matches(child) || hasMatchingDescendant(child.id))
    const walk = (parent: string, depth: number) => {
      for (const task of byParent.get(parent) || []) {
        if (matches(task) || hasMatchingDescendant(task.id)) {
          result.push({ task, depth })
          walk(task.id, depth + 1)
        }
      }
    }
    walk('root', 0)
    return result
  }, [filteredTasks, search, statusFilter, workspace.projects, workspace.team])

  useEffect(() => {
    if (!focusTaskId) return
    const target = workspace.tasks.find((task) => task.id === focusTaskId)
    if (!target) return
    setSearch('')
    setStatusFilter('הכל')
    setAssigneeFilter('הכל')
    setColorFilter('הכל')
    setProjectFilter('הכל')
    setView(isCompleted(target) ? 'archive' : 'active')
    const timer = window.setTimeout(() => {
      document.querySelector<HTMLElement>(`[data-task-id="${CSS.escape(focusTaskId)}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' })
    }, 60)
    return () => window.clearTimeout(timer)
  }, [focusTaskId, workspace.tasks])

  const updateTask = (id: string, patch: Partial<Task>) => setWorkspace((current) => ({
    ...current,
    tasks: current.tasks.map((task) => task.id === id ? { ...task, ...patch } : task),
  }))

  const updateTaskStatus = (id: string, status: string) => setWorkspace((current) => ({
    ...current,
    tasks: current.tasks.map((task) => task.id === id ? {
      ...task,
      status,
      completedAt: COMPLETED_STATUSES.includes(status) ? (task.completedAt || nowIso()) : undefined,
    } : task),
  }))

  const toggleTaskCompleted = (task: Task, complete: boolean) => setWorkspace((current) => {
    const completedStatus = current.taskStatuses.includes('בוצע') ? 'בוצע' : current.taskStatuses.includes('סגור') ? 'סגור' : 'בוצע'
    const restoreStatus = current.taskStatuses.find((status) => !COMPLETED_STATUSES.includes(status)) || 'בטיפול'
    return {
      ...current,
      taskStatuses: current.taskStatuses.includes(completedStatus) || !canUpdate ? current.taskStatuses : [...current.taskStatuses, completedStatus],
      tasks: current.tasks.map((item) => item.id === task.id ? {
        ...item,
        status: complete ? completedStatus : restoreStatus,
        completedAt: complete ? nowIso() : undefined,
      } : item),
    }
  })

  const changeTaskProject = (id: string, nextProjectId?: string) => setWorkspace((current) => {
    const affected = new Set<string>([id])
    let changed = true
    while (changed) {
      changed = false
      current.tasks.forEach((task) => {
        if (task.parentId && affected.has(task.parentId) && !affected.has(task.id)) {
          affected.add(task.id)
          changed = true
        }
      })
    }
    return { ...current, tasks: current.tasks.map((task) => affected.has(task.id) ? { ...task, projectId: nextProjectId } : task) }
  })

  const submitTask = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const parentId = creatingFor?.parentId
    const parent = parentId ? workspace.tasks.find((task) => task.id === parentId) : undefined
    const selectedProjectId = String(data.get('projectId') || '') || undefined
    const chosenProjectId = parent?.projectId || projectId || selectedProjectId || (!projectId && projectFilter !== 'הכל' && projectFilter !== '__none__' ? projectFilter : undefined)
    const status = String(data.get('status') || workspace.taskStatuses[0] || 'טרם התחיל')
    const task: Task = {
      id: uid('task'),
      projectId: chosenProjectId,
      parentId,
      title: String(data.get('title') || '').trim(),
      description: String(data.get('description') || '').trim() || undefined,
      assigneeId: String(data.get('assigneeId') || '') || undefined,
      status,
      priority: String(data.get('priority') || 'רגילה') as Priority,
      startDate: String(data.get('startDate') || '') || undefined,
      dueDate: String(data.get('dueDate') || '') || undefined,
      followUpDate: String(data.get('followUpDate') || '') || undefined,
      emailTo: String(data.get('emailTo') || '') || undefined,
      colorTag: String(data.get('colorTag') || '') || undefined,
      custom: {},
      order: workspace.tasks.length + 1,
      createdAt: nowIso(),
      completedAt: COMPLETED_STATUSES.includes(status) ? nowIso() : undefined,
    }
    if (!task.title) return
    setWorkspace((current) => ({ ...current, tasks: [...current.tasks, task] }))
    setCreatingFor(null)
    setView(isCompleted(task) ? 'archive' : 'active')
  }

  const removeTask = (id: string) => {
    if (!confirmDelete('המשימה וכל תתי-המשימות שלה')) return
    setWorkspace((current) => {
      const remove = new Set<string>([id])
      let changed = true
      while (changed) {
        changed = false
        current.tasks.forEach((task) => {
          if (task.parentId && remove.has(task.parentId) && !remove.has(task.id)) {
            remove.add(task.id)
            changed = true
          }
        })
      }
      return { ...current, tasks: current.tasks.filter((task) => !remove.has(task.id)) }
    })
  }

  const applyTemplate = (items: ChecklistTemplateItem[]) => {
    if (!projectId) return
    const created: Task[] = []
    const build = (list: ChecklistTemplateItem[], parentId?: string) => list.forEach((item) => {
      const id = uid('task')
      created.push({
        id,
        projectId,
        parentId,
        title: item.title,
        status: workspace.taskStatuses[0] || 'טרם התחיל',
        priority: 'רגילה',
        custom: {},
        order: workspace.tasks.length + created.length + 1,
        createdAt: nowIso(),
      })
      if (item.children?.length) build(item.children, id)
    })
    build(items)
    setWorkspace((current) => ({ ...current, tasks: [...current.tasks, ...created] }))
  }

  const editCell = (task: Task, column: TaskColumn, value: string) => {
    if (column.key === 'status') {
      updateTaskStatus(task.id, value)
      return
    }
    if (column.key.startsWith('custom.')) {
      const key = column.key.slice(7)
      updateTask(task.id, { custom: { ...task.custom, [key]: value } })
    } else {
      updateTask(task.id, { [column.key]: value } as Partial<Task>)
    }
  }

  const addColumn = () => {
    const label = newColumn.trim()
    if (!label) return
    const id = uid('col')
    setWorkspace((current) => ({
      ...current,
      taskColumns: [...current.taskColumns, { id, label, key: `custom.${id}`, type: newColumnType, visible: true, removable: true, width: 160 }],
    }))
    setNewColumn('')
  }

  const moveColumn = (id: string, direction: -1 | 1) => setWorkspace((current) => {
    const list = [...current.taskColumns]
    const index = list.findIndex((column) => column.id === id)
    const next = index + direction
    if (index < 0 || next < 0 || next >= list.length) return current
    ;[list[index], list[next]] = [list[next], list[index]]
    return { ...current, taskColumns: list }
  })

  const selectedParent = creatingFor?.parentId ? workspace.tasks.find((task) => task.id === creatingFor.parentId) : undefined
  const defaultProjectId = selectedParent?.projectId || projectId || (projectFilter !== 'הכל' && projectFilter !== '__none__' ? projectFilter : '')

  return <div className="task-board-wrap">
    {attentionOnly && <div className="attention-filter-banner" role="status"><strong>מציג רק נושאים שדורשים טיפול</strong>{onClearAttention && <button type="button" className="secondary" onClick={onClearAttention}>הצגת כל המשימות</button>}</div>}
    <div className="task-view-tabs" role="tablist" aria-label="תצוגת משימות">
      <button type="button" role="tab" aria-selected={view === 'active'} className={view === 'active' ? 'active' : ''} onClick={() => setView('active')}>משימות פעילות <span>{activeCount}</span></button>
      <button type="button" role="tab" aria-selected={view === 'archive'} className={view === 'archive' ? 'active' : ''} onClick={() => setView('archive')}>משימות שהושלמו <span>{archivedCount}</span></button>
    </div>

    <div className="toolbar board-toolbar">
      <label className="task-filter-field toolbar-grow"><span>חיפוש</span><input className="search-input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="שם משימה, פרויקט או אחראי" aria-label="חיפוש משימות" /></label>
      {!projectId && <label className="task-filter-field"><span>פרויקט</span><select aria-label="סינון לפי פרויקט" value={projectFilter} onChange={(e) => setProjectFilter(e.target.value)}><option value="הכל">כל הפרויקטים</option><option value="__none__">ללא פרויקט</option>{workspace.projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>}
      <label className="task-filter-field"><span>סטטוס</span><select aria-label="סינון לפי סטטוס" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}><option>הכל</option>{workspace.taskStatuses.map((status) => <option key={status}>{status}</option>)}</select></label>
      <label className="task-filter-field"><span>אחראי</span><select aria-label="סינון לפי אחראי" value={assigneeFilter} onChange={(e) => setAssigneeFilter(e.target.value)}><option value="הכל">כל האחראים</option><option value="__none__">ללא אחראי</option>{workspace.team.filter((member) => member.active).map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select></label>
      <label className="task-filter-field"><span>צבע</span><select aria-label="סינון לפי צבע" value={colorFilter} onChange={(e) => setColorFilter(e.target.value)}><option value="הכל">כל הצבעים</option><option value="__none__">ללא צבע</option>{TASK_COLOR_OPTIONS.filter((item) => item.id).map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
      {canCreate && projectId && <label className="task-filter-field"><span>תבנית</span><select aria-label="החלת צ׳ק ליסט" defaultValue="" onChange={(e) => { const template = workspace.checklistTemplates.find((item) => item.id === e.target.value); if (template) applyTemplate(template.items); e.target.value = '' }}><option value="">בחירת צ׳ק ליסט</option>{workspace.checklistTemplates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}</select></label>}
      {canUpdate && <button type="button" className="secondary board-settings-button" aria-expanded={showColumns} onClick={() => setShowColumns((value) => !value)}><Settings2 /> הגדרות תצוגה</button>}
      {canCreate && <button type="button" className="primary board-create-button" onClick={() => setCreatingFor({})}><Plus /> משימה חדשה</button>}
    </div>

    {canUpdate && showColumns && <div className="board-config card-soft">
      <div className="config-title"><Columns3 /><strong>עמודות וסטטוסים</strong></div>
      <div className="column-list">{taskColumns.map((column, index) => <div key={column.id} className="column-config-row">
        <input type="checkbox" aria-label={`הצגת עמודה ${column.label}`} checked={column.visible} onChange={(e) => setWorkspace((current) => ({ ...current, taskColumns: current.taskColumns.map((item) => item.id === column.id ? { ...item, visible: e.target.checked } : item) }))} />
        <input aria-label="שם עמודה" value={column.label} onChange={(e) => setWorkspace((current) => ({ ...current, taskColumns: current.taskColumns.map((item) => item.id === column.id ? { ...item, label: e.target.value } : item) }))} />
        <span>{column.type}</span>
        <button type="button" className="icon-btn" aria-label="הזזת עמודה למעלה" disabled={index === 0} onClick={() => moveColumn(column.id, -1)}><ChevronUp /></button>
        <button type="button" className="icon-btn" aria-label="הזזת עמודה למטה" disabled={index === taskColumns.length - 1} onClick={() => moveColumn(column.id, 1)}><ChevronDown /></button>
        {column.removable && <button type="button" className="icon-btn danger" aria-label={`מחיקת עמודה ${column.label}`} onClick={() => { if (confirmDelete(`העמודה "${column.label}"`)) setWorkspace((current) => ({ ...current, taskColumns: current.taskColumns.filter((item) => item.id !== column.id) })) }}><Trash2 /></button>}
      </div>)}</div>
      <div className="config-add"><label className="inline-control-label"><span>שם עמודה</span><input value={newColumn} onChange={(e) => setNewColumn(e.target.value)} placeholder="שם עמודה חדשה" /></label><label className="inline-control-label"><span>סוג עמודה</span><select value={newColumnType} onChange={(e) => setNewColumnType(e.target.value as TaskColumnType)}><option value="text">טקסט</option><option value="date">תאריך</option><option value="status">סטטוס</option><option value="member">אחראי</option><option value="email">מייל</option><option value="priority">עדיפות</option></select></label><button type="button" className="secondary" onClick={addColumn}>הוספת עמודה</button></div>
      <div className="status-config"><strong>סטטוסים:</strong>{workspace.taskStatuses.map((status) => <Chip key={status} tone="brand">{status}</Chip>)}<label className="inline-control-label"><span>סטטוס חדש</span><input value={newStatus} onChange={(e) => setNewStatus(e.target.value)} placeholder="שם הסטטוס" /></label><button type="button" className="secondary" onClick={() => { const value = newStatus.trim(); if (value && !workspace.taskStatuses.includes(value)) setWorkspace((current) => ({ ...current, taskStatuses: [...current.taskStatuses, value] })); setNewStatus('') }}>הוספת סטטוס</button></div>
    </div>}

    <div className="table-scroll task-table-wrap">
      <table className="data-table task-table">
        <thead><tr><th className="complete-col">בוצע</th><th className="color-col">קטלוג</th>{!projectId && <th style={{ minWidth: 180 }}>פרויקט</th>}{visibleColumns.map((column) => <th key={column.id} style={{ minWidth: column.width }}>{column.label}</th>)}<th className="actions-col">פעולות</th></tr></thead>
        <tbody>
          {rows.map(({ task, depth }) => <tr key={task.id} data-task-id={task.id} className={`${task.parentId ? 'subtask-row' : ''} ${isCompleted(task) ? 'completed-row' : ''} ${focusTaskId === task.id ? 'focused-task-row' : ''}`} style={{ borderInlineStartColor: task.colorTag ? taskColor(task.colorTag).hex : 'transparent' }}>
            <td className="complete-cell"><input type="checkbox" aria-label={isCompleted(task) ? `שחזור ${task.title} לאזור הפעיל` : `סימון ${task.title} כבוצעה`} checked={isCompleted(task)} disabled={!canStatus} onChange={(e) => toggleTaskCompleted(task, e.target.checked)} /></td>
            <td className="color-cell"><label className="task-color-picker"><span className="color-dot" style={{ backgroundColor: taskColor(task.colorTag).hex }} /><select aria-label={`צבע קטלוג עבור ${task.title}`} disabled={!canUpdate} value={task.colorTag || ''} onChange={(e) => updateTask(task.id, { colorTag: e.target.value || undefined })}>{TASK_COLOR_OPTIONS.map((item) => <option key={item.id || 'none'} value={item.id}>{item.label}</option>)}</select></label></td>
            {!projectId && <td><div className="task-project-cell"><select className="cell-input" disabled={!canUpdate} aria-label={`פרויקט עבור ${task.title}`} value={task.projectId || ''} onChange={(e) => changeTaskProject(task.id, e.target.value || undefined)}><option value="">ללא פרויקט</option>{workspace.projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select>{task.projectId && onProject && <button type="button" className="text-button" onClick={() => onProject(task.projectId!)}>פתיחה</button>}</div></td>}
            {visibleColumns.map((column) => <td key={column.id}>
              {column.key === 'title' ? <input className="cell-input task-title-input" disabled={!canUpdate} aria-label="שם משימה" style={{ paddingInlineStart: 8 + depth * 22 }} value={task.title} onChange={(e) => updateTask(task.id, { title: e.target.value })} />
                : column.type === 'status' ? <select className="cell-input" disabled={!canStatus} value={fieldValue(task, column)} onChange={(e) => editCell(task, column, e.target.value)}>{workspace.taskStatuses.map((status) => <option key={status}>{status}</option>)}</select>
                : column.type === 'member' ? <select className="cell-input" disabled={!canUpdate} value={fieldValue(task, column)} onChange={(e) => editCell(task, column, e.target.value)}><option value="">לא משויך</option>{workspace.team.filter((member) => member.active).map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select>
                : column.type === 'date' ? <input className="cell-input" disabled={!canUpdate} type="date" value={dateInput(fieldValue(task, column))} onChange={(e) => editCell(task, column, e.target.value)} />
                : column.type === 'priority' ? <select className="cell-input" disabled={!canUpdate} value={fieldValue(task, column)} onChange={(e) => editCell(task, column, e.target.value)}><option>נמוכה</option><option>רגילה</option><option>גבוהה</option><option>דחופה</option></select>
                : column.type === 'email' ? <div className="email-cell"><input className="cell-input" disabled={!canUpdate} type="email" value={fieldValue(task, column)} onChange={(e) => editCell(task, column, e.target.value)} placeholder="name@example.com" />{onEmail && <button type="button" className="secondary task-action-btn" title="פתיחת התכתבות" aria-label="פתיחת התכתבות" onClick={() => onEmail(task)}><Mail /> מייל</button>}</div>
                : <input className="cell-input" disabled={!canUpdate} value={fieldValue(task, column)} onChange={(e) => editCell(task, column, e.target.value)} />}
            </td>)}
            <td className="row-actions">{(canCreate || canDelete) && <div className="task-row-actions">{canCreate && <button type="button" className="secondary task-action-btn" onClick={() => setCreatingFor({ parentId: task.id })}><Plus /> תת-משימה</button>}{canDelete && <button type="button" className="secondary danger task-action-btn" onClick={() => removeTask(task.id)}><Trash2 /> מחיקה</button>}</div>}</td>
          </tr>)}
          {!rows.length && <tr><td colSpan={visibleColumns.length + (projectId ? 3 : 4)}><div className="table-empty">{view === 'archive' ? 'אין משימות שהושלמו.' : 'אין משימות פעילות שמתאימות לסינון.'}</div></td></tr>}
        </tbody>
      </table>
    </div>

    {canCreate && creatingFor && <Modal title={creatingFor.parentId ? 'תת-משימה חדשה' : 'משימה חדשה'} onClose={() => setCreatingFor(null)} wide>
      <form className="form-grid two-col" onSubmit={submitTask}>
        {selectedParent && <div className="task-parent-note full"><strong>תת-משימה של:</strong> {selectedParent.title}</div>}
        <Field label="שם המשימה"><input name="title" required autoFocus /></Field>
        {!projectId && !selectedParent && <Field label="פרויקט"><select name="projectId" defaultValue={defaultProjectId}><option value="">ללא פרויקט</option>{workspace.projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></Field>}
        <Field label="אחראי"><select name="assigneeId"><option value="">לא משויך</option>{workspace.team.filter((member) => member.active).map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select></Field>
        <Field label="סטטוס"><select name="status" defaultValue={workspace.taskStatuses[0] || 'טרם התחיל'}>{workspace.taskStatuses.map((status) => <option key={status}>{status}</option>)}</select></Field>
        <Field label="עדיפות"><select name="priority" defaultValue="רגילה"><option>נמוכה</option><option>רגילה</option><option>גבוהה</option><option>דחופה</option></select></Field>
        <Field label="צבע / קטלוג"><select name="colorTag" defaultValue=""><option value="">ללא צבע</option>{TASK_COLOR_OPTIONS.filter((item) => item.id).map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></Field>
        <Field label="תאריך תחילת משימה"><input name="startDate" type="date" /></Field>
        <Field label="תאריך סיום"><input name="dueDate" type="date" /></Field>
        <Field label="מועד מעקב"><input name="followUpDate" type="date" /></Field>
        <Field label="מייל לקוח"><input name="emailTo" type="email" placeholder="name@example.com" /></Field>
        <Field label="תיאור"><textarea name="description" rows={4} /></Field>
        <div className="form-actions full"><button type="button" className="secondary" onClick={() => setCreatingFor(null)}>ביטול</button><button className="primary"><Plus /> יצירת {creatingFor.parentId ? 'תת-משימה' : 'משימה'}</button></div>
      </form>
    </Modal>}
  </div>
}
