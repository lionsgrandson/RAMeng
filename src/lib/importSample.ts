import { tableCsv } from './tableExport'

export const taskImportHeaders = ['משימה', 'פרויקט', 'סטטוס', 'תאריך התחלה', 'תאריך סיום', 'מועד מעקב', 'הערות', 'מייל']
const sampleRow = (projectId: string) => ['משימת דוגמה — החליפו לפני ייבוא', projectId, 'טרם התחיל', '2026-10-20', '27/10/2026', '', 'הערה לדוגמה, עם פסיק', '']
export function taskImportSample(projectId = '') {
  return tableCsv(taskImportHeaders, [sampleRow(projectId)])
}
export async function taskImportExcel(projectId = '') {
  const XLSX = await import('@e965/xlsx')
  const book = XLSX.utils.book_new()
  const sheet = XLSX.utils.aoa_to_sheet([taskImportHeaders, sampleRow(projectId)])
  sheet['!cols'] = taskImportHeaders.map((_, index) => ({ wch: index === 0 || index === 6 ? 45 : 24 }))
  XLSX.utils.book_append_sheet(book, sheet, 'משימות')
  return XLSX.write(book, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer
}
export async function downloadTaskImportExcel(projectId: string) {
  const url = URL.createObjectURL(new Blob([await taskImportExcel(projectId)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
  const link = document.createElement('a'); link.href = url; link.download = 'rameng-task-import-he.xlsx'; link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
export function downloadTaskImportSample(projectId: string) {
  const url = URL.createObjectURL(new Blob([taskImportSample(projectId)], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a'); link.href = url; link.download = 'rameng-task-import-he.csv'; link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
