const dateColumns = ['תאריך התחלה', 'תאריך סיום', 'מועד מעקב']

export async function readImportRows(buffer: ArrayBuffer, csv: boolean): Promise<Record<string, unknown>[]> {
  const XLSX = await import('@e965/xlsx')
  const workbook = csv
    ? XLSX.read(new TextDecoder('utf-8').decode(buffer), { type: 'string', raw: true })
    : XLSX.read(buffer, { type: 'array', cellDates: true })
  const firstName = workbook.SheetNames[0]
  if (!firstName) throw new Error('הקובץ לא מכיל גיליון נתונים')
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[firstName], { defval: '' })
  if (!rows.length) throw new Error('לא נמצאו שורות לייבוא')
  for (const row of rows) {
    for (const column of dateColumns) {
      const value = row[column]
      if (value === undefined || value === '') continue
      let year: number, month: number, day: number
      if (value instanceof Date) { year = value.getFullYear(); month = value.getMonth() + 1; day = value.getDate() }
      else if (typeof value === 'number') {
        const parsed = XLSX.SSF.parse_date_code(value)
        if (!parsed) throw new Error(`תאריך לא תקין בעמודה ${column}`)
        year = parsed.y; month = parsed.m; day = parsed.d
      } else {
        const text = String(value).trim()
        const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/)
        const local = text.match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{4})$/)
        if (iso) { year = Number(iso[1]); month = Number(iso[2]); day = Number(iso[3]) }
        else if (local) { year = Number(local[3]); month = Number(local[2]); day = Number(local[1]) }
        else throw new Error(`תאריך לא תקין בעמודה ${column}. השתמשו בפורמט יום/חודש/שנה.`)
      }
      const date = new Date(Date.UTC(year, month - 1, day))
      if (date.getUTCFullYear() !== year || date.getUTCMonth() + 1 !== month || date.getUTCDate() !== day) throw new Error(`תאריך לא תקין בעמודה ${column}`)
      row[column] = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    }
  }
  return rows
}
