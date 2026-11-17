import { diagnosticContext, type Diagnostic } from './diagnostics'
import { getAccessToken, getRuntime } from './backend'

let organization = ''
let currentPage = ''
let owner = ''
let flushing = false
export const errorReportingOrganization = () => organization
const delivered = new Map<string, number>()
const deliveryKey = (key: string, report: Report) => `${key}:${report.operation}:${report.code}`
let reportTimer: ReturnType<typeof setTimeout> | undefined
export function setErrorReportingContext(orgId: string, page: string, userId = '') { organization = orgId; currentPage = page; owner = userId }
export function safeClientDiagnostic(value: string) {
  return value.split(/\n(?:DETAIL|Failing row|CONTEXT)/i)[0].replace(/Bearer\s+\S+/gi,'Bearer [redacted]').replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,'[redacted JWT]').replace(/sb_secret_[A-Za-z0-9_-]+|sk-[A-Za-z0-9_-]+|AIza[A-Za-z0-9_-]+/g,'[redacted key]').replace(/(["']?(?:password|secret|token|api.?key|authorization)["']?\s*[=:]\s*)("[^"]*"|'[^']*'|[^\s,;]+)/gi,'$1[redacted]').replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,'[email omitted]').replace(/https?:\/\/\S+/g,'[URL omitted]').slice(0,600)
}
type Report = {orgId:string;operation:string;message:string;code:string;page:string;batchId:string;at:string;count:number;events:Diagnostic[];endpoints:string[]}
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
      const sentAt = delivered.get(deliveryKey(key, report))
      if (sentAt && Date.now() - sentAt < 300000) continue
      const response = await fetch(`${getRuntime()?.apiBase || ''}/api/application-errors`, {method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},signal:AbortSignal.timeout(10000),body:JSON.stringify(report)})
      if (!response.ok) break
      delivered.set(deliveryKey(key, report),Date.now())
      savePending(key,pending(key).filter(item=>JSON.stringify(item)!==JSON.stringify(report)))
    }
  } catch { /* Retry after reconnect or on the next authenticated load. */ }
  finally {
    flushing = false
    if (key === storageKey() && pending(key).length && !reportTimer) reportTimer = setTimeout(() => { reportTimer = undefined; void flushPendingReports() },300000)
  }
}
export async function reportClientError(operation: string, error: unknown) {
  if (!organization || !owner || organization === 'local') return
  // Reporting uses raw fetch and never reports its own failures.
  if (operation === '/api/application-errors') return
  const supplied = (error as {diagnostic?:Partial<Diagnostic>} | null)?.diagnostic
  const message = safeClientDiagnostic(supplied?.message || (error instanceof Error ? error.message : String(error || 'Unknown error')))
  const network = ['network','offline','auth_transport'].includes(supplied?.category || '') || /failed to fetch|networkerror|load failed/i.test(message)
  const diagnostic = diagnosticContext(operation, {...supplied, code:supplied?.code || (error instanceof Error ? error.name : 'APPLICATION_ERROR'), message:undefined, category:network ? 'connectivity' : supplied?.category || 'application', errorName:supplied?.errorName || (error instanceof Error ? error.name : 'Error')})
  const key = storageKey(), reports = pending(key)
  const group = reports.find(item => item.code === (network ? 'CONNECTIVITY' : diagnostic.code) && (network || (item.operation === operation && item.message === message)) && Date.now() - Date.parse(item.at) < 300000)
  if (group) { group.count = (group.count || 1) + 1; group.events = [...(group.events || []), diagnostic].slice(-20); group.endpoints = [...new Set([...(group.endpoints || []),diagnostic.endpoint])].slice(0,20) }
  else reports.push({batchId:crypto.randomUUID(),orgId:organization,operation:network ? 'connectivity' : operation,message,code:network ? 'CONNECTIVITY' : diagnostic.code,page:currentPage,at:diagnostic.timestamp,count:1,events:[diagnostic],endpoints:[diagnostic.endpoint]})
  savePending(key,reports)
  if (!reportTimer) reportTimer = setTimeout(() => { reportTimer = undefined; void flushPendingReports() }, 10000)
}
