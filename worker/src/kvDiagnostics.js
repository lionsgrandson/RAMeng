// Request-local counters; never persist diagnostics or key values in KV.
export const sourceEnvironment = Symbol('sourceEnvironment')
export const operationContext = Symbol('operationContext')
export const environmentIdentity = env => env[sourceEnvironment] || env
export function failureCategory(error) {
  if (/quota|daily.*limit|limit.*exceed/i.test(String(error?.message || ''))) return 'quota_exceeded'
  if (error?.name === 'TimeoutError' || error?.name === 'AbortError') return 'timeout'
  return error?.category || 'temporarily_unavailable'
}

export function observeKv(env, context) {
  const counts = { read: 0, write: 0, delete: 0, list: 0 }
  const families = {}
  const started = Date.now()
  const observed = Object.create(env)
  observed[sourceEnvironment] = environmentIdentity(env)
  observed[operationContext] = context
  if (env.CONFIG) observed.CONFIG = new Proxy(env.CONFIG, { get(target, property) {
    const operation = { get: 'read', put: 'write', delete: 'delete', list: 'list' }[property]
    if (!operation || typeof target[property] !== 'function') return target[property]
    return async (...args) => {
      counts[operation]++
      const key = property === 'list' ? args[0]?.prefix || '' : String(args[0] || '')
      const family = ['rameng:admin-config', 'rameng:google-tokens', 'google-read', 'google-feed', 'drive-pending', 'drive-auto-clock', 'application-error', 'task-notification-scan-cursor', 'google-feed-cron-cursor', 'drive-pending-cron-cursor'].find(prefix => key.startsWith(prefix)) || 'other'
      families[`${family}:${operation}`] = (families[`${family}:${operation}`] || 0) + 1
      try { return await target[property](...args) }
      catch (error) {
        console.error(JSON.stringify({ event: 'kv_failure', ...context, namespace: 'CONFIG', namespaceId: env.CONFIG_NAMESPACE_ID || '7676674ec22a440d8d946a8fe393775b', operation, category: failureCategory(error) }))
        if (error && typeof error === 'object') { error.dependency = 'cloudflare_kv'; error.category = failureCategory(error) }
        throw error
      }
    }
  } })
  return { env: observed, finish: extra => console.log(JSON.stringify({ event: 'kv_usage', ...context, ...extra, counts, families, durationMs: Date.now() - started })) }
}

const pendingReads = new WeakMap()
// Coalesce only in-flight immutable reads. No stale authorization/config cache.
export async function sharedRead(env, key) {
  const identity = environmentIdentity(env)
  if (!pendingReads.has(identity)) pendingReads.set(identity, new Map())
  const pending = pendingReads.get(identity)
  if (pending.has(key)) return pending.get(key)
  const operation = env.CONFIG.get(key, 'json')
  pending.set(key, operation)
  try { return await operation } finally { if (pending.get(key) === operation) pending.delete(key) }
}

export async function saveCursor(kv, key, previous, next, json = false) {
  if ((previous || '') === (next || '')) return
  if (!next) { if (previous) await kv.delete(key); return }
  await kv.put(key, json ? JSON.stringify(next) : next)
}
