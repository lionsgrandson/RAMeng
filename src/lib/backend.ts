import { createClient, type RealtimeChannel, type SupabaseClient, type User } from '@supabase/supabase-js'
import type { RuntimeConfig } from './runtime'
import type { Workspace } from '../types'
import { cloneWorkspace } from '../seed'
import type { StoredPermissions } from './permissions'
import { authRedirectUrl } from './runtime'

let client: SupabaseClient | null = null
let runtime: RuntimeConfig | null = null
let clientConfigKey = ''

function localizedBackendError(error: unknown, fallback: string) {
  const message = error && typeof error === 'object' && 'message' in error ? String(error.message) : ''
  const normalized = message.toLowerCase()
  if (/[\u0590-\u05ff]/.test(message)) return error instanceof Error ? error : new Error(message)
  if (normalized.includes('invalid login credentials')) return new Error('המייל או הסיסמה שגויים.')
  if (normalized.includes('email not confirmed')) return new Error('יש לאשר את כתובת המייל לפני ההתחברות.')
  if (normalized.includes('password should be at least')) return new Error('הסיסמה קצרה מדי.')
  if (normalized.includes('rate limit')) return new Error('בוצעו יותר מדי ניסיונות. נסו שוב בעוד כמה דקות.')
  if (normalized.includes('row-level security') || normalized.includes('permission denied')) return new Error('אין הרשאה לבצע את הפעולה.')
  if (normalized.includes('already exists') || normalized.includes('duplicate')) return new Error('הפריט כבר קיים במערכת.')
  return new Error(fallback)
}

export interface OrganizationMember {
  userId: string
  email: string
  displayName: string
  role: string
  permissions?: StoredPermissions | null
  createdAt?: string
}

export function configureBackend(config: RuntimeConfig) {
  runtime = config

  const nextConfigKey = config.supabaseUrl && config.supabaseAnonKey
    ? `${config.supabaseUrl}|${config.supabaseAnonKey}`
    : ''

  if (!nextConfigKey) {
    client = null
    clientConfigKey = ''
    return
  }

  if (client && clientConfigKey === nextConfigKey) return

  client = createClient(config.supabaseUrl, config.supabaseAnonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  })
  clientConfigKey = nextConfigKey
}

export const getBackend = () => client
export const getRuntime = () => runtime

export async function getCurrentUser(): Promise<User | null> {
  if (!client) return null
  const { data } = await client.auth.getUser()
  return data.user
}

export async function signIn(email: string, password: string) {
  if (!client) throw new Error('השירות אינו זמין כרגע.')
  const { data, error } = await client.auth.signInWithPassword({ email, password })
  if (error) throw localizedBackendError(error, 'ההתחברות נכשלה')
  return data.user
}

export async function requestPasswordReset(email: string) {
  if (!client) throw new Error('השירות אינו זמין כרגע.')
  const redirectTo = authRedirectUrl('/?invite=1')
  const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo })
  if (error) throw localizedBackendError(error, 'שליחת קישור האיפוס נכשלה')
}

export async function updatePassword(password: string) {
  if (!client) throw new Error('השירות אינו זמין כרגע.')
  const { data, error } = await client.auth.updateUser({ password })
  if (error) throw localizedBackendError(error, 'שמירת הסיסמה נכשלה')
  return data.user
}

export async function updateCurrentUserName(fullName: string) {
  if (!client) throw new Error('השירות אינו זמין כרגע.')
  const name = fullName.trim()
  if (!name) throw new Error('יש להזין שם מלא.')
  const { data, error } = await client.auth.updateUser({
    data: { full_name: name },
  })
  if (error) throw localizedBackendError(error, 'שמירת השם נכשלה')
  return data.user
}

export async function signOut() {
  if (client) {
    const { error } = await client.auth.signOut()
    if (error) throw localizedBackendError(error, 'היציאה נכשלה. נסו שוב.')
  }
}

export async function getAccessToken() {
  if (!client) return ''
  const { data } = await client.auth.getSession()
  return data.session?.access_token || ''
}

