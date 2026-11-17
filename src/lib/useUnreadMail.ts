import {useEffect,useState} from 'react'
import {integrationsApi} from './api'

export function useUnreadMail(userId: string, enabled: boolean) {
  const [unreadStale, setUnreadStale] = useState(false)
  const [unreadCount, setUnreadCount] = useState<number | null>(null)
  useEffect(() => {
    if (!enabled) return
    let active = true
    let busy = false, failures = 0, next = 0
    setUnreadCount(null); setUnreadStale(false)
    const refresh = () => {
      if (!active || busy || !navigator.onLine || document.hidden || Date.now() < next) return
      busy = true
      void integrationsApi.unreadMail().then(result => { if (active) { setUnreadCount(result.unreadCount); setUnreadStale(false); failures = 0; next = Date.now() + 300000 } })
        .catch(() => { if (active) { setUnreadStale(true); failures++; next = Date.now() + Math.min(900000, 60000 * 2 ** Math.min(failures,4)) } })
        .finally(() => { busy = false })
    }
    const update = (event: Event) => { setUnreadCount((event as CustomEvent<number>).detail); setUnreadStale(false) }
    const recover = () => { next = 0; refresh() }
    refresh(); const timer = window.setInterval(refresh, 60000)
    window.addEventListener('rameng-mail-count', update); window.addEventListener('rameng-google-synced', recover)
    window.addEventListener('online', recover); document.addEventListener('visibilitychange', refresh)
    return () => { active = false; window.clearInterval(timer); window.removeEventListener('rameng-mail-count', update); window.removeEventListener('rameng-google-synced', recover); window.removeEventListener('online', recover); document.removeEventListener('visibilitychange', refresh) }
  }, [userId, enabled])
  return {unreadCount,unreadStale}
}
