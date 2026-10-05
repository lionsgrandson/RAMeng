const delay = async () => new Promise((resolve) => setTimeout(resolve, 250))
export const integrationsApi = {
  adminConfig: async () => { if ((new URLSearchParams(location.search).get('qaRole') || 'developer') !== 'developer') throw new Error('Forbidden in QA'); return { supabaseUrl: '', supabaseAnonKey: '', adminEmails: [] } },
  status: async () => ({ configured: true, google: { configured: true, connected: false }, openai: { configured: false } }),
  googleConfig: async () => ({ clientId: '', secretConfigured: false, redirectUri: 'http://127.0.0.1:4175/' }),
  addressSuggestions: async (query: string) => ({ suggestions: [{ label: `${query}, ירושלים`, value: `${query}, ירושלים` }] }),
  calendarEvents: async () => ({ items: [] }),
  createCalendarEvent: async () => { await delay(); return { id: 'qa-google-event' } },
  gmailLinks: async () => ({ links: {} }),
  linkGmailTask: async (taskId: string, threadId: string, to: string) => ({ links: { [taskId]: { threadId, to } } }),
  unlinkGmailTask: async () => ({ links: {} }),
  gmailThread: async () => ({ messages: [{ id: 'qa-mail', subject: 'מייל בדיקה', from: 'qa@example.test', to: 'client@example.test', date: '2026-10-04', body: 'תוכן בדיקה' }] }),
  gmailSearch: async () => ({ threads: [] }),
  sendMail: async () => { await delay(); return { id: 'qa-mail', threadId: 'qa-thread' } },
  projectDriveFolder: async () => ({ folder: null }),
  unlinkProjectDriveFolder: async () => ({ folder: null }),
  driveFiles: async () => ({ files: [] }),
  ensureProjectFolder: async () => ({ id: 'qa-folder', webViewLink: 'https://example.test' }),
}
export const bootstrapServer = async () => ({ ok: true })
