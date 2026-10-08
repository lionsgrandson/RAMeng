import { cloneWorkspace } from '/src/seed'
const params = new URLSearchParams(location.search)
const role = params.get('qaRole') || 'developer'
const taskCount = params.has('qaTasks') ? Math.min(500, Math.max(0, Number(params.get('qaTasks')) || 0)) : null
const key = `rameng-qa-${role}${taskCount === null ? '' : `-tasks-${taskCount}`}`
const versionKey = `${key}-version`
let authListener: ((event: string, session: unknown) => void) | undefined
let failedSave = false
const user = { id: role === 'external' ? 'qa-external' : 'qa-user', email: role === 'external' ? 'external@example.test' : 'qa@example.test', user_metadata: { full_name: role === 'external' ? 'משתתף חיצוני לבדיקה' : 'בודק QA' } }
export const configureBackend = () => undefined
export const getRuntime = () => ({ apiBase: '' })
export const getBackend = () => ({ auth: { getUser: async () => ({ data: { user } }), onAuthStateChange: (listener: typeof authListener) => { authListener = listener; return { data: { subscription: { unsubscribe() {} } } } } }, removeChannel() {}, from: () => { const query: any = { data: [], error: null }; for (const method of ['select','eq','in','order','limit']) query[method] = () => query; query.maybeSingle = async () => ({ data: { org_id: 'qa-org' } }); return query }, rpc: async () => ({ data: [{ data: JSON.parse(localStorage.getItem(key) || '{}') }] }) })
export const getCurrentUser = async () => user
export const getAccessToken = async () => ''
export const signIn = async () => user
export const signOut = async () => authListener?.('SIGNED_OUT', null)
export const requestPasswordReset = async () => undefined
export const updatePassword = async () => user
export const updateCurrentUserName = async (name: string) => ({ ...user, user_metadata: { full_name: name } })
export const listOrganizationMembers = async () => [{ userId: user.id, displayName: user.user_metadata.full_name, email: user.email, role }, ...JSON.parse(localStorage.getItem('qa-members') || '[]')]
export const setOrganizationMemberRole = async () => undefined
export const setOrganizationMemberPermissions = async () => undefined
export const taskNotifications = async () => []
export const readTaskNotification = async () => undefined
export const listProjectCollaborators = async () => JSON.parse(localStorage.getItem('qa-project-grants') || '[]')
export const setProjectCollaborator = async (_org: string, projectId: string, userId: string, allow: boolean) => { const current = await listProjectCollaborators(); const next = current.filter((grant: any) => grant.project_id !== projectId || grant.user_id !== userId); if (allow) next.push({ project_id: projectId, user_id: userId }); localStorage.setItem('qa-project-grants', JSON.stringify(next)) }
export const subscribeWorkspace = () => null
export async function loadOrganizationWorkspace() {
  const cached = JSON.parse(localStorage.getItem(key) || 'null')
  const workspace = { ...cloneWorkspace(), ...(cached || {}) }
  if (!cached && !workspace.contacts.length) workspace.contacts = [{ id: 'qa-client', name: 'לקוח בדיקה', email: 'client@example.test', status: 'פעיל', tags: [], createdAt: '2026-10-04T09:00:00Z' }]
  if (!cached && !workspace.projects.length) workspace.projects = [{ id: 'qa-project', name: 'פרויקט בדיקה', address: 'רחוב בדיקה 10, ירושלים', clientIds: ['qa-client'], status: 'בביצוע', progress: 20, createdAt: '2026-10-04T09:00:00Z' }]
  if (!cached && !workspace.tasks.length) workspace.tasks = [{ id: 'qa-task', title: 'משימת בדיקה', projectId: 'qa-project', status: 'דורש מעקב', priority: 'דחופה', custom: {}, order: 1, createdAt: '2026-10-04T09:00:00Z' }]
  if (!cached && taskCount !== null) workspace.tasks = Array.from({ length: taskCount }, (_, index) => ({ id: `qa-stress-${index}`, title: `משימת בדיקה ${index + 1} — Hebrew / English`, projectId: 'qa-project', status: index % 5 === 0 ? 'בוצע' : 'טרם התחיל', priority: 'רגילה', order: index + 1, createdAt: '2026-10-04T09:00:00Z', ...(index % 5 === 0 ? { completedAt: '2026-10-05T09:00:00Z' } : {}) }))
  if (!cached && !workspace.files.length) workspace.files = [{ id: 'qa-file', projectId: 'qa-project', name: 'QA-attachment.txt', url: 'data:text/plain;base64,UkFNIENSTSBkaXNwb3NhYmxlIGF0dGFjaG1lbnQ=', type: 'text/plain', size: 29, version: 1, uploadedAt: '2026-10-05T09:00:00Z' }]
  if (!cached && !workspace.reports.length) workspace.reports = [{ id: 'qa-report', projectId: 'qa-project', title: 'דוח בדיקה', siteAddress: 'רחוב בדיקה 10, ירושלים', inspectionDate: '2026-10-04', updatedAt: '2026-10-04T09:00:00Z', inspector: 'בודק QA', layout: 'table', sections: [{ id: 'qa-section', title: 'בנייה', items: [{ id: 'qa-item', description: 'סעיף בדיקה', status: 'פתוח', treatment: '', photos: [] }] }] }]
  const permissions = role === 'status' ? { tasks: { status: true }, reports: { status: true } } : role === 'restricted' ? { contacts: { view: false }, projects: { view: false }, finance: { view: false } } : null
  return { orgId: 'qa', role: ['status', 'restricted'].includes(role) ? 'viewer' : role, permissions, workspace, version: Number(localStorage.getItem(versionKey) || 0) }
}
export async function saveOrganizationWorkspace(_org: string, _user: string, workspace: unknown, version: number) {
  await new Promise((resolve) => setTimeout(resolve, 150))
  if (params.get('qaSave') === 'error' && !failedSave) { failedSave = true; throw new Error('QA save failure') }
  if (params.get('qaSave') === 'conflict') throw Object.assign(new Error('QA conflict'), { name: 'WorkspaceConflictError' })
  if (Number(localStorage.getItem(versionKey) || 0) !== version) throw Object.assign(new Error('QA concurrent change'), { name: 'WorkspaceConflictError' })
  localStorage.setItem(key, JSON.stringify(workspace))
  localStorage.setItem(versionKey, String(version + 1))
  return { version: version + 1 }
}
export async function uploadFile(_org: string, _project: string, file: File) {
  if (params.get('qaUpload') === 'error') throw new Error('העלאת התמונה נכשלה. נסו שוב.')
  return { url: URL.createObjectURL(file), path: '' }
}
export const refreshSignedUrl = async () => ''

export const readWorkspaceState = async () => { const raw = localStorage.getItem(key); return raw ? { workspace: JSON.parse(raw), version: Number(localStorage.getItem(versionKey) || 0) } : null }
