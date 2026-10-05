import { queueDriveUpload, runDriveQueue } from "./driveQueue.js"
import { cachedGoogleRead, googleReadHash, refreshGoogleReads } from "./googleSync.js"
import { createClient } from '@supabase/supabase-js'
import { cleanMailHtml, mailContent } from './mailHtml.js'

const CONFIG_KEY = 'rameng:admin-config:v1'
const GOOGLE_TOKENS_PREFIX = 'rameng:google-tokens:v2:'
const OAUTH_STATE_PREFIX = 'rameng:oauth-state:'
const PRODUCTION_APP_URL = 'https://rameng-crm.rameng-crm-worker.workers.dev'

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
const apiJson = (request, data, status = 200) => json(data, status, { ...corsHeaders(request), 'cache-control': 'no-store' })

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
    googleMapsApiKey: stored.googleMapsApiKey || cleanString(env.GOOGLE_MAPS_API_KEY),
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
  if (!config.supabaseUrl || !config.supabaseAnonKey) throw Object.assign(new Error('השירות אינו זמין כרגע.'), { status: 503 })
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
  if (!secret) throw Object.assign(new Error('הזמנות משתמשים אינן זמינות כרגע.'), { status: 503 })
  if (!config.supabaseUrl) throw Object.assign(new Error('השירות אינו זמין כרגע.'), { status: 503 })
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
  const user = await getAuthenticatedUser(request, env, config)
  if (isDeveloper(user, config)) {
    await ensureDeveloperMembership(env, config, user)
    return user
  }
  const membership = await currentMembership(request, env, config, user)
  if (!membership) throw Object.assign(new Error('המשתמש אינו משויך לארגון'), { status: 403 })
  return user
}

async function requireDeveloper(request, env, config) {
  const user = await getAuthenticatedUser(request, env, config)
  if (!isDeveloper(user, config)) throw Object.assign(new Error('הפעולה זמינה למפתח המערכת בלבד'), { status: 403 })
  await ensureDeveloperMembership(env, config, user)
  return user
}

function rolePermissionAllowed(role, permissions, area, action) {
  if (role === 'developer') return true
  if (area === 'connections' && action === 'view') return true
  if (area !== 'connections' && permissions?.[area]?.view === false) return false
  const custom = permissions?.[area]?.[action]
  if (typeof custom === 'boolean') return custom
  if (['connections', 'imports', 'settings'].includes(area)) return false
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

async function requireGoogleAreaAction(request, env, config, area, action) {
  return requireAreaAction(request, env, config, area, action)
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

function localizedExternalError(value, fallback) {
  const message = cleanString(value)
  return /[\u0590-\u05ff]/.test(message) ? message : fallback
}

function inviteRedirectUri(request) {
  const origin = new URL(request.url).origin
  return /localhost|127\.0\.0\.1/i.test(origin) ? `${PRODUCTION_APP_URL}/?invite=1` : `${origin}/?invite=1`
}

function googleTokensKey(userId) {
  return `${GOOGLE_TOKENS_PREFIX}${userId}`
}

const freshGoogleTokens = new WeakMap()
const googleRefreshes = new WeakMap()
async function googleTokens(env, userId) {
  const fresh = freshGoogleTokens.get(env)?.get(userId)
  if (fresh && fresh.until > Date.now()) return fresh.tokens
  return (await env.CONFIG.get(googleTokensKey(userId), 'json')) || null
}

async function putGoogleTokens(env, userId, tokens) {
  await env.CONFIG.put(googleTokensKey(userId), JSON.stringify(tokens))
  if (!freshGoogleTokens.has(env)) freshGoogleTokens.set(env, new Map())
  freshGoogleTokens.get(env).set(userId, { tokens, until: Date.now() + 60000 })
}

async function validGoogleAccessToken(env, config, userId, force = false) {
  if (!googleRefreshes.has(env)) googleRefreshes.set(env, new Map())
  const pending = googleRefreshes.get(env)
  if (pending.has(userId)) return pending.get(userId)
  const operation = refreshGoogleAccessToken(env, config, userId, force)
  pending.set(userId, operation)
  try { return await operation } finally { if (pending.get(userId) === operation) pending.delete(userId) }
}
async function refreshGoogleAccessToken(env, config, userId, force = false) {
  const stored = await googleTokens(env, userId)
  if (!stored?.refresh_token && !stored?.access_token) throw Object.assign(new Error('Google Workspace עדיין לא מחובר לחשבון שלך'), { status: 409 })
  if (!force && stored.access_token && Number(stored.expires_at || 0) > Date.now() + 60_000) return stored.access_token
  if (!stored.refresh_token) throw Object.assign(new Error('חיבור Google שלך פג. יש להתחבר מחדש בהגדרות.'), { status: 409 })
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
  if (!response.ok || !body.access_token) throw Object.assign(new Error(localizedExternalError(body.error_description, 'לא ניתן לרענן את חיבור Google')), { status: 502 })
  const next = { ...stored, access_token: body.access_token, expires_at: Date.now() + Number(body.expires_in || 3600) * 1000 }
  await putGoogleTokens(env, userId, next)
  return next.access_token
}

async function googleFetch(env, config, userId, url, init = {}) {
  const execute = async () => {
    let token = await validGoogleAccessToken(env, config, userId)
    let response = await fetch(url, { ...init, headers: { authorization: `Bearer ${token}`, ...(init.headers || {}) } })
    if (response.status === 401) {
      token = await validGoogleAccessToken(env, config, userId, true)
      response = await fetch(url, { ...init, headers: { authorization: `Bearer ${token}`, ...(init.headers || {}) } })
    }
    return response
  }
  if (config.dailyGoogleRead && (!init.method || init.method === 'GET')) return cachedGoogleRead(env, userId, url, execute, config.forceGoogleRead)
  return execute()
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
  // Binary MIME parts are attachments, never message text.
  return payload.mimeType?.startsWith('text/') && payload.body?.data ? decodeBase64UrlUtf8(payload.body.data) : ''
}

function mimeHtml(payload) {
  if (!payload || payload.filename) return ''
  if (payload.mimeType === 'text/html' && payload.body?.data) return decodeBase64UrlUtf8(payload.body.data)
  for (const part of payload.parts || []) { const html = mimeHtml(part); if (html) return html }
  return ''
}
async function handleMailSignature(request, env, config) {
  const user = await requireUser(request, env, config)
  const key = `mail-signature:${user.id}`
  if (request.method === 'PUT') {
    const body = await parseBody(request)
    if (typeof body.html !== 'string' || body.html.length > 3 * 1024 * 1024) throw Object.assign(new Error('החתימה גדולה מדי. השתמשו בתמונות קטנות יותר.'), { status: 413 })
    await env.CONFIG.put(key, JSON.stringify({ html: cleanMailHtml(body.html), enabled: body.enabled !== false }))
  }
  return apiJson(request, await env.CONFIG.get(key, 'json') || { html: '', enabled: true })
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
    htmlBody: mimeHtml(message.payload),
    snippet: message.snippet || '',
  }
}

async function handleGoogleAuthUrl(request, env, config) {
  const user = await requireUser(request, env, config)
  if (!config.googleClientId || !config.googleClientSecret) throw Object.assign(new Error('החיבור ל-Google עדיין לא זמין.'), { status: 503 })
  const driveRead = new URL(request.url).searchParams.get('driveRead') === 'true'
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
      ...(driveRead ? ['https://www.googleapis.com/auth/drive.metadata.readonly'] : []),
    ].join(' '),
  })
  return apiJson(request, { url: `https://accounts.google.com/o/oauth2/v2/auth?${params}` })
}

