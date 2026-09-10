# ראם הנדסה CRM

מערכת CRM, ניהול פרויקטים ופיקוח עבור **ר.א.ם הנדסה**. ברירת המחדל היא עברית מלאה ו-RTL, עם שפה עיצובית ירוקה ונקייה המבוססת על המיתוג של החברה.

## מה כלול

- מרכז שליטה עם תמונת מצב של פרויקטים, משימות, מעקבים, דוחות ומועדים.
- ניהול לקוחות ולידים.
- צינור מכירות, הצעות וחיובים.
- ניהול מלא לפי פרויקט.
- לוח משימות דינמי לכל פרויקט, כולל תתי משימות, אחראי, סטטוס, תאריך התחלה, מועד מעקב/סיום ותיבת מייל.
- אפשרות להוסיף, להסתיר, להסיר ולשנות סדר עמודות וסטטוסים ללא שינוי קוד.
- תבניות צ'ק ליסט קבועות שניתנות להחלה על כל פרויקט ואז לעריכה נקודתית.
- Gmail: שליחה מתוך משימה ושיוך השרשור חזרה לאותה משימה.
- Google Calendar: הצגת אירועים ויצירת אירועים מתוך המערכת.
- Google Drive: תיקייה לכל פרויקט וגישה לקבצים מתוך כרטיס הפרויקט.
- דוחות פיקוח עם תמונות, סטטוס, אחראי, הערות, נושאים פתוחים מדוחות קודמים ושלושה פורמטים להצגה/הדפסה.
- ניסוח הערות פיקוח באמצעות OpenAI בלי להוסיף עובדות שלא נמסרו.
- קבצים ב-Supabase Storage.
- משתמשים והרשאות באמצעות Supabase Auth + RLS.
- סנכרון realtime של סביבת העבודה בין משתמשים.
- מסך מנהל מערכת להגדרת Supabase, Google Workspace, OpenAI, מיתוג ותבניות.

## מבנה

- `src/` אפליקציית React/Vite.
- `worker/` Cloudflare Worker שמגיש גם את ה-Frontend וגם את `/api`.
- `supabase/setup.sql` סכמת בסיס נתונים, RLS, Realtime ו-Storage.
- `deploy.cmd` התקנה ופריסה ראשונית מ-Windows.

## הקמה ראשונית

### 1. Supabase

1. צור פרויקט Supabase חדש עבור ראם הנדסה.
2. פתח SQL Editor והריץ את `supabase/setup.sql` במלואו.
3. תחת Authentication צור ידנית את משתמש המנהל הראשון.
4. מומלץ להשאיר Public Signups כבוי עד שמחליטים על תהליך הזמנות מסודר.

האפליקציה משתמשת ב-`workspace_state` משותף לארגון, עם RLS לפי חברות בארגון. המשתמש הראשון שמתחבר לאחר הרצת ה-SQL הופך למנהל הארגון דרך `bootstrap_first_admin()`.

### 2. Cloudflare

Cloudflare הוא שכבת ה-hosting וה-API, ולכן **אי אפשר להעביר את ה-Worker מחשבון Cloudflare אחד לאחר מתוך מסך הניהול של ה-CRM עצמו**. זה שינוי ברמת התשתית. לעומת זאת, Supabase, Google ו-OpenAI ניתנים לשינוי ממנהל המערכת לאחר הפריסה.

ב-Windows אפשר להריץ:

```bat
deploy.cmd
```

הסקריפט מתקין dependencies, מתחבר ל-Cloudflare, בונה את האפליקציה ופורס את ה-Worker. ה-KV נוצר אוטומטית על ידי Wrangler.

לאחר הפריסה הראשונה, מתוך `worker` הרץ:

```bat
npx wrangler secret put ADMIN_SETUP_TOKEN
```

בחר token ארוך ואקראי. הוא משמש רק למסך ההגדרה הראשונית ואינו נשמר בדפדפן.

### 3. הגדרה דרך ה-CRM

פתח את כתובת ה-Worker. לפני ש-Supabase מוגדר תופיע אוטומטית **הגדרה ראשונית**. הזן:

- `ADMIN_SETUP_TOKEN`
- Supabase Project URL
- Supabase anon key
- מייל המנהל הראשון

Google ו-OpenAI הם אופציונליים בשלב הזה וניתן לחבר אותם מאוחר יותר מתוך **מנהל מערכת → חיבורים ותשתיות**.

### 4. Google Cloud / Workspace

ב-Google Cloud Console:

1. הפעל Gmail API, Google Calendar API ו-Google Drive API.
2. צור OAuth Client מסוג Web Application.
3. לאחר שיש כתובת Worker סופית, הוסף Redirect URI בפורמט:

```text
https://YOUR-WORKER-DOMAIN/api/google/callback
```

4. הזן Client ID ו-Client Secret במנהל המערכת.
5. לחץ **חיבור Google** והתחבר לתיבת החברה.

המערכת מבקשת הרשאות Gmail, Calendar ו-Drive הדרושות לפעולות שהוגדרו ב-CRM. אסימוני Google נשמרים בצד השרת ב-Cloudflare KV ואינם נשלחים ל-localStorage.

## פיתוח מקומי

העתק `.env.example` ל-`.env.local`, ואז:

```bash
npm install
npm run dev
```

בטרמינל נוסף:

```bash
cd worker
npm install
npx wrangler dev
```

ברירת המחדל ב-`.env.example` מפנה את האפליקציה המקומית ל-Worker ב-`http://localhost:8787`.

## בנייה

```bash
npm run build
```

כל push ל-`main` מריץ גם GitHub Actions build כדי לתפוס שגיאות TypeScript/Vite לפני פריסה.

## דוחות פיקוח

תבנית הדוח נבנתה על בסיס דוח הפיקוח שסופק: חלוקה לנושאים כגון בנייה, חשמל, אלומיניום ומיזוג, ולכל סעיף תיאור, סטטוס, לטיפול/הערות ותמונות. בגרסה החדשה נוספו אחראי, מעקב אחר נושאים פתוחים מדוחות קודמים, עריכה ישירה ושלושה layouts: טבלה נקייה, כרטיסים ותמונות מודגשות.
