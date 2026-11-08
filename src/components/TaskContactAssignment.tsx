import { useState, type Dispatch, type SetStateAction } from 'react'
import type { Task, Workspace } from '../types'
import { integrationsApi } from '../lib/api'
import { setProjectCollaborator } from '../lib/backend'
import { Modal } from './common'

export default function TaskContactAssignment({ task, workspace, setWorkspace, orgId, canInvite, onContact, onClose }: { task: Task; workspace: Workspace; setWorkspace: Dispatch<SetStateAction<Workspace>>; orgId: string; canInvite: boolean; onContact?: (id: string) => void; onClose: () => void }) {
  const project = workspace.projects.find(project => project.id === task.projectId)
  const contacts = workspace.contacts.filter(contact => !!contact.email)
  const [newAssignee, setNewAssignee] = useState(false)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [contactId, setContactId] = useState('')
  const [authorize, setAuthorize] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const contact = newAssignee ? { id: '', name: name.trim(), email: email.trim() } : contacts.find(contact => contact.id === contactId)
  const member = workspace.team.find(member => member.active && member.email.trim().toLowerCase() === contact?.email?.trim().toLowerCase())
  const assign = async () => {
    if (!contact?.email || !project) return
    setBusy(true); setError('')
    try {
      if (!contact.name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.email)) throw new Error('יש להזין שם וכתובת מייל תקינים')
      if ((!member || member.external) && (!canInvite || !authorize)) throw new Error('נדרש מנהל לאישור הזמנה וגישה מוגבלת')
      const result = member ? { userId: member.id } : await integrationsApi.inviteUser({ orgId, email: contact.email, name: contact.name, role: 'external' })
      if (!member || member.external) await setProjectCollaborator(orgId, project.id, result.userId, true)
      setWorkspace(current => ({ ...current, team: current.team.some(item => item.id === result.userId) ? current.team : [...current.team, { id: result.userId, name: contact.name, email: contact.email!, role: 'צפייה', external: true, active: true }], tasks: current.tasks.map(item => item.id === task.id ? { ...item, assigneeId: result.userId } : item) }))
      onClose()
    } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }
  return <Modal title={`הקצאה לאיש קשר — ${task.title}`} onClose={onClose}><p>בחרו איש קשר קיים או הוסיפו אחראי חיצוני חדש. חשבון קיים מזוהה לפי כתובת המייל ומשמש שוב.</p><label><input type="checkbox" checked={newAssignee} onChange={event => { setNewAssignee(event.target.checked); setAuthorize(false) }} />אחראי חיצוני חדש</label>{newAssignee ? <><label>שם אחראי חיצוני<input aria-label="שם אחראי חיצוני" value={name} onChange={event => setName(event.target.value)} /></label><label>מייל אחראי חיצוני<input aria-label="מייל אחראי חיצוני" type="email" dir="ltr" value={email} onChange={event => { setEmail(event.target.value); setAuthorize(false) }} /></label></> : <label>איש קשר<select aria-label="איש קשר להקצאת משימה" value={contactId} onChange={event => { setContactId(event.target.value); setAuthorize(false) }}><option value="">בחירת איש קשר</option>{contacts.map(contact => <option key={contact.id} value={contact.id}>{contact.name} — {contact.email}</option>)}</select></label>}
    {contact && !newAssignee && onContact && <button type="button" className="contact-name-link" onClick={() => onContact(contact.id)}>פתיחת כרטיס <bdi>{contact.name}</bdi></button>}
    {contact && (!member || member.external) && <><p>משתתף חיצוני יקבל גישה לפרטי הפרויקט הבסיסיים ולמשימות שהוקצו לו בלבד, עם עדכון סטטוס ותגובות. אין גישה לקבצים, מיילים, הגדרות או משימות אחרות. מנהל יכול לבטל את הגישה דרך משתמשים והרשאות.</p>{canInvite ? <label><input type="checkbox" checked={authorize} onChange={event => setAuthorize(event.target.checked)} />אני מאשר/ת {!member ? 'הזמנת חשבון חיצוני ושליחת הזמנה, ו' : ''}מתן גישה מוגבלת לפרויקט זה</label> : <p>יש לפנות למנהל כדי לאשר גישה מוגבלת.</p>}</>}
    {error && <p role="alert" className="error-banner">{error}</p>}<button className="primary" disabled={busy || !contact || ((!member || member.external) && (!canInvite || !authorize))} onClick={() => void assign()}>{busy ? 'מקצה...' : 'אישור הקצאה'}</button>
  </Modal>
}