async function handleGoogleCallback(request, env, config) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code') || ''
  const state = url.searchParams.get('state') || ''
  const oauthError = url.searchParams.get('error')
  if (oauthError) return new Response('חיבור Google בוטל או נכשל.', { status: 400 })
  if (!code || !state) return new Response('החיבור ל-Google נכשל. נסו שוב.', { status: 400 })
  const stateKey = `${OAUTH_STATE_PREFIX}${state}`
  const stateData = await env.CONFIG.get(stateKey, 'json')
  if (!stateData?.userId) return new Response('בקשת החיבור פגה או אינה תקפה.', { status: 400 })
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
  if (!tokenResponse.ok || !tokenBody.access_token) return new Response('לא ניתן להשלים את חיבור Google.', { status: 502 })

  const previous = await googleTokens(env, stateData.userId)
  let email = ''
  const profileResponse = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', { headers: { authorization: `Bearer ${tokenBody.access_token}` } })
  if (profileResponse.ok) email = String((await profileResponse.json()).emailAddress || '')
  const stored = {
    access_token: tokenBody.access_token,
    refresh_token: tokenBody.refresh_token || (email && previous?.email === email ? previous.refresh_token : '') || '',
    expires_at: Date.now() + Number(tokenBody.expires_in || 3600) * 1000,
    scope: tokenBody.scope || '',
    email,
    connectedBy: stateData.email || '',
    connectedAt: new Date().toISOString(),
  }
  await env.CONFIG.put(`google-read-epoch:${stateData.userId}`, crypto.randomUUID())
  await putGoogleTokens(env, stateData.userId, stored)
  return Response.redirect(`${url.origin}/?google=connected#app?page=settings`, 302)
}

async function handleGmailThread(request, env, config) {
  const user = await requireGoogleAreaAction(request, env, config, 'communication', 'view')
  const threadId = new URL(request.url).searchParams.get('threadId') || ''
  if (!threadId) throw Object.assign(new Error('לא נמצאה התכתבות.'), { status: 400 })
  const response = await googleFetch(env, config, user.id, `https://gmail.googleapis.com/gmail/v1/users/me/threads/${encodeURIComponent(threadId)}?format=full`)
  const body = await response.json()
  if (!response.ok) throw Object.assign(new Error(localizedExternalError(body.error?.message, 'טעינת שרשור Gmail נכשלה')), { status: response.status })
  return apiJson(request, { messages: (body.messages || []).map(normalizeGmailMessage) })
}

async function handleGmailImages(request, env, config) {
  const user = await requireGoogleAreaAction(request, env, config, 'communication', 'view')
  const id = new URL(request.url).searchParams.get('messageId') || ''
  if (!/^[a-zA-Z0-9_-]{1,160}$/.test(id)) throw Object.assign(new Error('מזהה הודעה לא תקין'), { status: 400 })
  const response = await googleFetch(env, config, user.id, `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(id)}?format=full`)
  if (!response.ok) throw Object.assign(new Error('טעינת תמונות ההודעה נכשלה'), { status: response.status })
  const payload = (await response.json()).payload
  const parts = []; const collect = (part) => { if (!part) return; parts.push(part); for (const child of part.parts || []) collect(child) }; collect(payload)
  const images = {}; let total = 0
  for (const part of parts) {
    const cid = headerValue(part.headers, 'Content-ID').replace(/^<|>$/g, '')
    if (!cid || !/^image\/(png|jpeg|gif|webp)$/.test(part.mimeType) || part.body?.size > 2 * 1024 * 1024 || Object.keys(images).length >= 10) continue
    let data = part.body?.data
    if (!data && part.body?.attachmentId) {
      const attachment = await googleFetch(env, config, user.id, `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(id)}/attachments/${encodeURIComponent(part.body.attachmentId)}`)
      if (!attachment.ok) throw Object.assign(new Error('טעינת תמונה מצורפת נכשלה'), { status: attachment.status })
      data = (await attachment.json()).data
    }
    if (!data || data.length > 3 * 1024 * 1024) continue
    total += data.length * 3 / 4; if (total > 8 * 1024 * 1024) break
    images[cid] = `data:${part.mimeType};base64,${data.replace(/-/g, '+').replace(/_/g, '/')}`
  }
  return apiJson(request, { images })
}

async function handleGmailLinks(request, env, config) {
  const writing = request.method !== 'GET'
  const user = await requireGoogleAreaAction(request, env, config, 'communication', request.method === 'DELETE' ? 'delete' : writing ? 'edit' : 'view')
  // Never accept an owner ID from the browser. Links belong to the authenticated mailbox.
  const key = `gmail-task-links:${user.id}`
  const links = await env.CONFIG.get(key, 'json') || {}
  if (writing) {
    const body = await parseBody(request)
    const taskId = cleanString(body.taskId)
    const threadId = cleanString(body.threadId)
    if (!taskId || !/^[a-zA-Z0-9_-]{1,160}$/.test(taskId) || (request.method !== 'DELETE' && !/^[a-zA-Z0-9_-]{1,160}$/.test(threadId))) throw Object.assign(new Error('שיוך מייל לא תקין'), { status: 400 })
    if (request.method === 'DELETE') { delete links[taskId]; await env.CONFIG.put(key, JSON.stringify(links)); return apiJson(request, { links }) }
    // Validate the thread against this user's Google account before storing its reference.
    const response = await googleFetch(env, config, user.id, `https://gmail.googleapis.com/gmail/v1/users/me/threads/${encodeURIComponent(threadId)}?format=minimal`)
    if (!response.ok) throw Object.assign(new Error('ההתכתבות אינה זמינה בחשבון Google שלך'), { status: response.status })
    links[taskId] = { threadId, to: cleanString(body.to) }
    await env.CONFIG.put(key, JSON.stringify(links))
  }
  return apiJson(request, { links })
}

async function handleGmailSearch(request, env, config) {
  const user = await requireGoogleAreaAction(request, env, config, 'communication', 'view')
  const query = new URL(request.url).searchParams.get('q') || ''
  const listUrl = new URL('https://gmail.googleapis.com/gmail/v1/users/me/threads')
  if (query) listUrl.searchParams.set('q', query)
  listUrl.searchParams.set('maxResults', '20')
  const response = await googleFetch(env, config, user.id, listUrl.toString())
  const body = await response.json()
  if (!response.ok) throw Object.assign(new Error(localizedExternalError(body.error?.message, 'חיפוש Gmail נכשל')), { status: response.status })
  const summaries = await Promise.all((body.threads || []).slice(0, 20).map(async (thread) => {
    const detail = await googleFetch(env, config, user.id, `https://gmail.googleapis.com/gmail/v1/users/me/threads/${encodeURIComponent(thread.id)}?format=metadata&metadataHeaders=Subject&metadataHeaders=From`)
    if (!detail.ok) return { id: thread.id, snippet: thread.snippet || '' }
    const detailBody = await detail.json()
    const messages = detailBody.messages || []
    const last = messages[messages.length - 1] || {}
    const headers = last.payload?.headers || []
    return { id: thread.id, snippet: last.snippet || thread.snippet || '', subject: headerValue(headers, 'Subject'), from: headerValue(headers, 'From') }
  }))
  return apiJson(request, { threads: summaries })
}

