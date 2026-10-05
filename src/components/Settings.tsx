import { lazy, Suspense, useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { Cloud, RefreshCw, Save, UserRound } from 'lucide-react'
import { integrationsApi, type AdminConfig, type GoogleIntegrationConfig, type IntegrationStatus } from '../lib/api'
import { updateCurrentUserName } from '../lib/backend'
import type { Workspace } from '../types'
import { Chip, Field } from './common'

import { DriveSettingsPanel } from './DriveConnection'
const RichTextEditor = lazy(() => import('./RichTextEditor'))

type SettingsTab = 'profile' | 'google' | 'organization' | 'system'

export default function SettingsPage({
  user,
  onUserUpdated,
  workspace,
  setWorkspace,
  canConfigureGoogle,
  canViewDrive,
  canManageDrive,
  canViewOrganization,
  canEditOrganization,
  isDeveloper,
}: {
  user: User
  onUserUpdated: (user: User) => void
  workspace: Workspace
  setWorkspace: React.Dispatch<React.SetStateAction<Workspace>>
  canConfigureGoogle: boolean
  canViewDrive: boolean
  canManageDrive: boolean
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
      {tab === 'google' && <><GoogleWorkspaceSettings canConfigure={canConfigureGoogle} />{canViewDrive && <section className="card settings-card"><DriveSettingsPanel canEdit={canManageDrive} /></section>}</>}
      {tab === 'organization' && canViewOrganization && <OrganizationSettings workspace={workspace} setWorkspace={setWorkspace} canEdit={canEditOrganization} />}
      {tab === 'system' && isDeveloper && <SystemSettings />}
    </main>
  </div>
}

function PersonalSettings({ user, onUserUpdated }: { user: User; onUserUpdated: (user: User) => void }) {
  const currentName = String(user.user_metadata?.full_name || user.user_metadata?.name || '').trim()
  const [signature, setSignature] = useState({ html: '', enabled: true }); const [signatureReady, setSignatureReady] = useState(false); const [signatureBusy, setSignatureBusy] = useState(false); const [signatureError, setSignatureError] = useState(''); const [signatureSaved, setSignatureSaved] = useState(false)
  useEffect(() => { let active = true; void integrationsApi.mailSignature().then((value) => { if (active) { setSignature(value); setSignatureReady(true) } }).catch((e) => { if (active) setSignatureError(e.message) }); return () => { active = false } }, [user.id])
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
    <div className="card-head"><h2>הפרופיל שלי</h2><UserRound /></div>
    {error && <div className="error-banner" role="alert">{error}</div>}
    {message && <div className="success-banner" role="status">{message}</div>}
    <div className="settings-form">
      <Field label="שם מלא"><input value={name} maxLength={100} autoComplete="name" onChange={(event) => setName(event.target.value)} /></Field>
      <Field label="כתובת מייל"><input type="email" value={user.email || ''} readOnly /></Field>
      <section className="signature-settings"><h3>החתימה שלי למייל</h3><p>החתימה אישית לחשבון שלך ומתווספת להודעות חדשות ולתשובות. אפשר לערוך או להסיר אותה לפני שליחה.</p>
      {signatureError && <div className="error-banner" role="alert">{signatureError}</div>}
      {signatureReady && <><Suspense fallback={<p>טוען עורך...</p>}><RichTextEditor label="חתימה למייל" value={signature.html} disabled={signatureBusy} onChange={(html) => { setSignatureSaved(false); setSignature({ ...signature, html }) }} /></Suspense>
      <label><input type="checkbox" checked={signature.enabled} disabled={signatureBusy} onChange={(e) => { setSignatureSaved(false); setSignature({ ...signature, enabled: e.target.checked }) }} /> הוספת החתימה אוטומטית</label>
      <button type="button" className="primary" disabled={signatureBusy} onClick={() => { setSignatureBusy(true); setSignatureError(''); void integrationsApi.saveMailSignature(signature).then((result) => { setSignature(result); setSignatureSaved(true) }).catch((e) => setSignatureError(e.message)).finally(() => setSignatureBusy(false)) }}>{signatureBusy ? 'שומר...' : 'שמירת החתימה'}</button>{signatureSaved && <p className="success-banner" role="status">החתימה נשמרה</p>}</>}
      </section>
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
  const [syncingGoogle, setSyncingGoogle] = useState(false)
  const syncGoogle = async () => {
    setSyncingGoogle(true); setError(''); setMessage('')
    try { let cursor = ''; let driveCursor = ''; let feedsDone = false; let driveDone = false; let failed = 0; do { const result = await integrationsApi.syncGoogle({ cursor, driveCursor, feedsDone, driveDone }); cursor = result.cursor; driveCursor = result.driveCursor; feedsDone = !cursor; driveDone = !driveCursor; failed += result.failed } while (cursor || driveCursor); window.dispatchEvent(new Event('rameng-google-synced')); setMessage(failed ? 'חלק מהנתונים לא הסתנכרנו. נסו שוב או בדקו את חיבור Google.' : 'סנכרון Gmail, היומן ותיקיות Drive המחוברות הסתיים.') } catch (e) { setError(e instanceof Error ? e.message : 'סנכרון Google נכשל') } finally { setSyncingGoogle(false) }
  }
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
      setMessage('Google חובר בהצלחה.')
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
      setMessage('החיבור נשמר.')
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שמירת החיבור נכשלה')
    } finally {
      setSavingConfig(false)
    }
  }

  if (loading) return <section className="card settings-card"><div className="loading-state"><RefreshCw className="spin" /> טוען את חיבור Google שלך...</div></section>

  return <section className="card settings-card">
    <div className="card-head"><div><h2>Google Workspace</h2><p>Gmail, יומן ו-Drive · עדכון אוטומטי פעם ביום. ניתן לסנכרן ידנית בכל עת.</p></div><button type="button" className="secondary" onClick={() => void refresh()}><RefreshCw /> רענון</button></div>
    {error && <div className="error-banner" role="alert">{error}</div>}
    {message && <div className="success-banner" role="status">{message}</div>}
    <div className="integration-health">
      <article><span className="google-g">G</span><div><strong>Google Workspace</strong><span>{status?.google.email || 'Gmail · Calendar · Drive'}</span></div><Chip tone={status?.google.connected ? 'good' : 'warn'}>{status?.google.connected ? 'מחובר לחשבון שלך' : 'לא מחובר'}</Chip><button type="button" className="primary" disabled={connecting || !status?.google.configured} onClick={() => void connectGoogle()}>{connecting ? 'מעביר ל-Google...' : status?.google.connected ? 'חיבור חשבון אחר' : 'התחברות עם Google'}</button></article>
    </div>
    {status?.google.connected && <button type="button" className="secondary" disabled={syncingGoogle} onClick={() => void syncGoogle()}><RefreshCw /> {syncingGoogle ? 'מסנכרן Google...' : 'סנכרון כל נתוני Google'}</button>}
    {!status?.google.configured && <div className="error-banner" role="status">החיבור ל-Google עדיין לא זמין.</div>}
    {canConfigure && config && <div className="integration-form">
      <h3>הגדרת Google</h3>
      <Field label="כתובת הפניה" hint="העתיקו את הכתובת ל-Google Cloud."><input readOnly value={config.redirectUri} /></Field>
      <Field label="מזהה Google"><input value={config.clientId} onChange={(e) => setConfig({ ...config, clientId: e.target.value })} placeholder="...apps.googleusercontent.com" /></Field>
      <Field label="מפתח Google" hint={config.secretConfigured ? 'כבר שמור. השאירו ריק אם אין שינוי.' : 'נדרש בשמירה הראשונה.'}><input type="password" autoComplete="off" value={clientSecret} onChange={(e) => setClientSecret(e.target.value)} placeholder={config.secretConfigured ? 'מפתח שמור' : 'הזנת מפתח'} /></Field>
      <div className="form-actions"><a className="secondary link-button" href="https://console.cloud.google.com/auth/clients" target="_blank" rel="noreferrer">פתיחת Google Cloud</a><button type="button" className="primary" disabled={savingConfig || !config.clientId.trim() || (!config.secretConfigured && !clientSecret.trim())} onClick={() => void saveGoogleConfig()}><Save /> {savingConfig ? 'שומר...' : 'שמירה'}</button></div>
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
    <div className="card-head"><h2>הגדרות מערכת</h2><Cloud /></div>
    {error && <div className="error-banner" role="alert">{error}</div>}
    {message && <div className="success-banner" role="status">{message}</div>}
    <div className="integration-form">
      <Field label="כתובת Supabase"><input value={config.supabaseUrl || ''} onChange={(e) => setConfig({ ...config, supabaseUrl: e.target.value })} placeholder="https://xxxxx.supabase.co" /></Field>
      <Field label="מפתח Supabase"><textarea rows={3} value={config.supabaseAnonKey || ''} onChange={(e) => setConfig({ ...config, supabaseAnonKey: e.target.value })} /></Field>
      <Field label="מייל מנהל"><input value={(config.adminEmails || []).join(', ')} onChange={(e) => setConfig({ ...config, adminEmails: e.target.value.split(',').map((value) => value.trim()).filter(Boolean) })} /></Field>
      <Field label="מזהה Google"><input value={config.googleClientId || ''} onChange={(e) => setConfig({ ...config, googleClientId: e.target.value })} /></Field>
      <Field label="מפתח Google"><input type="password" autoComplete="off" value={config.googleClientSecret || ''} onChange={(e) => setConfig({ ...config, googleClientSecret: e.target.value })} placeholder="השאירו ריק אם אין שינוי" /></Field>
      <Field label="מפתח Google Picker" hint="הפעילו Google Picker API באותו פרויקט של OAuth והגבילו את המפתח לדומיין CRM"><input type="password" autoComplete="off" value={config.googlePickerApiKey || ''} onChange={(e) => setConfig({ ...config, googlePickerApiKey: e.target.value })} placeholder="השאירו ריק אם אין שינוי" /></Field>
      <Field label="מפתח Google Maps" hint="אופציונלי"><input type="password" autoComplete="off" value={config.googleMapsApiKey || ''} onChange={(e) => setConfig({ ...config, googleMapsApiKey: e.target.value })} placeholder="השאירו ריק אם אין שינוי" /></Field>
      <div className="form-actions"><button type="button" className="primary" disabled={saving} onClick={() => void save()}><Save /> {saving ? 'שומר...' : 'שמירת הגדרות מערכת'}</button></div>
    </div>
  </section>
}
