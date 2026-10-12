import type { Dispatch, SetStateAction } from 'react'
import TaskComments from './TaskComments'
import type { Workspace } from '../types'
import { SaveButton } from './WorkspaceSave'

export default function ExternalTaskPage({ workspace, setWorkspace, orgId, taskId, onTask, onLogout }: { workspace: Workspace; setWorkspace: Dispatch<SetStateAction<Workspace>>; orgId: string; taskId: string | null; onTask: (id: string) => void; onLogout: () => void }) {
  const task = workspace.tasks.find(task => task.id === taskId)
  return <main className="external-task-page" dir="rtl"><div className="toolbar"><strong>ר.א.ם הנדסה — המשימה שלי</strong><button className="secondary" onClick={onLogout}>יציאה</button></div>
    {!task && taskId && <section className="card"><h1>המשימה אינה זמינה</h1><p>המשימה לא הוקצתה לחשבון זה, הוסרה או שהגישה בוטלה.</p></section>}
    {!taskId && <section className="card"><h1>המשימות שהוקצו לי</h1>{workspace.tasks.map(task => <button className="secondary" key={task.id} onClick={() => onTask(task.id)}>{task.title}</button>)}{!workspace.tasks.length && <p>אין משימות שהוקצו לחשבון זה.</p>}</section>}
    {task && <section className="card"><h1>{task.title}</h1><p>{workspace.projects.find(project => project.id === task.projectId)?.name}</p><p style={{ whiteSpace: 'pre-wrap' }}>{task.description}</p><p>תאריך: {task.startDate || task.dueDate || task.followUpDate || 'לא נקבע'} {task.scheduledTime || ''} (ירושלים)</p><label>סטטוס<select aria-label="סטטוס המשימה שלי" value={task.status} onChange={event => { const status = event.target.value; setWorkspace(current => ({ ...current, tasks: current.tasks.map(item => item.id === task.id ? { ...item, status } : item) })) }}>{workspace.taskStatuses.map(status => <option key={status}>{status}</option>)}</select></label><SaveButton />
      <TaskComments orgId={orgId} taskId={task.id} />
    </section>}
  </main>
}
