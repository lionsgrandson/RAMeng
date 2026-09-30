import { useState, type FormEvent } from 'react'
import { Building2, KeyRound, LockKeyhole } from 'lucide-react'
import { bootstrapServer } from '../lib/api'
import { requestPasswordReset, signIn, updatePassword } from '../lib/backend'
import { Field } from './common'

function authErrorMessage(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : ''
  const normalized = message.toLowerCase()
  if (normalized.includes('invalid login credentials')) return 'המייל או הסיסמה שגויים.'
  if (normalized.includes('email not confirmed')) return 'יש לאשר את כתובת המייל לפני ההתחברות.'
  if (normalized.includes('user already registered')) return 'כבר קיים חשבון עם כתובת המייל הזו.'
  if (normalized.includes('password should be at least')) return 'הסיסמה קצרה מדי.'
  if (normalized.includes('rate limit')) return 'בוצעו יותר מדי ניסיונות. נסו שוב בעוד כמה דקות.'
  return message || fallback
}

export function SetupScreen() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    setLoading(true)
    setError('')
    try {
      await bootstrapServer({
        setupToken: String(data.get('setupToken') || ''),
        organizationName: 'ר.א.ם הנדסה',
        supabaseUrl: String(data.get('supabaseUrl') || ''),
        supabaseAnonKey: String(data.get('supabaseAnonKey') || ''),
        adminEmails: String(data.get('adminEmails') || '').split(',').map((value) => value.trim()).filter(Boolean),
        googleClientId: String(data.get('googleClientId') || ''),
        googleClientSecret: String(data.get('googleClientSecret') || ''),
        googleMapsApiKey: String(data.get('googleMapsApiKey') || ''),
      })
      setDone(true)
      setTimeout(() => window.location.reload(), 1300)
    } catch (e) {
      setError(authErrorMessage(e, 'ההגדרה נכשלה'))
    } finally {
      setLoading(false)
    }
  }

  return <div className="auth-screen">
    <div className="auth-brand"><span className="ram-logo-shell auth-logo-shell"><img src="/ram-engineering-logo.png" alt="ר.א.ם הנדסה" width="1024" height="276" decoding="async" fetchPriority="high" /></span><div><strong>ר.א.ם הנדסה</strong><span>מערכת ניהול ופיקוח פרויקטים</span></div></div>
    <section className="setup-card">
      <div className="setup-intro"><span><Building2 /></span><h1>הגדרה ראשונית</h1><p>הזינו את פרטי ההגדרה.</p></div>
      {error && <div className="error-banner">{error}</div>}
      {done && <div className="success-banner">ההגדרה נשמרה. המערכת נטענת מחדש...</div>}
      <form className="form-grid" onSubmit={(e) => void submit(e)}>
        <Field label="קוד הגדרה"><input name="setupToken" type="password" required autoComplete="off" /></Field>
        <Field label="כתובת Supabase"><input name="supabaseUrl" inputMode="url" autoComplete="url" required placeholder="https://xxxxx.supabase.co" /></Field>
        <Field label="מפתח Supabase"><textarea name="supabaseAnonKey" rows={3} required /></Field>
        <Field label="מייל מנהל"><input name="adminEmails" type="email" required autoComplete="email" /></Field>
        <div className="setup-divider">Google — אפשר לחבר גם אחר כך</div>
        <Field label="מזהה Google"><input name="googleClientId" /></Field>
        <Field label="מפתח Google"><input name="googleClientSecret" type="password" autoComplete="off" /></Field>
        <Field label="מפתח Google Maps" hint="אופציונלי"><input name="googleMapsApiKey" type="password" autoComplete="off" /></Field>
        <button className="primary setup-submit" disabled={loading}><KeyRound /> {loading ? 'שומר...' : 'שמירת הגדרה'}</button>
      </form>
    </section>
  </div>
}

