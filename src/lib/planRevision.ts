import type { FileRecord } from '../types'

export function updatePlan(record: FileRecord, patch: Partial<Pick<FileRecord, 'planStatus' | 'planUpdatedAt' | 'planRevision' | 'revisionNotes' | 'version'>>, actor: string, at: string) {
  if (Object.entries(patch).every(([key, value]) => record[key as keyof FileRecord] === value)) return record
  const snapshot = { version: record.version, planRevision: record.planRevision, planStatus: record.planStatus, planUpdatedAt: record.planUpdatedAt, revisionNotes: record.revisionNotes, updatedBy: record.updatedBy, recordedAt: at }
  return { ...record, ...patch, updatedBy: actor, planHistory: [snapshot, ...(record.planHistory || [])] }
}

export function validateProjectUpload(file: Pick<File, 'name' | 'size'>) {
  if (file.size > 50 * 1024 * 1024) throw new Error('הקובץ גדול מ-50 MB. הקטינו אותו או העלו אותו לתיקיית Drive של הפרויקט.')
  if (!file.size) throw new Error('הקובץ ריק. בחרו קובץ עם תוכן.')
  if (!/\.(pdf|png|jpe?g|gif|webp|heic|tiff?|bmp|docx?|xlsx?|csv|txt|rtf|pptx?|dwg|dxf|ifc|rvt|rfa|dgn|zip|rar|7z|mp4|mov|mp3|wav|eml|msg)$/i.test(file.name)) throw new Error('סוג הקובץ אינו נתמך. השתמשו במסמך, תמונה, תכנית הנדסית או ארכיון ZIP.')
}
