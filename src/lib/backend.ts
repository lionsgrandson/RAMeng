import { createClient, type RealtimeChannel, type SupabaseClient, type User } from '@supabase/supabase-js'
import type { RuntimeConfig } from './runtime'
import type { Workspace } from '../types'
import { cloneWorkspace } from '../seed'

let client: SupabaseClient | null = null
let runtime: RuntimeConfig | null = null

export function configureBackend(config: RuntimeConfig) {
  runtime = config
  if (config.supabaseUrl && config.supabaseAnonKey) {
    client = createClient(config.supabaseUrl, config.supabaseAnonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
  }
}

export const getBackend = () => client
export const getRuntime = () => runtime

export async function getCurrentUser(): Promise<User | null> {
  if (!client) return null
  const { data } = await client.auth.getUser()
  return data.user
}

export async function signIn(email: string, password: string) {
  if (!client) throw new Error('Supabase is not configured')
  const { data, error } = await client.auth.signInWithPassword({ email, password })
  if (error) throw error
  return data.user
}

export async function signOut() {
  if (client) await client.auth.signOut()
}

export async function getAccessToken() {
  if (!client) return ''
  const { data } = await client.auth.getSession()
  return data.session?.access_token || ''
}

export async function loadOrganizationWorkspace(userId: string): Promise<{ orgId: string; role: string; workspace: Workspace }> {
  if (!client) return { orgId: 'local', role: 'admin', workspace: loadLocalWorkspace() }
  let { data: membership, error: membershipError } = await client
    .from('memberships')
    .select('org_id, role')
    .eq('user_id', userId)
    .maybeSingle()
  if (membershipError) throw membershipError

  if (!membership) {
    const { error: bootstrapError } = await client.rpc('bootstrap_first_admin')
    if (bootstrapError && !bootstrapError.message.includes('already')) throw bootstrapError
    const retry = await client.from('memberships').select('org_id, role').eq('user_id', userId).maybeSingle()
    if (retry.error) throw retry.error
    membership = retry.data
  }
  if (!membership) throw new Error('המשתמש אינו משויך לארגון. מנהל המערכת צריך להוסיף אותו.')

  const orgId = String(membership.org_id)
  const { data: state, error: stateError } = await client.from('workspace_state').select('data').eq('org_id', orgId).maybeSingle()
  if (stateError) throw stateError
  if (!state?.data) {
    const workspace = cloneWorkspace()
    const { error } = await client.from('workspace_state').upsert({ org_id: orgId, data: workspace, updated_by: userId }, { onConflict: 'org_id' })
    if (error) throw error
    saveLocalWorkspace(workspace)
    return { orgId, role: String(membership.role), workspace }
  }
  const workspace = { ...cloneWorkspace(), ...(state.data as Workspace) }
  saveLocalWorkspace(workspace)
  return { orgId, role: String(membership.role), workspace }
}

export async function saveOrganizationWorkspace(orgId: string, userId: string, workspace: Workspace) {
  saveLocalWorkspace(workspace)
  if (!client || orgId === 'local') return
  const { error } = await client.from('workspace_state').upsert({ org_id: orgId, data: workspace, updated_by: userId, updated_at: new Date().toISOString() }, { onConflict: 'org_id' })
  if (error) throw error
}

export function subscribeWorkspace(orgId: string, onWorkspace: (workspace: Workspace) => void): RealtimeChannel | null {
  if (!client || orgId === 'local') return null
  return client.channel(`workspace:${orgId}`)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'workspace_state', filter: `org_id=eq.${orgId}` }, (payload) => {
      const next = (payload.new as { data?: Workspace }).data
      if (next) onWorkspace({ ...cloneWorkspace(), ...next })
    })
    .subscribe()
}

export async function uploadFile(orgId: string, projectId: string, file: File) {
  if (!client || orgId === 'local') return { url: await fileToDataUrl(file), path: '' }
  const safeName = file.name.replace(/[^\p{L}\p{N}._-]+/gu, '_')
  const path = `${orgId}/${projectId || 'general'}/${Date.now()}-${safeName}`
  const { error } = await client.storage.from('crm-files').upload(path, file, { upsert: false })
  if (error) throw error
  const { data, error: signedError } = await client.storage.from('crm-files').createSignedUrl(path, 60 * 60 * 24 * 7)
  if (signedError) throw signedError
  return { url: data.signedUrl, path }
}

export async function refreshSignedUrl(path: string) {
  if (!client || !path) return ''
  const { data, error } = await client.storage.from('crm-files').createSignedUrl(path, 60 * 60)
  if (error) throw error
  return data.signedUrl
}

export function loadLocalWorkspace(): Workspace {
  try {
    const raw = localStorage.getItem('rameng-workspace')
    return raw ? { ...cloneWorkspace(), ...JSON.parse(raw) as Workspace } : cloneWorkspace()
  } catch { return cloneWorkspace() }
}

export function saveLocalWorkspace(workspace: Workspace) {
  localStorage.setItem('rameng-workspace', JSON.stringify(workspace))
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}
