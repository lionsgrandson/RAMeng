const DAY = 24 * 60 * 60 * 1000

export async function googleReadHash(value) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))), byte => byte.toString(16).padStart(2, '0')).join('')
}

// Only authenticated, owner-scoped read feeds are registered. Uploads and folder
// permission checks bypass this cache, and scheduled work never mutates Google.
export async function cachedGoogleRead(env, userId, url, execute, force = false) {
  const hash = await googleReadHash(url)
  const epoch = await env.CONFIG.get(`google-read-epoch:${userId}`) || 'initial'
  const key = `google-read:${userId}:${epoch}:${hash}`
  const cached = await env.CONFIG.get(key, 'json')
  if (!force && cached && Date.now() - cached.updatedAt < DAY) return new Response(cached.body, { status: 200, headers: { 'content-type': 'application/json' } })
  const response = await execute()
  if (response.ok) {
    const body = await response.clone().text()
    // KV values have a 25 MiB limit; large threads still load normally.
    if (body.length < 8 * 1024 * 1024) {
      await env.CONFIG.put(key, JSON.stringify({ body, updatedAt: Date.now() }), { expirationTtl: 7 * 86400 })
      if (!new URL(url).searchParams.has('pageToken')) await env.CONFIG.put(`google-feed:${userId}:${hash}`, JSON.stringify({ userId, url, key }), { expirationTtl: 30 * 86400 })
    }
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
    const url = new URL(feed.url)
    if (!['gmail.googleapis.com', 'www.googleapis.com'].includes(url.hostname) || !/^\/(gmail\/v1\/users\/me\/|calendar\/v3\/|drive\/v3\/files)/.test(url.pathname)) continue
    const cached = await env.CONFIG.get(feed.key, 'json')
    if (!options.force && cached && Date.now() - cached.updatedAt < DAY) continue
    try { const response = await cachedGoogleRead(env, feed.userId, feed.url, () => execute(feed.userId, feed.url), true); if (response.ok) refreshed++; else failed++ } catch (error) { failed++; console.error('Daily Google read failed', error?.status || 'unavailable') }
  }
  const next = page.list_complete ? '' : page.cursor
  if (!options.userId) await env.CONFIG.put(cursorKey, next)
  return { cursor: next, refreshed, failed }
}
