import { useEffect, useRef, useState } from 'react'
import { integrationsApi } from '../lib/api'
import type { Workspace } from '../types'

export default function TaskCalendarSync({ orgId, userId, workspace, enabled, ready }: { orgId: string; userId: string; workspace: Workspace; enabled: boolean; ready: boolean }) {
  const [attempt, setAttempt] = useState(0)
  const [state, setState] = useState<'idle' | 'busy' | 'saved' | 'disconnected' | 'pending'>('idle')
  const [error, setError] = useState('')
  const running = useRef(false)
  const queued = useRef(false)
  const signature = JSON.stringify([orgId, userId, workspace.tasks.map(task => [task.id, task.projectId, task.title, task.description, task.status, task.startDate, task.dueDate, task.followUpDate, task.scheduledTime]), workspace.projects.map(project => [project.id, project.name])])
  useEffect(() => {
    const retry = () => setAttempt(value => value + 1)
    const timer = window.setInterval(retry, 60000)
    window.addEventListener('online', retry)
    window.addEventListener('focus', retry)
    window.addEventListener('rameng-task-calendar-sync', retry)
    return () => { window.clearInterval(timer); window.removeEventListener('online', retry); window.removeEventListener('focus', retry); window.removeEventListener('rameng-task-calendar-sync', retry) }
  }, [])
  useEffect(() => {
    if (!enabled || !ready || orgId === 'local') return
    let active = true
    const timer = window.setTimeout(() => {
      if (running.current) { queued.current = true; return }
      running.current = true
      setState('busy'); setError('')
      void (async () => {
        const status = await integrationsApi.status()
        if (!status.google.connected) { if (active) setState('disconnected'); return }
        const result = await integrationsApi.syncTaskCalendar(orgId, userId)
        if (active) {
          setState(result.synced ? 'saved' : 'pending')
          if (!result.synced) setError(`${result.failed} עדכונים ממתינים לניסיון נוסף.`)
        }
        if (!result.synced && (result.created || result.updated || result.deleted)) queued.current = true
        if (result.created || result.updated || result.deleted) window.dispatchEvent(new Event('rameng-google-synced'))
      })().catch(e => { if (active) { setState('pending'); setError(e instanceof Error ? e.message : 'סנכרון המשימות נכשל') } }).finally(() => {
        running.current = false
        if (queued.current) { queued.current = false; setAttempt(value => value + 1) }
      })
    }, 1000)
    return () => { active = false; window.clearTimeout(timer) }
  }, [signature, ready, enabled, attempt, orgId])
  if (!enabled || orgId === 'local') return null
  if (!ready) return <div className="info-banner task-google-sync" role="status">סנכרון משימות ל-Google Calendar ממתין לשמירת השינויים.</div>
  if (state === 'pending') return <div className="error-banner task-google-sync" role="alert">המשימות נשמרו במערכת. סנכרון Google Calendar ממתין: {error} <button type="button" className="secondary" onClick={() => setAttempt(value => value + 1)}>ניסיון סנכרון משימות נוסף</button></div>
  if (state === 'disconnected') return <div className="info-banner task-google-sync" role="status">כדי להציג משימות ב-Google Calendar, חברו את חשבון Google בהגדרות.</div>
  return <div className="info-banner task-google-sync" role="status">{state === 'busy' ? 'מסנכרן תאריכי משימות ל-Google Calendar שלך...' : state === 'saved' ? 'תאריכי המשימות השמורות מסונכרנים ל-Google Calendar שלך.' : 'ממתין לסנכרון תאריכי המשימות ל-Google Calendar שלך.'}</div>
}
