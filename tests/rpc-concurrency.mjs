import assert from 'node:assert/strict'

// Called only by the disposable local PostgreSQL runner. No remote URL input.
export async function runConcurrencyChecks(database) {
  const root = database.getPgClient(), admin = database.getPgClient(), external = database.getPgClient()
  await Promise.all([root.connect(), admin.connect(), external.connect()])
  const org = '90000000-0000-0000-0000-000000000001'
  const manager = '90000000-0000-0000-0000-000000000002'
  const contractor = '90000000-0000-0000-0000-000000000003'
  try {
    const adminPid = (await admin.query('select pg_backend_pid() as pid')).rows[0].pid
    const externalPid = (await external.query('select pg_backend_pid() as pid')).rows[0].pid
    const waitForLock = async pid => {
      const deadline = Date.now() + 3000
      while (Date.now() < deadline) {
        const state = await root.query("select wait_event_type='Lock' as waiting from pg_stat_activity where pid=$1", [pid])
        if (state.rows[0]?.waiting) return
        await new Promise(resolve => setTimeout(resolve, 10))
      }
      throw Error('Expected concurrent transaction to wait for a database lock')
    }
    await root.query('insert into auth.users(id,email) values($1,$3),($2,$4)', [manager, contractor, 'concurrency-admin@example.test', 'concurrency-external@example.test'])
    await root.query('insert into public.organizations(id) values($1)', [org])
    await root.query("insert into public.memberships(org_id,user_id,role) values($1,$2,'admin'),($1,$3,'external')", [org, manager, contractor])
    await root.query("insert into public.project_collaborators(org_id,project_id,user_id) values($1,'p',$2)", [org, contractor])
    await root.query('insert into public.workspace_state(org_id,data) values($1,$2)', [org, JSON.stringify({ projects: [{ id: 'p', name: 'QA', categoryIds: [] }], tasks: [{ id: 'own', projectId: 'p', assigneeId: contractor, title: 'External QA', status: 'בטיפול' }, { id: 'other', projectId: 'p', title: 'Original', status: 'בטיפול' }], taskStatuses: ['בטיפול', 'בוצע'], audit: [] })])
    for (const [client, actor] of [[admin, manager], [external, contractor]]) {
      await client.query('set role authenticated')
      await client.query("select set_config('request.jwt.claim.sub',$1,false)", [actor])
    }
    const old = (await admin.query('select * from public.get_workspace_state($1)', [org])).rows[0]
    await external.query('begin')
    await external.query("select public.set_assigned_task_status($1,'own','בוצע','בטיפול')", [org])
    // The stale whole-workspace save blocks on the external transaction's lock.
    const staleResult = admin.query('select public.save_workspace_state($1,$2,$3)', [org, old.data, old.version]).then(() => ({ ok: true }), error => ({ error }))
    await waitForLock(adminPid)
    await external.query('commit')
    assert.match((await staleResult).error?.message || '', /WORKSPACE_VERSION_CONFLICT/)
    assert.equal((await root.query('select data from public.workspace_state where org_id=$1', [org])).rows[0].data.tasks[0].status, 'בוצע')
    console.log('PASS concurrent stale administrator save cannot overwrite contractor completion')

    const latest = (await admin.query('select * from public.get_workspace_state($1)', [org])).rows[0]
    latest.data.tasks[1].title = 'Concurrent unrelated edit'
    await admin.query('begin')
    await admin.query('select public.save_workspace_state($1,$2,$3)', [org, latest.data, latest.version])
    const statusResult = external.query("select public.set_assigned_task_status($1,'own','בטיפול','בוצע')", [org])
    await waitForLock(externalPid)
    await admin.query('commit')
    await statusResult
    const final = (await root.query('select data from public.workspace_state where org_id=$1', [org])).rows[0].data
    assert.equal(final.tasks[0].status, 'בטיפול')
    assert.equal(final.tasks[1].title, 'Concurrent unrelated edit')
    console.log('PASS concurrent scoped status update preserves an administrator edit to another task')
  } finally {
    await Promise.allSettled([admin.query('rollback'), external.query('rollback')])
    await Promise.all([root.end(), admin.end(), external.end()])
  }
}
