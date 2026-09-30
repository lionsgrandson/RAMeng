import { useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { Cloud, RefreshCw, Save, UserRound } from 'lucide-react'
import { integrationsApi, type AdminConfig, type GoogleIntegrationConfig, type IntegrationStatus } from '../lib/api'
import { updateCurrentUserName } from '../lib/backend'
import type { Workspace } from '../types'
import { Chip, Field } from './common'

type SettingsTab = 'profile' | 'google' | 'organization' | 'system'

export default function SettingsPage({
  user,
  onUserUpdated,
  workspace,
  setWorkspace,
  canConfigureGoogle,
  canViewOrganization,
  canEditOrganization,
  isDeveloper,
}: {
  user: User
  onUserUpdated: (user: User) => void
  workspace: Workspace
  setWorkspace: React.Dispatch<React.SetStateAction<Workspace>>
  canConfigureGoogle: boolean
  canViewOrganization: boolean
  canEditOrganization: boolean
  isDeveloper: boolean
}) {
  const [tab, setTab] = useState<SettingsTab>(() => new URLSearchParams(window.location.search).get('google') === 'connected' ? 'google' : 'profile')

  return <div className="settings-layout">
    <aside className="settings-nav card" role="tablist" aria-label="הגדרות">
      <button type="button" role="tab" aria-selected={tab === 'profile'} className={tab === 'profile' ? 'active' : ''} onClick={() => setTab('profile')}>הפרופיל שלי</button>
      <button type="button" role="tab" aria-selected={tab === 'google'} className={tab === 'google' ? 'active' : ''} onClick={() => setTab('google')}>Google Workspace</button>
      {canViewOrganization && <button type="button" role="tab" aria-selected={tab === 'organization'} className={tab === 'organization' ? 'active' : ''} onClick={() => setTab('organization')}>חברה</button>}
      {isDeveloper && <button type="button" role="tab" aria-selected={tab === 'system'} className={tab === 'system' ? 'active' : ''} onClick={() => setTab('system')}>הגדרות מערכת</button>}
    </aside>
    <main>
      {tab === 'profile' && <PersonalSettings user={user} onUserUpdated={onUserUpdated} />}
      {tab === 'google' && <GoogleWorkspaceSettings canConfigure={canConfigureGoogle} />}
      {tab === 'organization' && canViewOrganization && <OrganizationSettings workspace={workspace} setWorkspace={setWorkspace} canEdit={canEditOrganization} />}
      {tab === 'system' && isDeveloper && <SystemSettings />}
    </main>
  </div>
}

function PersonalSettings({ user, onUserUpdated }: { user: User; onUserUpdated: (user: User) => void }) {
  const currentName = String(user.user_metadata?.full_name || user.user_metadata?.name || '').trim()
  const [name, setName] = useState(currentName)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  useEffect(() => { setName(currentName) }, [user.id, currentName])

  const save = async () => {
    const nextName = name.trim()
    if (!nextName) {
      setError('יש להזין שם מלא.')
      return
    }
    setSaving(true)
    setError('')
    setMessage('')
    try {
      const updated = await updateCurrentUserName(nextName)
      onUserUpdated(updated)
      setName(String(updated.user_metadata?.full_name || nextName))
      setMessage('השם נשמר בהצלחה.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שמירת השם נכשלה')
    } finally {
      setSaving(false)
    }
  }

  return <section className="card settings-card">
    <div className="card-head"><div><h2>הפרופיל שלי</h2><p>הפרטים האישיים שמוצגים במערכת.</p></div><UserRound /></div>
    {error && <div className="error-banner" role="alert">{error}</div>}
    {message && <div className="success-banner" role="status">{message}</div>}
    <div className="settings-form">
      <Field label="שם מלא"><input value={name} maxLength={100} autoComplete="name" onChange={(event) => setName(event.target.value)} /></Field>
      <Field label="כתובת מייל" hint="כתובת המייל משמשת לכניסה ואינה משתנה במסך זה."><input type="email" value={user.email || ''} readOnly /></Field>
      <div className="form-actions"><button type="button" className="primary" disabled={saving || !name.trim() || name.trim() === currentName} onClick={() => void save()}><Save /> {saving ? 'שומר...' : 'שמירת השם'}</button></div>
    </div>
  </section>
}

function OrganizationSettings({ workspace, setWorkspace, canEdit }: { workspace: Workspace; setWorkspace: React.Dispatch<React.SetStateAction<Workspace>>; canEdit: boolean }) {
  const settings = workspace.settings
  const patch = (key: keyof typeof settings, value: string) => setWorkspace((current) => ({ ...current, settings: { ...current.settings, [key]: value } }))

  return <section className="card settings-card">
    <div className="card-head"><h2>חברה</h2><Chip tone="brand">ראם הנדסה</Chip></div>
    <div className="settings-form">
      <Field label="שם החברה"><input disabled={!canEdit} value={settings.organizationName} onChange={(e) => patch('organizationName', e.target.value)} /></Field>
      <Field label="שם קצר"><input disabled={!canEdit} value={settings.organizationShortName} onChange={(e) => patch('organizationShortName', e.target.value)} /></Field>
      <Field label="טלפון"><input disabled={!canEdit} type="tel" autoComplete="tel" value={settings.phone} onChange={(e) => patch('phone', e.target.value)} /></Field>
      <Field label="מייל"><input disabled={!canEdit} type="email" autoComplete="email" value={settings.email} onChange={(e) => patch('email', e.target.value)} /></Field>
      <Field label="מייל נוסף"><input disabled={!canEdit} type="email" value={settings.secondaryEmail} onChange={(e) => patch('secondaryEmail', e.target.value)} /></Field>
      <Field label="אתר"><input disabled={!canEdit} type="url" inputMode="url" value={settings.website} onChange={(e) => patch('website', e.target.value)} /></Field>
      <Field label="כתובת לוגו"><input disabled={!canEdit} type="url" inputMode="url" value={settings.logoUrl} onChange={(e) => patch('logoUrl', e.target.value)} /></Field>
    </div>
  </section>
}

function GoogleWorkspaceSettings({ canConfigure }: { canConfigure: boolean }) {
  const [status, setStatus] = useState<IntegrationStatus | null>(null)
  const [config, setConfig] = useState<GoogleIntegrationConfig | null>(null)
  const [clientSecret, setClientSecret] = useState('')
  const [loading, setLoading] = useState(true)
  const [connecting, setConnecting] = useState(false)
  const [savingConfig, setSavingConfig] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const refresh = async () => {
    setLoading(true)
    setError('')
    try {
      const [health, googleConfig] = await Promise.all([
        integrationsApi.status(),
        canConfigure ? integrationsApi.googleConfig() : Promise.resolve(null),
      ])
      setStatus(health)
      setConfig(googleConfig)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'לא ניתן לטעון את מצב החיבור ל-Google')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('google') === 'connected') {
      setMessage('חשבון Google Workspace האישי שלך חובר בהצלחה.')
      params.delete('google')
      const query = params.toString()
      window.history.replaceState({}, '', `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`)
    }
    void refresh()
  }, [])

  const connectGoogle = async () => {
    setConnecting(true)
    setError('')
    setMessage('')
    try {
      const { url } = await integrationsApi.googleAuthUrl()
      window.location.assign(url)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'לא ניתן להתחיל את חיבור Google')
      setConnecting(false)
    }
  }

  const saveGoogleConfig = async () => {
    if (!config) return
    setSavingConfig(true)
    setError('')
    setMessage('')
    try {
      await integrationsApi.saveGoogleConfig({ clientId: config.clientId, clientSecret: clientSecret || undefined })
      setClientSecret('')
      setMessage('הגדרת Google OAuth נשמרה. כעת כל משתמש בארגון יכול להתחבר בלחיצה אחת.')
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שמירת הגדרת Google OAuth נכשלה')
    } finally {
      setSavingConfig(false)
    }
  }

  if (loading) return <section className="card settings-card"><div className="loading-state"><RefreshCw className="spin" /> טוען את חיבור Google שלך...</div></section>

  return <section className="card settings-card">
    <div className="card-head"><div><h2>Google Workspace האישי שלי</h2><p>לחיצה אחת והתחברות ל-Google מקשרות את Gmail, יומן Google ו-Google Drive של החשבון שלך בלבד.</p></div><button type="button" className="secondary" onClick={() => void refresh()}><RefreshCw /> רענון</button></div>
    {error && <div className="error-banner" role="alert">{error}</div>}
    {message && <div className="success-banner" role="status">{message}</div>}
    <div className="integration-health">
      <article><span className="google-g">G</span><div><strong>Google Workspace</strong><span>{status?.google.email || 'Gmail · Calendar · Drive'}</span></div><Chip tone={status?.google.connected ? 'good' : 'warn'}>{status?.google.connected ? 'מחובר לחשבון שלך' : 'לא מחובר'}</Chip><button type="button" className="primary" disabled={connecting || !status?.google.configured} onClick={() => void connectGoogle()}>{connecting ? 'מעביר ל-Google...' : status?.google.connected ? 'חיבור חשבון אחר' : 'התחברות עם Google'}</button></article>
    </div>
    {!status?.google.configured && <div className="error-banner" role="status">חיבור Google Workspace טרם הוגדר עבור הארגון.</div>}
    <p className="settings-help">החיבור אישי לכל משתמש. פרטי הכניסה והמידע שלך אינם משותפים עם משתמשים אחרים, ואין במסך הזה גישה ל-Supabase, למפתחות מערכת או לקוד.</p>
    {canConfigure && config && <div className="integration-form">
      <h3>הגדרת חיבור Google לארגון</h3>
      <div className="security-note">Google דורשת יצירה חד-פעמית של לקוח OAuth במסוף Google Cloud ואינה מאפשרת לאפליקציות ליצור אותו אוטומטית. לאחר שמירת המזהה והסוד כאן, החיבור האישי של המשתמשים מתבצע בכפתור אחד.</div>
      <Field label="כתובת חזרה מורשית" hint="יש להוסיף כתובת זו בדיוק ל-Authorized redirect URIs ב-Google Cloud."><input readOnly value={config.redirectUri} /></Field>
      <Field label="מזהה לקוח של Google OAuth"><input value={config.clientId} onChange={(e) => setConfig({ ...config, clientId: e.target.value })} placeholder="...apps.googleusercontent.com" /></Field>
      <Field label="סוד לקוח של Google OAuth" hint={config.secretConfigured ? 'כבר נשמר סוד. השאירו ריק כדי לא לשנות אותו.' : 'נדרש בשמירה הראשונה.'}><input type="password" autoComplete="off" value={clientSecret} onChange={(e) => setClientSecret(e.target.value)} placeholder={config.secretConfigured ? 'סוד שמור' : 'הזנת סוד לקוח'} /></Field>
      <div className="form-actions"><a className="secondary link-button" href="https://console.cloud.google.com/auth/clients" target="_blank" rel="noreferrer">פתיחת Google Cloud</a><button type="button" className="primary" disabled={savingConfig || !config.clientId.trim() || (!config.secretConfigured && !clientSecret.trim())} onClick={() => void saveGoogleConfig()}><Save /> {savingConfig ? 'שומר...' : 'שמירת חיבור Google'}</button></div>
    </div>}
  </section>
}

