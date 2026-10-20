import { useContext, useState } from 'react'
import { captureReportSnapshot, listReportSnapshots, readReportSnapshot, type ReportSnapshot } from '../lib/backend'
import { WorkspaceSaveContext } from './WorkspaceSave'
import { StoredImage } from './common'

export default function ReportHistory({ orgId, reportId, canCapture }: { orgId: string; reportId: string; canCapture: boolean }) {
  const save = useContext(WorkspaceSaveContext)
  const [rows, setRows] = useState<Omit<ReportSnapshot, 'snapshot'>[]>([])
  const [selected, setSelected] = useState<ReportSnapshot | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const load = async (capture = false) => {
    setBusy(true); setError(''); setMessage('')
    try {
      if (capture) {
        if (save.dirty || ['saving', 'error', 'conflict'].includes(save.state)) throw new Error('יש לשמור תחילה את השינויים בדוח ולהמתין לאישור השמירה.')
        await captureReportSnapshot(orgId, reportId)
        setMessage('גרסת הדוח השמורה תועדה בהיסטוריה. תוכנה מוגן מעריכה.')
      }
      setRows(await listReportSnapshots(orgId, reportId))
    } catch (e) { setError(e instanceof Error ? e.message : 'טעינת ההיסטוריה נכשלה') }
    finally { setBusy(false) }
  }
  return <details className="card report-history" onToggle={event => { if (event.currentTarget.open) void load() }}><summary>היסטוריית גרסאות הדוח</summary>
    <p>גרסאות לצפייה בלבד של דוחות שנשמרו בשרת. תיעוד גרסה אינו אישור מקצועי או הנפקה רשמית. נדרשת הסכמת הלקוח לתבנית ולנוהל הנפקה.</p>
    {canCapture && <button type="button" className="secondary" disabled={busy || save.dirty || ['saving', 'error', 'conflict'].includes(save.state)} onClick={() => void load(true)}>תיעוד הגרסה השמורה</button>}
    <button type="button" className="secondary" disabled={busy} onClick={() => void load()}>רענון ההיסטוריה</button>
    {message && <p role="status">{message}</p>}{error && <p role="alert">{error}</p>}
    {!rows.length && !busy && <p>טרם תועדו גרסאות. מוצגות עד 50 הגרסאות האחרונות.</p>}
    {rows.map(row => <button type="button" className="secondary" disabled={busy} key={row.id} onClick={() => { setBusy(true); void readReportSnapshot(orgId, row.id).then(setSelected).catch(e => setError(e.message)).finally(() => setBusy(false)) }}>גרסה מתאריך {new Date(row.captured_at).toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem' })}</button>)}
    {selected && <article className="report-version-readonly"><h3>{selected.snapshot.report.title}</h3><p>{selected.snapshot.organizationName} · {selected.snapshot.projectName} · {selected.snapshot.report.inspectionDate}</p><p>{selected.snapshot.report.notes}</p>
      {selected.snapshot.report.sections.map(section => <section key={section.id}><h4>{section.title}</h4>{section.items.map(item => <article key={item.id}><p>{item.description}</p><p>{item.status} · {item.responsible} · {item.dueDate}</p><p>{item.treatment}</p>{item.sourceTaskId && <small>משימת מקור: <bdi>{item.sourceTaskId}</bdi></small>}{item.photos.map(photo => <StoredImage key={photo.id} photo={photo} alt={photo.caption || item.description} />)}</article>)}</section>)}
    </article>}
  </details>
}
