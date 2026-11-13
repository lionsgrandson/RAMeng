import type { Task } from '../types'

// Task dates represent calendar days; never convert them through UTC.
export function taskCalendarDates(task: Task, mode: 'all' | 'due' = 'all') {
  const dates = [
    { date: mode === 'all' ? task.startDate?.slice(0, 10) : undefined, label: 'תחילת משימה' },
    { date: task.dueDate?.slice(0, 10), label: 'סיום משימה' },
    { date: mode === 'all' ? task.followUpDate?.slice(0, 10) : undefined, label: 'מעקב' },
  ]
  return dates.filter((item): item is { date: string; label: string } => !!item.date && /^\d{4}-\d{2}-\d{2}$/.test(item.date) && !Number.isNaN(Date.parse(item.date)) && new Date(item.date).toISOString().slice(0, 10) === item.date)
}