async function buildGmailMessage(body, env, config, userId, draft = false) {
  const to = cleanString(body.to)
  const subject = cleanString(body.subject)
  const text = cleanString(body.body)
  const threadId = cleanString(body.threadId)
  if ((!draft && (!validEmail(to) || !subject || !text)) || /[\r\n]/.test(to)) throw Object.assign(new Error('יש להזין נמען תקין, נושא ותוכן'), { status: 400 })
  const attachments = validatedAttachments(body.attachments)
  const encodedSubject = `=?UTF-8?B?${utf8ToBase64(subject)}?=`
  const rich = mailContent(body.html || '')
  if (rich.inline.reduce((sum, file) => sum + file.data.length * 3 / 4, 0) + attachments.reduce((sum, file) => sum + file.data.length * 3 / 4, 0) > 18 * 1024 * 1024) throw Object.assign(new Error('Message exceeds 18 MB'), { status: 413 })
  const encodedBody = utf8ToBase64(text)
  const replyHeaders = []
  if (threadId && !draft) {
    const thread = await googleFetch(env, config, userId, `https://gmail.googleapis.com/gmail/v1/users/me/threads/${encodeURIComponent(threadId)}?format=metadata&metadataHeaders=Message-ID&metadataHeaders=References`)
    if (!thread.ok) throw Object.assign(new Error('ההתכתבות אינה זמינה בחשבון שלך'), { status: thread.status })
    const headers = (await thread.json()).messages?.at(-1)?.payload?.headers || []
    const messageId = headerValue(headers, 'Message-ID').replace(/[\r\n]/g, '').slice(0, 1000)
    const references = headerValue(headers, 'References').replace(/[\r\n]/g, '').slice(-3000)
    if (messageId) replyHeaders.push(`In-Reply-To: ${messageId}`, `References: ${references ? `${references} ` : ''}${messageId}`)
  }
  const boundary = `rameng_${crypto.randomUUID()}`
  const textPart = ['Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', wrapBase64(encodedBody)].join('\r\n')
  let contentPart = textPart
  if (rich.html) {
    const alternative = `alternative_${crypto.randomUUID()}`
    contentPart = [`Content-Type: multipart/alternative; boundary="${alternative}"`, '', `--${alternative}`, textPart, `--${alternative}`, 'Content-Type: text/html; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', wrapBase64(utf8ToBase64(rich.html)), `--${alternative}--`].join('\r\n')
    if (rich.inline.length) {
      const related = `related_${crypto.randomUUID()}`
      contentPart = [`Content-Type: multipart/related; boundary="${related}"`, '', `--${related}`, contentPart, ...rich.inline.flatMap((image) => [`--${related}`, `Content-Type: ${image.type}`, `Content-ID: <${image.id}>`, 'Content-Disposition: inline', 'Content-Transfer-Encoding: base64', '', wrapBase64(image.data)]), `--${related}--`].join('\r\n')
    }
  }
  const rfc822 = [
    ...(validEmail(to) ? [`To: ${to}`] : []),
    `Subject: ${encodedSubject}`,
    ...replyHeaders,
    'MIME-Version: 1.0',
    ...(attachments.length ? [`Content-Type: multipart/mixed; boundary="${boundary}"`, '', `--${boundary}`, contentPart,
      ...attachments.flatMap((file) => [`--${boundary}`, `Content-Type: ${file.type}`, `Content-Disposition: attachment; filename="attachment"; filename*=UTF-8''${encodeURIComponent(file.name)}`, 'Content-Transfer-Encoding: base64', '', wrapBase64(file.data)]), `--${boundary}--`, ''] : [contentPart]),
  ].join('\r\n')
  return { raw: utf8ToBase64Url(rfc822), ...(threadId ? { threadId } : {}) }
}

async function draftKey(userId, context) {
  if (!context || typeof context !== 'string' || context.length > 1000) throw Object.assign(new Error('Invalid draft context'), { status: 400 })
  return `mail-draft:${userId}:${await googleReadHash(context)}`
}

const freshMailDrafts = new WeakMap()
function rememberDraft(env, key, draft) {
  if (!freshMailDrafts.has(env)) freshMailDrafts.set(env, new Map())
  freshMailDrafts.get(env).set(key, { draft, until: Date.now() + 60000 })
}
async function readMailDraft(env, key) {
  const fresh = freshMailDrafts.get(env)?.get(key)
  if (fresh && fresh.until > Date.now()) return fresh.draft
  const draft = await env.CONFIG.get(key, 'json')
  if (!draft) return null
  const sent = await env.CONFIG.get(`${key}:sent`, 'json')
  if (sent && sent.at >= draft.updatedAt) return null
  const google = await env.CONFIG.get(`${key}:gmail`, 'json')
  return { ...draft, draftId: google?.draftId || '', synced: google?.updatedAt === draft.updatedAt }
}

async function handleGmailDraft(request, env, config) {
  const user = await requireGoogleAreaAction(request, env, config, 'communication', request.method === 'GET' ? 'view' : 'create')
  if (request.method === 'GET') return apiJson(request, { draft: await readMailDraft(env, await draftKey(user.id, new URL(request.url).searchParams.get('key'))) })
  const body = await parseBody(request)
  if (body.ownerId && body.ownerId !== user.id) throw Object.assign(new Error('Draft owner changed; reopen the composer'), { status: 409 })
  const key = await draftKey(user.id, body.key)
  const payload = await buildGmailMessage(body, env, config, user.id, true)
  const previous = await readMailDraft(env, key)
  const saved = { ...body, html: cleanMailHtml(body.html || ''), attachments: validatedAttachments(body.attachments), draftId: cleanString(body.draftId) || previous?.draftId || '', updatedAt: new Date().toISOString(), synced: false }
  if (new TextEncoder().encode(JSON.stringify(saved)).length > 24 * 1024 * 1024) throw Object.assign(new Error('Draft exceeds storage limit'), { status: 413 })
  await env.CONFIG.put(key, JSON.stringify(saved))
  rememberDraft(env, key, saved)
  try {
    let response = await googleFetch(env, config, user.id, `https://gmail.googleapis.com/gmail/v1/users/me/drafts${saved.draftId ? '/' + encodeURIComponent(saved.draftId) : ''}`, { method: saved.draftId ? 'PUT' : 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ message: payload }) })
    if (response.status === 404 && saved.draftId) response = await googleFetch(env, config, user.id, 'https://gmail.googleapis.com/gmail/v1/users/me/drafts', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ message: payload }) })
    const result = await response.json()
    if (!response.ok) throw new Error('Gmail draft sync failed')
    saved.draftId = result.id; saved.synced = true
    // Separate metadata avoids KV's one-write-per-key-per-second limit.
    await env.CONFIG.put(`${key}:gmail`, JSON.stringify({ draftId: saved.draftId, updatedAt: saved.updatedAt }))
    rememberDraft(env, key, saved)
  } catch { saved.synced = false; rememberDraft(env, key, saved) /* CRM draft remains recoverable during a Google outage. */ }
  return apiJson(request, { draft: saved })
}

