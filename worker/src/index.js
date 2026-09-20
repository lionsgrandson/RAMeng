import { createClient } from '@supabase/supabase-js'

const CONFIG_KEY = 'rameng:admin-config:v1'
const GOOGLE_TOKENS_KEY = 'rameng:google-tokens:v1'
const OAUTH_STATE_PREFIX = 'rameng:oauth-state:'

const json = (data, status = 200, extraHeaders = {}) => new Response(JSON.stringify(data), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', ...extraHeaders },
})

const normalizeOrigin = (request) => request.headers.get('origin') || '*'
const corsHeaders = (request) => ({
  'access-control-allow-origin': normalizeOrigin(request),
  'access-control-allow-methods': 'GET,POST,PUT,DELETE,OPTIONS',
  'access-control-allow-headers': 'authorization,content-type',
  'access-control-max-age': '86400',
  vary: 'Origin',
})
const apiJson = (request, data, status = 200) => json(data, status, corsHeaders(request))

async function readConfig(env) {
  const stored = (await env.CONFIG.get(CONFIG_KEY, 'json')) || {}
  const localDeveloperEmails = String(env.DEVELOPER_EMAILS || '')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean)

  return {
    ...stored,
    supabaseUrl: stored.supabaseUrl || cleanString(env.SUPABASE_URL),
    supabaseAnonKey: stored.supabaseAnonKey || cleanString(env.SUPABASE_ANON_KEY),
    adminEmails: cleanEmails(stored.adminEmails).length ? cleanEmails(stored.adminEmails) : localDeveloperEmails,
    developerEmails: cleanEmails(stored.developerEmails).length ? cleanEmails(stored.developerEmails) : localDeveloperEmails,
    googleClientId: stored.googleClientId || cleanString(env.GOOGLE_CLIENT_ID),
  }
}

async function saveConfig(env, next) {
  await env.CONFIG.put(CONFIG_KEY, JSON.stringify(next))
  return next
}

function publicConfig(config) {
  return {
    configured: Boolean(config.supabaseUrl && config.supabaseAnonKey),
    apiBase: '',
    supabaseUrl: config.supabaseUrl || '',
    supabaseAnonKey: config.supabaseAnonKey || '',
    googleClientId: config.googleClientId || '',
  }
}

async function parseBody(request) {
  try { return await request.json() } catch { return {} }
}

function cleanString(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function cleanEmails(value) {
  return Array.isArray(value) ? value.map(cleanString).filter(Boolean).map((email) => email.toLowerCase()) : []
}

function developerEmails(config) {
  return cleanEmails(config.developerEmails || config.adminEmails)
}

async function getAuthenticatedUser(request, env, config) {
  const auth = request.headers.get('authorization') || ''
  if (!auth.startsWith('Bearer ')) throw Object.assign(new Error('נדרשת התחברות'), { status: 401 })
  if (!config.supabaseUrl || !config.supabaseAnonKey) throw Object.assign(new Error('Supabase אינו מוגדר'), { status: 503 })
  const response = await fetch(`${config.supabaseUrl.replace(/\/$/, '')}/auth/v1/user`, {
    headers: { authorization: auth, apikey: config.supabaseAnonKey },
  })
  if (!response.ok) throw Object.assign(new Error('ההתחברות אינה תקפה'), { status: 401 })
  const user = await response.json()
  if (!user?.id) throw Object.assign(new Error('המשתמש אינו תקף'), { status: 401 })
  return user
}

function isDeveloper(user, config) {
  const email = String(user?.email || '').toLowerCase()
  return developerEmails(config).includes(email)
}

function supabaseAdmin(env, config) {
  const secret = cleanString(env.SUPABASE_SECRET_KEY)
  if (!secret) throw Object.assign(new Error('יש להגדיר SUPABASE_SECRET_KEY ב-Cloudflare Worker כדי לנהל הזמנות משתמשים'), { status: 503 })
  if (!config.supabaseUrl) throw Object.assign(new Error('Supabase אינו מוגדר'), { status: 503 })
  return createClient(config.supabaseUrl, secret, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  })
}

