import { getAccessToken, getRuntime } from './backend'

let organization = ''
let currentPage = ''
let owner = ''
let flushing = false
export const errorReportingOrganization = () => organization
const reported = new Map<string, number>()
export function setErrorReportingContext(orgId: string, page: string, userId = '') { organization = orgId; currentPage = page; owner = userId }
export function safeClientDiagnostic(value: string) {
  return value.split(/\n(?:DETAIL|Failing row|CONTEXT)/i)[0].replace(/Bearer\s+\S+/gi,'Bearer [redacted]').replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,'[redacted JWT]').replace(/sb_secret_[A-Za-z0-9_-]+|sk-[A-Za-z0-9_-]+|AIza[A-Za-z0-9_-]+/g,'[redacted key]').replace(/(["']?(?:password|secret|token|api.?key|authorization)["']?\s*[=:]\s*)("[^"]*"|'[^']*'|[^\s,;]+)/gi,'$1[redacted]').replace(/https?:\/\/\S+/g,'[URL omitted]').slice(0,600)
}
type Report = {orgId:string;operation:string;message:string;code:string;page:string}
const storageKey = () => `rameng-pending-errors:${organization}:${owner}`
function pending(key: string): Report[] { try { const value = JSON.parse(localStorage.getItem(key) || '[]'); return Array.isArray(value) ? value.filter(item => item && typeof item.orgId === 'string' && typeof item.message === 'string' && typeof item.operation === 'string').slice(-20) : [] } catch { return [] } }
function savePending(key: string, value: Report[]) { try { localStorage.setItem(key,JSON.stringify(value.slice(-20))) } catch { /* Session reporting remains available. */ } }
export async function flushPendingReports() {
  if (flushing || !organization || !owner || organization === 'local') return
  flushing = true
  const key = storageKey()
  try {
    const token = await getAccessToken()
    if (!token || key !== storageKey()) return
    for (const report of pending(key)) {
      if (key !== storageKey()) break
      const response = await fetch(`${getRuntime()?.apiBase || ''}/api/application-errors`, {method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify(report)})
      if (!response.ok) break
      savePending(key,pending(key).filter(item=>JSON.stringify(item)!==JSON.stringify(report)))
    }
  } catch { /* Retry after reconnect or on the next authenticated load. */ }
  finally { flushing = false }
}
export async function reportClientError(operation: string, error: unknown) {
  if (!organization || !owner || organization === 'local') return
  const diagnostic = (error as {diagnostic?:{message?:string;code?:string}} | null)?.diagnostic
  const message = safeClientDiagnostic(diagnostic?.message || (error instanceof Error ? error.message : String(error || 'Unknown error')))
  const fingerprint = `${organization}:${owner}:${operation}:${message}`
  if (Date.now() - (reported.get(fingerprint) || 0) < 3600000) return
  reported.set(fingerprint,Date.now())
  const report = {orgId:organization,operation,message,code:safeClientDiagnostic(diagnostic?.code || (error instanceof Error ? error.name : '')),page:currentPage}
  const key=storageKey();savePending(key,[...pending(key),report])
  await flushPendingReports()
}
