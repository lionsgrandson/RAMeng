const DAY = 86400000

export async function queueDriveUpload(env, userId, body, email) {
  const clockKey = `drive-auto-clock:${userId}`
  let clock = await env.CONFIG.get(clockKey, 'json')
  if (!clock) { clock = { nextAt: Date.now() + DAY }; await env.CONFIG.put(clockKey, JSON.stringify(clock)) }
  const key = `drive-pending:${userId}:${body.projectId}:${body.kind}:${body.recordId}`
  const previous = await env.CONFIG.get(key, 'json')
  await env.CONFIG.put(key, JSON.stringify({ userId, email, body, version: crypto.randomUUID(), dueAt: previous?.dueAt || clock.nextAt }), { expirationTtl: 30 * 86400 })
  return { queued: true, dueAt: new Date(previous?.dueAt || clock.nextAt).toISOString() }
}

export async function runDriveQueue(env, execute, options = {}) {
  if (!env.CONFIG.list) return { cursor: '', uploaded: 0, failed: 0 }
  const cursorKey = 'drive-pending-cron-cursor'
  const cursor = options.userId ? options.cursor : await env.CONFIG.get(cursorKey)
  const page = await env.CONFIG.list({ prefix: options.userId ? `drive-pending:${options.userId}:` : 'drive-pending:', limit: 5, ...(cursor ? { cursor } : {}) })
  let uploaded = 0; let failed = 0
  const clocks = new Map()
  for (const item of page.keys) {
    const job = await env.CONFIG.get(item.name, 'json')
    if (!job || (!options.force && job.dueAt > Date.now())) continue
    try {
      const result = await execute(job)
      // A newer edit queued while this upload ran must survive for tomorrow.
      const current = await env.CONFIG.get(item.name, 'json')
      if (current?.version === job.version) await env.CONFIG.delete(item.name)
      if (!result.skipped) uploaded++
      if (!clocks.has(job.userId)) {
        clocks.set(job.userId, true)
        await env.CONFIG.put(`drive-auto-clock:${job.userId}`, JSON.stringify({ nextAt: Date.now() + DAY }))
      }
    } catch { failed++ }
  }
  const next = page.list_complete ? '' : page.cursor
  if (!options.userId) await env.CONFIG.put(cursorKey, next)
  return { cursor: next, uploaded, failed }
}