async function ensureDeveloperMembership(env, config, user) {
  if (!isDeveloper(user, config) || !cleanString(env.SUPABASE_SECRET_KEY)) return
  const admin = supabaseAdmin(env, config)
  const memberships = await admin.from('memberships').select('org_id, role').eq('user_id', user.id)
  if (memberships.error) return
  if (memberships.data?.length) {
    for (const membership of memberships.data) {
      if (membership.role !== 'developer') await admin.from('memberships').update({ role: 'developer' }).eq('org_id', membership.org_id).eq('user_id', user.id)
    }
    return
  }
  const orgs = await admin.from('organizations').select('id').limit(1)
  const orgId = orgs.data?.[0]?.id
  if (orgId) await admin.from('memberships').upsert({ org_id: orgId, user_id: user.id, role: 'developer' }, { onConflict: 'org_id,user_id' })
}

async function requireUser(request, env, config) {
  return getAuthenticatedUser(request, env, config)
}

async function requireDeveloper(request, env, config) {
  const user = await getAuthenticatedUser(request, env, config)
  if (!isDeveloper(user, config)) throw Object.assign(new Error('הפעולה זמינה למפתח המערכת בלבד'), { status: 403 })
  await ensureDeveloperMembership(env, config, user)
  return user
}

function rolePermissionAllowed(role, permissions, area, action) {
  if (role === 'developer') return true
  const custom = permissions?.[area]?.[action]
  if (typeof custom === 'boolean') return custom
  if (action === 'view') return ['admin', 'manager', 'assistant', 'inspector', 'engineer', 'viewer', 'reviewer', 'member'].includes(role)
  if (['admin', 'manager'].includes(role)) return true
  if (role === 'assistant') return ['contacts', 'projects', 'tasks', 'calendar', 'files', 'finance', 'communication'].includes(area)
  if (['inspector', 'engineer'].includes(role)) return ['projects', 'tasks', 'calendar', 'files', 'reports', 'communication'].includes(area)
  return false
}

async function currentMembership(request, env, config, user) {
  const auth = request.headers.get('authorization') || ''
  const url = new URL(`${config.supabaseUrl.replace(/\/$/, '')}/rest/v1/memberships`)
  url.searchParams.set('select', 'role,permissions')
  url.searchParams.set('user_id', `eq.${user.id}`)
  const response = await fetch(url.toString(), {
    headers: {
      authorization: auth,
      apikey: config.supabaseAnonKey,
      accept: 'application/json',
    },
  })
  const memberships = response.ok ? await response.json() : []
  return Array.isArray(memberships) ? memberships[0] || null : null
}

async function requireAreaAction(request, env, config, area, action) {
  const user = await getAuthenticatedUser(request, env, config)
  if (isDeveloper(user, config)) {
    await ensureDeveloperMembership(env, config, user)
    return user
  }

  const membership = await currentMembership(request, env, config, user)
  if (!membership || !rolePermissionAllowed(membership.role, membership.permissions, area, action)) {
    throw Object.assign(new Error('אין לחשבון הרשאה לפעולה הזו'), { status: 403 })
  }
  return user
}

async function requireAnyAreaAction(request, env, config, checks) {
  const user = await getAuthenticatedUser(request, env, config)
  if (isDeveloper(user, config)) {
    await ensureDeveloperMembership(env, config, user)
    return user
  }

  const membership = await currentMembership(request, env, config, user)
  const allowed = membership && checks.some(({ area, action }) => rolePermissionAllowed(membership.role, membership.permissions, area, action))
  if (!allowed) throw Object.assign(new Error('אין לחשבון הרשאה לפעולה הזו'), { status: 403 })
  return user
}

async function requireOrgManager(request, env, config, orgId) {
  const user = await getAuthenticatedUser(request, env, config)
  if (isDeveloper(user, config)) {
    await ensureDeveloperMembership(env, config, user)
    return user
  }
  const auth = request.headers.get('authorization') || ''
  const response = await fetch(`${config.supabaseUrl.replace(/\/$/, '')}/rest/v1/rpc/is_org_admin`, {
    method: 'POST',
    headers: {
      authorization: auth,
      apikey: config.supabaseAnonKey,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ target_org: orgId }),
  })
  const allowed = response.ok ? await response.json() : false
  if (allowed !== true) throw Object.assign(new Error('רק מנהל יכול לנהל משתמשים'), { status: 403 })
  return user
}