async function handleGmailSend(request, env, config) {
  const user = await requireGoogleAreaAction(request, env, config, 'communication', 'create')
  const body = await parseBody(request)
  if (body.ownerId && body.ownerId !== user.id) throw Object.assign(new Error('Mail owner changed; reopen the composer'), { status: 409 })
  const payload = await buildGmailMessage(body, env, config, user.id)
  const saved = body.draftKey ? await readMailDraft(env, await draftKey(user.id, body.draftKey)) : null
  const gmailDraftId = cleanString(body.draftId) || saved?.draftId
  const response = await googleFetch(env, config, user.id, `https://gmail.googleapis.com/gmail/v1/users/me/${gmailDraftId ? 'drafts/send' : 'messages/send'}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(gmailDraftId ? { id: gmailDraftId, message: payload } : payload),
  })
  const result = await response.json()
  if (!response.ok) throw Object.assign(new Error(localizedExternalError(result.error?.message, 'שליחת Gmail נכשלה')), { status: response.status })
  if (body.draftKey) { const key = await draftKey(user.id, body.draftKey); rememberDraft(env, key, null); try { await env.CONFIG.put(`${key}:sent`, JSON.stringify({ at: new Date().toISOString() })) } catch { console.error('Sent message draft cleanup pending') } }
  return apiJson(request, { id: result.id, threadId: result.threadId })
}

async function handleCalendarList(request, env, config) {
  const user = await requireGoogleAreaAction(request, env, config, 'calendar', 'view')
  const url = new URL(request.url)
  const apiUrl = new URL('https://www.googleapis.com/calendar/v3/calendars/primary/events')
  apiUrl.searchParams.set('singleEvents', 'true')
  apiUrl.searchParams.set('orderBy', 'startTime')
  apiUrl.searchParams.set('maxResults', '250')
  const from = url.searchParams.get('from') || new Date(Date.now() - 30 * 86400000).toISOString()
  const to = url.searchParams.get('to') || ''
  apiUrl.searchParams.set('timeMin', new Date(from).toISOString())
  if (to) apiUrl.searchParams.set('timeMax', new Date(to).toISOString())
  const response = await googleFetch(env, config, user.id, apiUrl.toString())
  const body = await response.json()
  if (!response.ok) throw Object.assign(new Error(localizedExternalError(body.error?.message, 'טעינת יומן Google נכשלה')), { status: response.status })
  return apiJson(request, { items: (body.items || []).map((item) => ({ id: item.id, summary: item.summary || '(ללא כותרת)', start: item.start?.dateTime || item.start?.date || '', end: item.end?.dateTime || item.end?.date || '', htmlLink: item.htmlLink || '', location: item.location || '' })) })
}

function validEmail(value) { return typeof value === 'string' && /^[^\s<>@,;"()]+@[^\s<>@,;"()]+\.[^\s<>@,;"()]+$/.test(value) }
function contactEmails(url) {
  const emails = [...new Set((url.searchParams.get('emails') || '').split(',').map((email) => email.trim().toLowerCase()).filter(Boolean))]
  if (!emails.length || emails.length > 20 || emails.some((email) => !validEmail(email))) throw Object.assign(new Error('נדרשת כתובת מייל תקינה של לקוח'), { status: 400 })
  return emails
}
function wrapBase64(value) { return value.match(/.{1,76}/g)?.join('\r\n') || '' }
function validatedAttachments(value) {
  if (value === undefined) return []
  if (!Array.isArray(value) || value.length > 10) throw Object.assign(new Error('ניתן לצרף עד 10 קבצים'), { status: 400 })
  let total = 0
  return value.map((file) => {
    const name = cleanString(file?.name); const data = cleanString(file?.data); const type = cleanString(file?.type) || 'application/octet-stream'
    if (!name || name.length > 250 || /[\r\n]/.test(name) || !/^[\w.+-]+\/[\w.+-]+$/.test(type) || data.length % 4 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(data)) throw Object.assign(new Error('קובץ מצורף לא תקין'), { status: 400 })
    total += data.length * 3 / 4
    if (total > 18 * 1024 * 1024) throw Object.assign(new Error('הקבצים חורגים ממגבלת 18 MB'), { status: 413 })
    return { name, data, type }
  })
}
async function handleContactMail(request, env, config) {
  const user = await requireGoogleAreaAction(request, env, config, 'communication', 'view')
  const url = new URL(request.url); const emails = contactEmails(url)
  const api = new URL('https://gmail.googleapis.com/gmail/v1/users/me/threads')
  api.searchParams.set('q', `{${emails.map((email) => `from:${email} to:${email}`).join(' ')}}`)
  api.searchParams.set('maxResults', '20')
  if (url.searchParams.get('pageToken')) api.searchParams.set('pageToken', url.searchParams.get('pageToken'))
  const response = await googleFetch(env, config, user.id, api.toString()); const body = await response.json()
  if (!response.ok) throw Object.assign(new Error(localizedExternalError(body.error?.message, 'סנכרון מיילים של הלקוח נכשל')), { status: response.status })
  const threads = await Promise.all((body.threads || []).map(async (thread) => {
    const detail = await googleFetch(env, config, user.id, `https://gmail.googleapis.com/gmail/v1/users/me/threads/${encodeURIComponent(thread.id)}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Date`)
    if (!detail.ok) throw Object.assign(new Error('טעינת התכתבות נכשלה. נסו שוב.'), { status: 502 })
    const result = await detail.json(); const last = result.messages?.at(-1) || {}; const headers = last.payload?.headers || []
    return { id: thread.id, subject: headerValue(headers, 'Subject'), from: headerValue(headers, 'From'), to: headerValue(headers, 'To'), date: last.internalDate ? new Date(Number(last.internalDate)).toISOString() : headerValue(headers, 'Date'), snippet: last.snippet || thread.snippet || '' }
  }))
  return apiJson(request, { threads, nextPageToken: body.nextPageToken || '' })
}
async function handleContactCalendar(request, env, config) {
  const user = await requireGoogleAreaAction(request, env, config, 'calendar', 'view')
  const url = new URL(request.url); const emails = new Set(contactEmails(url))
  const from = url.searchParams.get('from') || new Date(Date.now() - 365 * 86400000).toISOString()
  const to = url.searchParams.get('to') || new Date(Date.now() + 365 * 86400000).toISOString()
  if (Number.isNaN(Date.parse(from)) || Number.isNaN(Date.parse(to)) || Date.parse(to) <= Date.parse(from)) throw Object.assign(new Error('טווח תאריכים לא תקין'), { status: 400 })
  const calendarList = new URL('https://www.googleapis.com/calendar/v3/users/me/calendarList'); calendarList.searchParams.set('maxResults', '250'); calendarList.searchParams.set('minAccessRole', 'reader')
  const calendars = []; let calendarPage = ''; let calendarPages = 0
  do {
    if (calendarPage) calendarList.searchParams.set('pageToken', calendarPage)
    const response = await googleFetch(env, config, user.id, calendarList.toString()); const body = await response.json()
    if (!response.ok) throw Object.assign(new Error('טעינת רשימת יומני Google נכשלה'), { status: response.status })
    calendars.push(...(body.items || []).filter((calendar) => calendar.primary || calendar.selected !== false))
    calendarPage = body.nextPageToken || ''; calendarPages++
  } while (calendarPage && calendarPages < 10)
  if (calendarPage || calendars.length > 50) throw Object.assign(new Error('לא ניתן לסנכרן את כל היומנים כרגע'), { status: 413 })
  const items = []; const seen = new Set()
  for (const calendar of calendars.length ? calendars : [{ id: 'primary', summary: 'Google' }]) {
  const api = new URL(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendar.id)}/events`)
  for (const [key, value] of Object.entries({ singleEvents: 'true', orderBy: 'startTime', maxResults: '250', timeMin: new Date(from).toISOString(), timeMax: new Date(to).toISOString() })) api.searchParams.set(key, value)
  let pageToken = ''; let pages = 0
  do {
    if (pageToken) api.searchParams.set('pageToken', pageToken)
    const response = await googleFetch(env, config, user.id, api.toString()); const body = await response.json()
    if (!response.ok) throw Object.assign(new Error(localizedExternalError(body.error?.message, 'סנכרון אירועי הלקוח נכשל')), { status: response.status })
    for (const item of body.items || []) {
      if (item.status === 'cancelled' || ![item.organizer?.email, item.creator?.email, ...(item.attendees || []).map((attendee) => attendee.email)].some((email) => emails.has(String(email || '').toLowerCase()))) continue
      const start = item.start?.dateTime || item.start?.date || ''; const unique = `${item.iCalUID || `${calendar.id}:${item.id}`}:${start}`
      if (seen.has(unique)) continue
      seen.add(unique)
      items.push({ id: `${calendar.id}:${item.id}`, summary: item.summary || '(ללא כותרת)', start, end: item.end?.dateTime || item.end?.date || '', htmlLink: item.htmlLink || '', location: item.location || '', calendarName: calendar.summary || '' })
    }
    pageToken = body.nextPageToken || ''; pages++
  } while (pageToken && pages < 20)
  if (pageToken) throw Object.assign(new Error('טווח היומן גדול מדי. צמצמו את התאריכים ונסו שוב.'), { status: 413 })
  }
  items.sort((a, b) => b.start.localeCompare(a.start))
  return apiJson(request, { items })
}

function isoWithDefaultEnd(start, end) {
  const startDate = new Date(start)
  if (end) return new Date(end).toISOString()
  return new Date(startDate.getTime() + 60 * 60 * 1000).toISOString()
}

async function handleCalendarCreate(request, env, config) {
  const user = await requireGoogleAreaAction(request, env, config, 'calendar', 'create')
  const body = await parseBody(request)
  const summary = cleanString(body.summary)
  const start = cleanString(body.start)
  if (!summary || !start || Number.isNaN(new Date(start).getTime())) throw Object.assign(new Error('כותרת ותאריך התחלה תקינים נדרשים'), { status: 400 })
  const end = cleanString(body.end)
  if (end && (Number.isNaN(new Date(end).getTime()) || new Date(end) <= new Date(start))) throw Object.assign(new Error('מועד הסיום חייב להיות אחרי מועד ההתחלה'), { status: 400 })
  const event = {
    summary,
    description: cleanString(body.description),
    location: cleanString(body.location),
    start: { dateTime: new Date(start).toISOString(), timeZone: 'Asia/Jerusalem' },
    end: { dateTime: isoWithDefaultEnd(start, end), timeZone: 'Asia/Jerusalem' },
  }
  const response = await googleFetch(env, config, user.id, 'https://www.googleapis.com/calendar/v3/calendars/primary/events', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(event),
  })
  const result = await response.json()
  if (!response.ok) throw Object.assign(new Error(localizedExternalError(result.error?.message, 'יצירת האירוע ביומן Google נכשלה')), { status: response.status })
  return apiJson(request, { id: result.id, htmlLink: result.htmlLink || '' })
}

function escapeDriveQuery(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'")
}

async function handleDriveProjectFolder(request, env, config) {
  const user = await requireGoogleAreaAction(request, env, config, 'files', 'create')
  const body = await parseBody(request)
  const projectId = cleanString(body.projectId)
  const name = cleanString(body.name)
  const parentId = cleanString(body.parentId) || 'root'
  if (!projectId) throw Object.assign(new Error('חסר מזהה פרויקט'), { status: 400 })
  const key = `drive-project-folder:${user.id}:${projectId}`
  const stored = await env.CONFIG.get(key, 'json')
  const requestedId = cleanString(body.folderId)
  const folderId = requestedId || stored?.id
  if (folderId) {
    if (!/^[a-zA-Z0-9_-]+$/.test(folderId)) throw Object.assign(new Error('מזהה תיקייה לא תקין'), { status: 400 })
    const folderResponse = await googleFetch(env, config, user.id, `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(folderId)}?fields=id,name,mimeType,trashed,webViewLink,capabilities(canAddChildren)&supportsAllDrives=true`)
    const folder = await folderResponse.json()
    if (!folderResponse.ok || folder.trashed || folder.mimeType !== 'application/vnd.google-apps.folder') throw Object.assign(new Error('בחרו את התיקייה דרך בוחר Google כדי להעניק גישה. אם עדיין אינה זמינה, בדקו שהיא משותפת עם החשבון המחובר.'), { status: folderResponse.ok ? 400 : folderResponse.status })
    if (body.readOnly === false && folder.capabilities?.canAddChildren === false) throw Object.assign(new Error('יש לכם הרשאת צפייה בלבד בתיקייה. להעלאה נדרשת הרשאת עריכה.'), { status: 403 })
    const protectedFolder = Boolean(await env.CONFIG.get(`drive-protected-folder:${folder.id}`, 'json'))
    const result = { id: folder.id, name: folder.name, readOnly: protectedFolder || body.readOnly !== false, protected: protectedFolder, webViewLink: folder.webViewLink || `https://drive.google.com/drive/folders/${folder.id}` }
    await env.CONFIG.put(key, JSON.stringify(result))
    return apiJson(request, result)
  }
  if (!name) throw Object.assign(new Error('חסר שם פרויקט'), { status: 400 })

  const search = new URL('https://www.googleapis.com/drive/v3/files')
  search.searchParams.set('q', `'${escapeDriveQuery(parentId)}' in parents and name='${escapeDriveQuery(name)}' and mimeType='application/vnd.google-apps.folder' and trashed=false`)
  search.searchParams.set('fields', 'files(id,name,webViewLink)')
  search.searchParams.set('pageSize', '10')
  const searchResponse = await googleFetch(env, config, user.id, search.toString())
  const searchBody = await searchResponse.json()
  if (!searchResponse.ok) throw Object.assign(new Error(localizedExternalError(searchBody.error?.message, 'חיפוש התיקייה ב-Drive נכשל')), { status: searchResponse.status })
  if (searchBody.files?.[0]) { const folder = { id: searchBody.files[0].id, webViewLink: searchBody.files[0].webViewLink || `https://drive.google.com/drive/folders/${searchBody.files[0].id}` }; await env.CONFIG.put(key, JSON.stringify(folder)); return apiJson(request, folder) }

  const response = await googleFetch(env, config, user.id, 'https://www.googleapis.com/drive/v3/files?fields=id,name,webViewLink', {
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
  if (!response.ok) throw Object.assign(new Error(localizedExternalError(result.error?.message, 'יצירת התיקייה ב-Drive נכשלה')), { status: response.status })
  const folder = { id: result.id, webViewLink: result.webViewLink || `https://drive.google.com/drive/folders/${result.id}` }; await env.CONFIG.put(key, JSON.stringify(folder)); return apiJson(request, folder)
}

async function handleDriveProjectFolderRead(request, env, config) {
  const user = await requireGoogleAreaAction(request, env, config, 'files', request.method === 'DELETE' ? 'delete' : 'view')
  const projectId = new URL(request.url).searchParams.get('projectId') || ''
  if (request.method === 'DELETE') { await env.CONFIG.delete(`drive-project-folder:${user.id}:${projectId}`); return apiJson(request, { folder: null }) }
  const folder = await env.CONFIG.get(`drive-project-folder:${user.id}:${projectId}`, 'json') || null
  if (folder && await env.CONFIG.get(`drive-protected-folder:${folder.id}`, 'json')) { folder.readOnly = true; folder.protected = true }
  return apiJson(request, { folder })
}

async function handleDriveFiles(request, env, config) {
  const user = await requireGoogleAreaAction(request, env, config, 'files', 'view')
  const folderId = new URL(request.url).searchParams.get('folderId') || ''
  if (!folderId) throw Object.assign(new Error('חסר מזהה תיקייה'), { status: 400 })
  const url = new URL('https://www.googleapis.com/drive/v3/files')
  url.searchParams.set('q', `'${escapeDriveQuery(folderId)}' in parents and trashed=false`)
  url.searchParams.set('orderBy', 'modifiedTime desc')
  url.searchParams.set('pageSize', '100')
  url.searchParams.set('supportsAllDrives', 'true')
  url.searchParams.set('includeItemsFromAllDrives', 'true')
  url.searchParams.set('fields', 'files(id,name,mimeType,modifiedTime,webViewLink,size),nextPageToken')
  const source = new URL(request.url)
  if (source.searchParams.get('pageToken')) url.searchParams.set('pageToken', source.searchParams.get('pageToken'))
  const response = await googleFetch(env, config, user.id, url.toString())
  const body = await response.json()
  if (!response.ok) throw Object.assign(new Error(localizedExternalError(body.error?.message, 'טעינת הקבצים מ-Drive נכשלה')), { status: response.status })
  return apiJson(request, { files: body.files || [], nextPageToken: body.nextPageToken || '', completeAccess: Boolean((await googleTokens(env, user.id))?.scope?.split(' ').some((scope) => ['https://www.googleapis.com/auth/drive.metadata.readonly', 'https://www.googleapis.com/auth/drive.readonly', 'https://www.googleapis.com/auth/drive'].includes(scope))) })
}

async function handleDriveFolders(request, env, config) {
  const user = await requireGoogleAreaAction(request, env, config, 'files', 'view')
  const source = new URL(request.url); const api = new URL('https://www.googleapis.com/drive/v3/files')
  const query = cleanString(source.searchParams.get('q'))
  api.searchParams.set('q', `mimeType='application/vnd.google-apps.folder' and trashed=false${query ? ` and name contains '${escapeDriveQuery(query)}'` : ''}`)
  api.searchParams.set('pageSize', '100'); api.searchParams.set('fields', 'files(id,name,webViewLink),nextPageToken'); api.searchParams.set('orderBy', 'name')
  api.searchParams.set('supportsAllDrives', 'true'); api.searchParams.set('includeItemsFromAllDrives', 'true')
  if (source.searchParams.get('pageToken')) api.searchParams.set('pageToken', source.searchParams.get('pageToken'))
  const response = await googleFetch(env, config, user.id, api.toString()); const body = await response.json()
  if (!response.ok) throw Object.assign(new Error(localizedExternalError(body.error?.message, 'טעינת תיקיות Drive נכשלה')), { status: response.status })
  return apiJson(request, { folders: body.files || [], nextPageToken: body.nextPageToken || '' })
}
async function handleDrivePicker(request, env, config) {
  const user = await requireGoogleAreaAction(request, env, config, 'files', 'create')
  const token = await validGoogleAccessToken(env, config, user.id)
  const tokens = await googleTokens(env, user.id)
  return apiJson(request, { token, apiKey: config.googlePickerApiKey || '', appId: String(config.googleClientId || '').split('-')[0], email: tokens?.email || '' })
}
async function handleDriveSettings(request, env, config) {
  const user = await requireGoogleAreaAction(request, env, config, 'files', request.method === 'PUT' ? 'create' : 'view')
  const key = `drive-settings:${user.id}`
  const current = { autoFiles: true, autoReports: true, ...(await env.CONFIG.get(key, 'json') || {}) }
  if (request.method === 'PUT') {
    const body = await parseBody(request)
    for (const field of ['autoFiles', 'autoReports']) if (typeof body[field] === 'boolean') current[field] = body[field]
    await env.CONFIG.put(key, JSON.stringify(current))
  }
  return apiJson(request, current)
}
async function handleDriveUpload(request, env, config) {
  const body = await parseBody(request); const kind = body.kind === 'report' ? 'report' : 'file'
  const user = await requireGoogleAreaAction(request, env, config, 'files', 'create')
  if (kind === 'report') await requireAreaAction(request, env, config, 'reports', 'view')
  return apiJson(request, await uploadGoogleDriveFile(env, config, user.id, body))
}

async function uploadGoogleDriveFile(env, config, userId, body, queued = false) {
  const kind = body.kind === 'report' ? 'report' : 'file'
  const projectId = cleanString(body.projectId); const recordId = cleanString(body.recordId)
  if (!/^[a-zA-Z0-9_-]{1,160}$/.test(projectId) || !/^[a-zA-Z0-9_-]{1,160}$/.test(recordId)) throw Object.assign(new Error('חסר שיוך לפרויקט או לקובץ'), { status: 400 })
  const settings = { autoFiles: true, autoReports: true, ...(await env.CONFIG.get(`drive-settings:${userId}`, 'json') || {}) }
  if (body.automatic !== false && !(kind === 'report' ? settings.autoReports : settings.autoFiles)) return { skipped: true, reason: 'disabled' }
  const folder = await env.CONFIG.get(`drive-project-folder:${userId}:${projectId}`, 'json')
  if (!folder) return { skipped: true, reason: 'unlinked' }
  if (folder.readOnly || await env.CONFIG.get(`drive-protected-folder:${folder.id}`, 'json')) return { skipped: true, reason: 'read-only-folder' }
  const [file] = validatedAttachments([body.file])
  if (body.automatic === true && !queued) return queueDriveUpload(env, userId, { ...body, projectId, recordId, kind, file }, (await googleTokens(env, userId))?.email || '')
  const pendingKey = `drive-pending:${userId}:${projectId}:${kind}:${recordId}`
  const pendingBefore = queued ? null : await env.CONFIG.get(pendingKey, 'json')
  const finish = async (result) => {
    if (pendingBefore && (await env.CONFIG.get(pendingKey, 'json'))?.version === pendingBefore.version) await env.CONFIG.delete(pendingKey)
    return result
  }
  const binary = atob(file.data); const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index)
  const contentHash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), (byte) => byte.toString(16).padStart(2, '0')).join('')
  const fingerprint = `${file.name}:${file.type}:${contentHash}`
  const stateKey = `drive-upload:${userId}:${projectId}:${kind}:${recordId}`
  const previous = await env.CONFIG.get(stateKey, 'json')
  if (previous?.fingerprint === fingerprint && previous?.folderId === folder.id) {
    const check = await googleFetch(env, config, userId, `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(previous.id)}?fields=id,trashed,parents&supportsAllDrives=true`)
    const checked = await check.json()
    if (check.ok && !checked.trashed && checked.parents?.includes(folder.id)) return finish({ id: previous.id, webViewLink: previous.webViewLink, unchanged: true })
    if (!check.ok && check.status !== 404) throw Object.assign(new Error('בדיקת קובץ Drive נכשלה. נסו שוב.'), { status: check.status })
  }
  const lookup = new URL('https://www.googleapis.com/drive/v3/files')
  lookup.searchParams.set('q', `'${escapeDriveQuery(folder.id)}' in parents and trashed=false and appProperties has { key='ramengRecordId' and value='${escapeDriveQuery(recordId)}' } and appProperties has { key='ramengKind' and value='${kind}' }`)
  lookup.searchParams.set('fields', 'files(id,webViewLink)'); lookup.searchParams.set('supportsAllDrives', 'true'); lookup.searchParams.set('includeItemsFromAllDrives', 'true')
  const found = await googleFetch(env, config, userId, lookup.toString()); const foundBody = await found.json()
  if (!found.ok) throw Object.assign(new Error('לא ניתן לבדוק את תיקיית Drive. הקובץ נשמר במערכת; נסו שוב.'), { status: found.status })
  const existing = foundBody.files?.[0]
  const boundary = `rameng_${crypto.randomUUID()}`
  const metadata = { name: file.name, mimeType: file.type, ...(existing ? {} : { parents: [folder.id], appProperties: { ramengProjectId: projectId, ramengRecordId: recordId, ramengKind: kind } }) }
  const multipart = new Blob([`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: ${file.type}\r\n\r\n`, bytes, `\r\n--${boundary}--\r\n`])
  const endpoint = `https://www.googleapis.com/upload/drive/v3/files${existing ? `/${encodeURIComponent(existing.id)}` : ''}?uploadType=multipart&supportsAllDrives=true&fields=id,name,webViewLink`
  const response = await googleFetch(env, config, userId, endpoint, { method: existing ? 'PATCH' : 'POST', headers: { 'content-type': `multipart/related; boundary=${boundary}` }, body: multipart })
  const result = await response.json()
  if (!response.ok) throw Object.assign(new Error(localizedExternalError(result.error?.message, 'העלאה ל-Drive נכשלה. הקובץ נשמר במערכת; נסו שוב.')), { status: response.status })
  const webViewLink = result.webViewLink || `https://drive.google.com/file/d/${result.id}/view`
  await env.CONFIG.put(stateKey, JSON.stringify({ id: result.id, webViewLink, folderId: folder.id, fingerprint }))
  return finish({ id: result.id, webViewLink })
}

