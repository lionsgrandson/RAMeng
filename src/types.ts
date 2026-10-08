export type ID = string
export type Priority = 'נמוכה' | 'רגילה' | 'גבוהה' | 'דחופה'
export type ProjectStatus = 'בתכנון' | 'בביצוע' | 'בהמתנה' | 'הושלם' | 'מוקפא'
export type ContactStatus = 'ליד' | 'פעיל' | 'בהמתנה' | 'לא פעיל'
export type DealStage = 'חדש' | 'פגישה' | 'הצעה' | 'משא ומתן' | 'זכייה' | 'נסגר'
export type QuoteStatus = 'טיוטה' | 'נשלחה' | 'אושרה' | 'נדחתה' | 'שולמה חלקית' | 'שולמה'
export type ReportLayout = 'table' | 'cards' | 'photo'
export type TaskColumnType = 'text' | 'date' | 'status' | 'member' | 'email' | 'priority'

export interface Contact {
  id: ID
  name: string
  company?: string
  phone?: string
  mobile?: string
  role?: string
  companyType?: string
  address?: string
  projectReferences?: string
  developer?: string
  additionalContact?: string
  importDetails?: Record<string, string>
  email?: string
  status: string
  tags: string[]
  notes?: string
  createdAt: string
}

export interface Deal {
  id: ID
  contactId?: ID
  title: string
  amount: number
  stage: DealStage
  probability: number
  nextAction?: string
  dueDate?: string
}

export interface Project {
  id: ID
  name: string
  address: string
  clientIds: ID[]
  contactIds?: ID[]
  meetingTemplate?: string
  categoryIds?: ID[]
  managerId?: ID
  status: ProjectStatus
  startDate?: string
  targetDate?: string
  progress: number
  budget?: number
  notes?: string
  driveFolderId?: string
  driveFolderUrl?: string
  createdAt: string
}

export interface Task {
  id: ID
  projectId?: ID
  parentId?: ID
  title: string
  description?: string
  categoryIds?: ID[]
  assigneeId?: ID
  status: string
  priority: Priority
  startDate?: string
  dueDate?: string
  followUpDate?: string
  emailTo?: string
  gmailThreadId?: string
  colorTag?: string
  custom: Record<string, string>
  order: number
  createdAt: string
  completedAt?: string
}

export interface CalendarEvent {
  id: ID
  projectId?: ID
  taskId?: ID
  title: string
  start: string
  end?: string
  location?: string
  notes?: string
  googleEventId?: string
  googleHtmlLink?: string
}

export interface FileRecord {
  id: ID
  projectId?: ID
  taskId?: ID
  name: string
  url: string
  storagePath?: string
  type?: string
  size?: number
  categoryIds?: ID[]
  version: number
  uploadedAt: string
}

export interface Quote {
  id: ID
  contactId?: ID
  projectId?: ID
  number: string
  title: string
  amount: number
  status: QuoteStatus
  issuedAt: string
  dueDate?: string
  paidAmount: number
}

export interface TeamMember {
  id: ID
  name: string
  email: string
  role: 'מנהל' | 'מפקח' | 'מהנדס' | 'משרד' | 'צפייה'
  external?: boolean
  active: boolean
}

export interface TaskColumn {
  id: ID
  label: string
  key: string
  type: TaskColumnType
  visible: boolean
  removable: boolean
  width?: number
  options?: string[]
}

export interface ChecklistTemplateItem {
  id: ID
  title: string
  children?: ChecklistTemplateItem[]
}

export interface ChecklistTemplate {
  id: ID
  name: string
  items: ChecklistTemplateItem[]
}

export interface InspectionPhoto {
  id: ID
  url: string
  storagePath?: string
  caption?: string
}

export interface InspectionItem {
  id: ID
  description: string
  status: string
  treatment: string
  responsible?: string
  sourceReportId?: ID
  photos: InspectionPhoto[]
}

export interface InspectionSection {
  id: ID
  title: string
  items: InspectionItem[]
}

export interface InspectionReport {
  id: ID
  projectId: ID
  title: string
  siteAddress: string
  inspectionDate: string
  updatedAt: string
  inspector: string
  layout: ReportLayout
  sections: InspectionSection[]
  notes?: string
}

export interface ReportTemplate {
  id: ID
  name: string
  layout: ReportLayout
  sectionTitles: string[]
}

export interface AuditEntry {
  id: ID
  at: string
  actor: string
  action: string
  entity: string
  entityId?: ID
}

export interface ClientNote {
  id: ID
  contactId: ID
  projectId?: ID
  kind: 'timeline' | 'message'
  body: string
  createdAt: string
  createdBy: string
}

export interface AppSettings {
  organizationName: string
  organizationShortName: string
  phone: string
  email: string
  secondaryEmail: string
  website: string
  brandColor: string
  logoUrl: string
  openaiModel: string
  driveRootFolderId: string
  defaultInspector: string
}

export interface Category { id: ID; name: string }
export interface MeetingSummary { id: ID; projectId: ID; title: string; date: string; taskIds: ID[]; notes: string; taskNotes: Record<string, string>; updatedAt: string }

export interface Workspace {
  categories: Category[]
  meetingSummaries: MeetingSummary[]
  contacts: Contact[]
  deals: Deal[]
  projects: Project[]
  tasks: Task[]
  events: CalendarEvent[]
  files: FileRecord[]
  quotes: Quote[]
  team: TeamMember[]
  taskColumns: TaskColumn[]
  taskStatuses: string[]
  checklistTemplates: ChecklistTemplate[]
  reports: InspectionReport[]
  reportTemplates: ReportTemplate[]
  audit: AuditEntry[]
  clientNotes: ClientNote[]
  settings: AppSettings
}
