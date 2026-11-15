import test from 'node:test'
import assert from 'node:assert/strict'
import { scheduledJobs, TASK_OUTBOX_CRON, KV_MAINTENANCE_CRON, GOOGLE_READ_CRON } from '../worker/src/cronSchedule.js'

test('five-minute task cron does not perform KV list scans', () => {
  assert.deepEqual(scheduledJobs(TASK_OUTBOX_CRON), { tasks: true, errors: false, google: false, drive: false })
})

test('KV queue maintenance scans error and Drive queues, not Google feeds', () => {
  assert.deepEqual(scheduledJobs(KV_MAINTENANCE_CRON), { tasks: false, errors: true, google: false, drive: true })
})

test('Google feed refresh is isolated to the two-hour schedule', () => {
  assert.deepEqual(scheduledJobs(GOOGLE_READ_CRON), { tasks: false, errors: false, google: true, drive: false })
})

test('an unknown cron performs no maintenance work', () => {
  assert.deepEqual(scheduledJobs('invalid'), { tasks: false, errors: false, google: false, drive: false })
})

test('manual scheduled calls continue to support existing integration tests', () => {
  assert.deepEqual(scheduledJobs(), { tasks: true, errors: true, google: true, drive: true })
})
