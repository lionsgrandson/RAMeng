import type { Task } from '../types'

export const taskCalendarTime = (task: Task, date: string) => (task.startDate || task.dueDate || task.followUpDate) === date ? task.scheduledTime : undefined

// Scheduling is a Jerusalem wall-clock time, independent of the browser zone.
export function jerusalemInstant(date: string, time = '09:00') {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new Error('יש להזין תאריך ושעה תקינים')
  const wall = Date.parse(`${date}T${time}:00Z`)
  const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
  const matches: string[] = []
  for (const offset of [120, 180]) {
    const candidate = new Date(wall - offset * 60000)
    const parts = Object.fromEntries(formatter.formatToParts(candidate).map(part => [part.type, part.value]))
    if (`${parts.year}-${parts.month}-${parts.day}` === date && `${parts.hour}:${parts.minute}` === time) matches.push(candidate.toISOString())
  }
  if (matches.length !== 1) throw new Error(matches.length ? 'השעה מופיעה פעמיים במעבר לשעון חורף. בחרו שעה אחרת' : 'השעה אינה קיימת במעבר לשעון קיץ. בחרו שעה אחרת')
  return matches[0]
}

export function jerusalemDate(instant: string) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(instant)).map(part => [part.type, part.value]))
  return `${parts.year}-${parts.month}-${parts.day}`
}
