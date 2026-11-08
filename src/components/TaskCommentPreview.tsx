import { useEffect, useRef, useState } from 'react'
import { integrationsApi } from '../lib/api'
import type { Workspace } from '../types'

export default function TaskCommentPreview({ orgId, taskId, workspace, onOpen }: { orgId: string; taskId: string; workspace: Workspace; onOpen: () => void }) {
  const element = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)
  const [comment, setComment] = useState<{ body: string; authorId: string; at: string } | null>(null)
  useEffect(() => {
    if (!element.current) return
    const observer = new IntersectionObserver(entries => setVisible(entries.some(entry => entry.isIntersecting)))
    observer.observe(element.current); return () => observer.disconnect()
  }, [])
  useEffect(() => {
    if (!visible) return
    let active = true
    const refresh = () => {
      if (document.visibilityState === 'hidden') return
      void integrationsApi.taskComments(orgId, taskId).then(result => { if (active) setComment(result.latestComment || [...result.comments].sort((a, b) => b.at.localeCompare(a.at))[0] || null) }).catch(() => {})
    }
    refresh(); const timer = window.setInterval(refresh, 60000)
    window.addEventListener('focus', refresh); window.addEventListener('rameng-task-comment', refresh)
    return () => { active = false; window.clearInterval(timer); window.removeEventListener('focus', refresh); window.removeEventListener('rameng-task-comment', refresh) }
  }, [orgId, taskId, visible])
  return <div ref={element} className="task-comment-preview">{comment && <button type="button" className="text-button" onClick={onOpen}><strong>תגובה: {workspace.team.find(member => member.id === comment.authorId)?.name || 'משתתף במשימה'}</strong><span dir="auto">{comment.body}</span><small>{new Date(comment.at).toLocaleString('he-IL')}</small></button>}</div>
}
