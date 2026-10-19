export const escapeTableHtml = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!)

export function tableCsv(headers: string[], rows: string[][]) {
  // Quoting does not prevent spreadsheet formulas from executing.
  const cell = (value: string) => `"${(/^[\s]*[=+@-]/.test(value) ? "'" : '') + value.replaceAll('"', '""')}"`
  return '\uFEFF' + [headers, ...rows].map(row => row.map(cell).join(',')).join('\r\n')
}

export function downloadTable(title: string, headers: string[], rows: string[][]) {
  const url = URL.createObjectURL(new Blob([tableCsv(headers, rows)], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a'); link.href = url; link.download = `${title}.csv`; link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function printTable(title: string, headers: string[], rows: string[][], note = '') {
  const popup = window.open('', '_blank')
  if (!popup) throw new Error('אפשרו פתיחת חלון להדפסת הדוח')
  popup.document.write(`<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><title>${escapeTableHtml(title)}</title><style>body{font:16px Arial;padding:24px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #aaa;padding:10px;text-align:right;overflow-wrap:anywhere}</style></head><body><h1>${escapeTableHtml(title)}</h1><p>${escapeTableHtml(note)}</p><table><thead><tr>${headers.map(cell => `<th>${escapeTableHtml(cell)}</th>`).join('')}</tr></thead><tbody>${rows.map(row => `<tr>${row.map(cell => `<td>${escapeTableHtml(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table></body></html>`)
  popup.document.close(); popup.focus(); popup.print()
}
