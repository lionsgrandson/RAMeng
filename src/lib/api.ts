import { diagnosticContext, appVersion } from './diagnostics'
import { errorReportingOrganization, reportClientError } from './errorReporting'
import { getAccessToken, getRuntime } from './backend'

const pendingStatus = new Map<string, Promise<unknown>>()
async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const requestId = crypto.randomUUID()
  let token: string | null
  let authTimer: ReturnType<typeof setTimeout> | undefined
  try { token = await Promise.race([getAccessToken(), new Promise<never>((_, reject) => { authTimer = setTimeout(() => reject(new DOMException('Authentication deadline', 'TimeoutError')), 10000) })]) } catch (cause) {
    const error = new Error('שירות ההתחברות אינו זמין כרגע.')
    Object.defineProperty(error, 'diagnostic', {value: diagnosticContext(path, {requestId,category:cause instanceof Error && cause.name === 'TimeoutError' ? 'timeout' : 'auth_transport',dependency:'supabase_auth',errorName:cause instanceof Error ? cause.name : 'Error'})})
    if (path !== '/api/application-errors') void reportClientError(path.split('?')[0], error)
    throw error
  } finally { clearTimeout(authTimer) }
  const base = getRuntime()?.apiBase || ''
  if (!['/api/integrations/status', '/api/google/gmail/unread'].includes(path) || (init.method && init.method !== 'GET')) return executeRequest<T>(path, init, token, base, requestId)
  const key = JSON.stringify([base, errorReportingOrganization(), token, path])
  const pending = pendingStatus.get(key)
  if (pending) return pending as Promise<T>
  const operation = executeRequest<T>(path, init, token, base, requestId)
  pendingStatus.set(key, operation)
  try { return await operation } finally { if (pendingStatus.get(key) === operation) pendingStatus.delete(key) }
}
async function executeRequest<T>(path: string, init: RequestInit, token: string | null, base: string, requestId: string): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${base}${path}`, {
      ...init,
      signal: init.signal || AbortSignal.timeout(30000),
      headers: {
        'content-type': 'application/json',
        'x-request-id': requestId, 'x-app-version': appVersion,
        ...(errorReportingOrganization() ? {'x-rameng-org': errorReportingOrganization()} : {}),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...(init.headers || {}),
      },
    })
  } catch (cause) {
    const error = new Error('לא ניתן להתחבר כרגע. נסו שוב.')
    const name = cause instanceof Error ? cause.name : 'Error'
    Object.defineProperty(error, 'diagnostic', { value: diagnosticContext(path, {requestId, method:init.method || 'GET', category:name === 'TimeoutError' ? 'timeout' : name === 'AbortError' ? 'cancelled' : navigator.onLine ? 'network' : 'offline',errorName:name}) })
    if (path !== '/api/application-errors' && name !== 'AbortError') void reportClientError(path.split('?')[0], error)
    throw error
  }

  let malformed = false
  const body = await response.json().catch(() => { malformed = true; return {} }) as T & { error?: string; diagnosticQueued?: boolean; requestId?: string; category?: string; workerVersion?: string; dependency?: string }
  if (!response.ok || malformed) {
    const error = new Error(body.error || 'הפעולה נכשלה.')
    Object.defineProperty(error, 'diagnostic', { value: diagnosticContext(path, {code:malformed && response.ok ? 'INVALID_RESPONSE' : `HTTP_${response.status}`,requestId:response.headers.get('x-request-id') || body.requestId || requestId,workerVersion:response.headers.get('x-worker-version') || body.workerVersion || 'unknown',method:init.method || 'GET',status:response.status,category:body.category || (malformed ? 'http_invalid_response' : 'http_error'),dependency:body.dependency || 'worker',responseReceived:true}) })
    if (path !== '/api/application-errors' && !body.diagnosticQueued && response.status !== 401 && response.status !== 403) void reportClientError(path.split('?')[0], error)
    throw error
  }
  return body
}

export interface MailDraft { ownerId?: string; key: string; to: string; subject: string; body: string; html: string; threadId?: string; attachments: MailAttachment[]; draftId?: string; updatedAt?: string; synced?: boolean }
export interface MailProjectContext { orgId: string; projectId: string; taskId?: string | null; categoryIds?: string[] }
export interface MailSendResult { id: string; threadId: string; associationSaved?: boolean; subject?: string }
export interface ProjectMailLink extends MailProjectContext { threadId: string; subject: string; from: string; to: string; date: string; snippet: string; incoming?: boolean; unread?: boolean }
export const integrationsApi = {
  testErrorReporting: (orgId: string) => request<{id:string;state:string}>('/api/application-errors', {method:'POST',body:JSON.stringify({orgId,operation:'diagnostic-test',code:'QA_TEST',message:'בדיקת מסלול דיווח התקלות. זוהי הודעת בדיקה יזומה; לא אירעה תקלה בנתוני הלקוח.',page:'settings'})}),
  communicationJournal: (orgId: string, projectId = '') => request<{ mailbox: { user_id: string; active: boolean; email: string; last_sync_at?: string; last_error_code?: string } | null; threads: JournalThread[] }>(`/api/communication-journal?orgId=${encodeURIComponent(orgId)}&projectId=${encodeURIComponent(projectId)}`),
  journalMessages: (orgId: string, threadId: string) => request<{ messages: JournalMessage[] }>(`/api/communication-journal?orgId=${encodeURIComponent(orgId)}&threadId=${encodeURIComponent(threadId)}`),
  shareJournalThread: (payload: { orgId: string; threadId: string; projectId: string; taskIds: string[]; contactIds: string[] }) => request<{ ok: boolean; threadId: string; messageCount: number }>('/api/communication-journal', { method: 'POST', body: JSON.stringify(payload) }),
  taskComments: (orgId: string, taskId: string, cursor = '') => request<{ latestComment?: {id:string;body:string;authorId:string;at:string} | null; comments: { id: string; body: string; authorId: string; at: string }[]; cursor: string }>(`/api/task-comments?orgId=${encodeURIComponent(orgId)}&taskId=${encodeURIComponent(taskId)}&cursor=${encodeURIComponent(cursor)}`),
  addTaskComment: (orgId: string, taskId: string, body: string) => request<{ comment: { id: string; body: string; authorId: string; at: string } }>('/api/task-comments', { method: 'POST', body: JSON.stringify({ orgId, taskId, body }) }),
  renameDrive: (payload: { orgId: string; projectId: string; fileId: string; name: string }) => request<{ file: GoogleDriveFile }>('/api/google/drive/rename', { method: 'PATCH', body: JSON.stringify(payload) }),
  createDriveFolder: (payload: {orgId: string; projectId: string; parentId: string; name: string}) => request<{file: GoogleDriveFile}>('/api/google/drive/folder', {method:'POST',body:JSON.stringify(payload)}),
  moveDriveFile: (payload: {orgId: string; projectId: string; parentId: string; fileId: string}) => request<{file: GoogleDriveFile}>('/api/google/drive/folder', {method:'PATCH',body:JSON.stringify(payload)}),
  driveCategory: (payload: { orgId: string; projectId: string; folderId: string; categoryId: string; name: string }) => request<{ id: string; name: string }>('/api/google/drive/category', { method: 'POST', body: JSON.stringify(payload) }),
  driveSharing: (orgId: string, projectId: string, fileId: string) => request<{ permissions: { id: string; emailAddress?: string; role: string; canRevoke: boolean }[] }>(`/api/google/drive/sharing?orgId=${encodeURIComponent(orgId)}&projectId=${encodeURIComponent(projectId)}&fileId=${encodeURIComponent(fileId)}`),
  shareDrive: (payload: { orgId: string; projectId: string; fileId: string; email: string; role: string }) => request<{ id: string }>('/api/google/drive/sharing', { method: 'POST', body: JSON.stringify(payload) }),
  revokeDriveShare: (payload: { orgId: string; projectId: string; fileId: string; permissionId: string }) => request<{ ok: true }>('/api/google/drive/sharing', { method: 'DELETE', body: JSON.stringify(payload) }),
  sendTaskNotifications: (orgId: string, notificationId?: string) => request<{ sent: number; failed: number }>('/api/task-notifications/send', { method: 'POST', body: JSON.stringify({ orgId, notificationId }) }),
  inbox: (pageToken = '') => request<{ messages: GmailApiMessage[]; nextPageToken: string; unreadCount: number }>(`/api/google/gmail/inbox?pageToken=${encodeURIComponent(pageToken)}`),
  unreadMail: () => request<{ unreadCount: number }>('/api/google/gmail/unread'),
  readMail: (threadId: string) => request<{ ok: true; unreadCount: number | null }>('/api/google/gmail/read', { method: 'POST', body: JSON.stringify({ threadId }) }),
  markMailUnread: (threadId: string) => request<{ ok: true; unreadCount: number | null }>('/api/google/gmail/unread', { method: 'POST', body: JSON.stringify({ threadId }) }),
  mailAttachment: (messageId: string, partId: string) => request<{ name: string; type: string; data: string }>(`/api/google/gmail/attachment?messageId=${encodeURIComponent(messageId)}&partId=${encodeURIComponent(partId)}`),
  trashMail: (threadId: string) => request<{ ok: true; unreadCount: number | null }>('/api/google/gmail/trash', { method: 'POST', body: JSON.stringify({ threadId }) }),
  projectMailLinks: () => request<{ links: ProjectMailLink[] }>('/api/google/gmail/project-links'),
  linkProjectMail: (payload: MailProjectContext & { threadId: string }) => request<{ link: ProjectMailLink }>('/api/google/gmail/project-links', { method: 'PUT', body: JSON.stringify(payload) }),
  unlinkProjectMail: (payload: MailProjectContext & { threadId: string }) => request<{ ok: true }>('/api/google/gmail/project-links', { method: 'DELETE', body: JSON.stringify(payload) }),
  syncGoogle: (state: { cursor?: string; driveCursor?: string; feedsDone?: boolean; driveDone?: boolean } = {}) => request<{ cursor: string; driveCursor: string; refreshed: number; uploaded: number; failed: number }>('/api/google/sync', { method: 'POST', body: JSON.stringify(state) }),
  mailDraft: (key: string) => request<{ draft: MailDraft | null }>(`/api/google/gmail/draft?key=${encodeURIComponent(key)}`),
  saveMailDraft: (draft: MailDraft) => request<{ draft: MailDraft }>('/api/google/gmail/draft', { method: 'PUT', body: JSON.stringify(draft), keepalive: new TextEncoder().encode(JSON.stringify(draft)).length < 60000 }),
  mailImages: (messageId: string) => request<{ images: Record<string, string> }>(`/api/google/gmail/images?messageId=${encodeURIComponent(messageId)}`),
  mailSignature: () => request<{ html: string; enabled: boolean }>('/api/profile/signature'),
  saveMailSignature: (signature: { html: string; enabled: boolean }) => request<{ html: string; enabled: boolean }>('/api/profile/signature', { method: 'PUT', body: JSON.stringify(signature) }),
  status: () => request<IntegrationStatus>('/api/integrations/status'),
  googleConfig: () => request<GoogleIntegrationConfig>('/api/google/config'),
  saveGoogleConfig: (config: { clientId: string; clientSecret?: string }) => request<{ ok: true; configured: boolean }>('/api/google/config', { method: 'PUT', body: JSON.stringify(config) }),
  googleAuthUrl: (driveRead = false) => request<{ url: string }>(`/api/google/auth-url?driveRead=${driveRead}`),
  gmailLinks: () => request<{ links: Record<string, { threadId: string; to: string }> }>('/api/google/gmail/links'),
  linkGmailTask: (taskId: string, threadId: string, to = '') => request<{ links: Record<string, { threadId: string; to: string }> }>('/api/google/gmail/links', { method: 'PUT', body: JSON.stringify({ taskId, threadId, to }) }),
  unlinkGmailTask: (taskId: string) => request<{ links: Record<string, { threadId: string; to: string }> }>('/api/google/gmail/links', { method: 'DELETE', body: JSON.stringify({ taskId }) }),
  gmailThread: (threadId: string, force = false) => request<{ messages: GmailApiMessage[] }>(`/api/google/gmail/thread?threadId=${encodeURIComponent(threadId)}&force=${force}`),
  gmailSearch: (query: string) => request<{ threads: { id: string; snippet: string; subject?: string; from?: string }[] }>(`/api/google/gmail/search?q=${encodeURIComponent(query)}`),
  sendMail: (payload: { to: string; subject: string; body: string; html?: string; threadId?: string; attachments?: MailAttachment[]; draftKey?: string; draftId?: string; ownerId?: string } & Partial<MailProjectContext>) => request<MailSendResult>('/api/google/gmail/send', { method: 'POST', body: JSON.stringify(payload) }),
  contactMail: (emails: string[], pageToken = '', force = false) => request<{ threads: GmailThreadSummary[]; nextPageToken: string }>(`/api/google/gmail/contacts?emails=${encodeURIComponent(emails.join(','))}&pageToken=${encodeURIComponent(pageToken)}&force=${force}`),
  contactCalendar: (emails: string[], from: string, to: string, force = false) => request<{ items: GoogleCalendarEvent[]; partial?: boolean }>(`/api/google/calendar/contacts?emails=${encodeURIComponent(emails.join(','))}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&force=${force}`),
  calendarEvents: (from?: string, to?: string, force = false) => request<{ items: GoogleCalendarEvent[]; partial?: boolean }>(`/api/google/calendar/events?from=${encodeURIComponent(from || '')}&to=${encodeURIComponent(to || '')}&force=${force}`),
  syncTaskCalendar: (orgId: string, ownerId: string) => request<{ synced: boolean; created: number; updated: number; deleted: number; unchanged: number; failed: number }>('/api/google/calendar/tasks/sync', { method: 'POST', body: JSON.stringify({ orgId, ownerId }) }),
  updateCalendarEvent: (payload: { orgId: string; id: string; etag: string; summary: string; start: string; end: string; description?: string; location?: string }) => request<{ id: string; etag: string; htmlLink?: string }>('/api/google/calendar/event', { method: 'PATCH', body: JSON.stringify(payload) }),
  deleteCalendarEvent: (payload: { orgId: string; id: string; etag: string }) => request<{ ok: boolean }>('/api/google/calendar/event', { method: 'DELETE', body: JSON.stringify(payload) }),
  createCalendarEvent: (payload: { orgId?: string; localEventId?: string; requestKey?: string; summary: string; start: string; end?: string; description?: string; location?: string }) => request<{ id: string; htmlLink?: string; etag?: string }>('/api/google/calendar/events', { method: 'POST', body: JSON.stringify(payload) }),
  ensureProjectFolder: (payload: { projectId: string; name: string; parentId?: string; folderId?: string; readOnly?: boolean }) => request<{ id: string; name?: string; readOnly?: boolean; webViewLink: string }>('/api/google/drive/project-folder', { method: 'POST', body: JSON.stringify(payload) }),
  projectDriveFolder: (projectId: string) => request<{ folder: { id: string; name?: string; readOnly?: boolean; webViewLink: string } | null }>(`/api/google/drive/project-folder?projectId=${encodeURIComponent(projectId)}`),
  unlinkProjectDriveFolder: (projectId: string) => request<{ folder: null }>(`/api/google/drive/project-folder?projectId=${encodeURIComponent(projectId)}`, { method: 'DELETE' }),
  driveFiles: (folderId: string, pageToken = '', force = false) => request<{ files: GoogleDriveFile[]; nextPageToken: string; completeAccess: boolean }>(`/api/google/drive/files?folderId=${encodeURIComponent(folderId)}&pageToken=${encodeURIComponent(pageToken)}&force=${force}`),
  driveFolders: (query = '', pageToken = '') => request<{ folders: GoogleDriveFile[]; nextPageToken: string }>(`/api/google/drive/folders?q=${encodeURIComponent(query)}&pageToken=${encodeURIComponent(pageToken)}`),
  drivePicker: () => request<{ token: string; apiKey: string; appId: string; email: string }>('/api/google/drive/picker'),
  driveSettings: () => request<DriveSettings>('/api/google/drive/settings'),
  saveDriveSettings: (settings: DriveSettings) => request<DriveSettings>('/api/google/drive/settings', { method: 'PUT', body: JSON.stringify(settings) }),
  uploadDrive: (payload: { orgId?: string; projectId: string; recordId: string; kind: 'file' | 'report'; file: MailAttachment; automatic?: boolean }) => request<{ id?: string; webViewLink?: string; skipped?: boolean; reason?: string; queued?: boolean }>('/api/google/drive/upload', { method: 'POST', body: JSON.stringify(payload) }),
  addressSuggestions: (query: string) => request<{ suggestions: { label: string; value: string }[] }>(`/api/address/suggest?q=${encodeURIComponent(query)}`),
  rewrite: (text: string, mode = 'inspection') => request<{ text: string }>('/api/ai/rewrite', { method: 'POST', body: JSON.stringify({ text, mode }) }),
  inviteUser: (payload: { orgId: string; email: string; name?: string; role: string; taskId?: string; projectId?: string }) => request<{ ok: true; invited: boolean; existing: boolean; email: string; userId: string }>('/api/users/invite', { method: 'POST', body: JSON.stringify(payload) }),
  resetUserPassword: (payload: { orgId: string; userId: string }) => request<{ ok: true; email: string }>('/api/users/password-reset', { method: 'POST', body: JSON.stringify(payload) }),
  deleteUser: (payload: { orgId: string; userId: string }) => request<{ ok: true; email: string }>('/api/users/delete', { method: 'POST', body: JSON.stringify(payload) }),
  adminConfig: () => request<AdminConfig>('/api/admin/config'),
  saveAdminConfig: (config: AdminConfig) => request<{ ok: true }>('/api/admin/config', { method: 'PUT', body: JSON.stringify(config) }),
}

export interface GmailApiMessage { cc?: string; attachments?: { id: string; name: string; type: string; size: number }[]; id: string; threadId: string; from: string; to: string; subject: string; date: string; body: string; htmlBody?: string; snippet: string; unread?: boolean; incoming?: boolean }
export interface MailAttachment { name: string; type: string; data: string }
export interface GmailThreadSummary { id: string; subject: string; from: string; to: string; date: string; snippet: string }
export interface DriveSettings { autoFiles: boolean; autoReports: boolean }
export interface GoogleCalendarEvent { sourceTaskId?: string; etag?: string; editable?: boolean; description?: string; localEventId?: string; sourceOrgId?: string; id: string; summary: string; start: string; end?: string; htmlLink?: string; location?: string }
export interface GoogleDriveFile { id: string; name: string; mimeType: string; size?: string; modifiedTime?: string; webViewLink?: string }
export interface IntegrationStatus {
  google: { configured: boolean; connected: boolean | null; email?: string; state?: 'connected' | 'disconnected' | 'temporarily_unavailable' | 'reconnect_required' | 'configuration_error'; reason?: string; synchronization?: 'unchecked' | 'delayed' }
  openai: { configured: boolean }
  configured: boolean
}
export interface GoogleIntegrationConfig {
  clientId: string
  secretConfigured: boolean
  redirectUri: string
}
export interface AdminConfig {
  organizationName?: string
  supabaseUrl?: string
  supabaseAnonKey?: string
  adminEmails?: string[]
  googleClientId?: string
  googleClientSecret?: string
  googleMapsApiKey?: string
  googlePickerApiKey?: string
  openaiApiKey?: string
  openaiModel?: string
  driveRootFolderId?: string
}

export async function bootstrapServer(payload: AdminConfig & { setupToken: string }) {
  const base = String(import.meta.env.VITE_API_BASE || '')
  const response = await fetch(`${base}/api/admin/bootstrap`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) })
  let malformed = false
  const body = await response.json().catch(() => { malformed = true; return {} }) as { ok?: boolean; error?: string }
  if (!response.ok) throw new Error(body.error || 'שמירת ההגדרה נכשלה')
  return body
}

export interface JournalThread { id: string; mailbox_user_id: string; gmail_thread_id: string; project_id: string; task_ids: string[]; contact_ids: string[]; subject: string; synced_at: string }
export interface JournalMessage { gmail_message_id: string; sender: string; recipients: string; cc: string; subject: string; sent_at: string | null; body: string; attachment_metadata: { name: string; mimeType: string; size: number }[] }