function redirectUri(request) {
  return `${new URL(request.url).origin}/api/google/callback`
}

async function googleTokens(env) {
  return (await env.CONFIG.get(GOOGLE_TOKENS_KEY, 'json')) || null
}

async function putGoogleTokens(env, tokens) {
  await env.CONFIG.put(GOOGLE_TOKENS_KEY, JSON.stringify(tokens))
}

async function validGoogleAccessToken(env, config) {
  const stored = await googleTokens(env)
  if (!stored?.refresh_token && !stored?.access_token) throw Object.assign(new Error('Google Workspace עדיין לא מחובר'), { status: 409 })
  if (stored.access_token && Number(stored.expires_at || 0) > Date.now() + 60_000) return stored.access_token
  if (!stored.refresh_token) throw Object.assign(new Error('חיבור Google פג. יש להתחבר מחדש ממנהל המערכת.'), { status: 409 })
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: config.googleClientId || '',
      client_secret: config.googleClientSecret || '',
      refresh_token: stored.refresh_token,
      grant_type: 'refresh_token',
    }),
  })
  const body = await response.json()
  if (!response.ok || !body.access_token) throw Object.assign(new Error(body.error_description || 'לא ניתן לרענן את חיבור Google'), { status: 502 })
  const next = { ...stored, access_token: body.access_token, expires_at: Date.now() + Number(body.expires_in || 3600) * 1000 }
  await putGoogleTokens(env, next)
  return next.access_token
}

async function googleFetch(env, config, url, init = {}) {
  const token = await validGoogleAccessToken(env, config)
  const response = await fetch(url, {
    ...init,
    headers: { authorization: `Bearer ${token}`, ...(init.headers || {}) },
  })
  if (response.status === 401) {
    const stored = await googleTokens(env)
    if (stored) {
      stored.expires_at = 0
      await putGoogleTokens(env, stored)
    }
  }
  return response
}

function decodeBase64UrlUtf8(value = '') {
  if (!value) return ''
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4)
  const binary = atob(normalized)
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

function utf8ToBase64(value) {
  const bytes = new TextEncoder().encode(value)
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  return btoa(binary)
}

