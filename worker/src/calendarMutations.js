export async function calendarRequestId(userId, orgId, key) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify([userId, orgId, key])))
  return [...new Uint8Array(hash)].map(value => value.toString(16).padStart(2, '0')).join('')
}
export async function invalidateCalendarCache(env, userId) {
  try { if (env.CONFIG?.put) await env.CONFIG.put(`google-read-epoch:${userId}`, crypto.randomUUID()) }
  catch { console.error('Calendar cache refresh pending') }
}

export async function handleCalendarMutation(request, env, config, deps) {
  const body = await request.json().catch(() => ({}))
  const action = request.method === 'DELETE' ? 'delete' : 'edit'
  const user = await deps.requireUser(request, env, config)
  if (!/^[0-9a-f-]{36}$/i.test(body.orgId || '') || !/^[a-zA-Z0-9_-]{1,1024}$/.test(body.id || '') || typeof body.etag !== 'string' || !body.etag || /[\r\n]/.test(body.etag)) return deps.json(request, { error: 'נדרש אירוע עדכני מארגון תקין. רעננו את היומן.' }, 400)
  const membership = await deps.currentMembership(request, env, config, user, body.orgId)
  if (!membership || !deps.allowed(membership.role, membership.permissions, 'calendar', action)) return deps.json(request, { error: 'אין הרשאה לעדכון יומן בארגון זה' }, 403)
  const liveConfig = {...config,dailyGoogleRead:false}
  const target = `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(body.id)}`
  const currentResponse = await deps.googleFetch(env, liveConfig, user.id, target)
  if (request.method === 'DELETE' && [404, 410].includes(currentResponse.status)) {await invalidateCalendarCache(env,user.id);return deps.json(request, { ok: true })}
  if (!currentResponse.ok) return deps.json(request, { error: 'האירוע אינו זמין בתיבת היומן שלך' }, 404)
  const current = await currentResponse.json()
  const marker = current.extendedProperties?.private
  if ((marker?.ramengOrgId && marker.ramengOrgId !== body.orgId) || (marker?.ramengOwnerId && marker.ramengOwnerId !== user.id)) return deps.json(request, { error: 'האירוע שייך לחשבון או לארגון אחר' }, 403)
  if (!current.organizer?.self || !current.start?.dateTime || current.recurrence || current.recurringEventId) return deps.json(request, { error: 'ניתן לערוך כאן אירוע מתוזמן יחיד שבבעלותך. לאירוע חוזר או יומי השתמשו בקישור ל-Google.' }, 403)
  if (current.etag !== body.etag) return deps.json(request, { error: 'האירוע השתנה בינתיים. רעננו לפני שמירת השינויים.' }, 409)
  const options = { method: request.method, headers: { 'If-Match': body.etag } }
  if (request.method === 'PATCH') {
    const start = Date.parse(body.start), end = Date.parse(body.end)
    if (typeof body.summary !== 'string' || !body.summary.trim() || !Number.isFinite(start) || !Number.isFinite(end) || end <= start) return deps.json(request, { error: 'יש להזין כותרת, התחלה וסיום תקינים' }, 400)
    options.headers['content-type'] = 'application/json'
    options.body = JSON.stringify({ summary: body.summary.trim().slice(0, 1000), description: String(body.description || '').slice(0, 200000), location: String(body.location || '').slice(0, 2000), start: { dateTime: new Date(start).toISOString(), timeZone: 'Asia/Jerusalem' }, end: { dateTime: new Date(end).toISOString(), timeZone: 'Asia/Jerusalem' } })
  }
  // No attendees, invitations, recurring rules or sharing settings are changed.
  const response = await deps.googleFetch(env, liveConfig, user.id, `${target}?sendUpdates=none`, options)
  if ([409, 412].includes(response.status)) return deps.json(request, { error: 'האירוע השתנה בינתיים. רעננו ונסו שוב.' }, 409)
  if (!response.ok && !(request.method === 'DELETE' && [404, 410].includes(response.status))) return deps.json(request, { error: 'עדכון Google Calendar נכשל. רעננו או חברו מחדש ונסו שוב.' }, 503)
  await invalidateCalendarCache(env, user.id)
  if (request.method === 'DELETE') return deps.json(request, { ok: true })
  const result = await response.json()
  return deps.json(request, { id: result.id, etag: result.etag, htmlLink: result.htmlLink || '' })
}