function photonAddressLabel(feature) {
  const props = feature?.properties || {}
  const street = [props.street || props.name, props.housenumber].filter(Boolean).join(' ').trim()
  const locality = props.city || props.town || props.village || props.locality || props.district || props.county
  const parts = [street, locality, props.state, props.postcode, props.country].map((value) => cleanString(value)).filter(Boolean)
  return [...new Set(parts)].join(', ')
}

async function handleAddressSuggest(request, env, config) {
  await requireAreaAction(request, env, config, 'projects', 'view')
  const url = new URL(request.url)
  const query = cleanString(url.searchParams.get('q')).slice(0, 120)
  if (query.length < 2) return apiJson(request, { suggestions: [] })

  const uniqueSuggestions = (items) => {
    const seen = new Set()
    return items
      .map((item) => cleanString(item))
      .filter((label) => label && !seen.has(label.toLowerCase()) && seen.add(label.toLowerCase()))
      .slice(0, 8)
      .map((label) => ({ label, value: label }))
  }

  if (config.googleMapsApiKey) {
    try {
      const response = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'X-Goog-Api-Key': config.googleMapsApiKey,
          'X-Goog-FieldMask': 'suggestions.placePrediction.text,suggestions.placePrediction.structuredFormat',
        },
        body: JSON.stringify({
          input: query,
          languageCode: 'he',
          regionCode: 'IL',
          includedRegionCodes: ['il'],
          locationBias: {
            rectangle: {
              low: { latitude: 29.4, longitude: 34.2 },
              high: { latitude: 33.4, longitude: 35.95 },
            },
          },
        }),
      })
      if (response.ok) {
        const body = await response.json().catch(() => ({}))
        const google = uniqueSuggestions((body.suggestions || []).map((item) => item?.placePrediction?.text?.text))
        if (google.length) return apiJson(request, { suggestions: google, source: 'google' })
      }
    } catch (error) {
      console.warn('Google Places autocomplete failed', error)
    }
  }

  try {
    const response = await fetch('https://www.govmap.gov.il/api/search-service/autocomplete', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        'accept-language': 'he',
        'user-agent': 'RAM-Engineering-CRM/1.0',
      },
      body: JSON.stringify({
        searchText: query,
        language: 'he',
        isAccurate: true,
        maxResults: 10,
      }),
    })
    if (response.ok) {
      const body = await response.json().catch(() => ({}))
      const rows = Array.isArray(body?.results) ? body.results : Array.isArray(body?.data?.results) ? body.data.results : []
      const govmap = uniqueSuggestions(rows.map((item) => item?.text || item?.value || item?.label))
      if (govmap.length) return apiJson(request, { suggestions: govmap, source: 'govmap' })
    }
  } catch (error) {
    console.warn('GovMap autocomplete failed', error)
  }

  try {
    const nominatim = new URL('https://nominatim.openstreetmap.org/search')
    nominatim.searchParams.set('q', query)
    nominatim.searchParams.set('format', 'jsonv2')
    nominatim.searchParams.set('limit', '7')
    nominatim.searchParams.set('countrycodes', 'il')
    nominatim.searchParams.set('accept-language', 'he')
    nominatim.searchParams.set('addressdetails', '1')
    nominatim.searchParams.set('namedetails', '1')
    nominatim.searchParams.set('viewbox', '34.2,33.4,35.95,29.4')
    nominatim.searchParams.set('bounded', '1')
    const response = await fetch(nominatim.toString(), {
      headers: { accept: 'application/json', 'accept-language': 'he', 'user-agent': 'RAM-Engineering-CRM/1.0' },
    })
    if (response.ok) {
      const body = await response.json().catch(() => [])
      const osm = uniqueSuggestions((Array.isArray(body) ? body : []).map((item) => item?.display_name))
      if (osm.length) return apiJson(request, { suggestions: osm, source: 'openstreetmap' })
    }
  } catch (error) {
    console.warn('OpenStreetMap autocomplete failed', error)
  }

  return apiJson(request, { suggestions: [], source: 'none' })
}

