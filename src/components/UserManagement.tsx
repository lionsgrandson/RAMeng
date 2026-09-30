import { useEffect, useState, type FormEvent } from 'react'
import { KeyRound, MailPlus, Plus, RefreshCw, ShieldCheck, SlidersHorizontal, Trash2, UsersRound } from 'lucide-react'
import { listOrganizationMembers, setOrganizationMemberPermissions, setOrganizationMemberRole, type OrganizationMember } from '../lib/backend'
import { integrationsApi } from '../lib/api'
import {
  normalizePermissions,
  permissionActionLabels,
  permissionActions,
  permissionAreaLabels,
  permissionAreas,
  permissionSummary,
  rolePermissionPreset,
  type PermissionAction,
  type PermissionArea,
  type PermissionMatrix,
} from '../lib/permissions'
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
  reviewer: 'צפייה בלבד',
  manager: 'מנהל',
  member: 'משתמש',
}

const teamRole = (role: string): TeamMember['role'] => {
  if (role === 'developer' || role === 'admin' || role === 'manager') return 'מנהל'
  if (role === 'inspector') return 'מפקח'
  if (role === 'engineer') return 'מהנדס'
  if (role === 'viewer' || role === 'reviewer') return 'צפייה'
  return 'משרד'
}

const clonePermissions = (permissions: PermissionMatrix): PermissionMatrix =>
  JSON.parse(JSON.stringify(permissions)) as PermissionMatrix

