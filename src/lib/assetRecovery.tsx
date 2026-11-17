import { lazy, type ComponentType } from 'react'
import { appVersion } from './diagnostics'

const isChunkError = (error: unknown) => /dynamically imported module|loading chunk|importing a module script|failed to load module/i.test(error instanceof Error ? error.message : String(error))
let banner: HTMLElement | undefined
export async function offerAssetRecovery(error: unknown) {
  if (!isChunkError(error) || banner || !navigator.onLine) return
  let changed = false
  try {
    const response = await fetch('/app-version.json', {cache:'no-store',signal:AbortSignal.timeout(5000)})
    if (!response.ok) return
    changed = (await response.json()).version !== appVersion
  } catch { return }
  banner = document.createElement('aside')
  banner.setAttribute('role','alert'); banner.dir = 'rtl'
  banner.style.cssText = 'position:fixed;bottom:16px;left:16px;right:16px;z-index:100000;background:white;color:#17243b;border:2px solid #b45e00;padding:16px;border-radius:10px;box-shadow:0 4px 20px #0003'
  const message = document.createElement('p')
  message.textContent = changed ? 'גרסה חדשה זמינה. רכיב לא נטען. שמרו או העתיקו שינויים וטיוטות לפני טעינה מחדש.' : 'רכיב לא נטען. בדקו את החיבור ושמרו או העתיקו שינויים לפני טעינה מחדש.'
  const reload = document.createElement('button'); reload.textContent = 'טעינה מחדש לאחר שמירה'
  reload.onclick = () => {
    // Explicit user action only; session guard also protects against repeated recovery.
    const key = `rameng-asset-recovery:${appVersion}`
    try { if (sessionStorage.getItem(key)) { message.textContent = 'הטעינה כבר נוסתה. נסו שוב מאוחר יותר או פנו לתמיכה.'; return } } catch { /* Explicit reload remains available. */ }
    if (!window.confirm('טעינה מחדש תסגור שינויים שלא נשמרו. האם שמרתם או העתקתם אותם?')) return
    try { sessionStorage.setItem(key,'1') } catch { /* No automatic reloads. */ }
    location.reload()
  }
  const dismiss = document.createElement('button'); dismiss.textContent = 'המשך עבודה ללא טעינה מחדש'
  dismiss.onclick = () => { banner?.remove(); banner = undefined }
  banner.append(message,reload,dismiss); document.body.append(banner)
}

export function recoverableLazy<T extends ComponentType<any>>(load: () => Promise<{default:T}>) {
  return lazy(async () => {
    try { return await load() }
    catch (error) {
      if (!isChunkError(error)) throw error
      void offerAssetRecovery(error)
      return { default: (() => <p role="alert">הרכיב אינו זמין כרגע. שאר המסך נשאר זמין; שמרו שינויים לפני רענון.</p>) as unknown as T }
    }
  })
}

export function installAssetRecovery() {
  window.addEventListener('vite:preloadError', event => { void offerAssetRecovery((event as Event & {payload:unknown}).payload) })
}
