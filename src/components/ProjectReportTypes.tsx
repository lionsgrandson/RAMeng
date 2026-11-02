import type { ReportTemplate } from '../types'

export default function ProjectReportTypes({ templates, value = [], onChange }: { templates: ReportTemplate[]; value?: string[]; onChange: (ids: string[]) => void }) {
  return <fieldset className="document-columns"><legend>סוגי הדוחות הנדרשים בפרויקט</legend>{templates.map(template => <label className="project-report-type" key={template.id}><input type="checkbox" checked={value.includes(template.id)} onChange={event => onChange(event.target.checked ? [...value, template.id] : value.filter(id => id !== template.id))} /><span>{template.name} · {template.layout === 'table' ? 'טבלה' : template.layout === 'cards' ? 'כרטיסים' : 'תמונות'}</span></label>)}</fieldset>
}
