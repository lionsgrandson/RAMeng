// Real application UI, isolated QA backend. Live verification is a separate release gate.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { join, resolve } from 'node:path'
import { mkdir, writeFile } from 'node:fs/promises'
import { createServer } from 'vite'
const runtime = process.env.RAMENG_TEST_BROWSER_RUNTIME
if (!runtime) throw Error('Set RAMENG_TEST_BROWSER_RUNTIME to the disposable Playwright installation')
const { chromium, webkit } = createRequire(join(resolve(runtime), 'package.json'))('playwright')
const base = 'http://127.0.0.1:4181'
const server = await createServer({configFile:'tests/qa.config.mjs',server:{port:4181,strictPort:true}})
await server.listen()
await mkdir('artifacts/audit',{recursive:true})
const results=[]
const value = 'QA אפשרות Café'
async function add(page, select, label, extras={}) {
  await select.selectOption({label:'+ הוספת פריט חדש'})
  const dialog=page.getByRole('dialog',{name:`הוספת ${label}`,exact:true})
  await dialog.locator('input').first().fill(value)
  for(const [name,text] of Object.entries(extras)) await dialog.locator(`[name="${name}"]`).fill(text)
  await dialog.getByRole('button',{name:'הוספה ובחירה',exact:true}).click()
  await dialog.waitFor({state:'hidden'})
}
async function stored(page,predicate) { await page.waitForFunction(predicate) }
async function open(page,route,button) {
  await page.goto(`${base}/#app?page=${route}`)
  await page.locator('.topbar').waitFor()
  if(button) await page.getByRole('button',{name:button,exact:true}).click()
}
const familyCases = [
  ['contact_status','clients','לקוח חדש','סטטוס לקוח'],
  ['contact_role','clients','לקוח חדש','תפקיד'],
  ['company_type','clients','לקוח חדש','סוג חברה'],
  ['contact_tag','clients','לקוח חדש','בחירת תגית קיימת','תגית'],
  ['project_status','projects','פרויקט חדש','סטטוס פרויקט'],
  ['priority','tasks','משימה חדשה','עדיפות'],
  ['plan_status','files',null,'סטטוס תכנית QA-attachment.txt','סטטוס תכנית'],
  ['report_status','reports',null,'סטטוס סעיף בדוח'],
]
try {
  for(const [engine,device] of [[chromium,'desktop-chromium'],[chromium,'mobile-chromium'],[webkit,'mobile-webkit']]) {
    const browser=await engine.launch({headless:true})
    const scenario=async(name,action,query='')=>{
      if(process.env.RAMENG_TEST_FILTER && !name.includes(process.env.RAMENG_TEST_FILTER))return
      const context=await browser.newContext({viewport:device==='desktop-chromium'?{width:1440,height:1000}:{width:390,height:844},...(device.startsWith('mobile')?{isMobile:true,hasTouch:true}:{})})
      const page=await context.newPage();page.setDefaultTimeout(15000)
      const errors=[];page.on('pageerror',error=>errors.push(error.message))
      await page.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort())
      try {
        await page.goto(`${base}/${query}#app?page=tasks`);await page.locator('.topbar').waitFor()
        await action(page)
        assert.deepEqual(errors,[])
        results.push({device,name,status:'PASS'});console.log(`PASS ${device}: ${name}`)
      }catch(error){results.push({device,name,status:'FAIL',error:String(error)});console.error(`FAIL ${device}: ${name}: ${error}`);await page.screenshot({path:`artifacts/audit/inline-failure-${results.length}.png`,fullPage:true})}
      finally{await context.close()}
    }
    for(const [family,route,button,aria,label=aria] of familyCases) await scenario(`${family} add/select/save/reload/reuse and parent cancellation`,async page=>{
      await open(page,route,button)
      if(family==='report_status')await page.locator('.report-row').first().click()
      const select=page.getByRole('combobox',{name:aria,exact:true})
      const parent=page.getByRole('dialog').first()
      if(button) {
        const draft=parent.locator('input[name="title"],input[name="name"]').first()
        await draft.fill('טיוטה שלא תימחק')
      }
      await add(page,select,label)
      if(family!=='contact_tag')assert.equal(await select.inputValue(),value)
      await stored(page,()=>JSON.parse(localStorage.getItem('qa-business-options')||'[]').some(row=>row.value==='QA אפשרות Café'))
      if(button){
        assert.equal(await parent.locator('input[name="title"],input[name="name"]').first().inputValue(),'טיוטה שלא תימחק')
        assert.equal(await page.getByRole('dialog').count(),1)
        await parent.getByRole('button',{name:'סגירה',exact:true}).click()
      }else{
        await stored(page,()=>JSON.stringify(JSON.parse(localStorage.getItem('rameng-qa-developer')||'{}')).includes('QA אפשרות Café'))
      }
      await page.reload();await page.locator('.topbar').waitFor()
      if(button)await page.getByRole('button',{name:button,exact:true}).click()
      // Report selection is in the route; browser refresh restores the editor.
      await select.locator('option').filter({hasText:value}).waitFor({state:'attached'})
      await select.selectOption(value)
      assert.equal(await select.locator(`option[value="${value}"]`).count(),1)
      if(button)await page.getByRole('dialog').getByRole('button',{name:'סגירה',exact:true}).click()
      if(family==='contact_status'||family==='project_status'||family==='priority'){
        const filter=page.getByRole('combobox',{name:family==='contact_status'?'סינון לפי סטטוס לקוח':family==='project_status'?'סינון לפי סטטוס פרויקט':'סינון לפי עדיפות',exact:true})
        assert.equal(await filter.locator(`option[value="${value}"]`).count(),1)
      }
    })
    await scenario('quote status add/select/save/reload/reuse through a valid client finance document',async page=>{
      await page.goto(`${base}/#app?page=clients&client=qa-client`)
      await page.getByRole('tab',{name:'כספים',exact:true}).click()
      await page.getByRole('button',{name:'מסמך פיננסי חדש',exact:true}).click()
      const parent=page.getByRole('dialog',{name:'מסמך פיננסי חדש',exact:true})
      await parent.locator('[name="title"]').fill('QA finance document');await parent.locator('[name="amount"]').fill('0')
      const select=parent.getByRole('combobox',{name:'סטטוס חיוב',exact:true})
      await add(page,select,'סטטוס חיוב')
      await parent.getByRole('button',{name:'ביטול',exact:true}).click()
      await page.getByRole('button',{name:'מסמך פיננסי חדש',exact:true}).click()
      await parent.locator('[name="title"]').fill('QA finance document');await parent.locator('[name="amount"]').fill('0')
      await select.selectOption(value);await parent.getByRole('button',{name:'שמירה',exact:true}).click()
      await stored(page,()=>JSON.parse(localStorage.getItem('rameng-qa-developer')||'{}').quotes?.some(quote=>quote.title==='QA finance document'&&quote.status==='QA אפשרות Café'&&quote.contactId==='qa-client'))
      await page.reload();await page.getByRole('tab',{name:'כספים',exact:true}).click()
      assert.equal(await page.getByRole('combobox',{name:'סטטוס חיוב',exact:true}).inputValue(),value)
      await page.goto(`${base}/#app?page=reports-finance`)
      assert.equal(await page.getByRole('combobox',{name:'סינון לפי סטטוס חיוב',exact:true}).locator(`option[value="${value}"]`).count(),1)
    })
    for(const [name,aria,label,extras] of [['task status','סטטוס','סטטוס',{}],['profession','מקצוע','מקצוע',{}],['linked project','פרויקט','פרויקט',{address:'כתובת בדיקה 42, ירושלים'}]]) await scenario(`${name} acknowledgement, nested submit, save, reload and reuse`,async page=>{
      await page.getByRole('button',{name:'משימה חדשה',exact:true}).click()
      const parent=page.getByRole('dialog',{name:'משימה חדשה',exact:true})
      await parent.locator('[name="title"]').fill('QA משימה עם אפשרות')
      const select=parent.getByRole('combobox',{name:aria,exact:true})
      await add(page,select,label,extras)
      assert.equal(await page.getByRole('dialog').count(),1)
      assert.equal(await parent.locator('[name="title"]').inputValue(),'QA משימה עם אפשרות')
      await parent.getByRole('button',{name:'יצירת משימה',exact:true}).click()
      await stored(page,()=>JSON.parse(localStorage.getItem('rameng-qa-developer')||'{}').tasks?.some(task=>task.title==='QA משימה עם אפשרות'))
      await page.reload();await page.locator('.topbar').waitFor()
      await page.getByRole('button',{name:'משימה חדשה',exact:true}).click()
      await parent.getByRole('combobox',{name:aria,exact:true}).selectOption({label:name==='linked project'?value:value})
    })
    await scenario('custom task status imports resolve Unicode whitespace and case to the canonical option',async page=>{
      await page.getByRole('button',{name:'משימה חדשה',exact:true}).click()
      const parent=page.getByRole('dialog',{name:'משימה חדשה',exact:true})
      await add(page,parent.getByRole('combobox',{name:'סטטוס',exact:true}),'סטטוס')
      await parent.getByRole('button',{name:'ביטול',exact:true}).click()
      await page.goto(`${base}/#app?page=imports`)
      await page.getByLabel('ייבוא קובץ משימות',{exact:true}).setInputFiles({name:'inline-status.csv',mimeType:'text/csv',buffer:Buffer.from('משימה,סטטוס\nQA imported,QA\u2003אפשרות CAFÉ\n')})
      await page.getByRole('dialog',{name:'תצוגה מקדימה של ייבוא משימות',exact:true}).getByRole('button',{name:'ייבוא 1 משימות',exact:true}).click()
      await stored(page,()=>JSON.parse(localStorage.getItem('rameng-qa-developer')||'{}').tasks?.some(task=>task.title==='QA imported'&&task.status==='QA אפשרות Café'))
      await page.reload();await page.goto(`${base}/#app?page=tasks`)
      assert.equal(await page.getByRole('combobox',{name:'סטטוס עבור QA imported',exact:true}).inputValue(),value)
    })
    await scenario('custom status columns share options without changing built-in task completion',async page=>{
      await page.goto(`${base}/#app?page=settings`);await page.getByRole('tab',{name:'תצוגה',exact:true}).click()
      await page.getByLabel('שם עמודה חדשה',{exact:true}).fill('סטטוס אישור');await page.getByLabel('סוג עמודה חדשה',{exact:true}).selectOption('status')
      await page.getByRole('button',{name:'הוספת עמודה',exact:true}).click()
      await stored(page,()=>JSON.parse(localStorage.getItem('rameng-qa-developer')||'{}').taskColumns?.some(column=>column.label==='סטטוס אישור'))
      await page.goto(`${base}/#app?page=tasks`)
      const select=page.getByRole('combobox',{name:'סטטוס אישור עבור משימת בדיקה',exact:true})
      await add(page,select,'סטטוס')
      await stored(page,()=>Object.values(JSON.parse(localStorage.getItem('rameng-qa-developer')||'{}').tasks?.[0]?.custom||{}).includes('QA אפשרות Café'))
      await page.reload();assert.equal(await select.inputValue(),value)
      assert.equal(await page.getByRole('combobox',{name:'סטטוס עבור משימת בדיקה',exact:true}).inputValue(),'דורש מעקב')
      assert.equal(await page.getByRole('combobox',{name:'סינון לפי סטטוס',exact:true}).getByRole('option',{name:value,exact:true}).count(),1)
      await page.getByRole('button',{name:'משימה חדשה',exact:true}).click()
      const parent=page.getByRole('dialog')
      await parent.locator('[name="title"]').fill('QA custom status form')
      await parent.getByRole('combobox',{name:'סטטוס אישור',exact:true}).selectOption(value)
      await parent.getByRole('button',{name:'יצירת משימה',exact:true}).click()
      await stored(page,()=>JSON.parse(localStorage.getItem('rameng-qa-developer')||'{}').tasks?.some(task=>task.title==='QA custom status form'&&Object.values(task.custom||{}).includes('QA אפשרות Café')))
      await page.reload();assert.equal(await page.getByRole('combobox',{name:'סטטוס אישור עבור QA custom status form',exact:true}).inputValue(),value)
    })
    await scenario('subtask inline status creation persists the real parent relationship',async page=>{
      await page.locator('[data-task-id="qa-task"]').getByRole('button',{name:'תת-משימה',exact:true}).click()
      const parent=page.getByRole('dialog')
      await parent.locator('[name="title"]').fill('QA inline subtask')
      await add(page,parent.getByRole('combobox',{name:'סטטוס',exact:true}),'סטטוס')
      await parent.getByRole('button',{name:'יצירת תת-משימה',exact:true}).click()
      await stored(page,()=>JSON.parse(localStorage.getItem('rameng-qa-developer')||'{}').tasks?.some(task=>task.title==='QA inline subtask'&&task.parentId==='qa-task'&&task.status==='QA אפשרות Café'))
      await page.reload();assert.equal(await page.getByRole('combobox',{name:'סטטוס עבור QA inline subtask',exact:true}).inputValue(),value)
    })
    await scenario('task status created in the client view is canonical in task forms, project tables and filters',async page=>{
      await page.goto(`${base}/#app?page=clients&client=qa-client`)
      await page.getByRole('tab',{name:'משימות',exact:true}).click()
      await add(page,page.locator('.client-task-table article').filter({has:page.getByRole('textbox',{name:'שם משימה משימת בדיקה',exact:true})}).getByRole('combobox',{name:'סטטוס',exact:true}),'סטטוס')
      await stored(page,()=>JSON.parse(localStorage.getItem('rameng-qa-developer')||'{}').tasks?.[0]?.status==='QA אפשרות Café')
      await page.reload();await page.getByRole('tab',{name:'משימות',exact:true}).click()
      await page.getByRole('button',{name:'כל הפרטים',exact:true}).click()
      const editor=page.getByRole('dialog')
      assert.equal(await editor.getByRole('combobox',{name:'סטטוס',exact:true}).inputValue(),value)
      await editor.locator('.form-actions').getByRole('button',{name:'סגירה',exact:true}).click()
      await page.goto(`${base}/#app?page=projects&project=qa-project&tab=tasks`)
      await page.getByRole('combobox',{name:'סינון לפי סטטוס',exact:true}).selectOption(value)
      assert.equal(await page.getByRole('combobox',{name:'סטטוס עבור משימת בדיקה',exact:true}).inputValue(),value)
      await page.getByRole('button',{name:'משימה חדשה',exact:true}).click()
      await page.getByRole('dialog').getByRole('combobox',{name:'סטטוס',exact:true}).selectOption(value)
    })
    await scenario('linked projects with duplicate names retain separate required addresses and identities',async page=>{
      await page.getByRole('button',{name:'משימה חדשה',exact:true}).click()
      const parent=page.getByRole('dialog',{name:'משימה חדשה',exact:true}),select=parent.getByRole('combobox',{name:'פרויקט',exact:true})
      await parent.locator('[name="title"]').fill('טיוטת משימה עם שני פרויקטים')
      await add(page,select,'פרויקט',{address:'כתובת QA ראשונה 1'})
      const first=await select.inputValue()
      await add(page,select,'פרויקט',{address:'כתובת QA שנייה 2'})
      const second=await select.inputValue()
      assert.notEqual(first,second)
      assert.equal(await parent.locator('[name="title"]').inputValue(),'טיוטת משימה עם שני פרויקטים')
      await parent.getByRole('button',{name:'סגירה',exact:true}).click();await page.reload()
      const projects=await page.evaluate(()=>JSON.parse(localStorage.getItem('rameng-qa-developer')).projects.filter(project=>project.name==='QA אפשרות Café'))
      assert.equal(projects.length,2)
      assert.deepEqual(projects.map(project=>project.address),['כתובת QA ראשונה 1','כתובת QA שנייה 2'])
    })
    await scenario('linked contacts with duplicate names retain distinct email identities after parent cancellation',async page=>{
      await open(page,'projects','פרויקט חדש')
      const parent=page.getByRole('dialog',{name:'פרויקט חדש',exact:true})
      for(const email of ['duplicate-one@example.test','duplicate-two@example.test']) {
        await parent.getByRole('button',{name:'+ הוספת פריט חדש',exact:true}).click()
        const inner=page.getByRole('dialog',{name:'הוספת איש קשר',exact:true})
        await inner.locator('[name="name"]').fill(value);await inner.locator('[name="email"]').fill(email)
        await inner.getByRole('button',{name:'הוספה ובחירה',exact:true}).click();await inner.waitFor({state:'hidden'})
      }
      await parent.getByRole('button',{name:'סגירה',exact:true}).click();await page.reload()
      const contacts=await page.evaluate(()=>JSON.parse(localStorage.getItem('rameng-qa-developer')).contacts.filter(contact=>contact.name==='QA אפשרות Café'))
      assert.equal(contacts.length,2);assert.notEqual(contacts[0].id,contacts[1].id)
      assert.deepEqual(contacts.map(contact=>contact.email),['duplicate-one@example.test','duplicate-two@example.test'])
    })
    await scenario('custom dropdown column add/select/save/reload/reuse',async page=>{
      await page.goto(`${base}/#app?page=settings`)
      await page.getByRole('tab',{name:'תצוגה',exact:true}).click()
      await page.getByLabel('שם עמודה חדשה',{exact:true}).fill('בחירה מותאמת')
      await page.getByLabel('סוג עמודה חדשה',{exact:true}).selectOption('dropdown')
      await page.getByRole('button',{name:'הוספת עמודה',exact:true}).click()
      await stored(page,()=>JSON.parse(localStorage.getItem('rameng-qa-developer')||'{}').taskColumns?.some(column=>column.type==='dropdown'&&column.label==='בחירה מותאמת'))
      await page.goto(`${base}/#app?page=tasks`)
      const select=page.getByRole('combobox',{name:'בחירה מותאמת עבור משימת בדיקה',exact:true})
      await add(page,select,'בחירה מותאמת')
      await stored(page,()=>Object.values(JSON.parse(localStorage.getItem('rameng-qa-developer')||'{}').tasks?.[0]?.custom||{}).includes('QA אפשרות Café'))
      await page.reload();assert.equal(await select.inputValue(),value)
      await page.getByRole('button',{name:'משימה חדשה',exact:true}).click()
      await page.getByRole('dialog').getByRole('combobox',{name:'בחירה מותאמת',exact:true}).selectOption(value)
    })
    await scenario('linked contact creation selects a real record and survives project cancellation',async page=>{
      await open(page,'projects','פרויקט חדש')
      const parent=page.getByRole('dialog',{name:'פרויקט חדש',exact:true})
      await parent.locator('[name="name"]').fill('טיוטת פרויקט')
      await parent.getByRole('button',{name:'+ הוספת פריט חדש',exact:true}).click()
      const inner=page.getByRole('dialog',{name:'הוספת איש קשר',exact:true})
      await inner.locator('[name="name"]').fill(value)
      await inner.locator('[name="email"]').fill('inline-contact@example.test')
      await inner.getByRole('button',{name:'הוספה ובחירה',exact:true}).click();await inner.waitFor({state:'hidden'})
      assert.equal(await parent.locator('[name="name"]').inputValue(),'טיוטת פרויקט')
      const selected=await parent.locator('input[type="hidden"][name="clientIds"]').inputValue()
      const contact=await page.evaluate(id=>JSON.parse(localStorage.getItem('rameng-qa-developer')).contacts.find(item=>item.id===id),selected)
      assert.equal(contact.name,value);assert.equal(contact.email,'inline-contact@example.test')
      await parent.getByRole('button',{name:'סגירה',exact:true}).click();await page.reload()
      await page.getByRole('button',{name:'פרויקט חדש',exact:true}).click()
      await page.getByRole('dialog').locator('.client-picker-option').filter({hasText:value}).locator('input[type="checkbox"]').check()
    })
    await scenario('report template requires a section, saves a valid record and survives parent cancellation',async page=>{
      await open(page,'projects','פרויקט חדש')
      const parent=page.getByRole('dialog',{name:'פרויקט חדש',exact:true})
      const select=parent.getByRole('combobox',{name:'תבנית דוח ברירת מחדל',exact:true})
      await add(page,select,'תבנית דוח',{section:'קטגוריית QA'})
      const templateId=await select.inputValue()
      assert.ok(templateId)
      const template=await page.evaluate(id=>JSON.parse(localStorage.getItem('rameng-qa-developer')).reportTemplates.find(item=>item.id===id),templateId)
      assert.deepEqual(template.sectionTitles,['קטגוריית QA']);assert.equal(template.layout,'table')
      await parent.getByRole('button',{name:'סגירה',exact:true}).click();await page.reload()
      await page.getByRole('button',{name:'פרויקט חדש',exact:true}).click();await select.selectOption(templateId)
    })
    await scenario('linked task creation uses the selected project and persists without uploading a file',async page=>{
      await open(page,'files')
      await page.getByRole('combobox',{name:'שיוך קובץ לפרויקט',exact:true}).selectOption('qa-project')
      const select=page.getByRole('combobox',{name:'שיוך קובץ למשימה',exact:true})
      await add(page,select,'משימה')
      const id=await select.inputValue()
      const task=await page.evaluate(id=>JSON.parse(localStorage.getItem('rameng-qa-developer')).tasks.find(item=>item.id===id),id)
      assert.equal(task.title,value);assert.equal(task.projectId,'qa-project');assert.equal(task.status,'טרם התחיל')
      await page.reload();await page.getByRole('combobox',{name:'שיוך קובץ לפרויקט',exact:true}).selectOption('qa-project');await select.selectOption(id)
      await add(page,select,'משימה')
      assert.notEqual(await select.inputValue(),id)
      await stored(page,()=>JSON.parse(localStorage.getItem('rameng-qa-developer')||'{}').tasks?.filter(task=>task.title==='QA אפשרות Café'&&task.projectId==='qa-project').length===2)
    })
    await scenario('checklist creation saves a real template, applies immediately and is reusable',async page=>{
      await page.goto(`${base}/#app?page=projects&project=qa-project&tab=tasks`)
      const select=page.getByRole('combobox',{name:'החלת צ׳ק ליסט',exact:true})
      await add(page,select,'צ׳ק ליסט',{item:'QA משימה מתבנית'})
      await stored(page,()=>JSON.parse(localStorage.getItem('rameng-qa-developer')||'{}').tasks?.some(task=>task.title==='QA משימה מתבנית'))
      await page.reload();await select.selectOption({label:value})
      await stored(page,()=>JSON.parse(localStorage.getItem('rameng-qa-developer')||'{}').tasks?.filter(task=>task.title==='QA משימה מתבנית').length===2)
    })
    await scenario('invalid labels and whitespace-only project addresses never create records',async page=>{
      await page.getByRole('button',{name:'משימה חדשה',exact:true}).click()
      const parent=page.getByRole('dialog',{name:'משימה חדשה',exact:true})
      await parent.getByRole('combobox',{name:'סטטוס',exact:true}).selectOption({label:'+ הוספת פריט חדש'})
      const inner=page.getByRole('dialog',{name:'הוספת סטטוס',exact:true})
      await inner.locator('input').fill('__none__');await inner.getByRole('button',{name:'הוספה ובחירה',exact:true}).click()
      await inner.getByRole('alert').waitFor();assert.equal(await page.getByRole('dialog').count(),2)
      await inner.getByRole('button',{name:'ביטול',exact:true}).click()
      await parent.getByRole('combobox',{name:'פרויקט',exact:true}).selectOption({label:'+ הוספת פריט חדש'})
      const project=page.getByRole('dialog',{name:'הוספת פרויקט',exact:true})
      await project.locator('input').first().fill(value);await project.locator('[name="address"]').fill('   ')
      await project.getByRole('button',{name:'הוספה ובחירה',exact:true}).click();await project.getByRole('alert').waitFor()
      assert.equal(await page.getByRole('dialog').count(),2)
    })
    await scenario('network rejection retains creation dialog and draft; retry waits for acknowledgement',async page=>{
      await page.getByRole('button',{name:'משימה חדשה',exact:true}).click()
      const parent=page.getByRole('dialog',{name:'משימה חדשה',exact:true})
      await parent.locator('[name="title"]').fill('טיוטה נשמרת')
      await parent.getByRole('combobox',{name:'עדיפות',exact:true}).selectOption({label:'+ הוספת פריט חדש'})
      const dialog=page.getByRole('dialog',{name:'הוספת עדיפות',exact:true})
      await dialog.locator('input').first().fill(value)
      await dialog.getByRole('button',{name:'הוספה ובחירה',exact:true}).click()
      await dialog.getByRole('alert').waitFor()
      assert.equal(await parent.locator('[name="title"]').inputValue(),'טיוטה נשמרת')
      assert.equal(await parent.getByRole('combobox',{name:'עדיפות',exact:true}).inputValue(),'רגילה')
      await dialog.getByRole('button',{name:'הוספה ובחירה',exact:true}).click()
      await dialog.waitFor({state:'hidden'})
      assert.equal(await parent.getByRole('combobox',{name:'עדיפות',exact:true}).inputValue(),value)
    },'?qaOptionSave=error')
    await scenario('keyboard Escape closes only inner modal and restores focus and unsaved fields',async page=>{
      await page.getByRole('button',{name:'משימה חדשה',exact:true}).click()
      const parent=page.getByRole('dialog',{name:'משימה חדשה',exact:true})
      await parent.locator('[name="title"]').fill('טיוטה נשמרת')
      const select=parent.getByRole('combobox',{name:'סטטוס',exact:true})
      await select.focus();await select.press('End');await select.press('Enter')
      // Native select keyboard handling differs on WebKit; selecting via native
      // selectOption still exercises the browser's change event, never a DOM mutation.
      if(!await page.getByRole('dialog',{name:'הוספת סטטוס',exact:true}).isVisible())await select.selectOption({label:'+ הוספת פריט חדש'})
      await page.getByRole('dialog',{name:'הוספת סטטוס',exact:true}).locator('input').first().fill('לא יישמר')
      await page.keyboard.press('Escape')
      assert.equal(await page.getByRole('dialog').count(),1)
      assert.equal(await parent.locator('[name="title"]').inputValue(),'טיוטה נשמרת')
      assert.equal(await select.evaluate(node=>node===document.activeElement),true)
    })
    await scenario('viewer sees no inline creation actions',async page=>{
      assert.equal(await page.locator('option').filter({hasText:'+ הוספת פריט חדש'}).count(),0)
    },'?qaRole=viewer')
    await browser.close()
  }
} finally {
  await server.close()
  await writeFile('artifacts/audit/inline-choices-browser-results.json',JSON.stringify(results,null,2))
}
console.log(`${results.filter(row=>row.status==='PASS').length}/${results.length} inline browser scenarios passed`)
if(results.some(row=>row.status==='FAIL'))process.exitCode=1