function utf8ToBase64Url(value) {
  return utf8ToBase64(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function headerValue(headers = [], name) {
  return headers.find((header) => String(header.name || '').toLowerCase() === name.toLowerCase())?.value || ''
}

function stripHtml(html) {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#39;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s+/g, '\n')
    .trim()
}

function mimeBody(payload) {
  if (!payload) return ''
  if (payload.mimeType === 'text/plain' && payload.body?.data) return decodeBase64UrlUtf8(payload.body.data)
  const parts = Array.isArray(payload.parts) ? payload.parts : []
  for (const part of parts) {
    const text = mimeBody(part)
    if (text && (part.mimeType === 'text/plain' || !/<[^>]+>/.test(text))) return text
  }
  if (payload.mimeType === 'text/html' && payload.body?.data) return stripHtml(decodeBase64UrlUtf8(payload.body.data))
  for (const part of parts) {
    if (part.mimeType === 'text/html' && part.body?.data) return stripHtml(decodeBase64UrlUtf8(part.body.data))
  }
  return payload.body?.data ? decodeBase64UrlUtf8(payload.body.data) : ''
}

function normalizeGmailMessage(message) {
  const headers = message.payload?.headers || []
  return {
    id: message.id,
    threadId: message.threadId,
    from: headerValue(headers, 'From'),
    to: headerValue(headers, 'To'),
    subject: headerValue(headers, 'Subject'),
    date: headerValue(headers, 'Date') || (message.internalDate ? new Date(Number(message.internalDate)).toISOString() : ''),
    body: mimeBody(message.payload),
    snippet: message.snippet || '',
  }
}

async function handleGoogleAuthUrl(request, env, config) {
  const user = await requireDeveloper(request, env, config)
  if (!config.googleClientId || !config.googleClientSecret) throw Object.assign(new Error('יש להזין Google OAuth Client ID ו-Client Secret לפני החיבור'), { status: 400 })
  const state = crypto.randomUUID()
  await env.CONFIG.put(`${OAUTH_STATE_PREFIX}${state}`, JSON.stringify({ userId: user.id, email: user.email || '', createdAt: Date.now() }), { expirationTtl: 600 })
  const params = new URLSearchParams({
    client_id: config.googleClientId,
    redirect_uri: redirectUri(request),
    response_type: 'code',
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state,
    scope: [
      'openid',
      'email',
      'https://www.googleapis.com/auth/gmail.modify',
      'https://www.googleapis.com/auth/calendar',
      'https://www.googleapis.com/auth/drive.file',
    ].join(' '),
  })
  return apiJson(request, { url: `https://accounts.google.com/o/oauth2/v2/auth?${params}` })
}

async function handleGoogleCallback(request, env, config) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code') || ''
  const state = url.searchParams.get('state') || ''
  const oauthError = url.searchParams.get('error')
  if (oauthError) return new Response(`Google OAuth error: ${oauthError}`, { status: 400 })
  if (!code || !state) return new Response('Missing OAuth code/state', { status: 400 })
  const stateKey = `${OAUTH_STATE_PREFIX}${state}`
  const stateData = await env.CONFIG.get(stateKey, 'json')
  if (!stateData) return new Response('OAuth state expired or invalid', { status: 400 })
  await env.CONFIG.delete(stateKey)

  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: config.googleClientId || '',
      client_secret: config.googleClientSecret || '',
      redirect_uri: redirectUri(request),
      grant_type: 'authorization_code',
    }),
  })
  const tokenBody = await tokenResponse.json()
  if (!tokenResponse.ok || !tokenBody.access_token) return new Response(tokenBody.error_description || 'Google token exchange failed', { status: 502 })

  const previous = await googleTokens(env)
  let email = ''
  const profileResponse = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', { headers: { authorization: `Bearer ${tokenBody.access_token}` } })
  if (profileResponse.ok) email = String((await profileResponse.json()).emailAddress || '')
  const stored = {
    access_token: tokenBody.access_token,
    refresh_token: tokenBody.refresh_token || previous?.refresh_token || '',
    expires_at: Date.now() + Number(tokenBody.expires_in || 3600) * 1000,
    scope: tokenBody.scope || '',
    email,
    connectedBy: stateData.email || '',
    connectedAt: new Date().toISOString(),
  }
  await putGoogleTokens(env, stored)
  return Response.redirect(`${url.origin}/?google=connected`, 302)
}

async function handleGmailThread(request, env, config) {
  await requireAreaAction(request, env, config, 'communication', 'view')
  const threadId = new URL(request.url).searchParams.get('threadId') || ''
  if (!threadId) throw Object.assign(new Error('חסר threadId'), { status: 400 })
  const response = await googleFetch(env, config, `https://gmail.googleapis.com/gmail/v1/users/me/threads/${encodeURIComponent(threadId)}?format=full`)
  const body = await response.json()
  if (!response.ok) throw Object.assign(new Error(body.error?.message || 'טעינת שרשור Gmail נכשלה'), { status: response.status })
  return apiJson(request, { messages: (body.messages || []).map(normalizeGmailMessage) })
}

async function handleGmailSearch(request, env, config) {
  await requireAreaAction(request, env, config, 'communication', 'view')
  const query = new URL(request.url).searchParams.get('q') || ''
  const listUrl = new URL('https://gmail.googleapis.com/gmail/v1/users/me/threads')
  if (query) listUrl.searchParams.set('q', query)
  listUrl.searchParams.set('maxResults', '20')
  const response = await googleFetch(env, config, listUrl.toString())
  const body = await response.json()
  if (!response.ok) throw Object.assign(new Error(body.error?.message || 'חיפוש Gmail נכשל'), { status: response.status })
  const summaries = await Promise.all((body.threads || []).slice(0, 20).map(async (thread) => {
    const detail = await googleFetch(env, config, `https://gmail.googleapis.com/gmail/v1/users/me/threads/${encodeURIComponent(thread.id)}?format=metadata&metadataHeaders=Subject&metadataHeaders=From`)
    if (!detail.ok) return { id: thread.id, snippet: thread.snippet || '' }
    const detailBody = await detail.json()
    const messages = detailBody.messages || []
    const last = messages[messages.length - 1] || {}
    const headers = last.payload?.headers || []
    return { id: thread.id, snippet: last.snippet || thread.snippet || '', subject: headerValue(headers, 'Subject'), from: headerValue(headers, 'From') }
  }))
  return apiJson(request, { threads: summaries })
}

