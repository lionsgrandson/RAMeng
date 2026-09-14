import { useState, type FormEvent } from 'react'
import { Building2, KeyRound, LockKeyhole } from 'lucide-react'
import { bootstrapServer } from '../lib/api'
import { signIn } from '../lib/backend'
import { Field } from './common'

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
      })
      setDone(true)
      setTimeout(() => window.location.reload(), 1300)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'הגדרה נכשלה')
    } finally {
      setLoading(false)
    }
  }

  return <div className="auth-screen">
    <div className="auth-brand"><img src="/rameng-mark.svg" /><div><strong>ר.א.ם הנדסה</strong><span>מערכת ניהול ופיקוח פרויקטים</span></div></div>
    <section className="setup-card">
      <div className="setup-intro"><span><Building2 /></span><h1>הגדרה ראשונית</h1><p>הזינו את פרטי המערכת הראשוניים. את חיבור Google אפשר להשלים גם בהמשך.</p></div>
      {error && <div className="error-banner">{error}</div>}
      {done && <div className="success-banner">ההגדרה נשמרה. המערכת נטענת מחדש...</div>}
      <form className="form-grid" onSubmit={(e) => void submit(e)}>
        <Field label="קוד הגדרה"><input name="setupToken" type="password" required /></Field>
        <Field label="Supabase Project URL"><input name="supabaseUrl" required placeholder="https://xxxxx.supabase.co" /></Field>
        <Field label="Supabase anon key"><textarea name="supabaseAnonKey" rows={3} required /></Field>
        <Field label="מייל מפתח"><input name="adminEmails" type="email" required /></Field>
        <div className="setup-divider">Google — אפשר לחבר גם אחר כך</div>
        <Field label="Google OAuth Client ID"><input name="googleClientId" /></Field>
        <Field label="Google OAuth Client Secret"><input name="googleClientSecret" type="password" /></Field>
        <button className="primary setup-submit" disabled={loading}><KeyRound /> {loading ? 'שומר...' : 'שמירת הגדרה'}</button>
      </form>
    </section>
  </div>
}

export function LoginScreen({ onSuccess }: { onSuccess: () => void }) {
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    setLoading(true)
    setError('')
    try {
      await signIn(String(data.get('email') || ''), String(data.get('password') || ''))
      onSuccess()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'התחברות נכשלה')
    } finally {
      setLoading(false)
    }
  }

  return <div className="auth-screen">
    <div className="auth-brand"><img src="/rameng-mark.svg" /><div><strong>ר.א.ם הנדסה</strong><span>ניהול ופיקוח</span></div></div>
    <section className="login-card">
      <span className="login-icon"><LockKeyhole /></span>
      <h1>כניסה למערכת</h1>
      <p>הזינו את פרטי ההתחברות שלכם.</p>
      {error && <div className="error-banner">{error}</div>}
      <form className="form-grid" onSubmit={(e) => void submit(e)}>
        <Field label="מייל"><input name="email" type="email" required autoComplete="email" /></Field>
        <Field label="סיסמה"><input name="password" type="password" required autoComplete="current-password" /></Field>
        <button className="primary login-submit" disabled={loading}>{loading ? 'מתחבר...' : 'כניסה'}</button>
      </form>
    </section>
  </div>
}