export function LoginScreen({ onSuccess }: { onSuccess: () => void }) {
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [resetMode, setResetMode] = useState(false)

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    setLoading(true)
    setError('')
    setMessage('')
    try {
      if (resetMode) {
        await requestPasswordReset(String(data.get('email') || ''))
        setMessage('אם קיים חשבון עם המייל הזה, נשלח אליו קישור להגדרת סיסמה חדשה.')
      } else {
        await signIn(String(data.get('email') || ''), String(data.get('password') || ''))
        onSuccess()
      }
    } catch (e) {
      setError(authErrorMessage(e, resetMode ? 'שליחת קישור האיפוס נכשלה' : 'ההתחברות נכשלה'))
    } finally {
      setLoading(false)
    }
  }

  return <div className="auth-screen">
    <div className="auth-brand"><span className="ram-logo-shell auth-logo-shell"><img src="/ram-engineering-logo.png" alt="ר.א.ם הנדסה" width="1024" height="276" decoding="async" fetchPriority="high" /></span><div><strong>ר.א.ם הנדסה</strong><span>ניהול ופיקוח</span></div></div>
    <section className="login-card">
      <span className="login-icon">{resetMode ? <KeyRound /> : <LockKeyhole />}</span>
      <h1>{resetMode ? 'איפוס סיסמה' : 'כניסה למערכת'}</h1>
      <p>{resetMode ? 'הזינו את המייל שלכם ונשלח קישור להגדרת סיסמה חדשה.' : 'הזינו את פרטי ההתחברות שלכם.'}</p>
      {error && <div className="error-banner">{error}</div>}
      {message && <div className="success-banner">{message}</div>}
      <form className="form-grid" onSubmit={(e) => void submit(e)}>
        <Field label="מייל"><input name="email" type="email" required autoComplete="email" /></Field>
        {!resetMode && <Field label="סיסמה"><input name="password" type="password" required autoComplete="current-password" /></Field>}
        <button className="primary login-submit" disabled={loading}>{loading ? 'שולח...' : resetMode ? 'שליחת קישור' : 'כניסה'}</button>
        <button className="secondary" type="button" disabled={loading} onClick={() => { setResetMode((value) => !value); setError(''); setMessage('') }}>{resetMode ? 'חזרה להתחברות' : 'שכחתי סיסמה'}</button>
      </form>
    </section>
  </div>
}

export function SetPasswordScreen({ onSuccess }: { onSuccess: () => void }) {
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const password = String(data.get('password') || '')
    const confirm = String(data.get('confirm') || '')
    setError('')
    if (password.length < 8) { setError('הסיסמה צריכה להכיל לפחות 8 תווים'); return }
    if (password !== confirm) { setError('הסיסמאות אינן תואמות'); return }
    setLoading(true)
    try {
      await updatePassword(password)
      onSuccess()
    } catch (e) {
      setError(authErrorMessage(e, 'לא ניתן לשמור את הסיסמה'))
    } finally {
      setLoading(false)
    }
  }

  return <div className="auth-screen">
    <div className="auth-brand"><span className="ram-logo-shell auth-logo-shell"><img src="/ram-engineering-logo.png" alt="ר.א.ם הנדסה" width="1024" height="276" decoding="async" fetchPriority="high" /></span><div><strong>ר.א.ם הנדסה</strong><span>ניהול ופיקוח</span></div></div>
    <section className="login-card">
      <span className="login-icon"><KeyRound /></span>
      <h1>הגדרת סיסמה</h1>
      <p>בחרו סיסמה לחשבון שלכם.</p>
      {error && <div className="error-banner">{error}</div>}
      <form className="form-grid" onSubmit={(e) => void submit(e)}>
        <Field label="סיסמה חדשה"><input name="password" type="password" required autoComplete="new-password" /></Field>
        <Field label="אימות סיסמה"><input name="confirm" type="password" required autoComplete="new-password" /></Field>
        <button className="primary login-submit" disabled={loading}>{loading ? 'שומר...' : 'שמירת סיסמה'}</button>
      </form>
    </section>
  </div>
}