const allAreasPreset = (actions: Partial<Record<PermissionAction, boolean>>): PermissionMatrix => {
  const next = rolePermissionPreset('viewer')
  for (const area of permissionAreas) {
    next[area] = {
      view: Boolean(actions.view),
      create: Boolean(actions.create),
      edit: Boolean(actions.edit),
      status: Boolean(actions.status),
      delete: Boolean(actions.delete),
    }
  }
  next.connections = { view: Boolean(actions.view), create: false, edit: Boolean(actions.edit), status: false, delete: false }
  return next
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
  const [activeAction, setActiveAction] = useState('')
  const [editingPermissions, setEditingPermissions] = useState<OrganizationMember | null>(null)
  const [permissionDraft, setPermissionDraft] = useState<PermissionMatrix | null>(null)
  const [resetToRoleDefault, setResetToRoleDefault] = useState(false)
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
      await setOrganizationMemberPermissions(orgId, member.userId, null)
      setMessage('התפקיד עודכן וההרשאות חזרו לברירת המחדל של התפקיד.')
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'עדכון ההרשאה נכשל')
    }
  }

  const openPermissions = (member: OrganizationMember) => {
    if (member.role === 'developer') return
    setEditingPermissions(member)
    setPermissionDraft(clonePermissions(normalizePermissions(member.role, member.permissions)))
    setResetToRoleDefault(false)
    setError('')
    setMessage('')
  }

  const setPermission = (area: PermissionArea, action: PermissionAction, checked: boolean) => {
    setResetToRoleDefault(false)
    setPermissionDraft((current) => {
      if (!current) return current
      const next = clonePermissions(current)
      if (action === 'view') {
        next[area].view = checked
        if (!checked) {
          next[area].create = false
          next[area].edit = false
          next[area].status = false
          next[area].delete = false
        }
      } else {
        next[area][action] = checked
        if (checked) next[area].view = true
      }
      return next
    })
  }

  const applyPermissionPreset = (preset: 'role' | 'view' | 'edit-no-delete' | 'status' | 'full') => {
    if (!editingPermissions) return
    const preserveDeveloperOnlyAreas = (next: PermissionMatrix) => {
      if (isDeveloper) return next
      const current = normalizePermissions(editingPermissions.role, editingPermissions.permissions)
      next.connections = { ...current.connections }
      next.imports = { ...current.imports }
      next.settings = { ...current.settings }
      return next
    }
    if (preset === 'role') {
      setPermissionDraft(preserveDeveloperOnlyAreas(clonePermissions(rolePermissionPreset(editingPermissions.role))))
      setResetToRoleDefault(true)
      return
    }
    setResetToRoleDefault(false)
    if (preset === 'view') setPermissionDraft(preserveDeveloperOnlyAreas(allAreasPreset({ view: true })))
    if (preset === 'edit-no-delete') setPermissionDraft(preserveDeveloperOnlyAreas(allAreasPreset({ view: true, create: true, edit: true, status: true })))
    if (preset === 'status') {
      const next = allAreasPreset({ view: true })
      ;(['contacts', 'projects', 'tasks', 'reports', 'finance'] as PermissionArea[]).forEach((area) => { next[area].status = true })
      setPermissionDraft(preserveDeveloperOnlyAreas(next))
    }
    if (preset === 'full') setPermissionDraft(preserveDeveloperOnlyAreas(allAreasPreset({ view: true, create: true, edit: true, status: true, delete: true })))
  }

  const savePermissions = async () => {
    if (!editingPermissions || !permissionDraft) return
    setSubmitting(true)
    setError('')
    setMessage('')
    try {
      await setOrganizationMemberPermissions(orgId, editingPermissions.userId, resetToRoleDefault ? null : permissionDraft)
      setMessage(resetToRoleDefault ? 'ההרשאות הוחזרו לברירת המחדל של התפקיד.' : 'ההרשאות נשמרו.')
      setEditingPermissions(null)
      setPermissionDraft(null)
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שמירת ההרשאות נכשלה')
    } finally {
      setSubmitting(false)
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
      setMessage(result.invited ? `הזמנה נשלחה אל ${result.email}` : `${result.email} כבר קיים ונוסף למערכת`)
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'הוספת המשתמש נכשלה')
    } finally {
      setSubmitting(false)
    }
  }

  const sendPasswordReset = async (member: OrganizationMember) => {
    if (!window.confirm(`לשלוח אל ${member.email} קישור לאיפוס הסיסמה?`)) return
    setError('')
    setMessage('')
    setActiveAction(`reset:${member.userId}`)
    try {
      const result = await integrationsApi.resetUserPassword({ orgId, userId: member.userId })
      setMessage(`קישור לאיפוס הסיסמה נשלח אל ${result.email}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שליחת הקישור לאיפוס הסיסמה נכשלה')
    } finally {
      setActiveAction('')
    }
  }

  const removeUser = async (member: OrganizationMember) => {
    if (member.role === 'developer') return
    const label = member.displayName || member.email
    if (!window.confirm(`למחוק את ${label} לצמיתות? המשתמש יאבד גישה למערכת.`)) return
    setError('')
    setMessage('')
    setActiveAction(`delete:${member.userId}`)
    try {
      const result = await integrationsApi.deleteUser({ orgId, userId: member.userId })
      setMessage(`המשתמש ${result.email} נמחק מהמערכת`)
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'מחיקת המשתמש נכשלה')
    } finally {
      setActiveAction('')
    }
  }

  return <section className="card">
    <div className="card-head">
      <h2><UsersRound /> משתמשים והרשאות</h2>
      <div className="page-action-row">
        <button type="button" className="secondary" onClick={() => void refresh()}><RefreshCw /> רענון</button>
        {canManage && <button type="button" className="primary" onClick={() => setAdding(true)}><Plus /> הוספת משתמש</button>}
      </div>
    </div>

    {error && <div className="error-banner" role="alert">{error}</div>}
    {message && <div className="success-banner" role="status">{message}</div>}
    {loading ? <div className="loading-state"><RefreshCw className="spin" /> טוען משתמשים...</div> : <div className="table-scroll">
      <table className="data-table">
        <thead><tr><th scope="col">משתמש</th><th scope="col">מייל</th><th scope="col">תפקיד</th><th scope="col">גישה</th><th scope="col">הרשאות</th><th scope="col">פעולות</th></tr></thead>
        <tbody>{members.map((member) => {
          const effective = normalizePermissions(member.role, member.permissions, member.role === 'developer')
          const protectedDeveloper = member.role === 'developer'
          return <tr key={member.userId}>
            <td><strong>{member.displayName || member.email}</strong></td>
            <td>{member.email}</td>
            <td>{canManage && (!protectedDeveloper || isDeveloper)
              ? <select className="cell-input" aria-label={`תפקיד עבור ${member.displayName || member.email}`} value={protectedDeveloper ? 'developer' : assignableRoles.includes(member.role as typeof assignableRoles[number]) ? member.role : 'viewer'} disabled={protectedDeveloper} onChange={(e) => void changeRole(member, e.target.value)}>
                  {protectedDeveloper && <option value="developer">{roleLabels.developer}</option>}
                  {assignableRoles.map((role) => <option key={role} value={role}>{roleLabels[role]}</option>)}
                </select>
              : roleLabels[member.role] || member.role}</td>
            <td><Chip tone={protectedDeveloper || permissionSummary(effective) === 'גישה מלאה' ? 'good' : 'neutral'}>{protectedDeveloper ? 'גישה מלאה' : permissionSummary(effective)}</Chip></td>
            <td>{protectedDeveloper
              ? <span className="muted-text">מוגן</span>
              : canManage
                ? <button type="button" className="secondary" onClick={() => openPermissions(member)}><SlidersHorizontal /> התאמה</button>
                : <span className="muted-text">—</span>}</td>
            <td>{canManage
              ? <div className="user-actions">
                  <button
                    type="button"
                    className="secondary"
                    disabled={Boolean(activeAction)}
                    onClick={() => void sendPasswordReset(member)}
                    aria-label={`שליחת איפוס סיסמה אל ${member.email}`}
                  ><KeyRound /> {activeAction === `reset:${member.userId}` ? 'שולח...' : 'איפוס סיסמה'}</button>
                  {!protectedDeveloper && <button
                    type="button"
                    className="secondary danger"
                    disabled={Boolean(activeAction)}
                    onClick={() => void removeUser(member)}
                    aria-label={`מחיקת המשתמש ${member.displayName || member.email}`}
                  ><Trash2 /> {activeAction === `delete:${member.userId}` ? 'מוחק...' : 'מחיקה'}</button>}
                </div>
              : <span className="muted-text">—</span>}</td>
          </tr>
        })}</tbody>
      </table>
      {!members.length && <EmptyState title="אין משתמשים נוספים" text="הוסיפו משתמש." />}
    </div>}

    {adding && <Modal title="הוספת משתמש" onClose={() => !submitting && setAdding(false)}>
      <form className="form-grid" onSubmit={(e) => void add(e)}>
        <div className="info-banner"><MailPlus /> משתמש חדש יקבל הזמנה במייל. ניתן לדייק את ההרשאות אחרי ההוספה.</div>
        <Field label="שם"><input name="name" autoComplete="name" /></Field>
        <Field label="מייל"><input name="email" type="email" required autoComplete="email" /></Field>
        <Field label="תפקיד"><select name="role" defaultValue="assistant">{assignableRoles.map((role) => <option key={role} value={role}>{roleLabels[role]}</option>)}</select></Field>
        <div className="form-actions"><button className="secondary" type="button" disabled={submitting} onClick={() => setAdding(false)}>ביטול</button><button className="primary" type="submit" disabled={submitting}><ShieldCheck /> {submitting ? 'מוסיף...' : 'שליחת הזמנה'}</button></div>
      </form>
    </Modal>}

    {editingPermissions && permissionDraft && <Modal title={`הרשאות · ${editingPermissions.displayName || editingPermissions.email}`} onClose={() => !submitting && setEditingPermissions(null)} wide>
      <div className="permission-editor">
        <div className="info-banner"><ShieldCheck /> בחרו את ההרשאות עבור המשתמש.</div>
        <div className="permission-presets" aria-label="תבניות הרשאה">
          <button type="button" className={resetToRoleDefault ? 'primary' : 'secondary'} onClick={() => applyPermissionPreset('role')}>ברירת מחדל לתפקיד</button>
          <button type="button" className="secondary" onClick={() => applyPermissionPreset('view')}>צפייה בלבד</button>
          <button type="button" className="secondary" onClick={() => applyPermissionPreset('edit-no-delete')}>עריכה ללא מחיקה</button>
          <button type="button" className="secondary" onClick={() => applyPermissionPreset('status')}>סטטוסים בלבד</button>
          <button type="button" className="secondary" onClick={() => applyPermissionPreset('full')}>גישה מלאה</button>
        </div>

        <div className="table-scroll permission-table-wrap">
          <table className="data-table permission-table">
            <thead><tr><th scope="col">אזור</th>{permissionActions.map((action) => <th scope="col" key={action}>{permissionActionLabels[action]}</th>)}</tr></thead>
            <tbody>{permissionAreas.map((area) => <tr key={area}>
              <td><strong>{permissionAreaLabels[area]}</strong></td>
              {permissionActions.map((action) => <td key={action}>
                <label className="permission-toggle">
                  <input
                    type="checkbox"
                    checked={permissionDraft[area][action]}
                    disabled={(area === 'connections' && action !== 'edit') || (!isDeveloper && (area === 'connections' || area === 'imports' || area === 'settings'))}
                    onChange={(e) => setPermission(area, action, e.target.checked)}
                    aria-label={`${permissionActionLabels[action]} · ${permissionAreaLabels[area]}`}
                  />
                  <span aria-hidden="true" />
                </label>
              </td>)}
            </tr>)}</tbody>
          </table>
        </div>
        <p className="permission-hint">כיבוי “צפייה” מכבה אוטומטית את שאר הפעולות באותו אזור. הפעלת פעולה כלשהי מפעילה צפייה.</p>
        <div className="form-actions">
          <button type="button" className="secondary" disabled={submitting} onClick={() => setEditingPermissions(null)}>ביטול</button>
          <button type="button" className="primary" disabled={submitting} onClick={() => void savePermissions()}><ShieldCheck /> {submitting ? 'שומר...' : 'שמירת הרשאות'}</button>
        </div>
      </div>
    </Modal>}
  </section>
}