async function handleAiRewrite(request, env, config) {
  await requireAnyAreaAction(request, env, config, [
    { area: 'reports', action: 'edit' },
    { area: 'communication', action: 'edit' },
  ])
  if (!config.openaiApiKey) throw Object.assign(new Error('הכלי אינו זמין כרגע.'), { status: 409 })
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
  if (!response.ok) throw Object.assign(new Error(localizedExternalError(result.error?.message, 'שגיאה בחיבור לשירות הבינה המלאכותית')), { status: response.status })
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
  if (listResult.error) throw Object.assign(new Error('לא ניתן לבדוק את רשימת המשתמשים'), { status: 502 })
  let targetUser = (listResult.data.users || []).find((item) => String(item.email || '').toLowerCase() === email)
  const existed = Boolean(targetUser)
  let invited = false

  if (!targetUser) {
    const invite = await admin.auth.admin.inviteUserByEmail(email, {
      data: name ? { full_name: name } : undefined,
      redirectTo: inviteRedirectUri(request),
    })
    if (invite.error || !invite.data.user) throw Object.assign(new Error('שליחת ההזמנה נכשלה'), { status: 502 })
    targetUser = invite.data.user
    invited = true
  } else if (name && !targetUser.user_metadata?.full_name) {
    const update = await admin.auth.admin.updateUserById(targetUser.id, { user_metadata: { ...(targetUser.user_metadata || {}), full_name: name } })
    if (!update.error && update.data.user) targetUser = update.data.user
  }

  const role = developerEmails(config).includes(email) ? 'developer' : requestedRole
  const membership = await admin.from('memberships').upsert({ org_id: orgId, user_id: targetUser.id, role }, { onConflict: 'org_id,user_id' })
  if (membership.error) throw Object.assign(new Error('לא ניתן לשייך את המשתמש לארגון'), { status: 502 })

  return apiJson(request, { ok: true, invited, existing: existed, email, userId: targetUser.id, role })
}

