# Source selector inventory

Generated from src. 150 static control instances; mapped/rendered controls may produce multiple runtime selectors. This includes component wrappers and unreachable legacy exports. Source presence does not establish live functionality.

| Source | Scope | Control / label | Family | Classification |
| --- | --- | --- | --- | --- |
| src/App.tsx:719 | FinancialReports | BusinessSelect / סינון לפי סטטוס חיוב | quote_status | canonical read-only filter |
| src/App.tsx:720 | FinancialReports | select / לקוח |  | restricted existing-record/system selector; see per-surface exceptions |
| src/App.tsx:721 | FinancialReports | select / פרויקט |  | restricted existing-record/system selector; see per-surface exceptions |
| src/App.tsx:722 | FinancialReports | select / תשלום |  | restricted existing-record/system selector; see per-surface exceptions |
| src/App.tsx:723 | FinancialReports | select / תאריך לפי |  | restricted existing-record/system selector; see per-surface exceptions |
| src/components/BusinessSelect.tsx:38 | BusinessSelect | CreatableSelect /  |  | workspace option/record; explicit callback |
| src/components/CalendarFiles.tsx:182 | CalendarPage | select / פרויקט |  | restricted existing-record/system selector; see per-surface exceptions |
| src/components/CalendarFiles.tsx:183 | CalendarPage | select / סוג |  | restricted existing-record/system selector; see per-surface exceptions |
| src/components/CalendarFiles.tsx:184 | CalendarPage | select / תאריכי משימות ביומן |  | restricted existing-record/system selector; see per-surface exceptions |
| src/components/CalendarFiles.tsx:185 | CalendarPage | select / מקור אירוע |  | restricted existing-record/system selector; see per-surface exceptions |
| src/components/CalendarFiles.tsx:238 | CalendarPage | LinkedRecordSelect / פרויקט | project | valid linked record workflow |
| src/components/CalendarFiles.tsx:239 | CalendarPage | LinkedRecordSelect / משימה | task | valid linked record workflow |
| src/components/CalendarFiles.tsx:334 | FilesPage | LinkedRecordSelect / שיוך קובץ לפרויקט | project | valid linked record workflow |
| src/components/CalendarFiles.tsx:334 | FilesPage | LinkedRecordSelect / שיוך קובץ למשימה | task | valid linked record workflow |
| src/components/CalendarFiles.tsx:338 | FilesPage | select / פרויקט |  | restricted existing-record/system selector; see per-surface exceptions |
| src/components/CalendarFiles.tsx:339 | FilesPage | select / משימה |  | restricted existing-record/system selector; see per-surface exceptions |
| src/components/CalendarFiles.tsx:340 | FilesPage | select / סינון קבצים לפי מקצוע |  | restricted existing-record/system selector; see per-surface exceptions |
| src/components/CalendarFiles.tsx:341 | FilesPage | select / סוג קובץ |  | restricted existing-record/system selector; see per-surface exceptions |
| src/components/CalendarFiles.tsx:348 | FilesPage | CategoryPicker /  |  | organization profession registry |
| src/components/CalendarFiles.tsx:348 | FilesPage | BusinessSelect / {`סטטוס תכנית ${file.name}`} | plan_status | durable organization option |
| src/components/Categories.tsx:13 | CategoryPicker | CreatableSelect / הוספת מקצוע לקובץ |  | workspace option/record; explicit callback |
| src/components/ClientCenter.tsx:124 | ClientDirectory | BusinessSelect / סינון לפי סטטוס לקוח | contact_status | canonical read-only filter |
| src/components/ClientCenter.tsx:125 | ClientDirectory | BusinessSelect / סינון תגית | contact_tag | canonical read-only filter |
| src/components/ClientCenter.tsx:126 | ClientDirectory | BusinessSelect / סינון תפקיד | contact_role | canonical read-only filter |
| src/components/ClientCenter.tsx:127 | ClientDirectory | BusinessSelect / סינון סוג חברה | company_type | canonical read-only filter |
| src/components/ClientCenter.tsx:128 | ClientDirectory | select / פרויקט |  | restricted existing-record/system selector; see per-surface exceptions |
| src/components/ClientCenter.tsx:140 | ClientDirectory | BusinessSelect / סטטוס לקוח | contact_status | durable organization option |
| src/components/ClientCenter.tsx:377 | ClientWorkspace | BusinessSelect / סטטוס לקוח | contact_status | durable organization option |
| src/components/ClientCenter.tsx:398 | ClientWorkspace | BusinessSelect / סטטוס פרויקט | project_status | durable organization option |
| src/components/ClientCenter.tsx:406 | ClientWorkspace | CreatableSelect / סטטוס |  | workspace option/record; explicit callback |
| src/components/ClientCenter.tsx:407 | ClientWorkspace | select / אחראי |  | restricted existing-record/system selector; see per-surface exceptions |
| src/components/ClientCenter.tsx:409 | ClientWorkspace | select / צבע |  | restricted existing-record/system selector; see per-surface exceptions |
| src/components/ClientCenter.tsx:423 | ClientWorkspace | BusinessSelect / סטטוס חיוב | quote_status | durable organization option |
| src/components/ClientCenter.tsx:431 | ClientWorkspace | LinkedRecordSelect / פרויקט | project | valid linked record workflow |
| src/components/ClientCenter.tsx:432 | ClientWorkspace | BusinessSelect / סטטוס חיוב | quote_status | durable organization option |
| src/components/ClientCenter.tsx:443 | ClientWorkspace | BusinessSelect / סטטוס לקוח | contact_status | durable organization option |
| src/components/ClientCenter.tsx:450 | ClientWorkspace | AddressAutocomplete / כתובת * |  | address suggestions; accepts required user address |
| src/components/ClientCenter.tsx:451 | ClientWorkspace | BusinessSelect / סטטוס פרויקט | project_status | durable organization option |
| src/components/ClientCenter.tsx:452 | ClientWorkspace | select / מנהל פרויקט |  | restricted existing-record/system selector; see per-surface exceptions |
| src/components/ClientCenter.tsx:459 | ClientWorkspace | CreatableSelect / פרויקט |  | workspace option/record; explicit callback |
| src/components/ClientCenter.tsx:461 | ClientWorkspace | CreatableSelect / סטטוס |  | workspace option/record; explicit callback |
| src/components/ClientCenter.tsx:462 | ClientWorkspace | BusinessSelect / עדיפות | priority | durable organization option |
| src/components/ClientCenter.tsx:463 | ClientWorkspace | select / צבע / קטלוג |  | restricted existing-record/system selector; see per-surface exceptions |
| src/components/ClientCenter.tsx:464 | ClientWorkspace | select / אחראי |  | restricted existing-record/system selector; see per-surface exceptions |
| src/components/ClientCenter.tsx:475 | ClientWorkspace | CreatableSelect / פרויקט |  | workspace option/record; explicit callback |
| src/components/ClientCenter.tsx:477 | ClientWorkspace | CreatableSelect / סטטוס |  | workspace option/record; explicit callback |
| src/components/ClientCenter.tsx:478 | ClientWorkspace | BusinessSelect / עדיפות | priority | durable organization option |
| src/components/ClientCenter.tsx:479 | ClientWorkspace | select / צבע / קטלוג |  | restricted existing-record/system selector; see per-surface exceptions |
| src/components/ClientCenter.tsx:480 | ClientWorkspace | select / אחראי |  | restricted existing-record/system selector; see per-surface exceptions |
| src/components/ClientCenter.tsx:487 | ClientWorkspace | BusinessSelect / {column.label} | priority | durable organization option |
| src/components/ClientCenter.tsx:487 | ClientWorkspace | CreatableSelect / {column.label} |  | workspace option/record; explicit callback |
| src/components/ClientCenter.tsx:493 | ClientWorkspace | LinkedRecordSelect / פרויקט | project | valid linked record workflow |
| src/components/CommunicationJournal.tsx:44 | CommunicationJournal | LinkedRecordSelect / פרויקט ליומן | project | valid linked record workflow |
| src/components/CommunicationJournal.tsx:44 | CommunicationJournal | select / פרויקט ליומן |  | restricted existing-record/system selector; see per-surface exceptions |
| src/components/CommunicationJournal.tsx:45 | CommunicationJournal | LinkedRecordSelect / הוספת משימה ליומן | task | valid linked record workflow |
| src/components/CommunicationJournal.tsx:45 | CommunicationJournal | select / משימות מקושרות ליומן |  | restricted existing-record/system selector; see per-surface exceptions |
| src/components/CommunicationJournal.tsx:46 | CommunicationJournal | ClientMultiPicker / אנשי קשר ליומן |  | linked contacts; explicit callback |
| src/components/CommunicationJournal.tsx:46 | CommunicationJournal | select / אנשי קשר מקושרים ליומן |  | restricted existing-record/system selector; see per-surface exceptions |
| src/components/ContactFields.tsx:18 | ContactFields | BusinessSelect / {label} | {key === "role" ? "contact_role" : "company_type"} | durable organization option |
| src/components/ContactFields.tsx:24 | ContactTags | BusinessSelect / בחירת תגית קיימת | contact_tag | durable organization option |
| src/components/CorePages.tsx:54 | ClientsPage | BusinessSelect / סטטוס לקוח | contact_status | durable organization option |
| src/components/CorePages.tsx:63 | PipelinePage | CreatableSelect / לקוח |  | workspace option/record; explicit callback |
| src/components/CorePages.tsx:70 | FinancePage | BusinessSelect / סטטוס חיוב | quote_status | durable organization option |
| src/components/CorePages.tsx:70 | FinancePage | CreatableSelect / לקוח |  | workspace option/record; explicit callback |
| src/components/CorePages.tsx:70 | FinancePage | CreatableSelect / פרויקט |  | workspace option/record; explicit callback |
| src/components/CorePages.tsx:76 | TeamPage | select / תפקיד |  | restricted existing-record/system selector; see per-surface exceptions |
| src/components/CorePages.tsx:155 | ImportCenter | select / פרויקט לדוגמה |  | restricted existing-record/system selector; see per-surface exceptions |
| src/components/CreatableSelect.tsx:86 | CreatableSelect | select / {ariaLabel \|\| label} |  | restricted existing-record/system selector; see per-surface exceptions |
| src/components/DisplaySettings.tsx:49 | DisplaySettings | select / קיבוץ משימות |  | restricted existing-record/system selector; see per-surface exceptions |
| src/components/DisplaySettings.tsx:49 | DisplaySettings | select / צפיפות טבלת משימות |  | restricted existing-record/system selector; see per-surface exceptions |
| src/components/DisplaySettings.tsx:61 | DisplaySettings | select / סוג עמודה חדשה |  | restricted existing-record/system selector; see per-surface exceptions |
| src/components/DisplaySettings.tsx:63 | DisplaySettings | select / מקצוע חלופי |  | restricted existing-record/system selector; see per-surface exceptions |
| src/components/DisplaySettings.tsx:65 | DisplaySettings | select / סטטוס חלופי |  | restricted existing-record/system selector; see per-surface exceptions |
| src/components/DriveConnection.tsx:80 | DriveConnection | select / בחירת מקצוע לתיקיית Drive |  | restricted existing-record/system selector; see per-surface exceptions |
| src/components/DriveConnection.tsx:83 | DriveConnection | select / תיקיית יעד להעברה |  | restricted existing-record/system selector; see per-surface exceptions |
| src/components/DriveConnection.tsx:89 | DriveConnection | datalist /  |  | restricted existing-record/system selector; see per-surface exceptions |
| src/components/DriveConnection.tsx:89 | DriveConnection | select / הרשאת שיתוף Drive |  | restricted existing-record/system selector; see per-surface exceptions |
| src/components/ExternalTaskPage.tsx:32 | ExternalTaskPage | select / סטטוס המשימה שלי |  | restricted existing-record/system selector; see per-surface exceptions |
| src/components/GoogleCommunication.tsx:95 | MailComposer | datalist / נמען |  | restricted existing-record/system selector; see per-surface exceptions |
| src/components/GoogleCommunication.tsx:99 | MailComposer | select / קובץ מהמערכת |  | restricted existing-record/system selector; see per-surface exceptions |
| src/components/LinkedRecordSelect.tsx:16 | LinkedRecordSelect | CreatableSelect /  |  | workspace option/record; explicit callback |
| src/components/MeetingSummaries.tsx:76 | MeetingSummaries | select / סינון סיכום לפי אחראי |  | restricted existing-record/system selector; see per-surface exceptions |
| src/components/MeetingSummaries.tsx:76 | MeetingSummaries | select / סינון סיכום לפי מקצוע |  | restricted existing-record/system selector; see per-surface exceptions |
| src/components/ProjectMail.tsx:192 | ProjectMail | select / סינון לפי מצב קריאה |  | restricted existing-record/system selector; see per-surface exceptions |
| src/components/ProjectMail.tsx:192 | ProjectMail | select / סינון מייל לפי מקצוע |  | restricted existing-record/system selector; see per-surface exceptions |
| src/components/ProjectMail.tsx:204 | ProjectMail | CreatableSelect / פרויקט לשיוך מייל |  | workspace option/record; explicit callback |
| src/components/ProjectMail.tsx:205 | ProjectMail | LinkedRecordSelect / משימה לשיוך מייל | task | valid linked record workflow |
| src/components/ProjectMail.tsx:229 | ProjectMail | CreatableSelect / פרויקט |  | workspace option/record; explicit callback |
| src/components/ProjectMail.tsx:231 | ProjectMail | select / אחראי למשימה |  | restricted existing-record/system selector; see per-surface exceptions |
| src/components/ProjectMail.tsx:232 | ProjectMail | BusinessSelect / עדיפות | priority | durable organization option |
| src/components/ProjectWorkspace.tsx:112 | ProjectsPage | BusinessSelect / סינון לפי סטטוס פרויקט | project_status | canonical read-only filter |
| src/components/ProjectWorkspace.tsx:113 | ProjectsPage | select / מנהל פרויקט |  | restricted existing-record/system selector; see per-surface exceptions |
| src/components/ProjectWorkspace.tsx:115 | ProjectsPage | select / לקוח |  | restricted existing-record/system selector; see per-surface exceptions |
| src/components/ProjectWorkspace.tsx:116 | ProjectsPage | select / תאריך לפי |  | restricted existing-record/system selector; see per-surface exceptions |
| src/components/ProjectWorkspace.tsx:140 | ProjectsPage | AddressAutocomplete / כתובת * |  | address suggestions; accepts required user address |
| src/components/ProjectWorkspace.tsx:141 | ProjectsPage | BusinessSelect / סטטוס פרויקט | project_status | durable organization option |
| src/components/ProjectWorkspace.tsx:142 | ProjectsPage | select / מנהל פרויקט |  | restricted existing-record/system selector; see per-surface exceptions |
| src/components/ProjectWorkspace.tsx:145 | ProjectsPage | ClientMultiPicker / clientIds |  | linked contacts; explicit callback |
| src/components/ProjectWorkspace.tsx:147 | ProjectsPage | LinkedRecordSelect / תבנית דוח ברירת מחדל | report_template | valid linked record workflow |
| src/components/ProjectWorkspace.tsx:148 | ProjectsPage | ProjectReportTypes /  |  | template checkboxes; adjacent template creation |
| src/components/ProjectWorkspace.tsx:208 | ProjectWorkspace | BusinessSelect / סטטוס פרויקט | project_status | durable organization option |
| src/components/ProjectWorkspace.tsx:209 | ProjectWorkspace | AddressAutocomplete / כתובת * |  | address suggestions; accepts required user address |
| src/components/ProjectWorkspace.tsx:209 | ProjectWorkspace | select / מנהל פרויקט |  | restricted existing-record/system selector; see per-surface exceptions |
| src/components/ProjectWorkspace.tsx:209 | ProjectWorkspace | ClientMultiPicker /  |  | linked contacts; explicit callback |
| src/components/ProjectWorkspace.tsx:209 | ProjectWorkspace | LinkedRecordSelect / תבנית דוח ברירת מחדל | report_template | valid linked record workflow |
| src/components/ProjectWorkspace.tsx:209 | ProjectWorkspace | ProjectReportTypes /  |  | template checkboxes; adjacent template creation |
| src/components/ProjectWorkspace.tsx:211 | ProjectWorkspace | ClientMultiPicker / אנשי קשר |  | linked contacts; explicit callback |
| src/components/ProjectWorkspace.tsx:251 | ProjectCalendar | LinkedRecordSelect / בחירת משימה לתזכורת | task | valid linked record workflow |
| src/components/Reports.tsx:95 | ReportsPage | select / פרויקט |  | restricted existing-record/system selector; see per-surface exceptions |
| src/components/Reports.tsx:96 | ReportsPage | select / מפקח |  | restricted existing-record/system selector; see per-surface exceptions |
| src/components/Reports.tsx:97 | ReportsPage | select / מצב |  | restricted existing-record/system selector; see per-surface exceptions |
| src/components/Reports.tsx:114 | ReportsPage | LinkedRecordSelect / פרויקט | project | valid linked record workflow |
| src/components/Reports.tsx:118 | ReportsPage | LinkedRecordSelect / תבנית דוח | report_template | valid linked record workflow |
| src/components/Reports.tsx:199 | ReportEditor | select / פורמט הדוח |  | restricted existing-record/system selector; see per-surface exceptions |
| src/components/Reports.tsx:204 | ReportEditor | BusinessSelect / סטטוס סעיף בדוח | report_status | durable organization option |
| src/components/RichTextEditor.tsx:46 | RichTextEditor | select / גודל טקסט |  | restricted existing-record/system selector; see per-surface exceptions |
| src/components/RichTextEditor.tsx:47 | RichTextEditor | select / גופן |  | restricted existing-record/system selector; see per-surface exceptions |
| src/components/TaskBoard.tsx:362 | TaskBoard | LinkedRecordSelect / תבנית דוח | report_template | valid linked record workflow |
| src/components/TaskBoard.tsx:370 | TaskBoard | select / סינון משימות לפי מקצוע |  | restricted existing-record/system selector; see per-surface exceptions |
| src/components/TaskBoard.tsx:374 | TaskBoard | select / סינון לפי פרויקט |  | restricted existing-record/system selector; see per-surface exceptions |
| src/components/TaskBoard.tsx:375 | TaskBoard | select / סינון לפי סטטוס |  | restricted existing-record/system selector; see per-surface exceptions |
| src/components/TaskBoard.tsx:376 | TaskBoard | select / סינון לפי אחראי |  | restricted existing-record/system selector; see per-surface exceptions |
| src/components/TaskBoard.tsx:377 | TaskBoard | select / סינון לפי אחראי חיצוני |  | restricted existing-record/system selector; see per-surface exceptions |
| src/components/TaskBoard.tsx:378 | TaskBoard | select / סינון לפי צבע |  | restricted existing-record/system selector; see per-surface exceptions |
| src/components/TaskBoard.tsx:379 | TaskBoard | BusinessSelect / סינון לפי עדיפות | priority | canonical read-only filter |
| src/components/TaskBoard.tsx:380 | TaskBoard | select / לקוח |  | restricted existing-record/system selector; see per-surface exceptions |
| src/components/TaskBoard.tsx:381 | TaskBoard | select / תאריך לפי |  | restricted existing-record/system selector; see per-surface exceptions |
| src/components/TaskBoard.tsx:385 | TaskBoard | LinkedRecordSelect / החלת צ׳ק ליסט | checklist | valid linked record workflow |
| src/components/TaskBoard.tsx:391 | TaskBoard | select / פתיחת מייל למשימה |  | restricted existing-record/system selector; see per-surface exceptions |
| src/components/TaskBoard.tsx:403 | TaskBoard | TaskProfessionSelect /  |  | organization profession registry |
| src/components/TaskBoard.tsx:405 | TaskBoard | select / {`צבע קטלוג עבור ${task.title}`} |  | restricted existing-record/system selector; see per-surface exceptions |
| src/components/TaskBoard.tsx:406 | TaskBoard | CreatableSelect / {`פרויקט עבור ${task.title}`} |  | workspace option/record; explicit callback |
| src/components/TaskBoard.tsx:409 | TaskBoard | CreatableSelect / {`${column.label} עבור ${task.title}`} |  | workspace option/record; explicit callback |
| src/components/TaskBoard.tsx:410 | TaskBoard | select / {`${column.label} עבור ${task.title}`} |  | restricted existing-record/system selector; see per-surface exceptions |
| src/components/TaskBoard.tsx:412 | TaskBoard | CreatableSelect / {`${column.label} עבור ${task.title}`} |  | workspace option/record; explicit callback |
| src/components/TaskBoard.tsx:414 | TaskBoard | BusinessSelect / {`${column.label} עבור ${task.title}`} | priority | durable organization option |
| src/components/TaskBoard.tsx:426 | TaskBoard | TaskContactAssignment /  |  | access-controlled invitation workflow |
| src/components/TaskBoard.tsx:431 | TaskBoard | CreatableSelect / פרויקט |  | workspace option/record; explicit callback |
| src/components/TaskBoard.tsx:432 | TaskBoard | select / אחראי |  | restricted existing-record/system selector; see per-surface exceptions |
| src/components/TaskBoard.tsx:433 | TaskBoard | CreatableSelect / סטטוס |  | workspace option/record; explicit callback |
| src/components/TaskBoard.tsx:434 | TaskBoard | BusinessSelect / עדיפות | priority | durable organization option |
| src/components/TaskBoard.tsx:435 | TaskBoard | select / צבע / קטלוג |  | restricted existing-record/system selector; see per-surface exceptions |
| src/components/TaskBoard.tsx:441 | TaskBoard | CreatableSelect / מקצוע |  | workspace option/record; explicit callback |
| src/components/TaskBoard.tsx:442 | TaskBoard | BusinessSelect / {column.label} | priority | durable organization option |
| src/components/TaskBoard.tsx:442 | TaskBoard | CreatableSelect / {column.label} |  | workspace option/record; explicit callback |
| src/components/TaskBoard.tsx:442 | TaskBoard | CreatableSelect / {column.label} |  | workspace option/record; explicit callback |
| src/components/TaskContactAssignment.tsx:31 | TaskContactAssignment | select / איש קשר להקצאת משימה |  | restricted existing-record/system selector; see per-surface exceptions |
| src/components/TaskProfessionSelect.tsx:21 | TaskProfessionSelect | CreatableSelect / {`מקצוע עבור ${task.title}`} |  | workspace option/record; explicit callback |
| src/components/UserManagement.tsx:274 | UserManagement | select / {`תפקיד עבור ${member.displayName \|\| member.email}`} |  | restricted existing-record/system selector; see per-surface exceptions |
| src/components/UserManagement.tsx:315 | UserManagement | select / תפקיד |  | restricted existing-record/system selector; see per-surface exceptions |
