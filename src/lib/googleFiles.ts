import { integrationsApi, type MailAttachment } from './api'
import { refreshSignedUrl } from './backend'
import type { FileRecord, InspectionReport, Workspace } from '../types'

export const MAX_ATTACHMENT_BYTES = 18 * 1024 * 1024
export async function fileAttachment(file: Blob, name: string): Promise<MailAttachment> {
  if (file.size > MAX_ATTACHMENT_BYTES) throw new Error('הקובץ חורג ממגבלת 18 MB')
  const data = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(',')[1] || ''); reader.onerror = () => reject(new Error('קריאת הקובץ נכשלה')); reader.readAsDataURL(file) })
  return { name, type: file.type || 'application/octet-stream', data }
}
export async function storedAttachment(file: FileRecord) {
  const url = file.storagePath ? await refreshSignedUrl(file.storagePath) : file.url
  const response = await fetch(url)
  if (!response.ok) throw new Error(`לא ניתן לטעון את ${file.name}`)
  return fileAttachment(await response.blob(), file.name)
}
export async function syncProjectFile(file: FileRecord, original?: File) {
  if (!file.projectId) return { skipped: true, reason: 'unlinked' }
  return integrationsApi.uploadDrive({ projectId: file.projectId, recordId: file.id, kind: 'file', file: original ? await fileAttachment(original, original.name) : await storedAttachment(file) })
}
const escapeHtml = (value: unknown) => String(value || '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!)
export async function reportAttachment(report: InspectionReport, workspace: Workspace): Promise<MailAttachment> {
  const sections = await Promise.all(report.sections.map(async (section) => `<section><h2>${escapeHtml(section.title)}</h2><table><thead><tr><th>#</th><th>תיאור</th><th>סטטוס</th><th>אחראי</th><th>לטיפול</th><th>תמונות</th></tr></thead><tbody>${(await Promise.all(section.items.map(async (item, index) => {
    const photos = await Promise.all(item.photos.map(async (photo) => {
      const url = photo.storagePath ? await refreshSignedUrl(photo.storagePath) : photo.url
      const response = await fetch(url); if (!response.ok) throw new Error('טעינת תמונות הדוח נכשלה')
      const file = await fileAttachment(await response.blob(), 'photo')
      if (!file.type.startsWith('image/') || file.type === 'image/svg+xml') throw new Error('פורמט תמונה לא נתמך בדוח Drive')
      return `<figure><img src="data:${file.type};base64,${file.data}" alt="${escapeHtml(photo.caption)}"><figcaption>${escapeHtml(photo.caption)}</figcaption></figure>`
    }))
    return `<tr><td>${index + 1}</td><td>${escapeHtml(item.description)}</td><td>${escapeHtml(item.status)}</td><td>${escapeHtml(item.responsible)}</td><td>${escapeHtml(item.treatment)}</td><td>${photos.join('')}</td></tr>`
  }))).join('')}</tbody></table></section>`))
  const html = `<!doctype html><html lang="he" dir="rtl"><meta charset="utf-8"><title>${escapeHtml(report.title)}</title><style>body{font:16px Arial,sans-serif;color:#18352b;padding:30px}h1{font-size:26px}table{border-collapse:collapse;width:100%}td,th{border:1px solid #ccd5ce;padding:10px;text-align:right;white-space:pre-wrap;overflow-wrap:anywhere}img{max-width:180px;max-height:200px}figure{margin:5px}section{margin:25px 0}@media print{tr,figure{break-inside:avoid}}</style><header><strong>${escapeHtml(workspace.settings.organizationName)}</strong><h1>${escapeHtml(report.title)}</h1><p>${escapeHtml(workspace.projects.find((project) => project.id === report.projectId)?.name)} · ${escapeHtml(report.siteAddress)}</p><p>${escapeHtml(report.inspectionDate)} · מפקח: ${escapeHtml(report.inspector)}</p></header>${sections.join('')}</html>`
  return fileAttachment(new Blob([html], { type: 'text/html' }), `${report.title.replace(/[\\/:*?"<>|]/g, '_') || 'דוח'}-${report.id}.html`)
}