async function managedOrganizationUser(request, env, config, body) {
  const orgId = cleanString(body.orgId)
  const userId = cleanString(body.userId)
  if (!orgId || !userId) throw Object.assign(new Error('חסרים פרטי המשתמש או הארגון'), { status: 400 })

  const actor = await requireOrgManager(request, env, config, orgId)
  const admin = supabaseAdmin(env, config)
  const membership = await admin.from('memberships').select('user_id, role').eq('org_id', orgId).eq('user_id', userId).maybeSingle()
  if (membership.error || !membership.data) throw Object.assign(new Error('המשתמש אינו משויך לארגון הזה'), { status: 404 })

  const target = await admin.auth.admin.getUserById(userId)
  if (target.error || !target.data.user) throw Object.assign(new Error('המשתמש לא נמצא'), { status: 404 })
  return { actor, admin, membership: membership.data, targetUser: target.data.user }
}

async function handleUserPasswordReset(request, env, config) {
  const body = await parseBody(request)
  const { admin, targetUser } = await managedOrganizationUser(request, env, config, body)
  const email = cleanString(targetUser.email).toLowerCase()
  if (!email) throw Object.assign(new Error('לא מוגדרת כתובת מייל למשתמש הזה'), { status: 409 })

  const result = await admin.auth.resetPasswordForEmail(email, { redirectTo: inviteRedirectUri(request) })
  if (result.error) throw Object.assign(new Error('שליחת הקישור לאיפוס הסיסמה נכשלה'), { status: 502 })
  return apiJson(request, { ok: true, email })
}

async function handleUserDelete(request, env, config) {
  const body = await parseBody(request)
  const { actor, admin, membership, targetUser } = await managedOrganizationUser(request, env, config, body)
  const email = cleanString(targetUser.email).toLowerCase()
  if (actor.id === targetUser.id) throw Object.assign(new Error('לא ניתן למחוק את החשבון שמחובר כעת'), { status: 409 })
  if (membership.role === 'developer' || developerEmails(config).includes(email)) {
    throw Object.assign(new Error('לא ניתן למחוק את חשבון המפתח המוגן'), { status: 403 })
  }

  const result = await admin.auth.admin.deleteUser(targetUser.id)
  if (result.error) throw Object.assign(new Error('מחיקת המשתמש נכשלה. אם המשתמש העלה קבצים, יש להעביר או למחוק אותם תחילה.'), { status: 502 })
  return apiJson(request, { ok: true, email })
}

async function handleAdminBootstrap(request, env) {
  const current = await readConfig(env)
  if (current.supabaseUrl && current.supabaseAnonKey) throw Object.assign(new Error('המערכת כבר הוגדרה. שינויים נוספים מבוצעים ממנהל המערכת.'), { status: 409 })
  const body = await parseBody(request)
  if (!env.ADMIN_SETUP_TOKEN) throw Object.assign(new Error('ההגדרה הראשונית אינה זמינה כרגע.'), { status: 503 })
  if (cleanString(body.setupToken) !== env.ADMIN_SETUP_TOKEN) throw Object.assign(new Error('קוד ההגדרה שגוי.'), { status: 403 })
  const supabaseUrl = cleanString(body.supabaseUrl).replace(/\/$/, '')
  const supabaseAnonKey = cleanString(body.supabaseAnonKey)
  const adminEmails = cleanEmails(body.adminEmails)
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(supabaseUrl) || supabaseAnonKey.length < 40 || !adminEmails.length) throw Object.assign(new Error('יש לבדוק את פרטי ההגדרה.'), { status: 400 })
  const next = {
    organizationName: cleanString(body.organizationName) || 'ר.א.ם הנדסה',
    supabaseUrl,
    supabaseAnonKey,
    adminEmails,
    googleClientId: cleanString(body.googleClientId),
    googleClientSecret: cleanString(body.googleClientSecret),
    googleMapsApiKey: cleanString(body.googleMapsApiKey),
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
      googleMapsApiKey: '',
      googlePickerApiKey: '',
      openaiApiKey: '',
      openaiModel: config.openaiModel || 'gpt-5.6-terra',
      driveRootFolderId: config.driveRootFolderId || '',
    })
  }
  if (request.method !== 'PUT') throw Object.assign(new Error('שיטת הבקשה אינה נתמכת'), { status: 405 })
  const body = await parseBody(request)
  const next = { ...config }
  for (const key of ['organizationName', 'supabaseUrl', 'supabaseAnonKey', 'googleClientId', 'openaiModel', 'driveRootFolderId']) {
    if (body[key] !== undefined) next[key] = cleanString(body[key])
  }
  if (body.adminEmails !== undefined) next.adminEmails = cleanEmails(body.adminEmails)
  if (cleanString(body.googleClientSecret)) next.googleClientSecret = cleanString(body.googleClientSecret)
  if (cleanString(body.googleMapsApiKey)) next.googleMapsApiKey = cleanString(body.googleMapsApiKey)
  if (cleanString(body.googlePickerApiKey)) next.googlePickerApiKey = cleanString(body.googlePickerApiKey)
  if (cleanString(body.openaiApiKey)) next.openaiApiKey = cleanString(body.openaiApiKey)
  next.updatedAt = new Date().toISOString()
  await saveConfig(env, next)
  return apiJson(request, { ok: true })
}

