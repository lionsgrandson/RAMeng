import { useEffect, useState } from 'react'
import { integrationsApi } from '../lib/api'
import type { Workspace } from '../types'
import { dateTimeLabel } from './common'
type Comment = { id: string; body: string; authorId: string; at: string }
export default function TaskComments({ orgId, taskId, canComment = true, team = [] }: { team?: Workspace['team']; orgId: string; taskId: string; canComment?: boolean }) {
  const [comments, setComments] = useState<Comment[]>([])
  const [cursor, setCursor] = useState('')
  const [body, setBody] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    let active = true; setComments([]); setCursor(''); setBody(''); setError('')
    void integrationsApi.taskComments(orgId, taskId).then(result => { if (active) { setComments(result.comments); setCursor(result.cursor) } }).catch(e => { if (active) setError(e.message) })
    return () => { active = false }
  }, [orgId, taskId])
  return <div><h2>תגובות למשימה</h2><button className="secondary" disabled={busy} onClick={() => { setBusy(true); setError(''); void integrationsApi.taskComments(orgId, taskId).then(result => { setComments(result.comments); setCursor(result.cursor) }).catch(e => setError(e.message)).finally(() => setBusy(false)) }}>רענון תגובות</button>{comments.map(comment => <article key={comment.id}><p style={{ whiteSpace: 'pre-wrap' }}>{comment.body}</p><small>{team.find(member=>member.id===comment.authorId)?.name || 'משתתף במשימה'} · {dateTimeLabel(comment.at)}</small></article>)}
    {cursor && <button disabled={busy} className="secondary" onClick={() => { setBusy(true); void integrationsApi.taskComments(orgId, taskId, cursor).then(result => { setComments(current => [...current, ...result.comments.filter(comment => !current.some(item => item.id === comment.id))]); setCursor(result.cursor) }).catch(e => setError(e.message)).finally(() => setBusy(false)) }}>תגובות נוספות</button>}
    {canComment && <form onSubmit={event => { event.preventDefault(); setBusy(true); setError(''); void integrationsApi.addTaskComment(orgId, taskId, body).then(({ comment }) => { setComments(current => [...current, comment]); setBody(''); window.dispatchEvent(new Event('rameng-task-comment')) }).catch(e => setError(e.message)).finally(() => setBusy(false)) }}><label>תגובה חדשה<textarea aria-label="תגובה חדשה למשימה" maxLength={4000} required value={body} onChange={event => setBody(event.target.value)} /></label><button className="primary" disabled={busy || !body.trim()}>הוספת תגובה</button></form>}
    {error && <p className="error-banner" role="alert">{error}</p>}
  </div>
}
