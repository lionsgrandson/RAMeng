// Route maintenance schedules independently so one queue cannot consume KV list
// allowance on every task-notification cron invocation.
export const TASK_OUTBOX_CRON = '*/5 * * * *'
export const KV_MAINTENANCE_CRON = '15,45 * * * *'
export const GOOGLE_READ_CRON = '0 */2 * * *'

export function scheduledJobs(cron) {
  // Missing cron keeps existing unit-test/manual invocation behavior.
  return {
    tasks: !cron || cron === TASK_OUTBOX_CRON,
    errors: !cron || cron === KV_MAINTENANCE_CRON,
    google: !cron || cron === GOOGLE_READ_CRON,
    drive: !cron || cron === KV_MAINTENANCE_CRON,
  }
}