async function handleGoogleConfig(request, env, config) {
  await requireAreaAction(request, env, config, 'connections', 'edit')
  if (request.method === 'GET') {
    return apiJson(request, {
      clientId: config.googleClientId || '',
      secretConfigured: Boolean(config.googleClientSecret),
      redirectUri: redirectUri(request),
    })
  }
  if (request.method !== 'PUT') throw Object.assign(new Error('שיטת הבקשה אינה נתמכת'), { status: 405 })

  const body = await parseBody(request)
  const clientId = cleanString(body.clientId)
  const clientSecret = cleanString(body.clientSecret)
  if (!/^[a-z0-9-]+\.apps\.googleusercontent\.com$/i.test(clientId)) {
    throw Object.assign(new Error('יש להזין מזהה Google תקין.'), { status: 400 })
  }
  if (!clientSecret && !config.googleClientSecret) {
    throw Object.assign(new Error('יש להזין מפתח Google.'), { status: 400 })
  }

  const next = { ...config, googleClientId: clientId, updatedAt: new Date().toISOString() }
  if (clientSecret) next.googleClientSecret = clientSecret
  await saveConfig(env, next)
  return apiJson(request, { ok: true, configured: Boolean(next.googleClientId && next.googleClientSecret) })
}

async function handleStatus(request, env, config) {
  const user = await requireUser(request, env, config)
  const tokens = await googleTokens(env, user.id)
  return apiJson(request, {
    configured: Boolean(config.supabaseUrl && config.supabaseAnonKey),
    google: {
      configured: Boolean(config.googleClientId && config.googleClientSecret),
      connected: Boolean(tokens?.refresh_token || (tokens?.access_token && Number(tokens.expires_at || 0) > Date.now())),
      email: tokens?.email || '',
    },
    openai: { configured: Boolean(config.openaiApiKey) },
    users: { invitationsConfigured: Boolean(cleanString(env.SUPABASE_SECRET_KEY)) },
  })
}

async function routeApi(request, env) {
  const url = new URL(request.url)
  const path = url.pathname
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(request) })
  let config = await readConfig(env)
  if (request.method === 'GET' && ['/api/google/gmail/thread', '/api/google/gmail/search', '/api/google/gmail/contacts', '/api/google/calendar/contacts', '/api/google/calendar/events', '/api/google/drive/files', '/api/google/drive/folders'].includes(path)) config = { ...config, dailyGoogleRead: true, forceGoogleRead: url.searchParams.get('force') === 'true' }

  if (path === '/api/public-config' && request.method === 'GET') return apiJson(request, publicConfig(config))
  if (path === '/api/admin/bootstrap' && request.method === 'POST') return handleAdminBootstrap(request, env)
  if (path === '/api/google/callback' && request.method === 'GET') return handleGoogleCallback(request, env, config)
  if (path === '/api/admin/config') return handleAdminConfig(request, env, config)
  if (path === '/api/users/invite' && request.method === 'POST') return handleUserInvite(request, env, config)
  if (path === '/api/users/password-reset' && request.method === 'POST') return handleUserPasswordReset(request, env, config)
  if (path === '/api/users/delete' && request.method === 'POST') return handleUserDelete(request, env, config)
  if (path === '/api/integrations/status' && request.method === 'GET') return handleStatus(request, env, config)
  if (path === '/api/google/config' && ['GET', 'PUT'].includes(request.method)) return handleGoogleConfig(request, env, config)
  if (path === '/api/google/auth-url' && request.method === 'GET') return handleGoogleAuthUrl(request, env, config)
  if (path === '/api/profile/signature' && ['GET', 'PUT'].includes(request.method)) return handleMailSignature(request, env, config)
  if (path === '/api/google/gmail/images' && request.method === 'GET') return handleGmailImages(request, env, config)
  if (path === '/api/google/gmail/thread' && request.method === 'GET') return handleGmailThread(request, env, config)
  if (path === '/api/google/gmail/links' && ['GET', 'PUT', 'DELETE'].includes(request.method)) return handleGmailLinks(request, env, config)
  if (path === '/api/google/gmail/search' && request.method === 'GET') return handleGmailSearch(request, env, config)
  if (path === '/api/google/gmail/contacts' && request.method === 'GET') return handleContactMail(request, env, config)
  if (path === '/api/google/calendar/contacts' && request.method === 'GET') return handleContactCalendar(request, env, config)
  if (path === '/api/google/sync' && request.method === 'POST') {
    const user = await requireUser(request, env, config); const body = await parseBody(request)
    const reads = body.feedsDone ? { cursor: '', refreshed: 0, failed: 0 } : await refreshGoogleReads(env, (userId, providerUrl) => googleFetch(env, config, userId, providerUrl), { userId: user.id, cursor: cleanString(body.cursor), force: true })
    let uploads = { cursor: '', uploaded: 0, failed: 0 }
    if (!body.driveDone) {
      let allowed = true
      try { await requireAreaAction(request, env, config, 'files', 'create') } catch (error) { if (error.status !== 403) throw error; allowed = false }
      if (allowed) uploads = await runDriveQueue(env, (job) => executeQueuedDriveUpload(env, config, job), { userId: user.id, cursor: cleanString(body.driveCursor), force: true })
    }
    return apiJson(request, { ...reads, driveCursor: uploads.cursor, uploaded: uploads.uploaded, failed: reads.failed + uploads.failed })
  }
  if (path === '/api/google/gmail/draft' && ['GET', 'PUT'].includes(request.method)) return handleGmailDraft(request, env, config)
  if (path === '/api/google/gmail/send' && request.method === 'POST') return handleGmailSend(request, env, config)
  if (path === '/api/google/calendar/events' && request.method === 'GET') return handleCalendarList(request, env, config)
  if (path === '/api/google/calendar/events' && request.method === 'POST') return handleCalendarCreate(request, env, config)
  if (path === '/api/google/drive/project-folder' && ['GET', 'DELETE'].includes(request.method)) return handleDriveProjectFolderRead(request, env, config)
  if (path === '/api/google/drive/project-folder' && request.method === 'POST') return handleDriveProjectFolder(request, env, config)
  if (path === '/api/google/drive/files' && request.method === 'GET') return handleDriveFiles(request, env, config)
  if (path === '/api/google/drive/folders' && request.method === 'GET') return handleDriveFolders(request, env, config)
  if (path === '/api/google/drive/picker' && request.method === 'GET') return handleDrivePicker(request, env, config)
  if (path === '/api/google/drive/settings' && ['GET', 'PUT'].includes(request.method)) return handleDriveSettings(request, env, config)
  if (path === '/api/google/drive/upload' && request.method === 'POST') return handleDriveUpload(request, env, config)
  if (path === '/api/address/suggest' && request.method === 'GET') return handleAddressSuggest(request, env, config)
  if (path === '/api/ai/rewrite' && request.method === 'POST') return handleAiRewrite(request, env, config)
  return apiJson(request, { error: 'כתובת השירות לא נמצאה' }, 404)
}

async function executeQueuedDriveUpload(env, config, job) {
  const tokens = await googleTokens(env, job.userId)
  if (!job.email || tokens?.email !== job.email) return { skipped: true, reason: 'account-changed' }
  return uploadGoogleDriveFile(env, config, job.userId, job.body, true)
}

export default {
  async scheduled(_event, env, ctx) {
    ctx.waitUntil((async () => { const config = await readConfig(env); await refreshGoogleReads(env, (userId, url) => googleFetch(env, config, userId, url)); await runDriveQueue(env, (job) => executeQueuedDriveUpload(env, config, job)) })())
  },
  async fetch(request, env) {
    try {
      const url = new URL(request.url)
      if (url.pathname.startsWith('/api/')) return await routeApi(request, env)
      if (env.ASSETS) return env.ASSETS.fetch(request)
      return new Response('RAMeng CRM', { status: 200 })
    } catch (error) {
      console.error(error)
      const status = Number(error?.status || 500)
      const message = error instanceof Error ? error.message : 'הפעולה נכשלה.'
      return apiJson(request, { error: message }, status)
    }
  },
}
