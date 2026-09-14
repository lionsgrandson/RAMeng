export interface RuntimeConfig {
  configured: boolean
  apiBase: string
  supabaseUrl: string
  supabaseAnonKey: string
  googleClientId?: string
  adminEmails?: string[]
  developerEmails?: string[]
}

const developerEmails = String(import.meta.env.VITE_DEVELOPER_EMAILS || '')
  .split(',')
  .map((value) => value.trim().toLowerCase())
  .filter(Boolean)

const envConfig: RuntimeConfig = {
  configured: Boolean(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY),
  apiBase: String(import.meta.env.VITE_API_BASE || ''),
  supabaseUrl: String(import.meta.env.VITE_SUPABASE_URL || ''),
  supabaseAnonKey: String(import.meta.env.VITE_SUPABASE_ANON_KEY || ''),
  googleClientId: String(import.meta.env.VITE_GOOGLE_CLIENT_ID || ''),
  developerEmails,
}

export async function loadRuntimeConfig(): Promise<RuntimeConfig> {
  try {
    const response = await fetch(`${envConfig.apiBase}/api/public-config`, { headers: { accept: 'application/json' } })
    if (!response.ok) throw new Error(String(response.status))
    const remote = await response.json() as Partial<RuntimeConfig>
    return { ...envConfig, ...remote, developerEmails: envConfig.developerEmails, configured: Boolean(remote.configured ?? envConfig.configured) }
  } catch {
    return envConfig
  }
}
