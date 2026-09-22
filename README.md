# ראם הנדסה CRM

מערכת CRM, ניהול פרויקטים ופיקוח עבור **ר.א.ם הנדסה**. המערכת בנויה בעברית ו-RTL, עם הרשאות משתמשים, Supabase, Cloudflare ויכולת חיבור ל-Google Workspace.

## מה כלול כרגע

- מרכז שליטה עם פרויקטים, משימות, מעקבים, דוחות ומועדים.
- ניהול לקוחות ולידים.
- ניהול מלא לפי פרויקט.
- לוח משימות לכל פרויקט, כולל תתי משימות, אחראי, סטטוס ותאריכים.
- דוחות פיקוח לפי מבנה הדוחות של ראם, כולל תמונות, סטטוסים, הערות ומעקב.
- קבצים ומסמכים ב-Supabase Storage.
- משתמשים והרשאות המחוברים ל-Supabase Auth.
- תפקידים: מפתח, מנהל, עוזר/ת, מפקח/ת, מהנדס/ת וצפייה בלבד.
- הזמנת משתמשים מתוך ה-CRM. משתמש חדש מקבל הזמנת Supabase ובוחר את הסיסמה שלו.
- סנכרון Realtime של סביבת העבודה בין משתמשים.
- הגדרות תשתית זמינות למפתח בלבד.
- חיבורי Gmail, Google Calendar ו-Google Drive מוכנים להפעלה כשחשבון Google של הלקוח יהיה זמין.
- אזורי AI מוסתרים כרגע מהממשק.

## הרשאות

`developer`
: חשבון המפתח. מוגן ונפרד ממנהל רגיל. רואה את הגדרות התשתית ויכול לנהל משתמשים.

`admin`
: מנהל עסקי של המערכת. יכול לנהל משתמשים רגילים ונתוני CRM, אך לא לשנות את חשבון המפתח.

`assistant`
: תפעול משרד ו-CRM: לקוחות, פרויקטים, משימות, יומן, קבצים, כספים ותקשורת. אין גישה לשינוי דוחות פיקוח או הגדרות תשתית.

`inspector`, `engineer`
: עבודה מקצועית בפרויקטים: פרויקטים, משימות, יומן, קבצים, דוחות ותקשורת. אין הרשאת עריכת פרטי לקוח או כספים.

`viewer`, `reviewer`
: גישה לקריאה בלבד.

המשתמשים עצמם נשמרים ב-Supabase Auth, והשיוך שלהם לראם והתפקיד שלהם נשמרים בטבלת `memberships`.

## מבנה הפרויקט

- `src/` אפליקציית React/Vite.
- `worker/` Cloudflare Worker שמגיש את ה-Frontend ואת `/api`.
- `supabase/setup.sql` סכמת Supabase המלאה, כולל RLS, Realtime, Storage והרשאות.
- `deploy.cmd` build ופריסה ל-Cloudflare, כולל הגדרת הסודות הדרושים.
- `PRODUCTION_SETUP.md` סדר ההקמה המדויק כשמקבלים את חשבונות הלקוח.
- `desktop/` לקוח Windows מבוסס Electron.

## הקמת סביבת הלקוח

ההוראות המלאות נמצאות ב-`PRODUCTION_SETUP.md`.

בגדול, הסדר הוא:

1. ליצור/לקבל גישה לפרויקט Supabase של הלקוח.
2. להריץ את כל `supabase/setup.sql` ב-SQL Editor.
3. להריץ `deploy.cmd` בחשבון Cloudflare של הלקוח.
4. להגדיר ב-Worker את `ADMIN_SETUP_TOKEN` ואת `SUPABASE_SECRET_KEY`.
5. להגדיר ב-Supabase Auth את כתובת ה-CRM כ-Site URL ואת `/?invite=1` כ-Redirect URL.
6. לפתוח את ה-CRM ולהזין Supabase URL, publishable/anon key ומייל המפתח.
7. ליצור/להזמין את חשבון המפתח הראשון ב-Supabase Auth.
8. לאחר מכן להוסיף את כל שאר המשתמשים מתוך `משתמשים והרשאות` ב-CRM.

## Supabase

הקובץ `supabase/setup.sql` הוא קובץ ההקמה הראשי. הוא יוצר:

- `organizations`
- `memberships`
- `workspace_state`
- RLS policies
- helper functions להרשאות
- Realtime עבור סביבת העבודה
- bucket פרטי בשם `crm-files`

Public signup אמור להישאר כבוי. משתמשים חדשים מוזמנים מתוך ה-CRM דרך Cloudflare Worker בעזרת Supabase secret key ששמור רק בצד השרת.

## Cloudflare

לפריסה מ-Windows:

```bat
deploy.cmd
```

הסקריפט:

- מתקין dependencies
- בודק התחברות ל-Cloudflare
- בונה את ה-CRM
- פורס את ה-Worker וה-assets
- מאפשר להגדיר `ADMIN_SETUP_TOKEN`
- מאפשר להגדיר `SUPABASE_SECRET_KEY`

ה-Supabase secret key לעולם לא נכנס לקוד frontend או ל-`.env.local`.

## הזמנת משתמשים וסיסמאות

מתוך `משתמשים והרשאות` מזינים שם, מייל ותפקיד.

אם המייל עדיין לא קיים ב-Supabase, המערכת שולחת הזמנה דרך Supabase Auth. המשתמש פותח את הקישור, מגיע למסך הגדרת סיסמה ב-CRM ובוחר סיסמה בעצמו. אם המייל כבר קיים ב-Supabase, המערכת רק משייכת אותו לארגון ראם ומעדכנת את התפקיד.

ה-CRM לא שומר סיסמאות ולא יודע אותן.

## חיפוש כתובות בישראל

חיפוש הכתובות בפרויקטים עובד בשכבות:

1. **Google Places Autocomplete** כאשר מוגדר `Google Maps / Places API Key` — האפשרות המועדפת לדיוק ברמת רחוב ומספר בית.
2. **GovMap** של המרכז למיפוי ישראל — חיפוש עברי ממוקד לכתובות בישראל ללא מפתח API.
3. **OpenStreetMap** כגיבוי אחרון.

כדי להפעיל Google Places, הפעילו בפרויקט Google Cloud את **Places API (New)**, צרו API key שמוגבל ל-Places API והזינו אותו תחת הגדרות המפתח ב-CRM.

## Google Workspace

כאשר חשבון Google Cloud של הלקוח יהיה זמין:

1. מפעילים Gmail API, Google Calendar API ו-Google Drive API.
2. יוצרים OAuth Client מסוג Web Application.
3. מוסיפים Redirect URI:

```text
https://YOUR-CRM-DOMAIN/api/google/callback
```

4. מזינים Client ID ו-Client Secret בהגדרות המפתח.
5. מחברים את חשבון Google של החברה.

## פיתוח מקומי

העתק `.env.example` ל-`.env.local`:

```bat
copy .env.example .env.local
npm install
npm run dev
```

לבדיקת ה-Worker מקומית:

```bat
copy worker\.dev.vars.example worker\.dev.vars
cd worker
npm install
npx wrangler dev
```

`worker/.dev.vars` ו-`.env.local` נמצאים ב-`.gitignore` ואסור להעלות אליהם סודות ל-GitHub.

## Build

```bat
npm run build
```

בדיקות build ופריסה מבוצעות מקומית לפני העלאה ל-Cloudflare.
