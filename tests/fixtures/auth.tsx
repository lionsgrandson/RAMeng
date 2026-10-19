// Only included by the explicit QA build. No real authentication or email service.
import { createRoot } from 'react-dom/client'
import { LoginScreen } from '../../src/components/AuthSetup'
import '../../src/styles.css'
import '../../src/commonFixes.css'
import '../../src/layoutFixes.css'
import '../../src/calendarEmphasis.css'
import '../../src/reportPrint.css'
import '../../src/checklist.css'

createRoot(document.getElementById('root')!).render(<>
  <aside className="preview-notice" dir="rtl">בדיקת תצוגה בלבד — אין התחברות או שליחת דוא״ל.</aside>
  <LoginScreen onSuccess={() => undefined} />
</>)