async function handleGmailSend(request, env, config) {
  await requireAreaAction(request, env, config, 'communication', 'create')
  const body = await parseBody(request)
  const to = cleanString(body.to)
  const subject = cleanString(body.subject)
  const text = cleanString(body.body)
  const threadId = cleanString(body.threadId)
  if (!to || !subject || !text) throw Object.assign(new Error('יש להזין נמען, נושא ותוכן'), { status: 400 })
  const encodedSubject = `=?UTF-8?B?${utf8ToBase64(subject)}?=`
  const encodedBody = utf8ToBase64(text)
  const rfc822 = [
    `To: ${to}`,
    `Subject: ${encodedSubject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    encodedBody,
  ].join('\r\n')
  const payload = { raw: utf8ToBase64Url(rfc822), ...(threadId ? { threadId } : {}) }
  const response = await googleFetch(env, config, 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const result = await response.json()
  if (!response.ok) throw Object.assign(new Error(result.error?.message || 'שליחת Gmail נכשלה'), { status: response.status })
  return apiJson(request, { id: result.id, threadId: result.threadId })
}

async function handleCalendarList(request, env, config) {
  await requireAreaAction(request, env, config, 'calendar', 'view')
  const url = new URL(request.url)
  const apiUrl = new URL('https://www.googleapis.com/calendar/v3/calendars/primary/events')
  apiUrl.searchParams.set('singleEvents', 'true')
  apiUrl.searchParams.set('orderBy', 'startTime')
  apiUrl.searchParams.set('maxResults', '250')
  const from = url.searchParams.get('from') || new Date(Date.now() - 30 * 86400000).toISOString()
  const to = url.searchParams.get('to') || ''
  apiUrl.searchParams.set('timeMin', new Date(from).toISOString())
  if (to) apiUrl.searchParams.set('timeMax', new Date(to).toISOString())
  const response = await googleFetch(env, config, apiUrl.toString())
  const body = await response.json()
  if (!response.ok) throw Object.assign(new Error(body.error?.message || 'טעינת Google Calendar נכשלה'), { status: response.status })
  return apiJson(request, { items: (body.items || []).map((item) => ({ id: item.id, summary: item.summary || '(ללא כותרת)', start: item.start?.dateTime || item.start?.date || '', end: item.end?.dateTime || item.end?.date || '', htmlLink: item.htmlLink || '', location: item.location || '' })) })
}

function isoWithDefaultEnd(start, end) {
  const startDate = new Date(start)
  if (end) return new Date(end).toISOString()
  return new Date(startDate.getTime() + 60 * 60 * 1000).toISOString()
}

async function handleCalendarCreate(request, env, config) {
  await requireAreaAction(request, env, config, 'calendar', 'create')
  const body = await parseBody(request)
  const summary = cleanString(body.summary)
  const start = cleanString(body.start)
  if (!summary || !start || Number.isNaN(new Date(start).getTime())) throw Object.assign(new Error('כותרת ותאריך התחלה תקינים נדרשים'), { status: 400 })
  const event = {
    summary,
    description: cleanString(body.description),
    location: cleanString(body.location),
    start: { dateTime: new Date(start).toISOString(), timeZone: 'Asia/Jerusalem' },
    end: { dateTime: isoWithDefaultEnd(start, cleanString(body.end)), timeZone: 'Asia/Jerusalem' },
  }
  const response = await googleFetch(env, config, 'https://www.googleapis.com/calendar/v3/calendars/primary/events', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(event),
  })
  const result = await response.json()
  if (!response.ok) throw Object.assign(new Error(result.error?.message || 'יצירת אירוע Google נכשלה'), { status: response.status })
  return apiJson(request, { id: result.id, htmlLink: result.htmlLink || '' })
}

function escapeDriveQuery(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'")
}

async function handleDriveProjectFolder(request, env, config) {
  await requireAreaAction(request, env, config, 'files', 'create')
  const body = await parseBody(request)
  const projectId = cleanString(body.projectId)
  const name = cleanString(body.name)
  const parentId = cleanString(body.parentId) || cleanString(config.driveRootFolderId) || 'root'
  if (!projectId || !name) throw Object.assign(new Error('חסרים projectId או שם פרויקט'), { status: 400 })

  const search = new URL('https://www.googleapis.com/drive/v3/files')
  search.searchParams.set('q', `'${escapeDriveQuery(parentId)}' in parents and name='${escapeDriveQuery(name)}' and mimeType='application/vnd.google-apps.folder' and trashed=false`)
  search.searchParams.set('fields', 'files(id,name,webViewLink)')
  search.searchParams.set('pageSize', '10')
  const searchResponse = await googleFetch(env, config, search.toString())
  const searchBody = await searchResponse.json()
  if (!searchResponse.ok) throw Object.assign(new Error(searchBody.error?.message || 'חיפוש תיקיית Drive נכשל'), { status: searchResponse.status })
  if (searchBody.files?.[0]) return apiJson(request, { id: searchBody.files[0].id, webViewLink: searchBody.files[0].webViewLink || `https://drive.google.com/drive/folders/${searchBody.files[0].id}` })

  const response = await googleFetch(env, config, 'https://www.googleapis.com/drive/v3/files?fields=id,name,webViewLink', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentId],
      appProperties: { ramengProjectId: projectId },
    }),
  })
  const result = await response.json()
  if (!response.ok) throw Object.assign(new Error(result.error?.message || 'יצירת תיקיית Drive נכשלה'), { status: response.status })
  return apiJson(request, { id: result.id, webViewLink: result.webViewLink || `https://drive.google.com/drive/folders/${result.id}` })
}

