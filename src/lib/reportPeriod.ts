// Calendar days, independent of UTC offset and DST; Israeli reporting week Sunday–Saturday.
export function reportWeekPeriod(day: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error('תאריך דיווח לא תקין')
  const date = new Date(`${day}T00:00:00Z`)
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== day) throw new Error('תאריך דיווח לא תקין')
  date.setUTCDate(date.getUTCDate() - date.getUTCDay())
  const periodStart = date.toISOString().slice(0, 10)
  date.setUTCDate(date.getUTCDate() + 6)
  return { periodStart, periodEnd: date.toISOString().slice(0, 10) }
}
