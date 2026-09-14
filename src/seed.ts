import type { Workspace } from './types'

export const emptyWorkspace: Workspace = {
  contacts: [],
  deals: [],
  projects: [],
  tasks: [],
  events: [],
  files: [],
  quotes: [],
  team: [],
  taskColumns: [
    { id: 'col-title', label: 'משימה / תת משימה', key: 'title', type: 'text', visible: true, removable: false, width: 300 },
    { id: 'col-assignee', label: 'אחראי', key: 'assigneeId', type: 'member', visible: true, removable: false, width: 150 },
    { id: 'col-status', label: 'סטטוס', key: 'status', type: 'status', visible: true, removable: false, width: 140 },
    { id: 'col-start', label: 'תאריך תחילת משימה', key: 'startDate', type: 'date', visible: true, removable: false, width: 155 },
    { id: 'col-follow', label: 'מועד מעקב / סיום', key: 'followUpDate', type: 'date', visible: true, removable: false, width: 165 },
    { id: 'col-email', label: 'תיבת מייל', key: 'emailTo', type: 'email', visible: true, removable: false, width: 190 },
  ],
  taskStatuses: ['טרם התחיל', 'בטיפול', 'ממתין לגורם חיצוני', 'דורש מעקב', 'בוצע חלקית', 'בוצע', 'סגור'],
  checklistTemplates: [],
  reports: [],
  reportTemplates: [
    { id: 'report-table', name: 'דוח פיקוח', layout: 'table', sectionTitles: ['בנייה', 'חשמל', 'אלומיניום', 'מיזוג אוויר'] },
    { id: 'report-cards', name: 'דוח כרטיסים', layout: 'cards', sectionTitles: ['בנייה', 'חשמל', 'אלומיניום', 'מיזוג אוויר'] },
    { id: 'report-photo', name: 'דוח תמונות', layout: 'photo', sectionTitles: ['בנייה', 'חשמל', 'אלומיניום', 'מיזוג אוויר'] },
  ],
  audit: [],
  settings: {
    organizationName: 'ר.א.ם הנדסה',
    organizationShortName: 'ראם הנדסה',
    phone: '052-3753296',
    email: 'office@r-eng.co.il',
    secondaryEmail: '',
    website: 'https://r-eng.co.il/',
    brandColor: '#75927c',
    logoUrl: '',
    openaiModel: 'gpt-5.6-terra',
    driveRootFolderId: '',
    defaultInspector: '',
  },
}

export const cloneWorkspace = () => JSON.parse(JSON.stringify(emptyWorkspace)) as Workspace
