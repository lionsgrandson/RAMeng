import { isProfessionColumn, normalizeProfessionValue, professionValues } from '../lib/taskProfession'
import { createContext, useContext, useEffect, useState } from 'react'
import { ChevronDown, ChevronUp, Plus } from 'lucide-react'
import type { TaskColumn, TaskColumnType, Workspace } from '../types'
import { moveTaskColumn, normalizeTaskColumns, percentageTaskColumns, resizeTaskColumn, taskSystemColumns } from '../lib/taskColumns'
import { Chip, confirmDelete, uid } from './common'
import { SaveButton } from './WorkspaceSave'

export type TaskGrouping = 'none' | 'assignee' | 'project'
type DisplayPreferences = { groupBy: TaskGrouping; density: 'comfortable' | 'compact'; contactColumns: string[]; hiddenContactColumns: string[] }
const defaults: DisplayPreferences = { groupBy: 'none', density: 'comfortable', contactColumns: ['name', 'role', 'company', 'phone', 'mobile', 'email', 'address'], hiddenContactColumns: [] }
export const DisplayContext = createContext({ ...defaults, update: (_patch: Partial<DisplayPreferences>) => {} })

export function useDisplayPreferences(owner?: string) {
  const [stored, setStored] = useState<{ owner?: string; value: DisplayPreferences }>({ value: defaults })
  useEffect(() => {
    let value = defaults
    try {
      const saved = JSON.parse(localStorage.getItem(`rameng-display:${owner || 'guest'}`) || '{}')
      value = { groupBy: ['none', 'assignee', 'project'].includes(saved.groupBy) ? saved.groupBy : 'none', density: saved.density === 'compact' ? 'compact' : 'comfortable', contactColumns: [...new Set([...(Array.isArray(saved.contactColumns) ? saved.contactColumns.filter((key: unknown) => typeof key === 'string' && defaults.contactColumns.includes(key)) : []), ...defaults.contactColumns])], hiddenContactColumns: Array.isArray(saved.hiddenContactColumns) ? saved.hiddenContactColumns.filter((key: unknown) => typeof key === 'string' && defaults.contactColumns.includes(key)) : [] }
    } catch { /* Keep usable defaults if storage is unavailable. */ }
    setStored({ owner, value })
  }, [owner])
  const value = stored.owner === owner ? stored.value : defaults
  return { ...value, update: (patch: Partial<DisplayPreferences>) => {
    setStored(current => {
      const next = { ...(current.owner === owner ? current.value : defaults), ...patch }
      try { localStorage.setItem(`rameng-display:${owner || 'guest'}`, JSON.stringify(next)) } catch { /* Preferences remain active in this session. */ }
      return { owner, value: next }
    })
  } }
}

