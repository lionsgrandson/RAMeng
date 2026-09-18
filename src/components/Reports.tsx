import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { ArrowRight, Camera, ChevronLeft, Download, FileText, Plus, Printer, Trash2, X } from 'lucide-react'
import { getCurrentUser, uploadFile } from '../lib/backend'
import type { InspectionItem, InspectionReport, InspectionSection, ReportLayout, Workspace } from '../types'
import { Chip, EmptyState, Field, Modal, confirmDelete, dateLabel, nowIso, uid } from './common'

const reportStatuses = ['פתוח', 'לא תקין', 'בוצע חלקית', 'לא בוצע', 'תקין', 'בוצע', 'סגור']
const isClosed = (status: string) => ['תקין', 'בוצע', 'סגור'].includes(status)

export default function ReportsPage({ workspace, setWorkspace, orgId, projectId, canEdit = true }: { workspace: Workspace; setWorkspace: React.Dispatch<React.SetStateAction<Workspace>>; orgId: string; projectId?: string; canEdit?: boolean }) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [currentEmail, setCurrentEmail] = useState('')
  const reports = workspace.reports.filter((report) => !projectId || report.projectId === projectId).sort((a, b) => b.inspectionDate.localeCompare(a.inspectionDate))
  const editing = workspace.reports.find((report) => report.id === editingId)

  useEffect(() => { void getCurrentUser().then((current) => setCurrentEmail(current?.email || '')) }, [])

  const currentInspector = workspace.team.find((member) => member.email.toLowerCase() === currentEmail.toLowerCase())?.name || currentEmail || workspace.settings.defaultInspector || ''

  const createReport = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const selectedProjectId = projectId || String(data.get('projectId') || '')
    if (!selectedProjectId) return
    const project = workspace.projects.find((item) => item.id === selectedProjectId)
    const template = workspace.reportTemplates.find((item) => item.id === String(data.get('templateId'))) || workspace.reportTemplates[0]
    const report: InspectionReport = {
      id: uid('report'),
      projectId: selectedProjectId,
      title: String(data.get('title') || `דוח פיקוח ${project?.name || ''}`),
      siteAddress: project?.address || '',
      inspectionDate: String(data.get('inspectionDate') || new Date().toISOString().slice(0, 10)),
      updatedAt: nowIso(),
      inspector: String(data.get('inspector') || currentInspector),
      layout: template?.layout || 'table',
      sections: (template?.sectionTitles || ['בנייה']).map((title) => ({ id: uid('section'), title, items: [] })),
    }
    setWorkspace((current) => ({ ...current, reports: [...current.reports, report] }))
    setCreating(false)
    setEditingId(report.id)
  }

  if (editing) return <ReportEditor workspace={workspace} setWorkspace={setWorkspace} report={editing} orgId={orgId} onBack={() => setEditingId(null)} canEdit={canEdit} />

  return <>
    <div className="page-action-row"><button type="button" className="primary" onClick={() => setCreating(true)}><Plus /> דוח חדש</button></div>
    <section className="card">
      <div className="card-head"><h2>דוחות</h2></div>
      <div className="report-list">{reports.map((report) => {
        const items = report.sections.flatMap((section) => section.items)
        const open = items.filter((item) => !isClosed(item.status)).length
        return <button className="report-row" key={report.id} onClick={() => setEditingId(report.id)}><span className="report-icon"><FileText /></span><div><strong>{report.title}</strong><small>{dateLabel(report.inspectionDate)} · {report.siteAddress || 'ללא כתובת'} · {items.length} סעיפים</small></div><Chip tone={open ? 'warn' : 'good'}>{open ? `${open} פתוחים` : 'הכול סגור'}</Chip><ChevronLeft /></button>
      })}{!reports.length && <EmptyState title="אין דוחות" text="צרו דוח חדש." />}</div>
    </section>
    {canEdit && creating && <Modal title="דוח חדש" onClose={() => setCreating(false)}><form className="form-grid" onSubmit={createReport}>
      {!projectId && <Field label="פרויקט"><select name="projectId" required><option value="">בחירת פרויקט</option>{workspace.projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></Field>}
      <Field label="כותרת"><input name="title" placeholder="דוח פיקוח" /></Field>
      <Field label="תאריך"><input name="inspectionDate" type="date" defaultValue={new Date().toISOString().slice(0, 10)} /></Field>
      <Field label="מפקח"><input name="inspector" defaultValue={currentInspector} /></Field>
      <Field label="פורמט"><select name="templateId">{workspace.reportTemplates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}</select></Field>
      <div className="form-actions"><button className="primary">יצירת דוח</button></div>
    </form></Modal>}
  </>
}

