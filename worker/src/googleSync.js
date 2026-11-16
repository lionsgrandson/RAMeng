import { failureCategory, saveCursor } from './kvDiagnostics.js'
const DAY = 24 * 60 * 60 * 1000
const LIVE_CACHE_TTL = 60 * 60 * 1000 // Drive listing cache; Gmail and Calendar bypass it.

export async function googleReadHash(value) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))), byte => byte.toString(16).padStart(2, '0')).join('')
}

// Only authenticated, owner-scoped read feeds are registered. Uploads and folder
// permission checks bypass this cache, and scheduled work never mutates Google.
export async function cachedGoogleRead(env, userId, url, execute, force = false) {
  const hash = await googleReadHash(url)
  let key
  try {
    const epoch = await env.CONFIG.get(`google-read-epoch:${userId}`) || 'initial'
    key = `google-read:${userId}:${epoch}:${hash}`
    const cached = await env.CONFIG.get(key, 'json')
    if (!force && cached && Date.now() - cached.updatedAt < LIVE_CACHE_TTL) return new Response(cached.body, { status: 200, headers: { 'content-type': 'application/json' } })
  } catch {
    // Cache failures must not make a healthy Google API request fail.
    console.error('Google read cache unavailable; requesting provider directly')
    return execute()
  }
  const response = await execute()
  if (response.ok) {
    try {
      const body = await response.clone().text()
      // KV values have a 25 MiB limit; large responses still load normally.
      if (body.length < 8 * 1024 * 1024) {
        await env.CONFIG.put(key, JSON.stringify({ body, updatedAt: Date.now() }), { expirationTtl: 7 * 86400 })
        if (!new URL(url).searchParams.has('pageToken')) {
          const feedKey = `google-feed:${userId}:${hash}`
          const existing = await env.CONFIG.get(feedKey, 'json')
          // Registered feeds do not need to be rewritten on every cache refresh.
          if (existing?.key !== key || existing?.url !== url || existing?.retryAttempts) {
            await env.CONFIG.put(feedKey, JSON.stringify({ userId, url, key }), { expirationTtl: 30 * 86400 })
          }
        }
      }
    } catch { console.error('Google read cache write skipped; provider response preserved') }
  }
  return response
}

export async function refreshGoogleReads(env, execute, options = {}) {
  if (!env.CONFIG.list) return { cursor: '', refreshed: 0, failed: 0 }
  const cursorKey = 'google-feed-cron-cursor'
  const cursor = options.userId ? options.cursor : await env.CONFIG.get(cursorKey)
  const page = await env.CONFIG.list({ prefix: options.userId ? `google-feed:${options.userId}:` : 'google-feed:', limit: 10, ...(cursor ? { cursor } : {}) })
  let refreshed = 0; let failed = 0
  for (const item of page.keys) {
    const feed = await env.CONFIG.get(item.name, 'json')
    if (!feed?.userId || !feed.url || !feed.key) continue
    if (!options.force && (feed.retryAttempts >= 5 || feed.nextRetryAt > Date.now())) continue
    let url
    try { url = new URL(feed.url) } catch { continue }
    if (!['gmail.googleapis.com', 'www.googleapis.com'].includes(url.hostname) || !/^\/(gmail\/v1\/users\/me\/|calendar\/v3\/|drive\/v3\/files)/.test(url.pathname)) continue
    // Gmail and Calendar now read live, as do individual Drive metadata checks.
    // Retire their legacy cache registrations without re-fetching old mail.
    // Only Drive listings still use cachedGoogleRead in the API router.
    if (url.hostname !== 'www.googleapis.com' || url.pathname !== '/drive/v3/files') {
      await env.CONFIG.delete(item.name)
      continue
    }
    const cached = await env.CONFIG.get(feed.key, 'json')
    if (!options.force && cached && Date.now() - cached.updatedAt < DAY) continue
    const defer = async category => {
      console.error(JSON.stringify({ event: 'google_feed_failure', service: 'drive', category, attempt: (feed.retryAttempts || 0) + 1 }))
      if (category === 'quota_exceeded' || options.force || options.userId) return
      const retryAttempts = (feed.retryAttempts || 0) + 1
      await env.CONFIG.put(item.name, JSON.stringify({ ...feed, retryAttempts, nextRetryAt: Date.now() + Math.min(DAY, 2 * 3600000 * 2 ** Math.min(retryAttempts, 4)) + Math.random() * 60000 }), { expirationTtl: 30 * 86400 })
    }
    try {
      const response = await cachedGoogleRead(env, feed.userId, feed.url, () => execute(feed.userId, feed.url), true)
      if (response.ok) refreshed++
      else {
        throw Object.assign(new Error('Google feed provider unavailable'), { category: `http_${response.status}` })
      }
    } catch (error) { failed++; const category = failureCategory(error); if (category === 'quota_exceeded') break; await defer(category) }
  }
  const next = page.list_complete ? '' : page.cursor
  if (!options.userId) await saveCursor(env.CONFIG, cursorKey, cursor, next)
  return { cursor: next, refreshed, failed }
}
