import { useEffect, useState } from 'react'
import { Cloud, RefreshCw, Save } from 'lucide-react'
import { integrationsApi, type AdminConfig } from '../lib/api'
import type { Workspace } from '../types'
import { Chip, Field } from './common'

export default function SettingsPage({ workspace, setWorkspace }: { workspace: Workspace; setWorkspace: React.Dispatch<React.SetStateAction<Workspace>> }) {
  const [tab, setTab] = useState<'organization' | 'integrations'>('organization')
  return <div className="settings-layout">
    <aside className="settings-nav card">
      <button className={tab === 'organization' ? 'active' : ''} onClick={() => setTab('organization')}>פרטי החברה</button>
      <button className={tab === 'integrations' ? 'active' : ''} onClick={() => setTab('integrations')}>חיבורים</button>
    </aside>
    <main>
      {tab === 'organization' && <OrganizationSettings workspace={workspace} setWorkspace={setWorkspace} />}
      {tab === 'integrations' && <IntegrationSettings workspace={workspace} setWorkspace={setWorkspace} />}
    </main>
  </div>
}

function OrganizationSettings({ workspace, setWorkspace }: { workspace: Workspace; setWorkspace: React.Dispatch<React.SetStateAction<Workspace>> }) {
  const settings = workspace.settings
  const patch = (key: keyof typeof settings, value: string) => setWorkspace((current) => ({ ...current, settings: { ...current.settings, [key]: value } }))

  return <section className="card settings-card">
    <div className="card-head"><div><h2>פרטי החברה</h2><p>הפרטים שמופיעים במערכת ובדוחות.</p></div><Chip tone="brand">ראם הנדסה</Chip></div>
    <div className="settings-form">
      <Field label="שם החברה"><input value={settings.organizationName} onChange={(e) => patch('organizationName', e.target.value)} /></Field>
      <Field label="שם קצר"><input value={settings.organizationShortName} onChange={(e) => patch('organizationShortName', e.target.value)} /></Field>
      <Field label="טלפון"><input value={settings.phone} onChange={(e) => patch('phone', e.target.value)} /></Field>
      <Field label="מייל"><input value={settings.email} onChange={(e) => patch('email', e.target.value)} /></Field>
      <Field label="מייל נוסף"><input value={settings.secondaryEmail} onChange={(e) => patch('secondaryEmail', e.target.value)} /></Field>
      <Field label="אתר"><input value={settings.website} onChange={(e) => patch('website', e.target.value)} /></Field>
      <Field label="כתובת לוגו"><input value={settings.logoUrl} onChange={(e) => patch('logoUrl', e.target.value)} /></Field>
    </div>
  </section>
}

function IntegrationSettings({ workspace, setWorkspace }: { workspace: Workspace; setWorkspace: React.Dispatch<React.SetStateAction<Workspace>> }) {
  const [config, setConfig] = useState<AdminConfig>({})
  const [status, setStatus] = useState<{ google: { connected: boolean; email?: string }; openai: { configured: boolean }; configured: boolean } | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const refresh = async () => {
    setLoading(true)
    setError('')
    try {
      const [current, health] = await Promise.all([integrationsApi.adminConfig(), integrationsApi.status()])
      setConfig(current)
      setStatus(health)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'לא ניתן לטעון את החיבורים')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void refresh() }, [])

  const save = async () => {
    setSaving(true)
    setError('')
    setMessage('')
    try {
      await integrationsApi.saveAdminConfig({
        ...config,
        driveRootFolderId: workspace.settings.driveRootFolderId,
        openaiApiKey: undefined,
        openaiModel: undefined,
      })
      setMessage('החיבורים נשמרו.')
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שמירה נכשלה')
    } finally {
      setSaving(false)
    }
  }

  const connectGoogle = async () => {
    try {
      const { url } = await integrationsApi.googleAuthUrl()
      window.location.href = url
    } catch (e) {
      setError(e instanceof Error ? e.message : 'לא ניתן להתחיל את חיבור Google')
    }
  }

  if (loading) return <section className="card settings-card"><div className="loading-state"><RefreshCw className="spin" /> טוען חיבורים...</div></section>

  return <section className="card settings-card">
    <div className="card-head"><div><h2>חיבורים</h2><p>הגדרת מסד הנתונים ושירותי Google.</p></div><button className="secondary" onClick={() => void refresh()}><RefreshCw /> רענון</button></div>
    {error && <div className="error-banner">{error}</div>}
    {message && <div className="success-banner">{message}</div>}
    <div className="integration-health">
      <article><Cloud /><div><strong>מערכת נתונים</strong><span>{status?.configured ? 'מחוברת' : 'לא מחוברת'}</span></div><Chip tone={status?.configured ? 'good' : 'warn'}>{status?.configured ? 'מחובר' : 'דורש הגדרה'}</Chip></article>
      <article><span className="google-g">G</span><div><strong>Google</strong><span>{status?.google.email || 'Gmail · Calendar · Drive'}</span></div><Chip tone={status?.google.connected ? 'good' : 'warn'}>{status?.google.connected ? 'מחובר' : 'לא מחובר'}</Chip><button className="secondary" onClick={() => void connectGoogle()}>{status?.google.connected ? 'חיבור מחדש' : 'חיבור Google'}</button></article>
    </div>
    <div className="integration-form">
      <Field label="Supabase Project URL"><input value={config.supabaseUrl || ''} onChange={(e) => setConfig({ ...config, supabaseUrl: e.target.value })} placeholder="https://xxxxx.supabase.co" /></Field>
      <Field label="Supabase anon key"><textarea rows={3} value={config.supabaseAnonKey || ''} onChange={(e) => setConfig({ ...config, supabaseAnonKey: e.target.value })} /></Field>
      <Field label="מייל מפתח"><input value={(config.adminEmails || []).join(', ')} onChange={(e) => setConfig({ ...config, adminEmails: e.target.value.split(',').map((value) => value.trim()).filter(Boolean) })} /></Field>
      <Field label="Google OAuth Client ID"><input value={config.googleClientId || ''} onChange={(e) => setConfig({ ...config, googleClientId: e.target.value })} /></Field>
      <Field label="Google OAuth Client Secret"><input type="password" value={config.googleClientSecret || ''} onChange={(e) => setConfig({ ...config, googleClientSecret: e.target.value })} placeholder="השאירו ריק אם אין שינוי" /></Field>
      <Field label="תיקיית Google Drive ראשית"><input value={workspace.settings.driveRootFolderId} onChange={(e) => setWorkspace((current) => ({ ...current, settings: { ...current.settings, driveRootFolderId: e.target.value } }))} /></Field>
      <div className="form-actions"><button className="primary" disabled={saving} onClick={() => void save()}><Save /> {saving ? 'שומר...' : 'שמירה'}</button></div>
    </div>
  </section>
}
