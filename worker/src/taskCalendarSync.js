import { calendarRequestId, invalidateCalendarCache } from './calendarMutations.js'

const API = 'https://www.googleapis.com/calendar/v3/calendars/primary/events'
const TIME_ZONE = 'Asia/Jerusalem'
const SYNC_VERSION = 'tasks-v1'
const fail = (message, status = 503) => Object.assign(new Error(message), { status })

function day(value) {
  if (!value) return ''
  const date = String(value).slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date) throw fail('תאריך משימה אינו תקין. תקנו אותו ונסו לסנכרן שוב.', 400)
  return date
}

function wallTime(date, time) {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw fail('שעת משימה אינה תקינה', 400)
  const wall = Date.parse(`${date}T${time}:00Z`)
  const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
  const matches = [120, 180].map(offset => new Date(wall - offset * 60000)).filter(candidate => {
    const parts = Object.fromEntries(formatter.formatToParts(candidate).map(part => [part.type, part.value]))
    return `${parts.year}-${parts.month}-${parts.day}` === date && `${parts.hour}:${parts.minute}` === time
  })
  if (matches.length !== 1) throw fail('שעת המשימה אינה חד משמעית במעבר שעון. בחרו שעה אחרת.', 400)
  return matches[0].toISOString()
}

export async function taskGoogleEvents(workspace, userId, orgId) {
  const result = []
  const scope = `${SYNC_VERSION}:${userId}:${orgId}`
  for (const task of workspace.tasks) {
    if (!task.id || !task.title) continue
    const dates = [
      { kind: 'start', date: day(task.startDate), label: 'תחילת משימה' },
      { kind: 'due', date: day(task.dueDate), label: 'סיום משימה' },
      { kind: 'follow', date: day(task.followUpDate), label: 'מעקב משימה' },
    ].filter(item => item.date)
    const project = workspace.projects?.find(project => project.id === task.projectId)
    for (const item of dates.filter((item, index) => dates.findIndex(other => other.date === item.date) === index)) {
      const labels = dates.filter(other => other.date === item.date).map(other => other.label).join(' / ')
      const start = task.scheduledTime && item === dates[0] ? { dateTime: wallTime(item.date, task.scheduledTime), timeZone: TIME_ZONE } : { date: item.date }
      const end = start.dateTime ? { dateTime: new Date(Date.parse(start.dateTime) + 3600000).toISOString(), timeZone: TIME_ZONE } : { date: new Date(Date.parse(item.date) + 86400000).toISOString().slice(0, 10) }
      result.push({
        id: await calendarRequestId(userId, orgId, `${SYNC_VERSION}:${task.id}:${item.kind}`),
        summary: `[RAMENG] ${project ? `${project.name} · ` : ''}${task.title} · ${labels}`.slice(0, 1000),
        description: [task.description || '', `סטטוס: ${task.status || ''}`, `https://rameng-crm.rameng-crm-worker.workers.dev/#app?page=tasks&task=${encodeURIComponent(task.id)}`].filter(Boolean).join('\n').slice(0, 200000),
        start, end, transparency: 'transparent',
        extendedProperties: { private: { ramengTaskSync: scope, ramengOwnerId: userId, ramengOrgId: orgId, ramengTaskId: task.id, ramengTaskKind: item.kind } },
      })
    }
  }
  return result
}

const identity = event => `${event.extendedProperties?.private?.ramengTaskId}:${event.extendedProperties?.private?.ramengTaskKind}`
const owned = (event, userId, orgId) => {
  const marker = event.extendedProperties?.private
  return marker?.ramengTaskSync === `${SYNC_VERSION}:${userId}:${orgId}` && marker.ramengOwnerId === userId && marker.ramengOrgId === orgId && !!marker.ramengTaskId && ['start', 'due', 'follow'].includes(marker.ramengTaskKind)
}
const same = (current, next) => current.summary === next.summary && (current.description || '') === next.description && current.transparency === next.transparency &&
  (next.start.date ? current.start?.date === next.start.date && current.end?.date === next.end.date : Date.parse(current.start?.dateTime) === Date.parse(next.start.dateTime) && Date.parse(current.end?.dateTime) === Date.parse(next.end.dateTime))

