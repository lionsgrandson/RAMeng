import { useEffect, useState } from 'react'
import { getBackend, readTaskNotification, taskNotifications } from '../lib/backend'
import { integrationsApi } from '../lib/api'

export function MyTaskNotifications({ userId, onTask }: { userId: string; onTask: (id: string) => void }) {
  const [items, setItems] = useState<Awaited<ReturnType<typeof taskNotifications>>>([])
  const [error, setError] = useState('')
  useEffect(() => { let active = true; const refresh = () => { void taskNotifications(userId).then(result => { if (active) setItems(result) }).catch(() => {}) }; refresh(); const timer = window.setInterval(refresh, 10000); return () => { active = false; window.clearInterval(timer) } }, [userId])
  return items.length > 0 ? <details className="task-notifications"><summary>התראות משימות ({items.filter(item => !item.read_at).length})</summary>{error && <p role="alert">{error}</p>}{items.map(item => <button type="button" key={item.id} onClick={() => { void readTaskNotification(item.id).then(() => { setItems(current => current.map(entry => entry.id === item.id ? { ...entry, read_at: new Date().toISOString() } : entry)); onTask(item.task_id) }).catch(e => setError(e.message)) }}>{item.read_at ? '' : '● '}{item.title}</button>)}</details> : null
}

export function TaskDeliveryStatus({ orgId }: { orgId: string }) {
  const [items, setItems] = useState<{ id: string; title: string; state: string; error: string | null }[]>([])
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false)
  const refresh = async () => { const backend = getBackend(); if (!backend || orgId === 'local') return; const { data: auth } = await backend.auth.getUser(); if (!auth.user) return; const { data, error } = await backend.from('task_notifications').select('id,title,state,error').eq('org_id', orgId).eq('assigned_by', auth.user.id).in('state', ['pending','sending','failed','uncertain']).order('created_at', { ascending: false }).limit(30); if (error) return; setItems(data || []) }
  useEffect(() => { void refresh(); const timer = window.setInterval(() => void refresh(), 10000); return () => window.clearInterval(timer) }, [orgId])
  return items.length ? <details className="task-delivery"><summary>התראות מייל למשימות — {items.length} ממתינות או דורשות בדיקה</summary>{error && <p role="alert">{error}</p>}{items.map(item => <div key={item.id}><strong>{item.title}</strong><p>{item.error || (item.state === 'pending' ? 'ממתין לשליחה' : 'השליחה בטיפול; אין לשלוח שוב')}</p>{['failed','pending'].includes(item.state) && <button type="button" className="secondary" disabled={busy} onClick={() => { setBusy(true); void integrationsApi.sendTaskNotifications(orgId, item.state === 'failed' ? item.id : undefined).then(result => { if (result.failed) setError('שליחת ההתראה נכשלה שוב. בדקו את חיבור Google.'); return refresh() }).catch(e => setError(e.message)).finally(() => setBusy(false)) }}>ניסיון שליחה נוסף</button>}{item.state === 'uncertain' && <p>יש לבדוק את תיקיית ״נשלח״ ב-Gmail לפני ניסיון נוסף.</p>}</div>)}</details> : null
}
