# ראם הנדסה CRM — Windows Desktop

תיקייה זו בונה מתקין Windows מסוג EXE עבור מערכת ראם הנדסה.

## איך זה עובד

האפליקציה היא מעטפת Desktop מאובטחת שמציגה את מערכת ה-CRM מה-Cloudflare Worker. לכן:

- המשתמש מתקין פעם אחת את `RAMeng-CRM-Setup.exe`.
- אין צורך להתקין Node.js, Chrome או כלי פיתוח במחשב המשתמש.
- בהפעלה הראשונה מזינים את כתובת ה-HTTPS של ה-CRM ב-Cloudflare.
- הכתובת נשמרת מקומית בפרופיל המשתמש.
- עדכוני Frontend שמפורסמים ל-Cloudflare מופיעים באפליקציית Windows בלי לבנות EXE חדש.
- קישורים חיצוניים נפתחים בדפדפן הרגיל של Windows.
- אפשר לשנות את כתובת השרת בהמשך דרך `מערכת -> שינוי כתובת מערכת`.

## בנייה מקומית

מתוך `desktop`:

```bat
npm install
npm run dist
```

הקובץ יופיע ב:

```text
desktop\dist\RAMeng-CRM-Setup.exe
```

## בנייה אוטומטית

ה-workflow `Windows Desktop Installer` רץ כאשר קבצי ה-Desktop משתנים, בונה את ה-EXE על Windows, מעלה אותו כ-GitHub Actions artifact וגם מעדכן rolling release בשם `desktop-latest`.

כתובת ההורדה הקבועה לאחר build מוצלח:

```text
https://github.com/lionsgrandson/RAMeng/releases/download/desktop-latest/RAMeng-CRM-Setup.exe
```

## הערת חתימה

המתקין עובד גם ללא תעודת code signing, אבל Windows SmartScreen עשוי להציג אזהרת publisher עד שנוסיף חתימת Authenticode. אין צורך לעקוף את Defender; עדיף לחתום על גרסת production כאשר תהיה תעודה.
