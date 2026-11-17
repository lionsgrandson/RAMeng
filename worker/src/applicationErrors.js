export const DEVELOPER_ERROR_EMAIL = 'moshe.sch.idf@gmail.com'

export function safeDiagnostic(value) {
  return String(value || '').split(/\n(?:DETAIL|Failing row|CONTEXT)/i)[0]
    .replace(/Bearer\s+\S+/gi, 'Bearer [redacted]')
    .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[redacted JWT]')
    .replace(/(["']?(?:password|secret|token|api.?key|authorization)["']?\s*[=:]\s*)("[^"]*"|'[^']*'|[^\s,;]+)/gi, '$1[redacted]')
    .replace(/sb_secret_[A-Za-z0-9_-]+|sk-[A-Za-z0-9_-]+|AIza[A-Za-z0-9_-]+/g, '[redacted key]')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,'[email omitted]').replace(/https?:\/\/\S+/g, '[URL omitted]').slice(0, 600)
}

export async function enqueueApplicationError(env, { orgId, userId, operation, code, message, page, at, count, events, endpoints, batchId }, senders) {
  const now = new Date()
  const diagnostic = { orgId, userId, operation: String(operation || 'application').replace(/[^a-zA-Z0-9/_-]/g, '').slice(0, 100), code: safeDiagnostic(code).slice(0, 80), message: safeDiagnostic(message), page: String(page || '').replace(/[^a-zA-Z0-9/_-]/g, '').slice(0, 80) }
  const fingerprint = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify({...diagnostic, message:diagnostic.code === 'CONNECTIVITY' ? '' : diagnostic.message}))))].map(byte => byte.toString(16).padStart(2, '0')).join('')
  const key = `application-error:${now.toISOString().slice(0, 13)}:${fingerprint}`
  const details = {firstAt: typeof at === 'string' ? safeDiagnostic(at).slice(0,40) : now.toISOString(), count:Math.max(1,Math.min(10000,Number(count)||1)), endpoints:Array.isArray(endpoints) ? endpoints.slice(0,20).map(value=>String(value).split('?')[0].replace(/[^a-zA-Z0-9/_-]/g,'').slice(0,100)) : [], events:Array.isArray(events) ? events.slice(-20).map(event => Object.fromEntries(['timestamp','requestId','appVersion','workerVersion','endpoint','method','status','category','dependency','responseReceived','online','visibility','errorName'].filter(key=>['string','number','boolean'].includes(typeof event?.[key])).map(key=>[key,typeof event[key] === 'string' ? safeDiagnostic(event[key]).slice(0,160) : event[key]]))) : []}
  const safeBatchId = /^[a-zA-Z0-9-]{16,64}$/.test(batchId || '') ? batchId : ''
  const existing = await env.CONFIG.get(key, 'json')
  if (existing) {
    if (safeBatchId && !(existing.batchIds || []).includes(safeBatchId)) {
      const merged = {...existing, count:(existing.count || 1) + details.count,
        events:[...(existing.events || []),...details.events].slice(-20),
        endpoints:[...new Set([...(existing.endpoints || []),...details.endpoints])].slice(0,20),
        batchIds:[...(existing.batchIds || []),safeBatchId].slice(-100)}
      await env.CONFIG.put(key,JSON.stringify(merged),{expirationTtl:7*86400})
      return {key,report:merged,duplicate:true}
    }
    return { key, report: existing, duplicate: true }
  }
  const rateKey = `application-error-rate:${userId}:${now.toISOString().slice(0, 10)}`
  const dailyCount = Number(await env.CONFIG.get(rateKey, 'json') || 0)
  const report = { ...diagnostic, ...details, batchIds:safeBatchId ? [safeBatchId] : [], id: crypto.randomUUID(), at: now.toISOString(), state: dailyCount >= 20 ? 'rate-limited' : 'pending', attempts: 0, senders: [...new Set(senders)].slice(0, 8) }
  await env.CONFIG.put(key, JSON.stringify(report), { expirationTtl: 7 * 86400 })
  if (dailyCount < 20) await env.CONFIG.put(rateKey, JSON.stringify(dailyCount + 1), { expirationTtl: 2 * 86400 })
  return { key, report, duplicate: false }
}

export async function deliverApplicationError(env, key, report, { tokens, send }) {
  if (report.state !== 'pending' || report.attempts >= 3) return report
  const stored = await env.CONFIG.get(key, 'json')
  if (stored && stored.state !== 'pending') return stored
  let sender
  for (const id of report.senders) { if (await tokens(id).catch(() => null)) { sender = id; break } }
  if (!sender) return report
  const claimed = { ...report, state: 'sending', attempts: report.attempts + 1 }
  // An interrupted/ambiguous provider write is never automatically resent.
  await env.CONFIG.put(key, JSON.stringify(claimed), { expirationTtl: 7 * 86400 })
  let outcome
  try {
    const response = await send(sender, { to: DEVELOPER_ERROR_EMAIL, subject: `RAMENG CRM — תקלה: ${report.operation}`, body: `דיווח תקלה אוטומטי\nמזהה: ${report.id}\nזמן: ${report.at}\nארגון: ${report.orgId}\nמשתמש: ${report.userId}\nפעולה: ${report.operation}\nעמוד: ${report.page}\nקוד: ${report.code}\nשגיאה: ${report.message}\nמספר כשלים: ${report.count || 1}\nפרטי אבחון: ${JSON.stringify({firstAt:report.firstAt,endpoints:report.endpoints,events:report.events})}\n\nלא צורפו תוכן סביבת העבודה, סיסמאות או אסימוני גישה.` })
    outcome = response.ok ? 'sent' : response.status >= 500 || response.status === 408 ? 'uncertain' : claimed.attempts >= 3 ? 'failed' : 'pending'
  } catch { outcome = 'uncertain' }
  const next = { ...claimed, state: outcome }
  await env.CONFIG.put(key, JSON.stringify(next), { expirationTtl: 7 * 86400 })
  return next
}
