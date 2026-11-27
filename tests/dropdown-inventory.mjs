// Static inventory, not a substitute for authenticated browser verification.
import ts from 'typescript'
import {readdir,readFile,mkdir,writeFile} from 'node:fs/promises'
import {join,relative} from 'node:path'
const root=process.argv[2] || 'src'
const output=process.argv[3] || 'artifacts/audit/dropdown-inventory'
const controls=new Set(['select','datalist','CreatableSelect','BusinessSelect','LinkedRecordSelect','ClientMultiPicker','CategoryPicker','TaskProfessionSelect','ProjectReportTypes','AddressAutocomplete','TaskContactAssignment'])
const rows=[]
async function walk(directory){for(const entry of await readdir(directory,{withFileTypes:true})){const path=join(directory,entry.name);if(entry.isDirectory())await walk(path);else if(path.endsWith('.tsx')){
  const source=await readFile(path,'utf8'),file=ts.createSourceFile(path,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX)
  const short=node=>node?.getText(file).replace(/\s+/g,' ').slice(0,230) || ''
  function visit(node){
    if(ts.isJsxOpeningElement(node)||ts.isJsxSelfClosingElement(node)){
      const control=node.tagName.getText(file)
      if(controls.has(control)){
        const attrs=Object.fromEntries(node.attributes.properties.filter(ts.isJsxAttribute).map(attr=>[attr.name.getText(file),attr.initializer ? ts.isStringLiteral(attr.initializer)?attr.initializer.text:short(attr.initializer):'true']))
        const labelText=element=>element.children.flatMap(child=>ts.isJsxText(child)?[child.text.trim()]:ts.isJsxElement(child)&&['span','strong'].includes(child.openingElement.tagName.getText(file))?[labelText(child)]:[]).join(' ').trim()
        let ancestor=node.parent,scope='',label=''
        while(ancestor){if(!label&&(ts.isJsxElement(ancestor))&&['label','Field'].includes(ancestor.openingElement.tagName.getText(file)))label=ancestor.openingElement.attributes.properties.find(attr=>ts.isJsxAttribute(attr)&&attr.name.getText(file)==='label')?.initializer?.text || labelText(ancestor);if(ts.isFunctionDeclaration(ancestor)||ts.isFunctionExpression(ancestor)){scope=ancestor.name?.text||'anonymous';break}ancestor=ancestor.parent}
        const native=control==='select'||control==='datalist'
        rows.push({file:relative('.',path).replaceAll('\\','/'),line:file.getLineAndCharacterOfPosition(node.getStart(file)).line+1,scope,control,label:attrs.ariaLabel||attrs['aria-label']||attrs.label||label||attrs.name||'',name:attrs.name||'',family:attrs.family||'',creation:attrs.onCreate||attrs.onCreateContact|| (['BusinessSelect','LinkedRecordSelect','TaskProfessionSelect','CategoryPicker'].includes(control)?'provider/permission gated':native?'inspect exception below':'dedicated workflow'),options:attrs.options||(native&&ts.isJsxElement(node.parent)?short(node.parent):''),source:short(node),classification:control==='BusinessSelect'?(attrs.allowCreate==='{false}'?'canonical read-only filter':'durable organization option'):control==='LinkedRecordSelect'?'valid linked record workflow':control==='CreatableSelect'?'workspace option/record; explicit callback':control==='TaskProfessionSelect'||control==='CategoryPicker'?'organization profession registry':control==='ClientMultiPicker'?'linked contacts; explicit callback':control==='ProjectReportTypes'?'template checkboxes; adjacent template creation':control==='AddressAutocomplete'?'address suggestions; accepts required user address':control==='TaskContactAssignment'?'access-controlled invitation workflow':'restricted existing-record/system selector; see per-surface exceptions'})
      }
    }ts.forEachChild(node,visit)
  }visit(file)
}}}
await walk(root);rows.sort((a,b)=>a.file.localeCompare(b.file)||a.line-b.line)
await mkdir('artifacts/audit',{recursive:true})
await writeFile(output+'.json',JSON.stringify(rows,null,2)+'\n')
const esc=value=>String(value).replaceAll('|','\\|').replaceAll('\n',' ')
await writeFile(output+'.md',`# Source selector inventory\n\nGenerated from ${root}. ${rows.length} static control instances; mapped/rendered controls may produce multiple runtime selectors. This includes component wrappers and unreachable legacy exports. Source presence does not establish live functionality.\n\n| Source | Scope | Control / label | Family | Classification |\n| --- | --- | --- | --- | --- |\n`+rows.map(row=>`| ${esc(row.file)}:${row.line} | ${esc(row.scope)} | ${esc(row.control+' / '+row.label)} | ${esc(row.family)} | ${esc(row.classification)} |`).join('\n')+'\n')
console.log(`${rows.length} selectors inventoried from ${root}`)
