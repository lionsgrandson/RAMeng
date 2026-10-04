import { cloneWorkspace } from '/src/seed'
const params = new URLSearchParams(location.search)
const role = params.get('qaRole') || 'developer'
const key = `rameng-qa-${role}`
let authListener: ((event: string, session: unknown) => void) | undefined
let failedSave = false
const user = { id: 'qa-user', email: 'qa@example.test', user_metadata: { full_name: 'בודק QA' } }
export const configureBackend = () => undefined
export const getRuntime = () => ({ apiBase: '' })
export const getBackend = () => ({ auth: { onAuthStateChange: (listener: typeof authListener) => { authListener = listener; return { data: { subscription: { unsubscribe() {} } } } } }, removeChannel() {} })
export const getCurrentUser = async () => user
export const getAccessToken = async () => ''
export const signIn = async () => user
export const signOut = async () => authListener?.('SIGNED_OUT', null)
export const requestPasswordReset = async () => undefined
export const updatePassword = async () => user
export const updateCurrentUserName = async (name: string) => ({ ...user, user_metadata: { full_name: name } })
export const listOrganizationMembers = async () => [{ userId: user.id, displayName: user.user_metadata.full_name, email: user.email, role }]
export const setOrganizationMemberRole = async () => undefined
export const setOrganizationMemberPermissions = async () => undefined
export const subscribeWorkspace = () => null
export async function loadOrganizationWorkspace() {
  const workspace = JSON.parse(localStorage.getItem(key) || 'null') || cloneWorkspace()
  if (!workspace.contacts.length) workspace.contacts = [{ id: 'qa-client', name: 'לקוח בדיקה', email: 'client@example.test', status: 'פעיל', tags: [], createdAt: '2026-10-04T09:00:00Z' }]
  if (!workspace.projects.length) workspace.projects = [{ id: 'qa-project', name: 'פרויקט בדיקה', address: 'רחוב בדיקה 10, ירושלים', clientIds: ['qa-client'], status: 'בביצוע', progress: 20, createdAt: '2026-10-04T09:00:00Z' }]
  if (!workspace.tasks.length) workspace.tasks = [{ id: 'qa-task', title: 'משימת בדיקה', projectId: 'qa-project', status: 'דורש מעקב', priority: 'דחופה', custom: {}, order: 1, createdAt: '2026-10-04T09:00:00Z' }]
  if (!workspace.reports.length) workspace.reports = [{ id: 'qa-report', projectId: 'qa-project', title: 'דוח בדיקה', siteAddress: 'רחוב בדיקה 10, ירושלים', inspectionDate: '2026-10-04', updatedAt: '2026-10-04T09:00:00Z', inspector: 'בודק QA', layout: 'table', sections: [{ id: 'qa-section', title: 'בנייה', items: [{ id: 'qa-item', description: 'סעיף בדיקה', status: 'פתוח', treatment: '', photos: [] }] }] }]
  const permissions = role === 'status' ? { tasks: { status: true }, reports: { status: true } } : role === 'restricted' ? { contacts: { view: false }, projects: { view: false }, finance: { view: false } } : null
  return { orgId: 'qa', role: ['status', 'restricted'].includes(role) ? 'viewer' : role, permissions, workspace, version: 0 }
}
export async function saveOrganizationWorkspace(_org: string, _user: string, workspace: unknown, version: number) {
  await new Promise((resolve) => setTimeout(resolve, 150))
  if (params.get('qaSave') === 'error' && !failedSave) { failedSave = true; throw new Error('QA save failure') }
  if (params.get('qaSave') === 'conflict') throw Object.assign(new Error('QA conflict'), { name: 'WorkspaceConflictError' })
  localStorage.setItem(key, JSON.stringify(workspace))
  return { version: version + 1 }
}
export async function uploadFile(_org: string, _project: string, file: File) {
  if (params.get('qaUpload') === 'error') throw new Error('העלאת התמונה נכשלה. נסו שוב.')
  return { url: URL.createObjectURL(file), path: '' }
}
export const refreshSignedUrl = async () => ''
