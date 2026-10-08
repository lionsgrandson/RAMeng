import { getAccessToken, getRuntime } from './backend'

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await getAccessToken()
  const base = getRuntime()?.apiBase || ''
  let response: Response
  try {
    response = await fetch(`${base}${path}`, {
      ...init,
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...(init.headers || {}),
      },
    })
  } catch {
    throw new Error('לא ניתן להתחבר כרגע. נסו שוב.')
  }

  const body = await response.json().catch(() => ({})) as T & { error?: string }
  if (!response.ok) throw new Error(body.error || 'הפעולה נכשלה.')
  return body
}

export interface MailDraft { ownerId?: string; key: string; to: string; subject: string; body: string; html: string; threadId?: string; attachments: MailAttachment[]; draftId?: string; updatedAt?: string; synced?: boolean }
export interface MailProjectContext { orgId: string; projectId: string; taskId?: string | null; categoryIds?: string[] }
export interface MailSendResult { id: string; threadId: string; associationSaved?: boolean; subject?: string }
export interface ProjectMailLink extends MailProjectContext { threadId: string; subject: string; from: string; to: string; date: string; snippet: string; incoming?: boolean; unread?: boolean }
export const integrationsApi = {
  driveCategory: (payload: { orgId: string; projectId: string; folderId: string; categoryId: string; name: string }) => request<{ id: string; name: string }>('/api/google/drive/category', { method: 'POST', body: JSON.stringify(payload) }),
  driveSharing: (orgId: string, projectId: string, fileId: string) => request<{ permissions: { id: string; emailAddress?: string; role: string; canRevoke: boolean }[] }>(`/api/google/drive/sharing?orgId=${encodeURIComponent(orgId)}&projectId=${encodeURIComponent(projectId)}&fileId=${encodeURIComponent(fileId)}`),
  shareDrive: (payload: { orgId: string; projectId: string; fileId: string; email: string; role: string }) => request<{ id: string }>('/api/google/drive/sharing', { method: 'POST', body: JSON.stringify(payload) }),
  revokeDriveShare: (payload: { orgId: string; projectId: string; fileId: string; permissionId: string }) => request<{ ok: true }>('/api/google/drive/sharing', { method: 'DELETE', body: JSON.stringify(payload) }),
  sendTaskNotifications: (orgId: string, notificationId?: string) => request<{ sent: number; failed: number }>('/api/task-notifications/send', { method: 'POST', body: JSON.stringify({ orgId, notificationId }) }),
  inbox: (pageToken = '') => request<{ messages: GmailApiMessage[]; nextPageToken: string; unreadCount: number }>(`/api/google/gmail/inbox?pageToken=${encodeURIComponent(pageToken)}`),
  unreadMail: () => request<{ unreadCount: number }>('/api/google/gmail/unread'),
  readMail: (threadId: string) => request<{ ok: true; unreadCount: number | null }>('/api/google/gmail/read', { method: 'POST', body: JSON.stringify({ threadId }) }),
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
  contactCalendar: (emails: string[], from: string, to: string, force = false) => request<{ items: GoogleCalendarEvent[] }>(`/api/google/calendar/contacts?emails=${encodeURIComponent(emails.join(','))}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&force=${force}`),
  calendarEvents: (from?: string, to?: string, force = false) => request<{ items: GoogleCalendarEvent[] }>(`/api/google/calendar/events?from=${encodeURIComponent(from || '')}&to=${encodeURIComponent(to || '')}&force=${force}`),
  createCalendarEvent: (payload: { summary: string; start: string; end?: string; description?: string; location?: string }) => request<{ id: string; htmlLink?: string }>('/api/google/calendar/events', { method: 'POST', body: JSON.stringify(payload) }),
  ensureProjectFolder: (payload: { projectId: string; name: string; parentId?: string; folderId?: string; readOnly?: boolean }) => request<{ id: string; name?: string; readOnly?: boolean; webViewLink: string }>('/api/google/drive/project-folder', { method: 'POST', body: JSON.stringify(payload) }),
  projectDriveFolder: (projectId: string) => request<{ folder: { id: string; name?: string; readOnly?: boolean; webViewLink: string } | null }>(`/api/google/drive/project-folder?projectId=${encodeURIComponent(projectId)}`),
  unlinkProjectDriveFolder: (projectId: string) => request<{ folder: null }>(`/api/google/drive/project-folder?projectId=${encodeURIComponent(projectId)}`, { method: 'DELETE' }),
  driveFiles: (folderId: string, pageToken = '', force = false) => request<{ files: GoogleDriveFile[]; nextPageToken: string; completeAccess: boolean }>(`/api/google/drive/files?folderId=${encodeURIComponent(folderId)}&pageToken=${encodeURIComponent(pageToken)}&force=${force}`),
  driveFolders: (query = '', pageToken = '') => request<{ folders: GoogleDriveFile[]; nextPageToken: string }>(`/api/google/drive/folders?q=${encodeURIComponent(query)}&pageToken=${encodeURIComponent(pageToken)}`),
  drivePicker: () => request<{ token: string; apiKey: string; appId: string; email: string }>('/api/google/drive/picker'),
  driveSettings: () => request<DriveSettings>('/api/google/drive/settings'),
  saveDriveSettings: (settings: DriveSettings) => request<DriveSettings>('/api/google/drive/settings', { method: 'PUT', body: JSON.stringify(settings) }),
  uploadDrive: (payload: { projectId: string; recordId: string; kind: 'file' | 'report'; file: MailAttachment; automatic?: boolean }) => request<{ id?: string; webViewLink?: string; skipped?: boolean; reason?: string; queued?: boolean }>('/api/google/drive/upload', { method: 'POST', body: JSON.stringify(payload) }),
  addressSuggestions: (query: string) => request<{ suggestions: { label: string; value: string }[] }>(`/api/address/suggest?q=${encodeURIComponent(query)}`),
  rewrite: (text: string, mode = 'inspection') => request<{ text: string }>('/api/ai/rewrite', { method: 'POST', body: JSON.stringify({ text, mode }) }),
  inviteUser: (payload: { orgId: string; email: string; name?: string; role: string }) => request<{ ok: true; invited: boolean; existing: boolean; email: string; userId: string }>('/api/users/invite', { method: 'POST', body: JSON.stringify(payload) }),
  resetUserPassword: (payload: { orgId: string; userId: string }) => request<{ ok: true; email: string }>('/api/users/password-reset', { method: 'POST', body: JSON.stringify(payload) }),
  deleteUser: (payload: { orgId: string; userId: string }) => request<{ ok: true; email: string }>('/api/users/delete', { method: 'POST', body: JSON.stringify(payload) }),
  adminConfig: () => request<AdminConfig>('/api/admin/config'),
  saveAdminConfig: (config: AdminConfig) => request<{ ok: true }>('/api/admin/config', { method: 'PUT', body: JSON.stringify(config) }),
}

export interface GmailApiMessage { id: string; threadId: string; from: string; to: string; subject: string; date: string; body: string; htmlBody?: string; snippet: string; unread?: boolean; incoming?: boolean }
export interface MailAttachment { name: string; type: string; data: string }
export interface GmailThreadSummary { id: string; subject: string; from: string; to: string; date: string; snippet: string }
export interface DriveSettings { autoFiles: boolean; autoReports: boolean }
export interface GoogleCalendarEvent { id: string; summary: string; start: string; end?: string; htmlLink?: string; location?: string }
export interface GoogleDriveFile { id: string; name: string; mimeType: string; size?: string; modifiedTime?: string; webViewLink?: string }
export interface IntegrationStatus {
  google: { configured: boolean; connected: boolean; email?: string }
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
  const body = await response.json().catch(() => ({})) as { ok?: boolean; error?: string }
  if (!response.ok) throw new Error(body.error || 'שמירת ההגדרה נכשלה')
  return body
}