async function handleDriveFiles(request, env, config) {
  await requireAreaAction(request, env, config, 'files', 'view')
  const folderId = new URL(request.url).searchParams.get('folderId') || ''
  if (!folderId) throw Object.assign(new Error('חסר folderId'), { status: 400 })
  const url = new URL('https://www.googleapis.com/drive/v3/files')
  url.searchParams.set('q', `'${escapeDriveQuery(folderId)}' in parents and trashed=false`)
  url.searchParams.set('orderBy', 'modifiedTime desc')
  url.searchParams.set('pageSize', '100')
  url.searchParams.set('fields', 'files(id,name,mimeType,modifiedTime,webViewLink,size)')
  const response = await googleFetch(env, config, url.toString())
  const body = await response.json()
  if (!response.ok) throw Object.assign(new Error(body.error?.message || 'טעינת קבצי Drive נכשלה'), { status: response.status })
  return apiJson(request, { files: body.files || [] })
}

async function handleAiRewrite(request, env, config) {
  await requireAnyAreaAction(request, env, config, [
    { area: 'reports', action: 'edit' },
    { area: 'communication', action: 'edit' },
  ])
  if (!config.openaiApiKey) throw Object.assign(new Error('OpenAI API Key אינו מוגדר'), { status: 409 })
  const body = await parseBody(request)
  const text = cleanString(body.text)
  const mode = cleanString(body.mode) || 'inspection'
  if (!text) throw Object.assign(new Error('אין טקסט לניסוח'), { status: 400 })
  const instructions = mode === 'inspection'
    ? 'נסח את הטקסט כהערת פיקוח הנדסית מקצועית, ברורה וקצרה בעברית. אל תוסיף עובדות, מידות, דרישות או מסקנות שלא נמסרו בטקסט המקורי. שמור על המשמעות המקורית בלבד.'
    : 'שפר את הניסוח בעברית באופן מקצועי וברור בלי להוסיף עובדות שלא נמסרו.'
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { authorization: `Bearer ${config.openaiApiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({ model: config.openaiModel || 'gpt-5.6-terra', instructions, input: text, reasoning: { effort: 'low' } }),
  })
  const result = await response.json()
  if (!response.ok) throw Object.assign(new Error(result.error?.message || 'שגיאה בחיבור ל-OpenAI'), { status: response.status })
  const outputText = (result.output || []).flatMap((item) => item.content || []).filter((item) => item.type === 'output_text').map((item) => item.text).join('\n').trim()
  if (!outputText) throw Object.assign(new Error('OpenAI לא החזיר טקסט'), { status: 502 })
  return apiJson(request, { text: outputText })
}

async function handleUserInvite(request, env, config) {
  const body = await parseBody(request)
  const orgId = cleanString(body.orgId)
  const email = cleanString(body.email).toLowerCase()
  const name = cleanString(body.name)
  const requestedRole = cleanString(body.role) || 'viewer'
  if (!orgId || !email || !email.includes('@')) throw Object.assign(new Error('יש להזין מייל תקין'), { status: 400 })
  if (!['admin', 'assistant', 'inspector', 'engineer', 'viewer', 'reviewer'].includes(requestedRole)) throw Object.assign(new Error('תפקיד לא תקין'), { status: 400 })

  await requireOrgManager(request, env, config, orgId)
  const admin = supabaseAdmin(env, config)

  const listResult = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
  if (listResult.error) throw Object.assign(new Error(listResult.error.message || 'לא ניתן לבדוק משתמשים ב-Supabase'), { status: 502 })
  let targetUser = (listResult.data.users || []).find((item) => String(item.email || '').toLowerCase() === email)
  const existed = Boolean(targetUser)
  let invited = false

  if (!targetUser) {
    const invite = await admin.auth.admin.inviteUserByEmail(email, {
      data: name ? { full_name: name } : undefined,
      redirectTo: `${new URL(request.url).origin}/?invite=1`,
    })
    if (invite.error || !invite.data.user) throw Object.assign(new Error(invite.error?.message || 'שליחת ההזמנה נכשלה'), { status: 502 })
    targetUser = invite.data.user
    invited = true
  } else if (name && !targetUser.user_metadata?.full_name) {
    const update = await admin.auth.admin.updateUserById(targetUser.id, { user_metadata: { ...(targetUser.user_metadata || {}), full_name: name } })
    if (!update.error && update.data.user) targetUser = update.data.user
  }

  const role = developerEmails(config).includes(email) ? 'developer' : requestedRole
  const membership = await admin.from('memberships').upsert({ org_id: orgId, user_id: targetUser.id, role }, { onConflict: 'org_id,user_id' })
  if (membership.error) throw Object.assign(new Error(membership.error.message || 'לא ניתן לשייך את המשתמש לארגון'), { status: 502 })

  return apiJson(request, { ok: true, invited, existing: existed, email, userId: targetUser.id, role })
}

async function handleAdminBootstrap(request, env) {
  const current = await readConfig(env)
  if (current.supabaseUrl && current.supabaseAnonKey) throw Object.assign(new Error('המערכת כבר הוגדרה. שינויים נוספים מבוצעים ממנהל המערכת.'), { status: 409 })
  const body = await parseBody(request)
  if (!env.ADMIN_SETUP_TOKEN) throw Object.assign(new Error('ADMIN_SETUP_TOKEN לא הוגדר ב-Cloudflare Worker'), { status: 503 })
  if (cleanString(body.setupToken) !== env.ADMIN_SETUP_TOKEN) throw Object.assign(new Error('Cloudflare Setup Token שגוי'), { status: 403 })
  const supabaseUrl = cleanString(body.supabaseUrl).replace(/\/$/, '')
  const supabaseAnonKey = cleanString(body.supabaseAnonKey)
  const adminEmails = cleanEmails(body.adminEmails)
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(supabaseUrl) || supabaseAnonKey.length < 40 || !adminEmails.length) throw Object.assign(new Error('יש להזין Supabase URL, anon key ומייל מפתח תקינים'), { status: 400 })
  const next = {
    organizationName: cleanString(body.organizationName) || 'ר.א.ם הנדסה',
    supabaseUrl,
    supabaseAnonKey,
    adminEmails,
    googleClientId: cleanString(body.googleClientId),
    googleClientSecret: cleanString(body.googleClientSecret),
    openaiApiKey: cleanString(body.openaiApiKey),
    openaiModel: cleanString(body.openaiModel) || 'gpt-5.6-terra',
    driveRootFolderId: cleanString(body.driveRootFolderId),
    updatedAt: new Date().toISOString(),
  }
  await saveConfig(env, next)
  return apiJson(request, { ok: true })
}

async function handleAdminConfig(request, env, config) {
  await requireDeveloper(request, env, config)
  if (request.method === 'GET') {
    return apiJson(request, {
      organizationName: config.organizationName || 'ר.א.ם הנדסה',
      supabaseUrl: config.supabaseUrl || '',
      supabaseAnonKey: config.supabaseAnonKey || '',
      adminEmails: developerEmails(config),
      googleClientId: config.googleClientId || '',
      googleClientSecret: '',
      openaiApiKey: '',
      openaiModel: config.openaiModel || 'gpt-5.6-terra',
      driveRootFolderId: config.driveRootFolderId || '',
    })
  }
  if (request.method !== 'PUT') throw Object.assign(new Error('Method not allowed'), { status: 405 })
  const body = await parseBody(request)
  const next = { ...config }
  for (const key of ['organizationName', 'supabaseUrl', 'supabaseAnonKey', 'googleClientId', 'openaiModel', 'driveRootFolderId']) {
    if (body[key] !== undefined) next[key] = cleanString(body[key])
  }
  if (body.adminEmails !== undefined) next.adminEmails = cleanEmails(body.adminEmails)
  if (cleanString(body.googleClientSecret)) next.googleClientSecret = cleanString(body.googleClientSecret)
  if (cleanString(body.openaiApiKey)) next.openaiApiKey = cleanString(body.openaiApiKey)
  next.updatedAt = new Date().toISOString()
  await saveConfig(env, next)
  return apiJson(request, { ok: true })
}

async function handleStatus(request, env, config) {
  await requireUser(request, env, config)
  const tokens = await googleTokens(env)
  return apiJson(request, {
    configured: Boolean(config.supabaseUrl && config.supabaseAnonKey),
    google: { connected: Boolean(tokens?.refresh_token || (tokens?.access_token && Number(tokens.expires_at || 0) > Date.now())), email: tokens?.email || '' },
    openai: { configured: Boolean(config.openaiApiKey) },
    users: { invitationsConfigured: Boolean(cleanString(env.SUPABASE_SECRET_KEY)) },
  })
}

async function routeApi(request, env) {
  const url = new URL(request.url)
  const path = url.pathname
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(request) })
  const config = await readConfig(env)

  if (path === '/api/public-config' && request.method === 'GET') return apiJson(request, publicConfig(config))
  if (path === '/api/admin/bootstrap' && request.method === 'POST') return handleAdminBootstrap(request, env)
  if (path === '/api/google/callback' && request.method === 'GET') return handleGoogleCallback(request, env, config)
  if (path === '/api/admin/config') return handleAdminConfig(request, env, config)
  if (path === '/api/users/invite' && request.method === 'POST') return handleUserInvite(request, env, config)
  if (path === '/api/integrations/status' && request.method === 'GET') return handleStatus(request, env, config)
  if (path === '/api/google/auth-url' && request.method === 'GET') return handleGoogleAuthUrl(request, env, config)
  if (path === '/api/google/gmail/thread' && request.method === 'GET') return handleGmailThread(request, env, config)
  if (path === '/api/google/gmail/search' && request.method === 'GET') return handleGmailSearch(request, env, config)
  if (path === '/api/google/gmail/send' && request.method === 'POST') return handleGmailSend(request, env, config)
  if (path === '/api/google/calendar/events' && request.method === 'GET') return handleCalendarList(request, env, config)
  if (path === '/api/google/calendar/events' && request.method === 'POST') return handleCalendarCreate(request, env, config)
  if (path === '/api/google/drive/project-folder' && request.method === 'POST') return handleDriveProjectFolder(request, env, config)
  if (path === '/api/google/drive/files' && request.method === 'GET') return handleDriveFiles(request, env, config)
  if (path === '/api/ai/rewrite' && request.method === 'POST') return handleAiRewrite(request, env, config)
  return apiJson(request, { error: 'API route not found' }, 404)
}

export default {
  async fetch(request, env) {
    try {
      const url = new URL(request.url)
      if (url.pathname.startsWith('/api/')) return await routeApi(request, env)
      if (env.ASSETS) return env.ASSETS.fetch(request)
      return new Response('RAMeng CRM', { status: 200 })
    } catch (error) {
      console.error(error)
      const status = Number(error?.status || 500)
      const message = error instanceof Error ? error.message : 'שגיאת שרת'
      return apiJson(request, { error: message }, status)
    }
  },
}