export async function listOrganizationMembers(orgId: string): Promise<OrganizationMember[]> {
  if (!client || orgId === 'local') return []
  const { data, error } = await client.rpc('list_org_members', { target_org: orgId })
  if (error) throw localizedBackendError(error, 'טעינת המשתמשים נכשלה')
  return (data || []).map((row: Record<string, unknown>) => ({
    userId: String(row.user_id || ''),
    email: String(row.email || ''),
    displayName: String(row.display_name || row.email || ''),
    role: String(row.role || 'viewer'),
    permissions: row.permissions && typeof row.permissions === 'object' ? row.permissions as StoredPermissions : null,
    createdAt: row.created_at ? String(row.created_at) : undefined,
  }))
}

export async function setOrganizationMemberRole(orgId: string, email: string, role: string) {
  if (!client || orgId === 'local') throw new Error('ניהול המשתמשים אינו זמין כרגע.')
  const { error } = await client.rpc('set_org_member_role', { target_org: orgId, target_email: email, target_role: role })
  if (error) throw localizedBackendError(error, 'עדכון תפקיד המשתמש נכשל')
}

export async function setOrganizationMemberPermissions(orgId: string, userId: string, permissions: StoredPermissions | null) {
  if (!client || orgId === 'local') throw new Error('ניהול המשתמשים אינו זמין כרגע.')
  const { error } = await client.rpc('set_org_member_permissions', {
    target_org: orgId,
    target_user: userId,
    target_permissions: permissions,
  })
  if (error) throw localizedBackendError(error, 'עדכון הרשאות המשתמש נכשל')
}

export async function loadOrganizationWorkspace(userId: string): Promise<{ orgId: string; role: string; permissions: StoredPermissions | null; workspace: Workspace; version: number }> {
  if (!client) return { orgId: 'local', role: 'admin', permissions: null, workspace: loadLocalWorkspace(), version: 0 }
  let { data: membership, error: membershipError } = await client
    .from('memberships')
    .select('org_id, role, permissions')
    .eq('user_id', userId)
    .maybeSingle()
  if (membershipError) throw localizedBackendError(membershipError, 'טעינת החשבון נכשלה')

  if (!membership) {
    const { error: bootstrapError } = await client.rpc('bootstrap_first_admin')
    if (bootstrapError && !bootstrapError.message.includes('already')) throw localizedBackendError(bootstrapError, 'פתיחת החשבון נכשלה')
    const retry = await client.from('memberships').select('org_id, role, permissions').eq('user_id', userId).maybeSingle()
    if (retry.error) throw localizedBackendError(retry.error, 'טעינת החשבון נכשלה')
    membership = retry.data
  }
  if (!membership) throw new Error('החשבון עדיין לא נוסף למערכת. פנו למנהל.')

  const orgId = String(membership.org_id)
  const filteredState = await client.rpc('get_workspace_state', { target_org: orgId })
  let state = Array.isArray(filteredState.data) ? filteredState.data[0] : filteredState.data
  let stateError = filteredState.error

  const rpcMissing = stateError && (stateError.code === 'PGRST202' || (stateError.message.includes('get_workspace_state') && stateError.message.toLowerCase().includes('schema cache')))
  if (rpcMissing) {
    const direct = await client.from('workspace_state').select('data, version').eq('org_id', orgId).maybeSingle()
    state = direct.data
    stateError = direct.error
    if (stateError && (stateError.code === '42703' || stateError.code === 'PGRST204' || stateError.message.toLowerCase().includes('version'))) {
      const legacy = await client.from('workspace_state').select('data').eq('org_id', orgId).maybeSingle()
      state = legacy.data ? { ...legacy.data, version: 0 } : null
      stateError = legacy.error
    }
  }
  if (stateError) throw localizedBackendError(stateError, 'טעינת נתוני סביבת העבודה נכשלה')
  if (!state?.data) {
    const workspace = cloneWorkspace()
    const { error } = await client.from('workspace_state').upsert({ org_id: orgId, data: workspace, updated_by: userId }, { onConflict: 'org_id' })
    if (error) throw localizedBackendError(error, 'שמירת סביבת העבודה נכשלה')
    saveLocalWorkspace(workspace)
    return { orgId, role: String(membership.role), permissions: membership.permissions as StoredPermissions | null, workspace, version: 0 }
  }

  const workspace = { ...cloneWorkspace(), ...(state.data as Workspace) }
  workspace.checklistTemplates = (workspace.checklistTemplates || []).filter((template) => template.id !== 'tpl-supervision')
  if (workspace.settings.defaultInspector === 'אודי מאיר') workspace.settings.defaultInspector = ''
  saveLocalWorkspace(workspace)
  return { orgId, role: String(membership.role), permissions: membership.permissions as StoredPermissions | null, workspace, version: Number(state.version || 0) }
}

