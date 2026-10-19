import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'
import './commonFixes.css'
import './layoutFixes.css'
import './calendarEmphasis.css'
import './reportPrint.css'
import './checklist.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {import.meta.env.VITE_APP_PREVIEW === 'true' && <aside className="preview-notice" role="status" dir="rtl">{import.meta.env.VITE_QA_FIXTURES === 'true' ? 'סביבת QA מבודדת — נתונים סינתטיים בלבד בדפדפן זה. אין חיבור לנתוני הייצור או לשירותי Google.' : 'גרסת בדיקה — קוד זה אינו מוגש באתר הייצור. גרסה זו מחוברת לנתונים ולשירותים הקיימים; שינויים ושיתוף מתבצעים בהם.'}</aside>}
    <App />
  </StrictMode>,
)
