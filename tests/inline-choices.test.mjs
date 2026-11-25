import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'

const source = readFileSync(new URL('../src/lib/inlineChoices.ts', import.meta.url), 'utf8')
const transpiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText
const exports = {}
runInNewContext(transpiled, { exports })
const { createTaskStatus, createProfession, createColumnOption, projectStatuses, contactStatuses } = exports

const fixture = () => ({
  taskStatuses: ['טרם התחיל', 'בוצע'],
  categories: [{ id: 'profession-electric', name: 'חשמל' }],
  projects: [{ id: 'project-one', name: 'פרויקט', status: 'בתכנון', categoryIds: [] }],
  contacts: [{ id: 'contact-one', status: 'פעיל' }],
  taskColumns: [{ id: 'column-one', key: 'custom.column-one', options: ['א'] }],
})

test('task status options persist in a serializable shared workspace snapshot', () => {
  const original = fixture()
  const next = createTaskStatus(original, '  בדיקת  קבלן ')
  assert.deepEqual([...next.taskStatuses], ['טרם התחיל', 'בוצע', 'בדיקת קבלן'])
  const reopened = JSON.parse(JSON.stringify(next))
  assert.ok(reopened.taskStatuses.includes('בדיקת קבלן'))
  assert.deepEqual([...original.taskStatuses], ['טרם התחיל', 'בוצע'])
  assert.equal(createTaskStatus(next, 'בדיקת קבלן').taskStatuses.length, next.taskStatuses.length)
  assert.equal(createTaskStatus(next, '  בדיקת קבלן  ').taskStatuses.length, next.taskStatuses.length)
  assert.equal(createTaskStatus(next, 'בדיקת קבלן'.toLocaleUpperCase('he-IL')).taskStatuses.length, next.taskStatuses.length)
})

test('professions can be created and associated with a project without duplicates', () => {
  const original = fixture()
  const next = createProfession(original, 'קונסטרוקציה', 'profession-structural', 'project-one')
  assert.equal(next.categories.length, 2)
  assert.deepEqual([...next.projects[0].categoryIds], ['profession-structural'])
  const repeated = createProfession(next, ' קונסטרוקציה ', 'different-id', 'project-one')
  assert.equal(repeated.categories.length, 2)
  assert.deepEqual([...repeated.projects[0].categoryIds], ['profession-structural'])
  const existing = createProfession(next, 'חשמל', 'ignored-id', 'project-one')
  assert.deepEqual([...existing.projects[0].categoryIds], ['profession-structural', 'profession-electric'])
  assert.equal(original.projects[0].categoryIds.length, 0)
})

test('custom column choices persist only on their own column', () => {
  const original = fixture()
  const next = createColumnOption(original, 'column-one', 'בדיקה')
  assert.deepEqual([...next.taskColumns[0].options], ['א', 'בדיקה'])
  assert.equal(createColumnOption(next, 'column-one', ' בדיקה ').taskColumns[0].options.length, 2)
  assert.deepEqual([...original.taskColumns[0].options], ['א'])
})

test('contact and project status selectors include saved custom record states', () => {
  const state = fixture()
  state.projects[0].status = 'בבדיקת יועץ'
  state.contacts[0].status = 'לחזור בשבוע הבא'
  assert.ok(projectStatuses(state).includes('בבדיקת יועץ'))
  assert.ok(contactStatuses(state).includes('לחזור בשבוע הבא'))
})

test('empty user-defined options are rejected', () => {
  assert.throws(() => createTaskStatus(fixture(), '   '))
  assert.throws(() => createProfession(fixture(), '', 'id'))
  assert.throws(() => createColumnOption(fixture(), 'column-one', ''))
})