export async function syncTaskCalendar(env, config, userId, orgId, workspace, googleFetch) {
  // Plan and validate everything before issuing any Google write.
  const desired = await taskGoogleEvents(workspace, userId, orgId)
  const liveConfig = { ...config, dailyGoogleRead: false }
  let writes = 0
  const call = (url, init) => {
    // Bounded batches leave large workspaces pending for the next retry.
    if (init?.method && init.method !== 'GET' && ++writes > 10) throw fail('ממתינות משימות נוספות לסנכרון')
    return googleFetch(env, liveConfig, userId, url, init)
  }
  const list = new URL(API)
  list.searchParams.set('privateExtendedProperty', `ramengTaskSync=${SYNC_VERSION}:${userId}:${orgId}`)
  list.searchParams.set('maxResults', '250')
  const existing = []
  const cursors = new Set()
  for (let page = 0; page < 20; page++) {
    const response = await call(list.toString())
    if (!response.ok) throw fail('לא ניתן לקרוא את משימות Google Calendar. חברו מחדש את Google או נסו שוב.')
    const data = await response.json()
    existing.push(...(data.items || []).filter(event => event.status !== 'cancelled' && owned(event, userId, orgId)))
    if (!data.nextPageToken) break
    if (page === 19 || cursors.has(data.nextPageToken)) throw fail('רשימת היומן חלקית. לא בוצע סנכרון משימות.')
    cursors.add(data.nextPageToken)
    list.searchParams.set('pageToken', data.nextPageToken)
  }
  const counts = { created: 0, updated: 0, deleted: 0, unchanged: 0, failed: 0 }
  const keep = new Set()
  const patch = async (current, next) => {
    if (same(current, next)) { counts.unchanged++; return }
    if (!current.etag) throw fail('האירוע אינו עדכני. נסו לסנכרן שוב.')
    const { id: _id, ...payload } = next
    const response = await call(`${API}/${encodeURIComponent(current.id)}?sendUpdates=none`, { method: 'PATCH', headers: { 'content-type': 'application/json', 'If-Match': current.etag }, body: JSON.stringify(payload) })
    if (!response.ok) throw fail('עדכון משימה ב-Google Calendar ממתין לניסיון נוסף.')
    counts.updated++
  }
  for (const next of desired) {
    const current = existing.find(event => identity(event) === identity(next))
    try {
      if (current) { keep.add(current.id); await patch(current, next); continue }
      let id = next.id
      let completed = false
      for (let attempt = 0; attempt < 5; attempt++) {
        const response = await call(`${API}?sendUpdates=none`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...next, id }) })
        if (response.ok) { keep.add(id); counts.created++; completed = true; break }
        if (response.status !== 409) throw fail('יצירת משימה ב-Google Calendar ממתינה לניסיון נוסף.')
        // Deterministic IDs make concurrent saves and uncertain POST retries safe.
        const priorResponse = await call(`${API}/${encodeURIComponent(id)}`)
        if (!priorResponse.ok) throw fail('אימות אירוע Google ממתין לניסיון נוסף.')
        const prior = await priorResponse.json()
        if (prior.status === 'cancelled') {
          // Google retains deleted IDs. Derive a new generation from its tombstone.
          if (!prior.etag && !prior.updated) throw fail('אירוע שנמחק ממתין לרענון Google.')
          id = await calendarRequestId(userId, orgId, `${id}:${prior.etag || prior.updated}`)
          continue
        }
        if (!owned(prior, userId, orgId) || identity(prior) !== identity(next)) throw fail('מזהה האירוע אינו שייך למשימה זו.')
        keep.add(id); await patch(prior, next); completed = true; break
      }
      if (!completed) throw fail('האירוע נמחק מספר פעמים. נסו שוב מאוחר יותר.')
    } catch { counts.failed++ }
  }
  // Never touch ordinary meetings, manual reminders, other accounts or organizations.
  // Keep the matching existing event even when its update failed.
  for (const event of existing.filter(event => !counts.failed && !keep.has(event.id))) {
    try {
      if (!event.etag) throw fail('האירוע אינו עדכני')
      const response = await call(`${API}/${encodeURIComponent(event.id)}?sendUpdates=none`, { method: 'DELETE', headers: { 'If-Match': event.etag } })
      if (!response.ok && ![404, 410].includes(response.status)) throw fail('מחיקת משימת Google ממתינה')
      counts.deleted++
    } catch { counts.failed++ }
  }
  if (counts.created || counts.updated || counts.deleted) await invalidateCalendarCache(env, userId)
  return counts
}

export async function handleTaskCalendarSync(request, env, config, deps) {
  const user = await deps.requireUser(request, env, config)
  const body = await request.json().catch(() => ({}))
  if (body.ownerId && body.ownerId !== user.id) return deps.json(request, { error: 'החשבון התחלף. פתחו מחדש את סביבת העבודה.' }, 409)
  if (!/^[0-9a-f-]{36}$/i.test(body.orgId || '')) return deps.json(request, { error: 'נדרש ארגון תקין' }, 400)
  const membership = await deps.currentMembership(request, env, config, user, body.orgId)
  if (!membership || !deps.allowed(membership.role, membership.permissions, 'tasks', 'view') || !['view', 'create', 'edit', 'delete'].every(action => deps.allowed(membership.role, membership.permissions, 'calendar', action))) return deps.json(request, { error: 'אין הרשאה לסנכרן משימות ליומן Google בארגון זה' }, 403)
  // Read only saved, caller-authorized tasks. Never trust task data from the browser.
  const response = await fetch(`${config.supabaseUrl.replace(/\/$/, '')}/rest/v1/rpc/get_workspace_state`, { method: 'POST', headers: { authorization: request.headers.get('authorization'), apikey: config.supabaseAnonKey, 'content-type': 'application/json' }, body: JSON.stringify({ target_org: body.orgId }) })
  if (!response.ok) throw fail('טעינת המשימות השמורות לסנכרון נכשלה')
  const rows = await response.json()
  const workspace = (Array.isArray(rows) ? rows[0] : rows)?.data
  if (!Array.isArray(workspace?.tasks) || !Array.isArray(workspace.projects)) throw fail('נתוני המשימות לסנכרון אינם זמינים')
  const result = await syncTaskCalendar(env, config, user.id, body.orgId, workspace, deps.googleFetch)
  return deps.json(request, { ...result, synced: result.failed === 0 }, 200)
}