export async function saveOrganizationWorkspace(orgId: string, userId: string, workspace: Workspace, expectedVersion: number) {
  saveLocalWorkspace(workspace)
  if (!client || orgId === 'local') return { version: expectedVersion + 1 }
  const { data, error } = await client.rpc('save_workspace_state', {
    target_org: orgId,
    next_data: workspace,
    expected_version: expectedVersion,
  })
  if (error) {
    if (error.message.includes('WORKSPACE_VERSION_CONFLICT')) {
      const conflict = new Error('הנתונים עודכנו על ידי משתמש אחר. רעננו את המסך ונסו שוב.')
      conflict.name = 'WorkspaceConflictError'
      throw conflict
    }
    const rpcMissing = error.code === 'PGRST202' || (error.message.includes('save_workspace_state') && error.message.toLowerCase().includes('schema cache'))
    if (rpcMissing) {
      const legacy = await client.from('workspace_state').upsert({ org_id: orgId, data: workspace, updated_by: userId, updated_at: new Date().toISOString() }, { onConflict: 'org_id' })
      if (legacy.error) throw localizedBackendError(legacy.error, 'שמירת הנתונים נכשלה')
      return { version: expectedVersion + 1 }
    }
    throw localizedBackendError(error, 'שמירת הנתונים נכשלה')
  }
  return { version: Number(data || expectedVersion + 1) }
}

export function subscribeWorkspace(orgId: string, onWorkspace: (workspace: Workspace, version: number) => void): RealtimeChannel | null {
  if (!client || orgId === 'local') return null
  return client.channel(`workspace:${orgId}`)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'workspace_state', filter: `org_id=eq.${orgId}` }, (payload) => {
      const row = payload.new as { data?: Workspace; version?: number }
      if (row.data) onWorkspace({ ...cloneWorkspace(), ...row.data }, typeof row.version === 'number' ? row.version : -1)
    })
    .subscribe()
}

export async function uploadFile(orgId: string, projectId: string, file: File) {
  if (!client || orgId === 'local') return { url: await fileToDataUrl(file), path: '' }
  const safeName = file.name.replace(/[^\p{L}\p{N}._-]+/gu, '_')
  const path = `${orgId}/${projectId || 'general'}/${Date.now()}-${safeName}`
  const { error } = await client.storage.from('crm-files').upload(path, file, { upsert: false })
  if (error) throw localizedBackendError(error, 'העלאת הקובץ נכשלה')
  const { data, error: signedError } = await client.storage.from('crm-files').createSignedUrl(path, 60 * 60 * 24 * 7)
  if (signedError) throw localizedBackendError(signedError, 'יצירת קישור מאובטח לקובץ נכשלה')
  return { url: data.signedUrl, path }
}

export async function refreshSignedUrl(path: string) {
  if (!client || !path) return ''
  const { data, error } = await client.storage.from('crm-files').createSignedUrl(path, 60 * 60)
  if (error) throw localizedBackendError(error, 'רענון הקישור לקובץ נכשל')
  return data.signedUrl
}

export function loadLocalWorkspace(): Workspace {
  try {
    const raw = localStorage.getItem('rameng-workspace')
    return raw ? { ...cloneWorkspace(), ...JSON.parse(raw) as Workspace } : cloneWorkspace()
  } catch {
    return cloneWorkspace()
  }
}

export function saveLocalWorkspace(workspace: Workspace) {
  // A full or unavailable browser cache must not block saving to the server.
  try { localStorage.setItem('rameng-workspace', JSON.stringify(workspace)) } catch { /* Best-effort cache. */ }
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}
