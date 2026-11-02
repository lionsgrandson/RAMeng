import { documentColumns, meetingColumnDefaults } from '../lib/documentColumns'
import DocumentColumns from './DocumentColumns'
import { refreshSignedUrl, uploadFile } from '../lib/backend'
import { useContext, useRef, useState } from 'react'
import type { MeetingSummary, Workspace } from '../types'
import { Modal, StoredImage, nowIso, uid } from './common'
import { WorkspaceSaveContext } from './WorkspaceSave'

export const escapeMeetingHtml = (value: string) => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!))

export function meetingHtml(summary: MeetingSummary, workspace: Workspace) {
  const e = escapeMeetingHtml; const project = workspace.projects.find(item => item.id === summary.projectId)
  const columns = documentColumns(summary.columns, meetingColumnDefaults).filter(column => column.visible)
  const rows = summary.taskIds.map(id => {
    const task = workspace.tasks.find(item => item.id === id && item.projectId === summary.projectId)
    if (!task) return `<tr><td colspan="${columns.length}">משימה שהוסרה: ${e(id)}</td></tr>`
    const values: Record<string, string> = { title: task.title + (task.description ? `\n${task.description}` : ''), category: workspace.categories.filter(category => task.categoryIds?.includes(category.id)).map(item => item.name).join(', '), assignee: workspace.team.find(item => item.id === task.assigneeId)?.name || 'לא משויך', status: task.status || '', dueDate: task.dueDate || '', notes: summary.taskNotes[id] || '' }
    return `<tr>${columns.map(column => `<td>${e(values[column.key] || '')}</td>`).join('')}</tr>`
  }).join('')
  const photos = (summary.photos || []).filter(photo => /^(https:\/\/|data:image\/(png|jpeg|gif|webp);base64,)/i.test(photo.url)).map(photo => `<figure><img src="${e(photo.url)}" alt="${e(photo.caption || '')}"><figcaption>${e(photo.caption || '')}</figcaption></figure>`).join('')
  return `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><title>${e(summary.title)}</title><style>body{font:14px Arial,sans-serif;direction:rtl;text-align:right;padding:24px;color:#182b25}h1{color:#314538;border-bottom:3px solid #75927c;padding-bottom:12px}table{width:100%;border-collapse:collapse;table-layout:fixed}th,td{border:1px solid #bbb;padding:8px;vertical-align:top;text-align:right;white-space:pre-wrap;overflow-wrap:anywhere}th{background:#eef3ef}thead{display:table-header-group}tr,figure{break-inside:avoid}.notes{white-space:pre-wrap}.photos{display:grid;grid-template-columns:1fr 1fr;gap:12px}figure{margin:0}img{width:100%;max-height:300px;object-fit:contain}figcaption{white-space:pre-wrap}@page{size:A4 landscape;margin:15mm}@media print{button{display:none}}</style></head><body><button onclick="window.print()">הדפסה / שמירה כ-PDF</button><h1>${e(summary.title)}</h1><p>${e(project?.name || '')} · ${e(summary.date)}</p><p class="notes">${e(summary.notes)}</p><table><thead><tr>${columns.map(column => `<th>${e(column.label)}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table>${photos ? `<h2>תמונות מהפגישה</h2><div class="photos">${photos}</div>` : ''}</body></html>`
}

export default function MeetingSummaries({ workspace, setWorkspace, projectId, selectedTaskIds, canEdit, canDelete, orgId, canUploadFiles = false }: { workspace: Workspace; setWorkspace: React.Dispatch<React.SetStateAction<Workspace>>; projectId: string; selectedTaskIds: string[]; canEdit: boolean; canDelete: boolean; orgId: string; canUploadFiles?: boolean }) {
  const { state: saveState, dirty, refresh: refreshWorkspace } = useContext(WorkspaceSaveContext)
  const [editingId, setEditingId] = useState(''); const [error, setError] = useState('')
  const uploadBusy = useRef(false)
  const [uploading, setUploading] = useState(false)
  const [exporting, setExporting] = useState(false)
  const summary = workspace.meetingSummaries.find(item => item.id === editingId && item.projectId === projectId)
  const patch = (value: Partial<MeetingSummary>) => setWorkspace(current => ({ ...current, meetingSummaries: current.meetingSummaries.map(item => item.id === editingId ? { ...item, ...value, updatedAt: nowIso() } : item) }))
  const addTasks = (id: string) => setWorkspace(current => ({ ...current, meetingSummaries: current.meetingSummaries.map(item => item.id === id ? { ...item, taskIds: [...new Set([...item.taskIds, ...selectedTaskIds.filter(taskId => current.tasks.some(task => task.id === taskId && task.projectId === projectId))])], updatedAt: nowIso() } : item) }))
  const exportPdf = async () => {
    if (!summary || exporting) return
    const tab = window.open('', '_blank')
    if (!tab) { setError('הדפדפן חסם את חלון ההדפסה. אפשרו חלונות קופצים.'); return }
    setExporting(true); setError('')
    tab.document.body.textContent = 'מכין תמונות להדפסה...'
    try {
      const photos = await Promise.all((summary.photos || []).map(async photo => {
        const legacyPath = photo.url.split('/storage/v1/object/sign/crm-files/')[1]?.split('?')[0]
        const path = photo.storagePath || (legacyPath ? decodeURIComponent(legacyPath) : '')
        return path ? { ...photo, url: await refreshSignedUrl(path) || photo.url } : photo
      }))
      if (tab.closed) throw new Error('חלון ההדפסה נסגר.')
      tab.document.open(); tab.document.write(meetingHtml({ ...summary, photos }, workspace)); tab.document.close()
      await Promise.race([
        Promise.all([tab.document.fonts.ready, ...Array.from(tab.document.images).map(image => image.decode())]),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('טעינת התמונות נכשלה. נסו שוב לפני ההדפסה.')), 10000)),
      ])
      tab.focus(); tab.print()
    } catch (e) { tab.close(); setError(e instanceof Error ? e.message : 'הכנת ההדפסה נכשלה') }
    finally { setExporting(false) }
  }
  const attachPhoto = async (file: File) => {
    if (!summary || !canEdit || !canUploadFiles || uploadBusy.current) return
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type) || file.size > 10 * 1024 * 1024) { setError('יש לבחור תמונת JPG, PNG, WebP או GIF עד 10 MB.'); return }
    uploadBusy.current = true; setUploading(true); setError('')
    const summaryId = summary.id
    try {
      const result = await uploadFile(orgId, projectId, file)
      const photo = { id: uid('photo'), url: result.url, storagePath: result.path || undefined, caption: '' }
      setWorkspace(current => ({ ...current, meetingSummaries: current.meetingSummaries.map(item => item.id === summaryId ? { ...item, photos: [...(item.photos || []), photo], updatedAt: nowIso() } : item) }))
    } catch (e) { setError(e instanceof Error ? e.message : 'העלאת התמונה נכשלה') }
    finally { uploadBusy.current = false; setUploading(false) }
  }
  const refresh = async () => { if (dirty || ['saving','error','conflict'].includes(saveState)) { setError('יש לשמור את סביבת העבודה לפני רענון פרטי המשימות.'); return } try { await refreshWorkspace(); setError('') } catch (e) { setError(e instanceof Error ? e.message : 'רענון המשימות נכשל') } }
  return <section className="meeting-summaries"><div className="toolbar"><strong>סיכומי פגישה · {selectedTaskIds.length} משימות נבחרו</strong>{canEdit && <button className="secondary" type="button" onClick={() => { const id = uid('meeting'); setWorkspace(current => ({ ...current, meetingSummaries: [...current.meetingSummaries, { id, projectId, title: 'סיכום פגישת פרויקט', date: new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()), taskIds: selectedTaskIds, notes: workspace.projects.find(item => item.id === projectId)?.meetingTemplate || '', taskNotes: {}, columns: workspace.projects.find(item => item.id === projectId)?.meetingColumns, photos: [], updatedAt: nowIso() }] })); setEditingId(id) }}>הוסף לסיכום פגישה חדש</button>}</div>
    {workspace.meetingSummaries.filter(item => item.projectId === projectId).map(item => <div key={item.id} className="inline-create"><button className="secondary" type="button" onClick={() => setEditingId(item.id)}>{item.title} · {item.date} ({item.taskIds.length})</button>{canEdit && selectedTaskIds.length > 0 && <button type="button" className="secondary" onClick={() => { addTasks(item.id); setEditingId(item.id) }}>הוספת הנבחרות לסיכום</button>}</div>)}
    {summary && <Modal title="סיכום פגישה" wide onClose={() => setEditingId('')}><p>פרטי המשימות מוצגים מנתוני המערכת ומתעדכנים עם המשימות. הערות הפגישה נשמרות בנפרד.</p>{error && <p role="alert">{error}</p>}<label>כותרת<input disabled={!canEdit} value={summary.title} onChange={event => patch({ title: event.target.value })} /></label><label>תאריך<input disabled={!canEdit} type="date" value={summary.date} onChange={event => patch({ date: event.target.value })} /></label><DocumentColumns value={summary.columns} defaults={meetingColumnDefaults} disabled={!canEdit} onChange={columns => patch({ columns })} /><label>הערות וסעיפים ידניים<textarea disabled={!canEdit} value={summary.notes} onChange={event => patch({ notes: event.target.value })} /></label>{summary.taskIds.map(id => { const task = workspace.tasks.find(item => item.id === id && item.projectId === projectId); return <article className="meeting-task" key={id}><strong>{task?.title || 'משימה שהוסרה'}</strong><p>{task?.status} · {workspace.team.find(item => item.id === task?.assigneeId)?.name || 'ללא אחראי'} · {task?.dueDate}</p><textarea aria-label={`הערות לפגישה עבור ${task?.title || id}`} disabled={!canEdit} value={summary.taskNotes[id] || ''} onChange={event => patch({ taskNotes: { ...summary.taskNotes, [id]: event.target.value } })} />{canEdit && <button type="button" className="secondary" onClick={() => patch({ taskIds: summary.taskIds.filter(taskId => taskId !== id) })}>הסרה מהסיכום</button>}</article> })}<section className="meeting-photos"><h3>תמונות לפגישה</h3>{canEdit && canUploadFiles && <label className="secondary file-label">הוספת תמונה<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" disabled={uploading} onChange={event => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ''; if (file) void attachPhoto(file) }} /></label>}{uploading && <p role="status">מעלה תמונה...</p>}<div className="meeting-photo-grid">{(summary.photos || []).map(photo => <figure key={photo.id}><StoredImage photo={photo} alt={photo.caption || 'תמונת פגישה'} /><input aria-label="כיתוב לתמונת פגישה" disabled={!canEdit} value={photo.caption || ''} onChange={event => patch({ photos: summary.photos?.map(item => item.id === photo.id ? { ...item, caption: event.target.value } : item) })} />{canEdit && canDelete && <button type="button" className="secondary" onClick={() => { if (window.confirm('להסיר את התמונה מהסיכום?')) patch({ photos: summary.photos?.filter(item => item.id !== photo.id) }) }}>הסרת תמונה מהסיכום</button>}</figure>)}</div></section><div className="form-actions"><button type="button" className="secondary" onClick={() => void refresh()}>רענון פרטי משימות</button><button type="button" className="primary" disabled={exporting || uploading} onClick={() => void exportPdf()}>{exporting ? 'מכין להדפסה...' : 'ייצוא PDF'}</button>{canDelete && <button type="button" className="secondary" onClick={() => { setWorkspace(current => ({ ...current, meetingSummaries: current.meetingSummaries.filter(item => item.id !== summary.id) })); setEditingId('') }}>מחיקת סיכום</button>}</div><p>הסיכום נשמר עם סביבת העבודה. בחלון ההדפסה בחרו ״שמירה כ-PDF״.</p></Modal>}
  </section>
}