function SystemSettings() {
  const [config, setConfig] = useState<AdminConfig>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const refresh = async () => {
    setLoading(true)
    setError('')
    try {
      setConfig(await integrationsApi.adminConfig())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'לא ניתן לטעון את הגדרות המערכת')
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
      await integrationsApi.saveAdminConfig({ ...config, openaiApiKey: undefined, openaiModel: undefined })
      setMessage('הגדרות המערכת נשמרו.')
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שמירת הגדרות המערכת נכשלה')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <section className="card settings-card"><div className="loading-state"><RefreshCw className="spin" /> טוען הגדרות מערכת...</div></section>

  return <section className="card settings-card">
    <div className="card-head"><div><h2>הגדרות מערכת למפתח</h2><p>מפתחות ותשתיות משותפות. מסך זה אינו זמין למנהלים או למשתמשים רגילים.</p></div><Cloud /></div>
    {error && <div className="error-banner" role="alert">{error}</div>}
    {message && <div className="success-banner" role="status">{message}</div>}
    <div className="integration-form">
      <Field label="כתובת פרויקט Supabase"><input value={config.supabaseUrl || ''} onChange={(e) => setConfig({ ...config, supabaseUrl: e.target.value })} placeholder="https://xxxxx.supabase.co" /></Field>
      <Field label="המפתח הציבורי של Supabase"><textarea rows={3} value={config.supabaseAnonKey || ''} onChange={(e) => setConfig({ ...config, supabaseAnonKey: e.target.value })} /></Field>
      <Field label="מייל מפתח"><input value={(config.adminEmails || []).join(', ')} onChange={(e) => setConfig({ ...config, adminEmails: e.target.value.split(',').map((value) => value.trim()).filter(Boolean) })} /></Field>
      <Field label="מזהה לקוח של Google OAuth"><input value={config.googleClientId || ''} onChange={(e) => setConfig({ ...config, googleClientId: e.target.value })} /></Field>
      <Field label="סוד לקוח של Google OAuth"><input type="password" autoComplete="off" value={config.googleClientSecret || ''} onChange={(e) => setConfig({ ...config, googleClientSecret: e.target.value })} placeholder="השאירו ריק אם אין שינוי" /></Field>
      <Field label="מפתח API של Google Maps / Places" hint="אופציונלי. משפר חיפוש כתובות; המפתח נשמר בצד השרת בלבד."><input type="password" autoComplete="off" value={config.googleMapsApiKey || ''} onChange={(e) => setConfig({ ...config, googleMapsApiKey: e.target.value })} placeholder="השאירו ריק אם אין שינוי" /></Field>
      <div className="form-actions"><button type="button" className="primary" disabled={saving} onClick={() => void save()}><Save /> {saving ? 'שומר...' : 'שמירת הגדרות מערכת'}</button></div>
    </div>
  </section>
}
