import type { Workspace } from '../types'

// Keep dependent business records when removing their container.
export function deleteProject(workspace: Workspace, id: string): Workspace {
  return {
    ...workspace,
    projects: workspace.projects.filter((item) => item.id !== id),
    meetingSummaries: workspace.meetingSummaries.map(item => item.projectId === id ? { ...item, projectId: '' } : item),
    tasks: workspace.tasks.map((item) => item.projectId === id ? { ...item, projectId: undefined } : item),
    events: workspace.events.map((item) => item.projectId === id ? { ...item, projectId: undefined } : item),
    files: workspace.files.map((item) => item.projectId === id ? { ...item, projectId: undefined } : item),
    quotes: workspace.quotes.map((item) => item.projectId === id ? { ...item, projectId: undefined } : item),
    clientNotes: workspace.clientNotes.map((item) => item.projectId === id ? { ...item, projectId: undefined } : item),
    // Reports retain their site details and remain accessible in the report list.
    reports: workspace.reports.map((item) => item.projectId === id ? { ...item, projectId: '' } : item),
  }
}

export function deleteContact(workspace: Workspace, id: string): Workspace {
  return {
    ...workspace,
    contacts: workspace.contacts.filter((item) => item.id !== id),
    projects: workspace.projects.map((item) => item.clientIds.includes(id) ? { ...item, clientIds: item.clientIds.filter((clientId) => clientId !== id), contactIds: item.contactIds?.filter(contactId => contactId !== id) } : item),
    deals: workspace.deals.map((item) => item.contactId === id ? { ...item, contactId: undefined } : item),
    quotes: workspace.quotes.map((item) => item.contactId === id ? { ...item, contactId: undefined } : item),
    clientNotes: workspace.clientNotes.filter((item) => item.contactId !== id),
  }
}
