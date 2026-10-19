import type { InspectionReport, InspectionSection, Workspace } from '../types'

export interface TaskReportOptions {
  title: string
  templateId?: string
  inspector?: string
  date?: string
  periodStart?: string
  periodEnd?: string
}

/** Create an editable, attributed snapshot from explicitly selected project tasks.
 * Never infer findings or silently include unselected or cross-project records.
 */
export function createReportFromTasks(
  workspace: Workspace,
  projectId: string,
  selectedIds: string[],
  options: TaskReportOptions,
  generateId: (prefix: string) => string = (prefix) => `${prefix}-${crypto.randomUUID()}`,
): InspectionReport {
  const project = workspace.projects.find((item) => item.id === projectId)
  if (!project) throw new Error('הפרויקט אינו קיים')
  if (options.periodStart && options.periodEnd && options.periodStart > options.periodEnd) throw new Error('תאריך סיום התקופה חייב להיות אחרי תאריך ההתחלה')
  const taskIds = [...new Set(selectedIds)]
  const tasks = taskIds.map((id) => workspace.tasks.find((item) => item.id === id && item.projectId === projectId)).filter((task) => task !== undefined)
  if (!tasks.length) throw new Error('יש לבחור משימות מהפרויקט')

  const template = workspace.reportTemplates.find((item) => item.id === options.templateId) || workspace.reportTemplates[0]
  const sections: InspectionSection[] = (template?.sectionTitles || []).map((title) => ({ id: generateId('section'), title, items: [] }))
  for (const task of tasks) {
    const category = workspace.categories.find((item) => task.categoryIds?.includes(item.id))
    const sectionTitle = category?.name || 'כללי'
    let section = sections.find((item) => item.title === sectionTitle)
    if (!section) {
      section = { id: generateId('section'), title: sectionTitle, items: [] }
      sections.push(section)
    }
    const secondaryCategories = workspace.categories.filter((item) => item.id !== category?.id && task.categoryIds?.includes(item.id)).map((item) => item.name)
    const details = [
      task.title,
      task.description || '',
      secondaryCategories.length ? `מקצועות נוספים: ${secondaryCategories.join(', ')}` : '',
      task.dueDate ? `תאריך יעד: ${task.dueDate}` : '',
    ].filter(Boolean).join('\n')
    section.items.push({
      id: generateId('issue'),
      sourceTaskId: task.id,
      sourceTaskStatus: task.status,
      dueDate: task.dueDate,
      description: details,
      status: ['בוצע', 'סגור'].includes(task.status) ? 'בוצע' : task.status === 'בוצע חלקית' ? 'בוצע חלקית' : 'פתוח',
      treatment: '',
      responsible: workspace.team.find((member) => member.id === task.assigneeId)?.name,
      photos: [],
    })
  }
  return {
    id: generateId('report'),
    projectId,
    title: options.title.trim() || `דוח משימות - ${project.name}`,
    siteAddress: project.address,
    inspectionDate: options.date || new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()),
    updatedAt: new Date().toISOString(),
    inspector: options.inspector || workspace.settings.defaultInspector || '',
    layout: template?.layout || 'table',
    periodStart: options.periodStart || undefined,
    periodEnd: options.periodEnd || undefined,
    sections,
  }
}
