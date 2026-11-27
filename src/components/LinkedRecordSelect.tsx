import type { ComponentProps, Dispatch, SetStateAction } from 'react'
import type { Workspace } from '../types'
import { useRecordCreation } from './BusinessSelect'
import CreatableSelect from './CreatableSelect'
import { nowIso, uid } from './common'

// Minimal valid creation workflows; names are display labels, never identifiers.
export default function LinkedRecordSelect({ family, workspace, setWorkspace, projectId, contactId, ...props }: Omit<ComponentProps<typeof CreatableSelect>, 'options' | 'onCreate' | 'extraFields'> & {
  family: 'project' | 'contact' | 'task' | 'report_template' | 'checklist'
  workspace: Workspace; setWorkspace: Dispatch<SetStateAction<Workspace>>; projectId?: string; contactId?: string
}) {
  const canCreate = useRecordCreation()
  const area = family === 'project' ? 'projects' : family === 'contact' ? 'contacts' : family === 'report_template' ? 'reports' : 'tasks'
  const records = family === 'project' ? workspace.projects : family === 'contact' ? workspace.contacts : family === 'task' ? workspace.tasks.filter(task => !projectId || task.projectId === projectId) : family === 'report_template' ? workspace.reportTemplates : workspace.checklistTemplates
  const options = records.map(record => ({ value: record.id, label: 'title' in record ? record.title : 'address' in record ? `${record.name} — ${record.address}` : record.name }))
  return <CreatableSelect {...props} options={options} allowDuplicateNames
    extraFields={family === 'project' ? [{key:'address',label:'כתובת הפרויקט',required:true}] : family === 'contact' ? [{key:'email',label:'מייל (אופציונלי)',type:'email'}] : family === 'report_template' ? [{key:'section',label:'קטגוריה ראשונה',required:true}] : family === 'checklist' ? [{key:'item',label:'משימה ראשונה',required:true}] : []}
    onCreate={!props.disabled && canCreate(area) ? (name, details) => {
      const id = uid(family)
      setWorkspace(current => {
        if (family === 'project') return {...current,projects:[...current.projects,{id,name,address:details.address.trim(),clientIds:contactId?[contactId]:[],status:'בתכנון',progress:0,createdAt:nowIso()}]}
        if (family === 'contact') return {...current,contacts:[...current.contacts,{id,name,email:details.email.trim(),status:'פעיל',tags:[],createdAt:nowIso()}]}
        if (family === 'report_template') return {...current,reportTemplates:[...current.reportTemplates,{id,name,layout:'table',sectionTitles:[details.section.trim()]}]}
        if (family === 'checklist') return {...current,checklistTemplates:[...current.checklistTemplates,{id,name,items:[{id:uid('item'),title:details.item.trim()}]}]}
        if (projectId && !current.projects.some(project => project.id === projectId)) throw new Error('הפרויקט אינו זמין')
        return {...current,tasks:[...current.tasks,{id,title:name,projectId,status:current.taskStatuses[0] || 'טרם התחיל',priority:'רגילה',custom:{},order:current.tasks.length+1,createdAt:nowIso()}]}
      })
      return id
    } : undefined} />
}
