import type { Task } from '../types'

// Task dates represent calendar days; never convert them through UTC.
export function taskCalendarDates(task: Task) {
  const dates = [
    { date: task.startDate?.slice(0, 10), label: 'תחילת משימה' },
    { date: task.dueDate?.slice(0, 10), label: 'סיום משימה' },
    { date: task.followUpDate?.slice(0, 10), label: 'מעקב' },
  ]
  return dates.filter((item): item is { date: string; label: string } => !!item.date && /^\d{4}-\d{2}-\d{2}$/.test(item.date))
}
