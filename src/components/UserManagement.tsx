import { useEffect, useState, type FormEvent } from 'react'
import { MailPlus, Plus, RefreshCw, ShieldCheck, UsersRound } from 'lucide-react'
import { listOrganizationMembers, setOrganizationMemberRole, type OrganizationMember } from '../lib/backend'
import { integrationsApi } from '../lib/api'
import type { TeamMember, Workspace } from '../types'
import { Chip, EmptyState, Field, Modal } from './common'

const assignableRoles = ['admin', 'assistant', 'inspector', 'engineer', 'viewer'] as const
const roleLabels: Record<string, string> = {
  developer: 'מפתח',
  admin: 'מנהל',
  assistant: 'עוזר/ת',
  inspector: 'מפקח/ת',
  engineer: 'מהנדס/ת',
  viewer: 'צפייה בלבד',
  manager: 'מנהל',
  member: 'משתמש',
}

const teamRole = (role: string): TeamMember['role'] => {
  if (role === 'developer' || role === 'admin' || role === 'manager') return 'מנהל'
  if (role === 'inspector') return 'מפקח'
  if (role === 'engineer') return 'מהנדס'
  if (role === 'viewer') return 'צפייה'
  return 'משרד'
}

export default function UserManagement({ orgId, canManage, isDeveloper, workspace, setWorkspace }: {
  orgId: string
  canManage: boolean
  isDeveloper: boolean
  workspace: Workspace
  setWorkspace: React.Dispatch<React.SetStateAction<Workspace>>
}) {
  const [members, setMembers] = useState<OrganizationMember[]>([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const syncTeam = (next: OrganizationMember[]) => {
    const mapped: TeamMember[] = next.map((member) => ({
      id: member.userId,
      name: member.displayName || member.email,
      email: member.email,
      role: teamRole(member.role),
      active: true,
    }))
    const current = JSON.stringify(workspace.team)
    const incoming = JSON.stringify(mapped)
    if (current !== incoming) setWorkspace((state) => ({ ...state, team: mapped }))
  }

  const refresh = async () => {
    setLoading(true)
    setError('')
    try {
      const next = await listOrganizationMembers(orgId)
      setMembers(next)
      syncTeam(next)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'לא ניתן לטעון את המשתמשים')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void refresh() }, [orgId])

  const changeRole = async (member: OrganizationMember, role: string) => {
    if (member.role === 'developer' && !isDeveloper) return
    setError('')
    setMessage('')
    try {
      await setOrganizationMemberRole(orgId, member.email, role)
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'עדכון ההרשאה נכשל')
    }
  }

  const add = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const email = String(data.get('email') || '').trim()
    const name = String(data.get('name') || '').trim()
    const role = String(data.get('role') || 'viewer')
    setError('')
    setMessage('')
    setSubmitting(true)
    try {
      const result = await integrationsApi.inviteUser({ orgId, email, name, role })
      setAdding(false)
      setMessage(result.invited ? `הזמנה נשלחה אל ${result.email}` : `${result.email} כבר קיים ב-Supabase ונוסף למערכת`)
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'הוספת המשתמש נכשלה')
    } finally {
      setSubmitting(false)
    }
  }

  return <section className="card">
    <div className="card-head">
      <div><h2><UsersRound /> משתמשים והרשאות</h2><p>המשתמשים מסונכרנים עם Supabase ומקבלים גישה לפי התפקיד שלהם.</p></div>
      <div className="page-action-row">
        <button className="secondary" onClick={() => void refresh()}><RefreshCw /> רענון</button>
        {canManage && <button className="primary" onClick={() => setAdding(true)}><Plus /> הוספת משתמש</button>}
      </div>
    </div>

    {error && <div className="error-banner">{error}</div>}
    {message && <div className="success-banner">{message}</div>}
    {loading ? <div className="loading-state"><RefreshCw className="spin" /> טוען משתמשים...</div> : <div className="table-scroll">
      <table className="data-table">
        <thead><tr><th>משתמש</th><th>מייל</th><th>תפקיד</th><th>גישה</th></tr></thead>
        <tbody>{members.map((member) => <tr key={member.userId}>
          <td><strong>{member.displayName}</strong></td>
          <td>{member.email}</td>
          <td>{canManage && (member.role !== 'developer' || isDeveloper)
            ? <select className="cell-input" value={member.role === 'developer' ? 'developer' : assignableRoles.includes(member.role as typeof assignableRoles[number]) ? member.role : 'viewer'} disabled={member.role === 'developer'} onChange={(e) => void changeRole(member, e.target.value)}>
                {member.role === 'developer' && <option value="developer">{roleLabels.developer}</option>}
                {assignableRoles.map((role) => <option key={role} value={role}>{roleLabels[role]}</option>)}
              </select>
            : roleLabels[member.role] || member.role}</td>
          <td><Chip tone={member.role === 'viewer' ? 'neutral' : 'good'}>{member.role === 'viewer' ? 'קריאה' : 'עבודה'}</Chip></td>
        </tr>)}</tbody>
      </table>
      {!members.length && <EmptyState title="אין משתמשים נוספים" text="אפשר להזמין משתמש חדש ולבחור עבורו תפקיד." />}
    </div>}

    {adding && <Modal title="הוספת משתמש" onClose={() => !submitting && setAdding(false)}>
      <form className="form-grid" onSubmit={(e) => void add(e)}>
        <div className="info-banner"><MailPlus /> אם המייל עדיין לא קיים ב-Supabase, תישלח אליו הזמנה להגדרת החשבון והסיסמה.</div>
        <Field label="שם"><input name="name" autoComplete="name" /></Field>
        <Field label="מייל"><input name="email" type="email" required autoComplete="email" /></Field>
        <Field label="תפקיד"><select name="role" defaultValue="assistant">{assignableRoles.map((role) => <option key={role} value={role}>{roleLabels[role]}</option>)}</select></Field>
        <div className="form-actions"><button className="secondary" type="button" disabled={submitting} onClick={() => setAdding(false)}>ביטול</button><button className="primary" type="submit" disabled={submitting}><ShieldCheck /> {submitting ? 'מוסיף...' : 'שליחת הזמנה'}</button></div>
      </form>
    </Modal>}
  </section>
}
