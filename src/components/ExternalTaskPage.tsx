import { useEffect, useState } from 'react'
import TaskComments from './TaskComments'
import type { Workspace } from '../types'
import { updateExternalTaskStatus } from '../lib/backend'

export default function ExternalTaskPage({ workspace, userId, refreshWorkspace, orgId, taskId, onTask, onLogout }: { workspace: Workspace; userId: string; refreshWorkspace: () => Promise<void>; orgId: string; taskId: string | null; onTask: (id: string) => void; onLogout: () => void }) {
  const tasks = workspace.tasks.filter(task => task.assigneeId === userId)
  const task = tasks.find(task => task.id === taskId)
  const [status, setStatus] = useState(task?.status || '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [retryStatus, setRetryStatus] = useState('')
  useEffect(() => { setStatus(task?.status || ''); setError('') }, [task?.id, task?.status])
  useEffect(() => { setMessage('') }, [task?.id])
  const save = async (next: string) => {
    if (!task || busy) return
    setBusy(true); setError(''); setMessage(''); setRetryStatus(next)
    try {
      await updateExternalTaskStatus(orgId, task.id, next, task.status)
      await refreshWorkspace()
      setMessage('הסטטוס נשמר בהצלחה. מנהל הפרויקט יראה את העדכון.')
    } catch (e) { setError(e instanceof Error ? e.message : 'השמירה נכשלה. נסו שוב.') }
    finally { setBusy(false) }
  }
  return <main className="external-task-page" dir="rtl"><div className="toolbar"><strong>ר.א.ם הנדסה — המשימה שלי</strong><button className="secondary" disabled={busy} onClick={onLogout}>יציאה</button></div>
    {!task && taskId && <section className="card"><h1>המשימה אינה זמינה</h1><p>המשימה לא הוקצתה לחשבון זה, הוסרה או שהגישה בוטלה.</p></section>}
    {!taskId && <section className="card"><h1>המשימות שהוקצו לי</h1>{tasks.map(task => <button className="secondary" key={task.id} onClick={() => onTask(task.id)}>{task.title}</button>)}{!tasks.length && <p>אין משימות שהוקצו לחשבון זה.</p>}</section>}
    {task && <section className="card"><h1>{task.title}</h1><p>{workspace.projects.find(project => project.id === task.projectId)?.name}</p><p style={{ whiteSpace: 'pre-wrap' }}>{task.description}</p><p>תאריך יעד: {task.dueDate || 'לא נקבע'}</p><p>סטטוס נוכחי: {task.status}</p>
      {task.completedAt && <p>הושלם: {new Date(task.completedAt).toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem' })}</p>}
      <div className="external-task-actions"><button type="button" className="primary" disabled={busy || ['בוצע', 'סגור'].includes(task.status) || !workspace.taskStatuses.includes('בוצע')} onClick={() => void save('בוצע')}>{busy ? 'שומר...' : 'סמן כבוצע'}</button>
        <label>סטטוס<select aria-label="סטטוס המשימה שלי" disabled={busy} value={status} onChange={event => { setStatus(event.target.value); setMessage('') }}>{workspace.taskStatuses.map(status => <option key={status}>{status}</option>)}</select></label>
        <button type="button" className="secondary" disabled={busy || status === task.status} onClick={() => void save(status)}>שמירת סטטוס</button>
        <button type="button" className="secondary" disabled={busy} onClick={() => void refreshWorkspace().catch(e => setError(e.message))}>רענון המשימה</button></div>
      {message && <p role="status" className="success-banner">{message}</p>}
      {error && <div role="alert" className="error-banner"><p>{error}</p><button type="button" disabled={busy} onClick={() => void save(retryStatus)}>ניסיון נוסף</button></div>}
      <TaskComments orgId={orgId} taskId={task.id} />
    </section>}
  </main>
}
