import { taskTreeRows } from '../lib/taskTree'
import TaskComments from './TaskComments'
import TaskContactAssignment from './TaskContactAssignment'
import { taskColumnChoices } from '../lib/taskProfession'
import { jerusalemInstant } from '../lib/taskTime'
import { percentageTaskColumns, taskTableMinWidth, visibleTaskColumns } from '../lib/taskColumns'
import { DisplayContext } from './DisplaySettings'
import { TaskDeliveryStatus } from './TaskNotifications'
import { CategoryManager, CategoryPicker } from './Categories'
import MeetingSummaries from './MeetingSummaries'
import DeleteButton from './RecordDelete'
import { Fragment, useContext, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Mail, Plus, Settings2 } from 'lucide-react'
import type { ChecklistTemplateItem, Priority, Task, TaskColumn, Workspace } from '../types'
import type { AreaPermissions } from '../lib/permissions'
import { Chip, Field, Modal, dateInput, nowIso, uid } from './common'

type Props = {
  canInviteExternal?: boolean
  orgId: string
  workspace: Workspace
  setWorkspace: React.Dispatch<React.SetStateAction<Workspace>>
  projectId?: string
  onEmail?: (task: Task) => void
  canEdit?: boolean
  permissions?: AreaPermissions
  focusTaskId?: string | null
  attentionOnly?: boolean
  onClearAttention?: () => void
  canEditProject?: boolean
  startCreating?: boolean
  onProject?: (id: string) => void
  onCreateReportFromTasks?: (taskIds: string[], options: { title: string; templateId: string; periodStart?: string; periodEnd?: string }) => void
  onContact?: (id: string) => void
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
// Status changes are immediately available to external users; completion metadata
// is normalized by the server after save and can briefly retain its old value.
export const isCompleted = (task: Task) => COMPLETED_STATUSES.includes(task.status) || (!task.status && Boolean(task.completedAt))

const fieldValue = (task: Task, column: TaskColumn) => {
  if (column.key.startsWith('custom.')) return task.custom?.[column.key.slice(7)] || ''
  return String((task as unknown as Record<string, unknown>)[column.key] ?? '')
}

export default function TaskBoard({ canInviteExternal = false, workspace, setWorkspace, projectId, onEmail, onProject, onContact, canEdit = true, permissions, focusTaskId, attentionOnly = false, onClearAttention, startCreating = false, orgId, canEditProject = false, onCreateReportFromTasks }: Props) {
  const taskPermissions: AreaPermissions = permissions || { view: true, create: canEdit, edit: canEdit, status: canEdit, delete: canEdit }
  const canCreate = taskPermissions.create
  const canUpdate = taskPermissions.edit
  const canStatus = taskPermissions.status || taskPermissions.edit
  const canDelete = taskPermissions.delete
  const [commentTask, setCommentTask] = useState<Task | null>(null)
  const [contactTask, setContactTask] = useState<Task | null>(null)
  const tableRef = useRef<HTMLDivElement>(null)
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({})
  const [scheduleError, setScheduleError] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const { groupBy, density } = useContext(DisplayContext)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [newCategories, setNewCategories] = useState<string[]>([])
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('הכל')
  const [projectFilter, setProjectFilter] = useState('הכל')
  const [addressFilter, setAddressFilter] = useState('')
  const [assigneeFilter, setAssigneeFilter] = useState('הכל')
  const [colorFilter, setColorFilter] = useState('הכל')
  const [priorityFilter, setPriorityFilter] = useState('הכל')
  const [clientFilter, setClientFilter] = useState('הכל')
  const [dateField, setDateField] = useState<'start' | 'due' | 'follow' | 'created' | 'completed'>('due')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [view, setView] = useState<TaskView>('active')
  const [creatingFor, setCreatingFor] = useState<{ parentId?: string } | null>(startCreating && canCreate ? {} : null)
  const [creatingTaskReport, setCreatingTaskReport] = useState(false)
  const [taskReportTitle, setTaskReportTitle] = useState('')
  const [periodStart, setPeriodStart] = useState('')
  const [periodEnd, setPeriodEnd] = useState('')
  const [taskReportTemplate, setTaskReportTemplate] = useState(workspace.reportTemplates[0]?.id || '')
  const visibleColumns = useMemo(() => percentageTaskColumns(visibleTaskColumns(workspace.taskColumns, projectId)).map(column => ({ ...column, options: taskColumnChoices(column, workspace) })), [workspace.taskColumns, workspace.categories, projectId])
  const activeCount = workspace.tasks.filter((task) => {
    if (projectId && task.projectId !== projectId) return false
    return !isCompleted(task)
  }).length
  const archivedCount = workspace.tasks.filter((task) => {
    if (projectId && task.projectId !== projectId) return false
    return isCompleted(task)
  }).length

  const filteredTasks = workspace.tasks.filter((task) => {
    if (Object.entries(columnFilters).some(([key, value]) => { const column = visibleColumns.find(item => item.key === key); return value && column && !fieldValue(task, column).toLowerCase().includes(value.toLowerCase()) })) return false
    if (projectId && task.projectId !== projectId) return false
    if (categoryFilter && !task.categoryIds?.includes(categoryFilter)) return false
    if (!projectId && addressFilter.trim()) {
      const projectAddress = workspace.projects.find((project) => project.id === task.projectId)?.address || ''
      if (!projectAddress.toLowerCase().includes(addressFilter.trim().toLowerCase())) return false
    }
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
    if (priorityFilter !== 'הכל' && task.priority !== priorityFilter) return false
    if (clientFilter !== 'הכל') {
      const project = workspace.projects.find((item) => item.id === task.projectId)
      const clientIds = project?.clientIds || []
      if (clientFilter === '__none__' && clientIds.length) return false
      if (clientFilter !== '__none__' && !clientIds.includes(clientFilter)) return false
    }
    const selectedDate = dateField === 'start' ? task.startDate : dateField === 'due' ? task.dueDate : dateField === 'follow' ? task.followUpDate : dateField === 'completed' ? task.completedAt?.slice(0, 10) : task.createdAt.slice(0, 10)
    if (dateFrom && (!selectedDate || selectedDate < dateFrom)) return false
    if (dateTo && (!selectedDate || selectedDate > dateTo)) return false
    if (view === 'active' && isCompleted(task)) return false
    if (view === 'archive' && !isCompleted(task)) return false
    if (attentionOnly && !(task.status === 'דורש מעקב' || task.priority === 'דחופה' || (task.followUpDate && new Date(task.followUpDate).getTime() < Date.now()))) return false
    return true
  })

  const matches = (task: Task) => {
    const project = workspace.projects.find((item) => item.id === task.projectId)
    const projectName = project?.name || ''
    const projectAddress = project?.address || ''
    const assigneeName = workspace.team.find((member) => member.id === task.assigneeId)?.name || ''
    const haystack = `${task.title} ${task.description || ''} ${projectName} ${projectAddress} ${assigneeName} ${task.emailTo || ''}`.toLowerCase()
    return (!search || haystack.includes(search.toLowerCase())) && (statusFilter === 'הכל' || task.status === statusFilter)
  }

  const rows = useMemo(() => {
    const result = taskTreeRows(filteredTasks, matches)
    if (groupBy !== 'none') result.sort((a, b) => (groupBy === 'assignee' ? a.task.assigneeId || '' : a.task.projectId || '').localeCompare(groupBy === 'assignee' ? b.task.assigneeId || '' : b.task.projectId || ''))
    return result
  }, [groupBy, filteredTasks, search, statusFilter, workspace.projects, workspace.team])

  useEffect(() => {
    if (!focusTaskId) return
    const target = workspace.tasks.find((task) => task.id === focusTaskId)
    if (!target) return
    setColumnFilters({})
    setSearch('')
    setStatusFilter('הכל')
    setAssigneeFilter('הכל')
    setCategoryFilter('')
    setColorFilter('הכל')
    setPriorityFilter('הכל')
    setClientFilter('הכל')
    setDateFrom('')
    setDateTo('')
    setProjectFilter('הכל')
    setAddressFilter('')
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
      ...(canUpdate ? { completedAt: COMPLETED_STATUSES.includes(status) ? (task.completedAt || nowIso()) : undefined } : {}),
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
        ...(canUpdate ? { completedAt: complete ? nowIso() : undefined } : {}),
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
    return { ...current, tasks: current.tasks.map((task) => affected.has(task.id) ? { ...task, projectId: nextProjectId, categoryIds: task.categoryIds?.filter(id => current.projects.find(project => project.id === nextProjectId)?.categoryIds?.includes(id)) } : task) }
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
      categoryIds: newCategories.filter(id => workspace.projects.find(project => project.id === chosenProjectId)?.categoryIds?.includes(id)),
      title: String(data.get('title') || '').trim(),
      description: String(data.get('description') || '').trim() || undefined,
      assigneeId: String(data.get('assigneeId') || '') || undefined,
      status,
      priority: String(data.get('priority') || 'רגילה') as Priority,
      scheduledTime: String(data.get('scheduledTime') || '') || undefined,
      startDate: String(data.get('startDate') || '') || undefined,
      dueDate: String(data.get('dueDate') || '') || undefined,
      followUpDate: String(data.get('followUpDate') || '') || undefined,
      emailTo: String(data.get('emailTo') || '') || undefined,
      colorTag: String(data.get('colorTag') || '') || undefined,
      custom: Object.fromEntries(workspace.taskColumns.filter(column => column.key.startsWith('custom.')).map(column => [column.key.slice(7), String(data.get(column.key) || '')])),
      order: workspace.tasks.length + 1,
      createdAt: nowIso(),
      completedAt: COMPLETED_STATUSES.includes(status) ? nowIso() : undefined,
    }
    if (!task.title) return
    try { if (task.scheduledTime) jerusalemInstant(task.startDate || task.dueDate || task.followUpDate || '', task.scheduledTime) } catch (error) { setScheduleError((error as Error).message); return }
    setScheduleError('')
    setWorkspace((current) => ({ ...current, tasks: [...current.tasks, task] }))
    setCreatingFor(null); setNewCategories([])
    setView(isCompleted(task) ? 'archive' : 'active')
  }

  const removeTask = (id: string) => {
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
    if (['scheduledTime', 'startDate', 'dueDate', 'followUpDate'].includes(column.key)) {
      const next = { ...task, [column.key]: value }
      try { if (next.scheduledTime) jerusalemInstant(next.startDate || next.dueDate || next.followUpDate || '', next.scheduledTime) } catch (error) { setScheduleError((error as Error).message); return }
      setScheduleError('')
    }
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

  const selectedParent = creatingFor?.parentId ? workspace.tasks.find((task) => task.id === creatingFor.parentId) : undefined
  const defaultProjectId = selectedParent?.projectId || projectId || (projectFilter !== 'הכל' && projectFilter !== '__none__' ? projectFilter : '')

  return <div className="task-board-wrap">
    {attentionOnly && <div className="attention-filter-banner" role="status"><strong>מציג רק נושאים שדורשים טיפול</strong>{onClearAttention && <button type="button" className="secondary" onClick={onClearAttention}>הצגת כל המשימות</button>}</div>}
    <div className="task-view-tabs" role="tablist" aria-label="תצוגת משימות">
      <button type="button" role="tab" aria-selected={view === 'active'} className={view === 'active' ? 'active' : ''} onClick={() => setView('active')}>משימות פעילות <span>{activeCount}</span></button>
      <button type="button" role="tab" aria-selected={view === 'archive'} className={view === 'archive' ? 'active' : ''} onClick={() => setView('archive')}>משימות שהושלמו <span>{archivedCount}</span></button>
    </div>

    {(canUpdate || canCreate) && <div className="task-edit-banner"><div className="task-edit-banner-copy"><span className="task-edit-icon"><Settings2 /></span><div><strong>עריכת משימות</strong><span>{canUpdate ? 'אפשר ללחוץ ולערוך ישירות שם, סטטוס, אחראי, תאריכים ושאר השדות בטבלה.' : 'ניתן ליצור משימות חדשות.'}</span></div></div>{canCreate && <button type="button" className="primary board-create-button prominent" onClick={() => setCreatingFor({})}><Plus /> משימה חדשה</button>}</div>}

    {canUpdate && <TaskDeliveryStatus orgId={orgId} />}
    <div className="toolbar task-overview-counts">{(() => { const all = workspace.tasks.filter(task => !projectId || task.projectId === projectId); const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); return <><span>סה״כ: {all.length}</span><span>פתוחות: {all.filter(task => !isCompleted(task)).length}</span><span>בטיפול: {all.filter(task => task.status === 'בטיפול').length}</span><span>הושלמו: {all.filter(isCompleted).length}</span><span>באיחור: {all.filter(task => !isCompleted(task) && task.dueDate && task.dueDate < today).length}</span></> })()}</div>
    {canUpdate && <CategoryManager workspace={workspace} setWorkspace={setWorkspace} projectId={projectId && canEditProject ? projectId : undefined} canEdit={canUpdate} canDelete={canDelete} />}
    {projectId && <MeetingSummaries workspace={workspace} setWorkspace={setWorkspace} projectId={projectId} selectedTaskIds={selectedIds.filter(id => rows.some(row => row.task.id === id))} canEdit={canCreate && canUpdate} canDelete={canDelete} />}
    {projectId && onCreateReportFromTasks && selectedIds.some((id) => rows.some((row) => row.task.id === id)) && <button className="secondary" type="button" onClick={() => {
      setTaskReportTitle(`דוח משימות - ${workspace.projects.find((project) => project.id === projectId)?.name || ''}`)
      setCreatingTaskReport(true)
    }}>יצירת טיוטת דוח פיקוח מהמשימות שנבחרו</button>}
    {projectId && creatingTaskReport && onCreateReportFromTasks && <Modal wide title="דוח פיקוח ממשימות הפרויקט" onClose={() => setCreatingTaskReport(false)}>
      <form className="form-grid" onSubmit={(event) => {
        event.preventDefault()
        const taskIds = selectedIds.filter((id) => rows.some((row) => row.task.id === id))
        if (!taskIds.length) { setCreatingTaskReport(false); return }
        onCreateReportFromTasks(taskIds, { title: taskReportTitle, templateId: taskReportTemplate, periodStart, periodEnd })
        setCreatingTaskReport(false)
      }}>
        <p>ייווצר דוח טיוטה ניתן לעריכה. רק המשימות המסומנות יועתקו; המשימות המקוריות לא ישונו. יש לבדוק את הממצאים לפני שליחת הדוח.</p>
        <Field label="כותרת דוח"><input required value={taskReportTitle} onChange={(event) => setTaskReportTitle(event.target.value)} /></Field>
        <Field label="תבנית"><select value={taskReportTemplate} onChange={(event) => setTaskReportTemplate(event.target.value)}>
          {workspace.reportTemplates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}
        </select></Field>
        <Field label="תחילת תקופת הדיווח"><input type="date" value={periodStart} onChange={event => setPeriodStart(event.target.value)} /></Field><Field label="סיום תקופת הדיווח"><input type="date" min={periodStart || undefined} value={periodEnd} onChange={event => setPeriodEnd(event.target.value)} /></Field><p>התבנית היא טיוטה לעריכה ולאישור מקצועי. התקופה מתארת את הדוח; רק המשימות המסומנות ייכללו.</p><p>{selectedIds.filter((id) => rows.some((row) => row.task.id === id)).length} משימות נבחרו:</p>
        <ul>{selectedIds.filter((id) => rows.some((row) => row.task.id === id)).map((id) => <li key={id}>{workspace.tasks.find((task) => task.id === id)?.title}</li>)}</ul>
        <div className="form-actions"><button type="button" className="secondary" onClick={() => setCreatingTaskReport(false)}>ביטול</button>
          <button type="submit" className="primary">יצירת טיוטה ופתיחת הדוח</button></div>
      </form>
    </Modal>}
    <div className="toolbar board-toolbar">
      <label className="task-filter-field"><span>מקצוע</span><select aria-label="סינון משימות לפי מקצוע" value={categoryFilter} onChange={event => setCategoryFilter(event.target.value)}><option value="">כל המקצועות</option>{workspace.categories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>

      <label className="task-filter-field toolbar-grow"><span>חיפוש</span><input className="search-input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="משימה, פרויקט, כתובת, אחראי או מייל" aria-label="חיפוש משימות" /></label>
      {!projectId && <label className="task-filter-field address-task-filter"><span>כתובת</span><input value={addressFilter} onChange={(e) => setAddressFilter(e.target.value)} placeholder="רחוב, עיר או כתובת" aria-label="סינון משימות לפי כתובת פרויקט" /></label>}
      {!projectId && <label className="task-filter-field"><span>פרויקט</span><select aria-label="סינון לפי פרויקט" value={projectFilter} onChange={(e) => setProjectFilter(e.target.value)}><option value="הכל">כל הפרויקטים</option><option value="__none__">ללא פרויקט</option>{workspace.projects.map((project) => <option key={project.id} value={project.id}>{project.name} — {project.address || 'כתובת חסרה'}</option>)}</select></label>}
      <label className="task-filter-field"><span>סטטוס</span><select aria-label="סינון לפי סטטוס" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}><option>הכל</option>{workspace.taskStatuses.map((status) => <option key={status}>{status}</option>)}</select></label>
      <label className="task-filter-field"><span>אחראי</span><select aria-label="סינון לפי אחראי" value={assigneeFilter} onChange={(e) => setAssigneeFilter(e.target.value)}><option value="הכל">כל האחראים</option><option value="__none__">ללא אחראי</option>{workspace.team.filter((member) => member.active).map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select></label>
      <label className="task-filter-field"><span>צבע</span><select aria-label="סינון לפי צבע" value={colorFilter} onChange={(e) => setColorFilter(e.target.value)}><option value="הכל">כל הצבעים</option><option value="__none__">ללא צבע</option>{TASK_COLOR_OPTIONS.filter((item) => item.id).map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
      <label className="task-filter-field"><span>עדיפות</span><select value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)}><option>הכל</option><option>נמוכה</option><option>רגילה</option><option>גבוהה</option><option>דחופה</option></select></label>
      {!projectId && <label className="task-filter-field"><span>לקוח</span><select value={clientFilter} onChange={(e) => setClientFilter(e.target.value)}><option value="הכל">כל הלקוחות</option><option value="__none__">ללא לקוח</option>{workspace.contacts.map((contact) => <option key={contact.id} value={contact.id}>{contact.name}</option>)}</select></label>}
      <label className="task-filter-field"><span>תאריך לפי</span><select value={dateField} onChange={(e) => setDateField(e.target.value as 'start' | 'due' | 'follow' | 'created' | 'completed')}><option value="start">תאריך התחלה</option><option value="due">תאריך סיום</option><option value="follow">מועד מעקב</option><option value="created">תאריך יצירה</option><option value="completed">תאריך השלמה</option></select></label>
      <label className="task-filter-field"><span>מתאריך</span><input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} /></label>
      <label className="task-filter-field"><span>עד תאריך</span><input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} /></label>
      <button type="button" className="secondary compact-filter-clear" onClick={() => { setColumnFilters({}); setSearch(''); setStatusFilter('הכל'); setProjectFilter('הכל'); setAddressFilter(''); setAssigneeFilter('הכל'); setColorFilter('הכל'); setPriorityFilter('הכל'); setClientFilter('הכל'); setDateFrom(''); setDateTo(''); setCategoryFilter('') }}>ניקוי סינון</button>
      {canCreate && projectId && <label className="task-filter-field"><span>תבנית</span><select aria-label="החלת צ׳ק ליסט" defaultValue="" onChange={(e) => { const template = workspace.checklistTemplates.find((item) => item.id === e.target.value); if (template) applyTemplate(template.items); e.target.value = '' }}><option value="">בחירת צ׳ק ליסט</option>{workspace.checklistTemplates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}</select></label>}

    </div>

    {scheduleError && <div className="error-banner" role="alert">{scheduleError}</div>}
    <details className="card"><summary>סינון לפי עמודות מוצגות</summary><div className="toolbar">{visibleColumns.filter(column => !column.key.startsWith('__')).map(column => <label key={column.key}>{column.label}<input aria-label={`סינון עמודה ${column.label}`} value={columnFilters[column.key] || ''} onChange={event => setColumnFilters(current => ({ ...current, [column.key]: event.target.value }))} /></label>)}</div></details>
    <div className="toolbar task-scroll-controls" aria-label="ניווט אופקי בטבלה"><button type="button" className="secondary" onClick={() => tableRef.current?.scrollBy({ left: 400, behavior: 'smooth' })}>גלילה ימינה →</button><button type="button" className="secondary" onClick={() => tableRef.current?.scrollBy({ left: -400, behavior: 'smooth' })}>← גלילה שמאלה</button>{onEmail && <label>פתיחת מייל למשימה<select aria-label="פתיחת מייל למשימה" value="" onChange={event => { const task = rows.find(row => row.task.id === event.target.value)?.task; if (task) onEmail(task) }}><option value="">בחירת משימה</option>{rows.map(({ task }) => <option key={task.id} value={task.id}>{task.title}</option>)}</select></label>}</div>
    {!visibleColumns.length && <p className="field-help">כל העמודות מוסתרות. ניתן להציג אותן בהגדרות ← תצוגה.</p>}
    <div ref={tableRef} tabIndex={0} aria-label="טבלת משימות — גלילה אופקית" className={`table-scroll task-table-wrap table-density-${density}`}>
      <table className="data-table task-table task-table-percent" style={{ minWidth: taskTableMinWidth(visibleColumns) }}>
        <colgroup>{visibleColumns.map(column => <col key={column.id} style={{ width: `${column.widthPercent}%` }} />)}</colgroup>
        <thead><tr>{visibleColumns.map(column => <th key={column.id} data-column-key={column.key} className={column.key === '__actions' ? 'actions-col' : column.key === '__completed' ? 'complete-col' : column.key === '__color' ? 'color-col' : ''}>{column.label}{column.key === '__select' && <input type="checkbox" aria-label="בחירת כל המשימות המסוננות לסיכום" checked={rows.length > 0 && rows.every(row => selectedIds.includes(row.task.id))} onChange={event => setSelectedIds(event.target.checked ? rows.map(row => row.task.id) : [])} />}</th>)}</tr></thead>
        <tbody>
          {rows.map(({ task, depth }, index) => <Fragment key={task.id}>{groupBy !== 'none' && (index === 0 || (groupBy === 'assignee' ? rows[index - 1].task.assigneeId !== task.assigneeId : rows[index - 1].task.projectId !== task.projectId)) && <tr className="task-group-row"><th colSpan={Math.max(1, visibleColumns.length)}>{groupBy === 'assignee' ? workspace.team.find(member => member.id === task.assigneeId)?.name || 'ללא אחראי' : workspace.projects.find(project => project.id === task.projectId)?.name || 'ללא פרויקט'} · {rows.filter(row => groupBy === 'assignee' ? row.task.assigneeId === task.assigneeId : row.task.projectId === task.projectId).length}</th></tr>}<tr key={task.id} data-task-id={task.id} className={`${task.parentId ? 'subtask-row' : ''} ${isCompleted(task) ? 'completed-row' : ''} ${focusTaskId === task.id ? 'focused-task-row' : ''}`} style={{ borderInlineStartColor: task.colorTag ? taskColor(task.colorTag).hex : 'transparent' }}>
            {visibleColumns.map((column) => <td key={column.id} data-column-key={column.key} className={column.key === '__completed' ? 'complete-cell' : column.key === '__color' ? 'color-cell' : column.key === '__actions' ? 'task-actions-cell' : ''}>
              {column.key === '__select' ? <input type="checkbox" aria-label={`בחירת ${task.title} לסיכום פגישה`} checked={selectedIds.includes(task.id)} onChange={event => setSelectedIds(current => event.target.checked ? [...current, task.id] : current.filter(id => id !== task.id))} />
                : column.key === '__categories' ? <CategoryPicker workspace={workspace} projectId={task.projectId} value={task.categoryIds || []} disabled={!canUpdate || !task.projectId} onChange={categoryIds => updateTask(task.id, { categoryIds })} />
                : column.key === '__completed' ? <input type="checkbox" aria-label={isCompleted(task) ? `שחזור ${task.title} לאזור הפעיל` : `סימון ${task.title} כבוצעה`} checked={isCompleted(task)} disabled={!canStatus} onChange={(e) => toggleTaskCompleted(task, e.target.checked)} />
                : column.key === '__color' ? <label className="task-color-picker"><span className="color-dot" style={{ backgroundColor: taskColor(task.colorTag).hex }} /><select aria-label={`צבע קטלוג עבור ${task.title}`} disabled={!canUpdate} value={task.colorTag || ''} onChange={(e) => updateTask(task.id, { colorTag: e.target.value || undefined })}>{TASK_COLOR_OPTIONS.map((item) => <option key={item.id || 'none'} value={item.id}>{item.label}</option>)}</select></label>
                : column.key === '__project' ? <div className="task-project-cell"><select className="cell-input" disabled={!canUpdate} aria-label={`פרויקט עבור ${task.title}`} value={task.projectId || ''} onChange={(e) => changeTaskProject(task.id, e.target.value || undefined)}><option value="">ללא פרויקט</option>{workspace.projects.map((project) => <option key={project.id} value={project.id}>{project.name} — {project.address || 'כתובת חסרה'}</option>)}</select>{task.projectId && onProject && <button type="button" className="text-button" onClick={() => onProject(task.projectId!)}>פתיחה</button>}</div>
                : column.key === '__actions' ? (<div className="task-row-actions"><button className="secondary" onClick={() => setCommentTask(task)}>תגובות</button>{canUpdate && task.projectId && <button className="secondary" onClick={() => setContactTask(task)}>הקצאה לאיש קשר</button>}{canCreate && <button type="button" className="secondary task-action-btn" onClick={() => setCreatingFor({ parentId: task.id })}><Plus /> תת-משימה</button>}{canDelete && <DeleteButton message={`למחוק את המשימה "${task.title}" וכל תתי-המשימות שלה?`} onConfirm={() => removeTask(task.id)} />}</div>)
                : column.key === 'title' ? <input className="cell-input task-title-input" disabled={!canUpdate} aria-label="שם משימה" style={{ paddingInlineStart: 8 + Math.min(depth, 8) * 22 }} value={task.title} onChange={(e) => updateTask(task.id, { title: e.target.value })} />
                : column.type === 'status' ? <select className="cell-input" disabled={!canStatus} aria-label={`${column.label} עבור ${task.title}`} value={fieldValue(task, column)} onChange={(e) => editCell(task, column, e.target.value)}>{workspace.taskStatuses.map((status) => <option key={status}>{status}</option>)}</select>
                : column.type === 'member' ? <select className="cell-input" disabled={!canUpdate} aria-label={`${column.label} עבור ${task.title}`} value={fieldValue(task, column)} onChange={(e) => editCell(task, column, e.target.value)}><option value="">לא משויך</option>{workspace.team.filter((member) => member.active).map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select>
                : column.type === 'time' ? <input className="cell-input" type="time" disabled={!canUpdate} aria-label={`${column.label} עבור ${task.title}`} value={fieldValue(task, column)} onChange={event => editCell(task, column, event.target.value)} />
                : column.options !== undefined ? <select className="cell-input" disabled={!canUpdate} value={fieldValue(task, column)} aria-label={`${column.label} עבור ${task.title}`} onChange={event => editCell(task, column, event.target.value)}><option value="">ללא</option>{fieldValue(task, column) && !column.options.includes(fieldValue(task, column)) && <option>{fieldValue(task, column)}</option>}{column.options.map(value => <option key={value}>{value}</option>)}</select>
                : column.type === 'date' ? <input className="cell-input" disabled={!canUpdate} aria-label={`${column.label} עבור ${task.title}`} type="date" value={dateInput(fieldValue(task, column))} onChange={(e) => editCell(task, column, e.target.value)} />
                : column.type === 'priority' ? <select className="cell-input" disabled={!canUpdate} aria-label={`${column.label} עבור ${task.title}`} value={fieldValue(task, column)} onChange={(e) => editCell(task, column, e.target.value)}><option>נמוכה</option><option>רגילה</option><option>גבוהה</option><option>דחופה</option></select>
                : column.type === 'email' ? <div className="email-cell"><input className="cell-input" disabled={!canUpdate} aria-label={`${column.label} עבור ${task.title}`} type="email" value={fieldValue(task, column)} onChange={(e) => editCell(task, column, e.target.value)} placeholder="name@example.com" />{onEmail && <button type="button" className="secondary task-action-btn" title="פתיחת התכתבות" aria-label="פתיחת התכתבות" onClick={() => onEmail(task)}><Mail /> מייל</button>}</div>
                : <input className="cell-input" disabled={!canUpdate} aria-label={`${column.label} עבור ${task.title}`} value={fieldValue(task, column)} onChange={(e) => editCell(task, column, e.target.value)} />}
            </td>)}

          </tr></Fragment>)}
          {!rows.length && <tr><td colSpan={Math.max(1, visibleColumns.length)}><div className="table-empty">{view === 'archive' ? 'אין משימות שהושלמו.' : 'אין משימות פעילות שמתאימות לסינון.'}</div></td></tr>}
        </tbody>
      </table>
    </div>

    {commentTask && <Modal title={`תגובות — ${commentTask.title}`} onClose={() => setCommentTask(null)}><TaskComments orgId={orgId} taskId={commentTask.id} canComment={canStatus} /></Modal>}
    {contactTask && <TaskContactAssignment task={contactTask} workspace={workspace} setWorkspace={setWorkspace} orgId={orgId} canInvite={canInviteExternal} onContact={onContact} onClose={() => setContactTask(null)} />}
    {canCreate && creatingFor && <Modal title={creatingFor.parentId ? 'תת-משימה חדשה' : 'משימה חדשה'} onClose={() => setCreatingFor(null)} wide>
      <form className="form-grid two-col" onSubmit={submitTask}>
        {selectedParent && <div className="task-parent-note full"><strong>תת-משימה של:</strong> {selectedParent.title}</div>}
        <Field label="שם המשימה"><input name="title" required autoFocus /></Field>
        {!projectId && !selectedParent && <Field label="פרויקט"><select name="projectId" defaultValue={defaultProjectId}><option value="">ללא פרויקט</option>{workspace.projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></Field>}
        <Field label="אחראי" hint="אנשי קשר משויכים זמינים לאחר הזמנה ואישור גישה מוגבלת דרך משתמשים והרשאות. בחירה אינה מעניקה גישה חדשה."><select name="assigneeId"><option value="">לא משויך</option>{workspace.team.filter((member) => member.active).map((member) => <option key={member.id} value={member.id}>{member.name}{workspace.contacts.some(contact => [...(workspace.projects.find(project => project.id === defaultProjectId)?.contactIds || []), ...(workspace.projects.find(project => project.id === defaultProjectId)?.clientIds || [])].includes(contact.id) && contact.email?.toLowerCase() === member.email.toLowerCase()) ? ' — איש קשר בפרויקט' : ''}</option>)}</select></Field>
        <Field label="סטטוס"><select name="status" defaultValue={workspace.taskStatuses[0] || 'טרם התחיל'}>{workspace.taskStatuses.map((status) => <option key={status}>{status}</option>)}</select></Field>
        <Field label="עדיפות"><select name="priority" defaultValue="רגילה"><option>נמוכה</option><option>רגילה</option><option>גבוהה</option><option>דחופה</option></select></Field>
        <Field label="צבע / קטלוג"><select name="colorTag" defaultValue=""><option value="">ללא צבע</option>{TASK_COLOR_OPTIONS.filter((item) => item.id).map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></Field>
        <Field label="תאריך תחילת משימה"><input name="startDate" type="date" /></Field>
        <Field label="שעה" hint="השעה חלה על תאריך ההתחלה, או הסיום / המעקב אם לא נקבעה התחלה"><input name="scheduledTime" type="time" /></Field>
        <Field label="תאריך סיום"><input name="dueDate" type="date" /></Field>
        <Field label="מועד מעקב"><input name="followUpDate" type="date" /></Field>
        <Field label="מייל לקוח"><input name="emailTo" type="email" placeholder="name@example.com" /></Field>
        <div className="field"><span>מקצועות</span><CategoryPicker workspace={workspace} projectId={projectId || selectedParent?.projectId} value={newCategories} onChange={setNewCategories} /></div>
        {workspace.taskColumns.filter(column => column.key.startsWith('custom.')).map(column => <Field key={column.id} label={column.label}>{taskColumnChoices(column, workspace) !== undefined ? <select name={column.key}><option value="">ללא</option>{taskColumnChoices(column, workspace)!.map(value => <option key={value}>{value}</option>)}</select> : <input name={column.key} />}</Field>)}
        <Field label="תיאור"><textarea name="description" rows={4} /></Field>
        <div className="form-actions full"><button type="button" className="secondary" onClick={() => setCreatingFor(null)}>ביטול</button><button className="primary"><Plus /> יצירת {creatingFor.parentId ? 'תת-משימה' : 'משימה'}</button></div>
      </form>
    </Modal>}
  </div>
}
