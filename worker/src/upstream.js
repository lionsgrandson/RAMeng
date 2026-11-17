// No provider bodies, URLs, or credentials escape this boundary.
export async function upstreamFetch(dependency, url, init = {}) {
  try { return await fetch(url, init) }
  catch (cause) {
    const timeout = ['TimeoutError', 'AbortError'].includes(cause?.name)
    throw Object.assign(new Error('שירות חיצוני אינו זמין כרגע. נסו שוב.'), { status: 503, category: timeout ? 'timeout' : 'upstream_network', dependency })
  }
}

export async function upstreamJson(response, dependency) {
  try { return await response.json() }
  catch { throw Object.assign(new Error('תשובת השירות החיצוני אינה תקינה'), { status: 502, category: 'provider_response', dependency }) }
}

export async function gmailUnreadResponse(response) {
  let body
  try { body = await response.json() }
  catch { throw Object.assign(new Error('תשובת Gmail אינה תקינה'), { status: 502, category: 'provider_response', dependency: 'gmail' }) }
  if (!response.ok) {
    const rateLimited = response.status === 429 || (response.status === 403 && body?.error?.errors?.some(item => ['rateLimitExceeded', 'userRateLimitExceeded', 'quotaExceeded'].includes(item.reason)))
    throw Object.assign(new Error('טעינת מספר ההודעות שלא נקראו נכשלה'), {
      status: rateLimited ? 429 : response.status >= 500 ? 503 : response.status === 401 ? 409 : 502,
      category: rateLimited ? 'provider_rate_limit' : response.status >= 500 ? 'provider_unavailable' : response.status === 401 ? 'reconnect_required' : 'provider_permission', dependency: 'gmail', providerStatus: response.status,
    })
  }
  // Missing/invalid counters are not evidence of an empty inbox.
  if (!Number.isSafeInteger(body?.messagesUnread) || body.messagesUnread < 0) throw Object.assign(new Error('תשובת Gmail אינה תקינה'), { status: 502, category: 'provider_response', dependency: 'gmail' })
  return body.messagesUnread
}
