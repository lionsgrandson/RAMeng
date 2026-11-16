import { failureCategory } from './kvDiagnostics.js'

// connected=null means unknown, never a confirmed disconnect. OAuth health does
// not prove that every Google service or background job is healthy.
export async function googleIntegrationStatus(config, readTokens, validateToken) {
  const configured = Boolean(config.googleClientId && config.googleClientSecret)
  const result = { configured, connected: null, state: 'temporarily_unavailable', services: { gmail: 'unchecked', calendar: 'unchecked', drive: 'unchecked' }, synchronization: 'unchecked' }
  if (!configured) return { ...result, state: 'configuration_error' }
  try {
    const tokens = await readTokens()
    if (!tokens?.refresh_token && !tokens?.access_token) return { ...result, connected: false, state: 'disconnected' }
    if (!tokens.refresh_token && Number(tokens.expires_at || 0) <= Date.now() + 60000) return { ...result, connected: false, state: 'reconnect_required', reason: 'token_expired' }
    await validateToken(tokens)
    return { ...result, connected: true, state: 'connected', email: tokens.email || '' }
  } catch (error) {
    if (error?.category === 'reconnect_required') return { ...result, connected: false, state: 'reconnect_required', reason: 'oauth_invalid_grant' }
    if (error?.category === 'configuration_error') return { ...result, state: 'configuration_error', reason: 'oauth_configuration' }
    return { ...result, reason: failureCategory(error) }
  }
}
