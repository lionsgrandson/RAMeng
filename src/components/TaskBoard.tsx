import { useMemo, useState } from 'react'
import { ChevronDown, ChevronUp, Columns3, Mail, Plus, Settings2, Trash2 } from 'lucide-react'
import type { ChecklistTemplateItem, Task, TaskColumn, TaskColumnType, Workspace } from '../types'
import { Chip, dateInput, nowIso, uid } from './common'

type Props = {
  workspace: Workspace
  setWorkspace: React.Dispatch<React.SetStateAction<Workspace>>
  projectId?: string
  onEmail?: (task: Task) => void
}

const fieldValue = (task: Task, column: TaskColumn) => {
  if (column.key.startsWith('custom.')) return task.custom[column.key.slice(7)] || ''
  return String((task as unknown as Record<string, unknown>)[column.key] ?? '')
}

export default function TaskBoard({ workspace, setWorkspace, projectId, onEmail }: Props) {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('הכל')
  const [showColumns, setShowColumns] = useState(false)
  const [newColumn, setNewColumn] = useState('')
  const [newColumnType, setNewColumnType] = useState<TaskColumnType>('text')
  const [newStatus, setNewStatus] = useState('')

  const visibleColumns = workspace.taskColumns.filter((column) => column.visible)
  const projectTasks = workspace.tasks.filter((task) => !projectId || task.projectId === projectId)
  const matches = (task: Task) => (!search || `${task.title} ${task.description || ''}`.toLowerCase().includes(search.toLowerCase())) && (statusFilter === 'הכל' || task.status === statusFilter)

  const rows = useMemo(() => {
    const byParent = new Map<string, Task[]>()
    projectTasks.forEach((task) => {
      const key = task.parentId || 'root'
      byParent.set(key, [...(byParent.get(key) || []), task].sort((a, b) => a.order - b.order))
    })
    const result: { task: Task; depth: number }[] = []
    const walk = (parent: string, depth: number) => {
      for (const task of byParent.get(parent) || []) {
        if (matches(task) || (byParent.get(task.id) || []).some(matches)) result.push({ task, depth })
        walk(task.id, depth + 1)
      }
    }
    walk('root', 0)
    return result
  }, [projectTasks, search, statusFilter])

  const updateTask = (id: string, patch: Partial<Task>) => setWorkspace((current) => ({ ...current, tasks: current.tasks.map((task) => task.id === id ? { ...task, ...patch } : task) }))
  const addTask = (parentId?: string, title = 'משימה חדשה') => setWorkspace((current) => ({
    ...current,
    tasks: [...current.tasks, {
      id: uid('task'), projectId, parentId, title, status: current.taskStatuses[0] || 'טרם התחיל', priority: 'רגילה', custom: {}, order: current.tasks.length + 1, createdAt: nowIso(),
    }],
  }))
  const removeTask = (id: string) => setWorkspace((current) => {
    const remove = new Set<string>([id])
    let changed = true
    while (changed) {
      changed = false
      current.tasks.forEach((task) => { if (task.parentId && remove.has(task.parentId) && !remove.has(task.id)) { remove.add(task.id); changed = true } })
    }
    return { ...current, tasks: current.tasks.filter((task) => !remove.has(task.id)) }
  })

  const applyTemplate = (items: ChecklistTemplateItem[]) => {
    const created: Task[] = []
    const build = (list: ChecklistTemplateItem[], parentId?: string) => list.forEach((item) => {
      const id = uid('task')
      created.push({ id, projectId, parentId, title: item.title, status: workspace.taskStatuses[0] || 'טרם התחיל', priority: 'רגילה', custom: {}, order: workspace.tasks.length + created.length + 1, createdAt: nowIso() })
      if (item.children?.length) build(item.children, id)
    })
    build(items)
    setWorkspace((current) => ({ ...current, tasks: [...current.tasks, ...created] }))
  }

  const editCell = (task: Task, column: TaskColumn, value: string) => {
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
    setWorkspace((current) => ({ ...current, taskColumns: [...current.taskColumns, { id, label, key: `custom.${id}`, type: newColumnType, visible: true, removable: true, width: 160 }] }))
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

  return <div className="task-board-wrap">
    <div className="toolbar board-toolbar">
      <div className="toolbar-grow"><input className="search-input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="חיפוש משימה..." /></div>
      <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}><option>הכל</option>{workspace.taskStatuses.map((status) => <option key={status}>{status}</option>)}</select>
      {projectId && <select defaultValue="" onChange={(e) => { const template = workspace.checklistTemplates.find((item) => item.id === e.target.value); if (template) applyTemplate(template.items); e.target.value = '' }}>
        <option value="">החלת צ׳ק ליסט</option>{workspace.checklistTemplates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}
      </select>}
      <button className="secondary" onClick={() => setShowColumns((value) => !value)}><Settings2 /> התאמת לוח</button>
      <button className="primary" onClick={() => addTask()}><Plus /> משימה</button>
    </div>

    {showColumns && <div className="board-config card-soft">
      <div className="config-title"><Columns3 /><strong>עמודות וסטטוסים</strong><span>ניתן להוסיף, להסיר, להסתיר ולשנות סדר ללא שינוי קוד.</span></div>
      <div className="column-list">{workspace.taskColumns.map((column, index) => <div key={column.id} className="column-config-row">
        <input type="checkbox" checked={column.visible} onChange={(e) => setWorkspace((current) => ({ ...current, taskColumns: current.taskColumns.map((item) => item.id === column.id ? { ...item, visible: e.target.checked } : item) }))} />
        <input value={column.label} onChange={(e) => setWorkspace((current) => ({ ...current, taskColumns: current.taskColumns.map((item) => item.id === column.id ? { ...item, label: e.target.value } : item) }))} />
        <span>{column.type}</span>
        <button className="icon-btn" disabled={index === 0} onClick={() => moveColumn(column.id, -1)}><ChevronUp /></button>
        <button className="icon-btn" disabled={index === workspace.taskColumns.length - 1} onClick={() => moveColumn(column.id, 1)}><ChevronDown /></button>
        {column.removable && <button className="icon-btn danger" onClick={() => setWorkspace((current) => ({ ...current, taskColumns: current.taskColumns.filter((item) => item.id !== column.id) }))}><Trash2 /></button>}
      </div>)}</div>
      <div className="config-add"><input value={newColumn} onChange={(e) => setNewColumn(e.target.value)} placeholder="שם עמודה חדשה" /><select value={newColumnType} onChange={(e) => setNewColumnType(e.target.value as TaskColumnType)}><option value="text">טקסט</option><option value="date">תאריך</option><option value="status">סטטוס</option><option value="member">אחראי</option><option value="email">מייל</option><option value="priority">עדיפות</option></select><button className="secondary" onClick={addColumn}>הוספה</button></div>
      <div className="status-config"><strong>סטטוסים:</strong>{workspace.taskStatuses.map((status) => <Chip key={status} tone="brand">{status}</Chip>)}<input value={newStatus} onChange={(e) => setNewStatus(e.target.value)} placeholder="סטטוס חדש" /><button className="secondary" onClick={() => { const value = newStatus.trim(); if (value && !workspace.taskStatuses.includes(value)) setWorkspace((current) => ({ ...current, taskStatuses: [...current.taskStatuses, value] })); setNewStatus('') }}>הוספה</button></div>
    </div>}

    <div className="table-scroll task-table-wrap">
      <table className="data-table task-table"><thead><tr>{visibleColumns.map((column) => <th key={column.id} style={{ minWidth: column.width }}>{column.label}</th>)}<th className="actions-col">פעולות</th></tr></thead>
        <tbody>{rows.map(({ task, depth }) => <tr key={task.id} className={task.parentId ? 'subtask-row' : ''}>{visibleColumns.map((column) => <td key={column.id}>{column.key === 'title' ? <input className="cell-input task-title-input" style={{ paddingInlineStart: 8 + depth * 22 }} value={task.title} onChange={(e) => updateTask(task.id, { title: e.target.value })} /> : column.type === 'status' ? <select className="cell-input" value={fieldValue(task, column)} onChange={(e) => editCell(task, column, e.target.value)}>{workspace.taskStatuses.map((status) => <option key={status}>{status}</option>)}</select> : column.type === 'member' ? <select className="cell-input" value={fieldValue(task, column)} onChange={(e) => editCell(task, column, e.target.value)}><option value="">לא משויך</option>{workspace.team.filter((member) => member.active).map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select> : column.type === 'date' ? <input className="cell-input" type="date" value={dateInput(fieldValue(task, column))} onChange={(e) => editCell(task, column, e.target.value)} /> : column.type === 'priority' ? <select className="cell-input" value={fieldValue(task, column)} onChange={(e) => editCell(task, column, e.target.value)}><option>נמוכה</option><option>רגילה</option><option>גבוהה</option><option>דחופה</option></select> : column.type === 'email' ? <div className="email-cell"><input className="cell-input" type="email" value={fieldValue(task, column)} onChange={(e) => editCell(task, column, e.target.value)} placeholder="name@example.com" />{onEmail && <button className="icon-btn" title="פתיחת התכתבות" onClick={() => onEmail(task)}><Mail /></button>}</div> : <input className="cell-input" value={fieldValue(task, column)} onChange={(e) => editCell(task, column, e.target.value)} />}</td>)}
          <td className="row-actions"><button className="icon-btn" title="הוסף תת משימה" onClick={() => addTask(task.id, 'תת משימה חדשה')}><Plus /></button><button className="icon-btn danger" title="מחיקה" onClick={() => removeTask(task.id)}><Trash2 /></button></td></tr>)}
        {!rows.length && <tr><td colSpan={visibleColumns.length + 1}><div className="table-empty">אין משימות להצגה. הוסיפו משימה או החילו צ׳ק ליסט לפרויקט.</div></td></tr>}</tbody>
      </table>
    </div>
  </div>
}