export default function DisplaySettings({ workspace, setWorkspace, canViewTasks, canEditTasks, canCreateTasks, canDeleteTasks }: {
  workspace: Workspace; setWorkspace: React.Dispatch<React.SetStateAction<Workspace>>; canViewTasks: boolean; canEditTasks: boolean; canCreateTasks: boolean; canDeleteTasks: boolean
}) {
  const display = useContext(DisplayContext)
  const columns = percentageTaskColumns(normalizeTaskColumns(workspace.taskColumns))
  const [professionReview, setProfessionReview] = useState<{ column: TaskColumn; source: string; target: string } | null>(null)
  const [newColumn, setNewColumn] = useState('')
  const [newType, setNewType] = useState<TaskColumnType>('text')
  const [newStatus, setNewStatus] = useState('')
  const patchColumn = (id: string, patch: Partial<TaskColumn>) => setWorkspace(current => ({ ...current, taskColumns: normalizeTaskColumns(current.taskColumns).map(column => column.id === id ? { ...column, ...patch } : column) }))
  return <section className="card settings-card display-settings"><div className="card-head"><h2>הגדרות תצוגה</h2><SaveButton /></div>
    <p>סדר העמודות, שמותיהן, רוחבן והצגתן מנוהלים כאן לכל טבלאות המשימות. הסדר ברשימה הוא הסדר בטבלה מימין לשמאל.</p>
    {canViewTasks && <><div className="display-personal-settings"><h3>התצוגה שלי</h3><p>העדפות אלה נשמרות לחשבון שלך בדפדפן הזה.</p><label>קיבוץ משימות<select aria-label="קיבוץ משימות" value={display.groupBy} onChange={event => display.update({ groupBy: event.target.value as TaskGrouping })}><option value="none">ללא קיבוץ</option><option value="assignee">לפי אחראי</option><option value="project">לפי פרויקט</option></select></label><label>צפיפות טבלת משימות<select aria-label="צפיפות טבלת משימות" value={display.density} onChange={event => display.update({ density: event.target.value as DisplayPreferences['density'] })}><option value="comfortable">מרווחת</option><option value="compact">צפופה</option></select></label></div>
    <h3>עמודות משימות — הגדרה משותפת לארגון</h3><p className="field-help">כל העמודות ניתנות להזזה, כולל מקצועות, בוצע, קטלוג, פרויקט ופעולות. בחירה לסיכום פגישה מופיעה בתוך פרויקט; עמודת פרויקט מופיעה ברשימת כל המשימות.</p>
    <p className="field-help">הרוחב מוגדר באחוזים. שינוי רוחב עמודה מתאים את שאר העמודות באופן יחסי לסך של 100%. בכל טבלה האחוזים מחולקים בין העמודות המוצגות בלבד.</p>
    {!canEditTasks && <p>נדרשת הרשאת עריכת משימות לשינוי העמודות.</p>}
    <div className="display-column-list">{columns.map((column, index) => <div className="display-column-row" key={column.id} data-column-key={column.key}>
      <span className="display-column-number">{index + 1}</span>
      <label className="display-column-visible"><input type="checkbox" checked={column.visible} disabled={!canEditTasks} aria-label={`הצגת עמודה ${column.label}`} onChange={event => patchColumn(column.id, { visible: event.target.checked })} />הצגה</label>
      <label>שם עמודה<input aria-label={`שם עמודה ${column.label}`} disabled={!canEditTasks} value={column.label} onChange={event => patchColumn(column.id, { label: event.target.value })} /></label>
      <label>רוחב (%)<input aria-label={`רוחב עמודה ${column.label}`} type="number" min="1" max="99" step="0.1" disabled={!canEditTasks} value={Number(column.widthPercent.toFixed(1))} onChange={event => { const percent = Number(event.target.value); if (percent >= 1 && percent <= 99) setWorkspace(current => ({ ...current, taskColumns: resizeTaskColumn(current.taskColumns, column.id, percent) })) }} /></label>
      <div className="display-column-actions"><button type="button" className="icon-btn" aria-label={`הזזת ${column.label} למעלה`} title="מוקדם יותר בטבלה" disabled={!canEditTasks || index === 0} onClick={() => setWorkspace(current => ({ ...current, taskColumns: moveTaskColumn(current.taskColumns, column.id, -1) }))}><ChevronUp /></button><button type="button" className="icon-btn" aria-label={`הזזת ${column.label} למטה`} title="מאוחר יותר בטבלה" disabled={!canEditTasks || index === columns.length - 1} onClick={() => setWorkspace(current => ({ ...current, taskColumns: moveTaskColumn(current.taskColumns, column.id, 1) }))}><ChevronDown /></button>
      {canEditTasks && canDeleteTasks && column.removable && !taskSystemColumns.some(item => item.key === column.key) && <button type="button" className="secondary" aria-label={`מחיקת עמודה ${column.label}`} onClick={() => { if (confirmDelete(`העמודה "${column.label}"`)) setWorkspace(current => ({ ...current, taskColumns: normalizeTaskColumns(current.taskColumns).filter(item => item.id !== column.id) })) }}>מחיקה</button>}</div>
    </div>)}</div>
    {canEditTasks && canCreateTasks && <div className="display-add-column"><label>שם עמודה חדשה<input aria-label="שם עמודה חדשה" value={newColumn} onChange={event => setNewColumn(event.target.value)} /></label><label>סוג עמודה<select aria-label="סוג עמודה חדשה" value={newType} onChange={event => setNewType(event.target.value as TaskColumnType)}><option value="text">טקסט</option><option value="date">תאריך</option><option value="time">שעה</option><option value="status">סטטוס</option><option value="member">אחראי</option><option value="email">מייל</option><option value="priority">עדיפות</option></select></label><button type="button" className="secondary" disabled={!newColumn.trim()} onClick={() => { const id = uid('col'); setWorkspace(current => ({ ...current, taskColumns: [...normalizeTaskColumns(current.taskColumns), { id, key: `custom.${id}`, label: newColumn.trim(), type: newType, visible: true, removable: true, width: 160 }] })); setNewColumn('') }}><Plus />הוספת עמודה</button></div>}
    {columns.filter(isProfessionColumn).map(column => <section key={column.id}><h3>ערכים ישנים — {column.label}</h3><p>ערכים חדשים נבחרים מתוך המקצועות המוגדרים. ערכים ישנים נשמרים עד להחלפה מפורשת.</p>{professionValues(workspace, column).map(source => <button className="secondary" disabled={!canEditTasks} key={source} onClick={() => setProfessionReview({ column, source, target: '' })}>{source} — בדיקת החלפה ({workspace.tasks.filter(task => task.custom?.[column.key.slice(7)] === source).length} משימות)</button>)}</section>)}
    {professionReview && <div className="card" role="region" aria-label="בדיקת החלפת מקצוע"><p>החלפת ״{professionReview.source}״ ב-{workspace.tasks.filter(task => task.custom?.[professionReview.column.key.slice(7)] === professionReview.source).length} משימות בלבד. ערכים אחרים לא ישתנו.</p><select aria-label="מקצוע חלופי" value={professionReview.target} onChange={event => setProfessionReview({ ...professionReview, target: event.target.value })}><option value="">בחירת מקצוע מוגדר</option>{workspace.categories.map(category => <option key={category.id}>{category.name}</option>)}</select><button className="primary" disabled={!canEditTasks || !professionReview.target} onClick={() => { setWorkspace(current => normalizeProfessionValue(current, professionReview.column, professionReview.source, professionReview.target)); setProfessionReview(null) }}>אישור ההחלפה</button><button className="secondary" onClick={() => setProfessionReview(null)}>ביטול</button></div>}
    <h3>סטטוסים למשימות</h3><div className="status-config">{workspace.taskStatuses.map(status => <Chip key={status} tone="brand">{status}</Chip>)}{canEditTasks && <><label>סטטוס חדש<input aria-label="סטטוס חדש" value={newStatus} onChange={event => setNewStatus(event.target.value)} /></label><button type="button" className="secondary" disabled={!newStatus.trim()} onClick={() => { const value = newStatus.trim(); setWorkspace(current => ({ ...current, taskStatuses: current.taskStatuses.includes(value) ? current.taskStatuses : [...current.taskStatuses, value] })); setNewStatus('') }}>הוספת סטטוס</button></>}</div>
    </>}
  </section>
}
