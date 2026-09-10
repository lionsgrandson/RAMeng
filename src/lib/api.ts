import { getAccessToken, getRuntime } from './backend'

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await getAccessToken()
  const base = getRuntime()?.apiBase || ''
  const response = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(init.headers || {}),
    },
  })
  const body = await response.json().catch(() => ({})) as T & { error?: string }
  if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`)
  return body
}

export const integrationsApi = {
  status: () => request<{ google: { connected: boolean; email?: string }; openai: { configured: boolean }; configured: boolean }>('/api/integrations/status'),
  googleAuthUrl: () => request<{ url: string }>('/api/google/auth-url'),
  gmailThread: (threadId: string) => request<{ messages: GmailApiMessage[] }>(`/api/google/gmail/thread?threadId=${encodeURIComponent(threadId)}`),
  gmailSearch: (query: string) => request<{ threads: { id: string; snippet: string; subject?: string; from?: string }[] }>(`/api/google/gmail/search?q=${encodeURIComponent(query)}`),
  sendMail: (payload: { to: string; subject: string; body: string; threadId?: string }) => request<{ id: string; threadId: string }>('/api/google/gmail/send', { method: 'POST', body: JSON.stringify(payload) }),
  calendarEvents: (from?: string, to?: string) => request<{ items: GoogleCalendarEvent[] }>(`/api/google/calendar/events?from=${encodeURIComponent(from || '')}&to=${encodeURIComponent(to || '')}`),
  createCalendarEvent: (payload: { summary: string; start: string; end?: string; description?: string; location?: string }) => request<{ id: string; htmlLink?: string }>('/api/google/calendar/events', { method: 'POST', body: JSON.stringify(payload) }),
  ensureProjectFolder: (payload: { projectId: string; name: string; parentId?: string }) => request<{ id: string; webViewLink: string }>('/api/google/drive/project-folder', { method: 'POST', body: JSON.stringify(payload) }),
  driveFiles: (folderId: string) => request<{ files: GoogleDriveFile[] }>(`/api/google/drive/files?folderId=${encodeURIComponent(folderId)}`),
  rewrite: (text: string, mode = 'inspection') => request<{ text: string }>('/api/ai/rewrite', { method: 'POST', body: JSON.stringify({ text, mode }) }),
  adminConfig: () => request<AdminConfig>('/api/admin/config'),
  saveAdminConfig: (config: AdminConfig) => request<{ ok: true }>('/api/admin/config', { method: 'PUT', body: JSON.stringify(config) }),
}

export interface GmailApiMessage { id: string; threadId: string; from: string; to: string; subject: string; date: string; body: string; snippet: string }
export interface GoogleCalendarEvent { id: string; summary: string; start: string; end?: string; htmlLink?: string; location?: string }
export interface GoogleDriveFile { id: string; name: string; mimeType: string; modifiedTime?: string; webViewLink?: string }
export interface AdminConfig {
  organizationName?: string
  supabaseUrl?: string
  supabaseAnonKey?: string
  adminEmails?: string[]
  googleClientId?: string
  googleClientSecret?: string
  openaiApiKey?: string
  openaiModel?: string
  driveRootFolderId?: string
}

export async function bootstrapServer(payload: AdminConfig & { setupToken: string }) {
  const base = String(import.meta.env.VITE_API_BASE || '')
  const response = await fetch(`${base}/api/admin/bootstrap`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) })
  const body = await response.json().catch(() => ({})) as { ok?: boolean; error?: string }
  if (!response.ok) throw new Error(body.error || 'Bootstrap failed')
  return body
}
