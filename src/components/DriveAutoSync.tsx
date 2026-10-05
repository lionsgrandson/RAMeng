import { useEffect, useRef, useState } from 'react'
import { integrationsApi } from '../lib/api'
import { reportAttachment, syncProjectFile } from '../lib/googleFiles'
import type { Workspace } from '../types'

export default function DriveAutoSync({ workspace, enabled, reportsAllowed, ready }: { workspace: Workspace; enabled: boolean; reportsAllowed: boolean; ready: boolean }) {
  const [attempt, setAttempt] = useState(0); const [error, setError] = useState(''); const [busy, setBusy] = useState(false)
  const done = useRef(new Map<string, string>()); const snapshot = useRef(workspace); snapshot.current = workspace
  const running = useRef(false); const rerun = useRef(false)
  useEffect(() => { const changed = () => { done.current.clear(); setAttempt((value) => value + 1) }; window.addEventListener('rameng-drive-changed', changed); return () => window.removeEventListener('rameng-drive-changed', changed) }, [])
  useEffect(() => {
    if (!enabled || !ready) return
    let active = true
    const timer = window.setTimeout(() => {
      if (running.current) { rerun.current = true; return }
      running.current = true; setBusy(true); setError('')
      void (async () => {
        const data = snapshot.current
        if (!(await integrationsApi.status()).google.connected) return
        const settings = await integrationsApi.driveSettings()
        const linked = new Set<string>()
        for (const project of data.projects) if ((await integrationsApi.projectDriveFolder(project.id)).folder) linked.add(project.id)
        const errors: string[] = []
        if (settings.autoFiles) for (const file of data.files) {
          if (!file.projectId || !linked.has(file.projectId)) continue
          const key = `file:${file.id}`; const fingerprint = `${file.storagePath || file.url}:${file.version}`
          if (done.current.get(key) === fingerprint) continue
          try { const result = await syncProjectFile(file); if (!result.skipped) done.current.set(key, fingerprint) } catch (e) { errors.push(`${file.name}: ${e instanceof Error ? e.message : 'העלאה נכשלה'}`) }
        }
        if (settings.autoReports && reportsAllowed) for (const report of data.reports) {
          if (!linked.has(report.projectId)) continue
          const key = `report:${report.id}`; const fingerprint = JSON.stringify([report, data.settings.organizationName, data.projects.find((project) => project.id === report.projectId)?.name])
          if (done.current.get(key) === fingerprint) continue
          try { const result = await integrationsApi.uploadDrive({ projectId: report.projectId, recordId: report.id, kind: 'report', file: await reportAttachment(report, data) }); if (!result.skipped) done.current.set(key, fingerprint) } catch (e) { errors.push(`${report.title}: ${e instanceof Error ? e.message : 'העלאה נכשלה'}`) }
        }
        if (active && errors.length) setError(errors.join(' · '))
      })().catch((e) => { if (active) setError(e instanceof Error ? e.message : 'סנכרון Drive נכשל') }).finally(() => { running.current = false; if (active) setBusy(false); if (rerun.current) { rerun.current = false; setAttempt((value) => value + 1) } })
    }, 2000)
    return () => { active = false; window.clearTimeout(timer) }
  }, [workspace.files, workspace.reports, workspace.projects, workspace.settings.organizationName, enabled, reportsAllowed, ready, attempt])
  return error ? <div className="error-banner" role="alert">סנכרון Drive: {error} <button type="button" className="secondary" onClick={() => setAttempt((value) => value + 1)}>ניסיון נוסף</button></div> : busy ? <div className="info-banner" role="status">בודק ומסנכרן קבצי פרויקט ודוחות ל-Drive...</div> : null
}