function ReportEditor({ workspace, setWorkspace, report, orgId, onBack, canEdit }: { workspace: Workspace; setWorkspace: React.Dispatch<React.SetStateAction<Workspace>>; report: InspectionReport; orgId: string; onBack: () => void; canEdit: boolean }) {
  const [showPrevious, setShowPrevious] = useState(false)
  const unresolved = useMemo(() => workspace.reports.filter((item) => item.projectId === report.projectId && item.id !== report.id && item.inspectionDate <= report.inspectionDate).flatMap((oldReport) => oldReport.sections.flatMap((section) => section.items.filter((item) => !isClosed(item.status)).map((item) => ({ ...item, oldReport, sectionTitle: section.title })))).filter((item) => !report.sections.some((section) => section.items.some((current) => current.sourceReportId === item.oldReport.id && current.description === item.description))), [workspace.reports, report])

  const patchReport = (patch: Partial<InspectionReport>) => setWorkspace((current) => ({ ...current, reports: current.reports.map((item) => item.id === report.id ? { ...item, ...patch, updatedAt: nowIso() } : item) }))
  const patchSection = (sectionId: string, updater: (section: InspectionSection) => InspectionSection) => setWorkspace((current) => ({ ...current, reports: current.reports.map((item) => item.id === report.id ? { ...item, updatedAt: nowIso(), sections: item.sections.map((section) => section.id === sectionId ? updater(section) : section) } : item) }))
  const patchItem = (sectionId: string, itemId: string, patch: Partial<InspectionItem>) => patchSection(sectionId, (section) => ({ ...section, items: section.items.map((item) => item.id === itemId ? { ...item, ...patch } : item) }))
  const addItem = (sectionId: string, source?: InspectionItem & { oldReport?: InspectionReport }) => patchSection(sectionId, (section) => ({ ...section, items: [...section.items, source ? { id: uid('issue'), description: source.description, status: 'פתוח', treatment: source.treatment, responsible: source.responsible, sourceReportId: source.oldReport?.id, photos: source.photos.map((photo) => ({ ...photo, id: uid('photo') })) } : { id: uid('issue'), description: '', status: 'פתוח', treatment: '', photos: [] }] }))

  const attachPhoto = async (sectionId: string, item: InspectionItem, file: File) => {
    if (!canEdit) return
    const result = await uploadFile(orgId, report.projectId, file)
    patchItem(sectionId, item.id, { photos: [...item.photos, { id: uid('photo'), url: result.url, caption: '' }] })
  }

  const exportCsv = () => {
    const rows = [['קטגוריה', 'תיאור', 'סטטוס', 'לטיפול / הערות']]
    report.sections.forEach((section) => section.items.forEach((item) => rows.push([section.title, item.description, item.status, item.treatment])))
    const csv = '\ufeff' + rows.map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(',')).join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `${report.title}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }
  const print = () => { document.body.dataset.printReport = report.id; setTimeout(() => window.print(), 30) }

  const project = workspace.projects.find((item) => item.id === report.projectId)
  return <div className="report-editor">
    <div className="editor-top"><button type="button" className="secondary" onClick={onBack}><ArrowRight /> דוחות</button><div className="editor-actions"><select disabled={!canEdit} value={report.layout} onChange={(e) => patchReport({ layout: e.target.value as ReportLayout })}><option value="table">טבלה</option><option value="cards">כרטיסים</option><option value="photo">תמונות</option></select><button type="button" className="secondary" onClick={() => setShowPrevious((value) => !value)}>פתוחים קודמים {unresolved.length ? `(${unresolved.length})` : ''}</button><button type="button" className="secondary" onClick={exportCsv}><Download /> CSV</button><button type="button" className="primary" onClick={print}><Printer /> הדפסה</button></div></div>
    <section className="card report-meta"><div><label>כותרת<input disabled={!canEdit} value={report.title} onChange={(e) => patchReport({ title: e.target.value })} /></label><label>כתובת<input disabled={!canEdit} value={report.siteAddress} onChange={(e) => patchReport({ siteAddress: e.target.value })} /></label><label>תאריך<input disabled={!canEdit} type="date" value={report.inspectionDate} onChange={(e) => patchReport({ inspectionDate: e.target.value })} /></label><label>מפקח<input disabled={!canEdit} value={report.inspector} onChange={(e) => patchReport({ inspector: e.target.value })} /></label></div></section>
    {showPrevious && <section className="card previous-issues"><div className="card-head"><h2>פתוחים מדוחות קודמים</h2></div><div className="previous-grid">{unresolved.map((item) => <article key={`${item.oldReport.id}-${item.id}`}><div><strong>{item.description}</strong><small>{item.oldReport.title} · {item.sectionTitle} · {item.status}</small></div>{canEdit && <button type="button" className="secondary" onClick={() => { const target = report.sections.find((section) => section.title === item.sectionTitle) || report.sections[0]; if (target) addItem(target.id, item) }}>הוספה לדוח</button>}</article>)}{!unresolved.length && <div className="table-empty">אין פריטים פתוחים.</div>}</div></section>}
    <div className="inspection-sections">{report.sections.map((section, sectionIndex) => <section className="card inspection-section" key={section.id}><div className="card-head"><div className="section-title-edit"><span>{sectionIndex + 1}</span><input disabled={!canEdit} value={section.title} onChange={(e) => patchSection(section.id, (current) => ({ ...current, title: e.target.value }))} /></div><div>{canEdit && <><button type="button" className="secondary" onClick={() => addItem(section.id)}><Plus /> סעיף</button><button type="button" className="icon-btn danger" aria-label={`מחיקת קטגוריה ${section.title}`} onClick={() => { if (confirmDelete(`הקטגוריה "${section.title}"`)) patchReport({ sections: report.sections.filter((item) => item.id !== section.id) }) }}><Trash2 /></button></>}</div></div><div className="inspection-item-list">{section.items.map((item, index) => <article className="inspection-item" key={item.id}><div className="issue-number">{index + 1}</div><div className="issue-main"><label>תיאור<input disabled={!canEdit} value={item.description} onChange={(e) => patchItem(section.id, item.id, { description: e.target.value })} /></label><div className="issue-fields"><label>סטטוס<select disabled={!canEdit} value={item.status} onChange={(e) => patchItem(section.id, item.id, { status: e.target.value })}>{reportStatuses.map((status) => <option key={status}>{status}</option>)}</select></label><label>אחראי<input disabled={!canEdit} value={item.responsible || ''} onChange={(e) => patchItem(section.id, item.id, { responsible: e.target.value })} /></label></div><label className="treatment-field">לטיפול / הערות<textarea disabled={!canEdit} rows={3} value={item.treatment} onChange={(e) => patchItem(section.id, item.id, { treatment: e.target.value })} /></label><div className="issue-actions">{canEdit && <><label className="secondary file-label"><Camera /> הוספת תמונה<input type="file" accept="image/*" capture="environment" onChange={(e) => e.target.files?.[0] && void attachPhoto(section.id, item, e.target.files[0])} /></label><button type="button" className="icon-btn danger" aria-label="מחיקת סעיף" onClick={() => { if (confirmDelete('הסעיף')) patchSection(section.id, (current) => ({ ...current, items: current.items.filter((currentItem) => currentItem.id !== item.id) })) }}><Trash2 /></button></>}</div></div><div className="issue-photos">{item.photos.map((photo) => <figure key={photo.id}><img src={photo.url} alt={photo.caption || item.description} /><input disabled={!canEdit} value={photo.caption || ''} onChange={(e) => patchItem(section.id, item.id, { photos: item.photos.map((current) => current.id === photo.id ? { ...current, caption: e.target.value } : current) })} placeholder="כיתוב" />{canEdit && <button type="button" aria-label="מחיקת תמונה" onClick={() => { if (confirmDelete('התמונה')) patchItem(section.id, item.id, { photos: item.photos.filter((current) => current.id !== photo.id) }) }}><X /></button></figure>)}</div></article>)}{!section.items.length && <div className="table-empty">אין סעיפים.</div>}</div></section>)}
      {canEdit && <button type="button" className="add-section secondary" onClick={() => patchReport({ sections: [...report.sections, { id: uid('section'), title: 'קטגוריה חדשה', items: [] }] })}><Plus /> קטגוריה</button>}
    </div>
    <PrintableReport report={report} projectName={project?.name || ''} settings={workspace.settings} />
  </div>
}

function PrintableReport({ report, projectName, settings }: { report: InspectionReport; projectName: string; settings: Workspace['settings'] }) {
  return <div className={`print-report layout-${report.layout}`} data-report-id={report.id}>
    <header className="print-header"><div className="print-brand"><div className="print-logo">ראם</div><div><strong>{settings.organizationName}</strong><span>ניהול ופיקוח פרויקטים</span></div></div><div className="print-title"><h1>{report.title}</h1><p>{projectName}</p></div><div className="print-meta"><span><b>כתובת האתר:</b> {report.siteAddress || '—'}</span><span><b>תאריך עדכון:</b> {dateLabel(report.inspectionDate)}</span><span><b>מפקח:</b> {report.inspector}</span></div></header>
    <main>{report.sections.map((section, sectionIndex) => <section className="print-section" key={section.id}><h2>{sectionIndex + 1}. {section.title}</h2>{report.layout === 'table' ? <table><thead><tr><th>#</th><th>תיאור</th><th>סטטוס</th><th>לטיפול / הערות</th><th>תמונות</th></tr></thead><tbody>{section.items.map((item, index) => <tr key={item.id}><td>{index + 1}</td><td>{item.description}</td><td><span className={`print-status ${isClosed(item.status) ? 'closed' : 'open'}`}>{item.status}</span></td><td>{item.treatment}</td><td><div className="print-photos">{item.photos.map((photo) => <img key={photo.id} src={photo.url} alt="" />)}</div></td></tr>)}</tbody></table> : <div className="print-card-grid">{section.items.map((item, index) => <article key={item.id}><div className="print-card-head"><b>{index + 1}. {item.description}</b><span className={`print-status ${isClosed(item.status) ? 'closed' : 'open'}`}>{item.status}</span></div><p>{item.treatment}</p><div className="print-photos large">{item.photos.map((photo) => <figure key={photo.id}><img src={photo.url} alt="" />{photo.caption && <figcaption>{photo.caption}</figcaption>}</figure>)}</div></article>)}</div>}</section>)}</main>
    <footer className="print-footer">{settings.email && <span>{settings.email}</span>}{settings.secondaryEmail && <span>{settings.secondaryEmail}</span>}{settings.phone && <span>{settings.phone}</span>}{settings.website && <span>{settings.website.replace(/^https?:\/\//, '')}</span>}</footer>
  </div>
}
