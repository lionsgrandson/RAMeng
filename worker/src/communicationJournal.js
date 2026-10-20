// Explicit selected-thread publication only. No inbox crawling or background ingestion.
export async function handleCommunicationJournal(request, env, config, deps) {
  const url = new URL(request.url)
  const body = request.method === 'POST' ? await request.json().catch(() => ({})) : {}
  const orgId = body.orgId || url.searchParams.get('orgId') || ''
  if (!/^[0-9a-f-]{36}$/i.test(orgId)) return deps.json(request, { error: 'ארגון לא תקין' }, 400)
  const user = await deps.requireUser(request, env, config)
  const membership = await deps.currentMembership(request, env, config, user, orgId)
  const can = (action) => membership && deps.allowed(membership.role, membership.permissions, 'communication', action)
  if (!can('view') || membership.role === 'external') return deps.json(request, { error: 'אין הרשאה ליומן הארגוני' }, 403)
  const headers = { authorization: request.headers.get('authorization'), apikey: config.supabaseAnonKey }
  const read = async (table, params) => {
    const target = new URL(`/rest/v1/${table}`, config.supabaseUrl)
    for (const [key, value] of Object.entries(params)) target.searchParams.set(key, value)
    const response = await fetch(target, { headers })
    if (!response.ok) throw Object.assign(new Error('היומן הארגוני אינו זמין כרגע'), { status: 503 })
    return response.json()
  }
  if (request.method === 'GET') {
    const threadId = url.searchParams.get('threadId')
    if (threadId) {
      if (!/^[0-9a-f-]{36}$/i.test(threadId)) return deps.json(request, { error: 'התכתבות לא תקינה' }, 400)
      const threads = await read('communication_threads', { select: 'id', id: `eq.${threadId}`, org_id: `eq.${orgId}` })
      if (!threads.length) return deps.json(request, { error: 'ההתכתבות אינה זמינה' }, 404)
      return deps.json(request, { messages: await read('communication_messages', { select: '*', thread_id: `eq.${threadId}`, order: 'sent_at.asc', limit: '100' }) })
    }
    const mailboxes = await read('communication_mailboxes', { select: 'user_id,active,email,last_sync_at,last_error_code', org_id: `eq.${orgId}`, user_id: `eq.${user.id}` })
    const params = { select: 'id,mailbox_user_id,gmail_thread_id,project_id,task_ids,contact_ids,subject,synced_at', org_id: `eq.${orgId}`, order: 'synced_at.desc', limit: '50' }
    if (url.searchParams.get('projectId')) params.project_id = `eq.${url.searchParams.get('projectId')}`
    return deps.json(request, { mailbox: mailboxes[0] || null, threads: await read('communication_threads', params) })
  }
  if (!can('create')) return deps.json(request, { error: 'אין הרשאה להוסיף ליומן' }, 403)
  if (!/^[a-zA-Z0-9_-]{1,160}$/.test(body.threadId || '') || !body.projectId || !Array.isArray(body.taskIds) || !Array.isArray(body.contactIds) || body.taskIds.length > 100 || body.contactIds.length > 100) return deps.json(request, { error: 'שיוך לא תקין' }, 400)
  const mailboxes = await read('communication_mailboxes', { select: 'email,active', org_id: `eq.${orgId}`, user_id: `eq.${user.id}`, active: 'eq.true' })
  const tokens = await deps.getGoogleTokens(env, user.id)
  if (!mailboxes[0] || mailboxes[0].email.toLowerCase() !== String(tokens?.email || '').toLowerCase()) return deps.json(request, { error: 'נדרש אישור מפורש לתיבה עסקית זו לפני שיתוף ביומן הארגוני.' }, 403)
  const admin = deps.admin(env, config)
  try {
    const response = await deps.googleFetch(env, { ...config, dailyGoogleRead: false }, user.id, `https://gmail.googleapis.com/gmail/v1/users/me/threads/${encodeURIComponent(body.threadId)}?format=full`)
    if (!response.ok) throw new Error('provider_unavailable')
    const thread = await response.json()
    if (!thread.messages?.length || thread.messages.length > 100) return deps.json(request, { error: 'ניתן לשתף עד 100 הודעות בהתכתבות אחת.' }, 400)
    const attachments = (part) => [
      ...(part?.filename ? [{ name: String(part.filename).slice(0, 500), mimeType: part.mimeType || '', size: Number(part.body?.size || 0), providerAttachmentId: part.body?.attachmentId || '' }] : []),
      ...(part?.parts || []).flatMap(attachments),
    ]
    const messages = thread.messages.map(message => {
      const normalized = deps.normalize(message)
      const parsedDate = Date.parse(normalized.date)
      return { id: normalized.id, from: normalized.from, to: normalized.to, cc: (message.payload?.headers || []).find(header => header.name.toLowerCase() === 'cc')?.value || '', subject: normalized.subject, date: Number.isFinite(parsedDate) ? new Date(parsedDate).toISOString() : null, body: normalized.body || normalized.snippet || '', attachments: attachments(message.payload) }
    })
    if (JSON.stringify(messages).length > 2_000_000 || messages.some(message => message.body.length > 200000)) return deps.json(request, { error: 'ההתכתבות גדולה מדי לשיתוף ביומן.' }, 400)
    const result = await admin.rpc('ingest_communication_thread', { target_org: orgId, actor: user.id, mailbox_email: tokens.email, provider_thread: body.threadId, project: body.projectId, tasks: body.taskIds, contacts: body.contactIds, messages, history: thread.historyId || null })
    if (result.error) throw new Error('journal_save_failed')
    return deps.json(request, { ok: true, threadId: result.data, messageCount: messages.length })
  } catch {
    await admin.from('communication_journal_audit').insert({ org_id: orgId, actor_id: user.id, action: 'selected_thread_sync_failed' })
    await admin.from('communication_mailboxes').update({ last_error_code: 'selected_thread_sync_failed' }).eq('org_id', orgId).eq('user_id', user.id)
    return deps.json(request, { error: 'הסנכרון נכשל. השיתוף הקודם נשמר; ניתן לנסות שוב ללא שכפול הודעות.' }, 503)
  }
}
