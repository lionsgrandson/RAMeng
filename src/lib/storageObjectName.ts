/** Storage keys use opaque ASCII names; the original filename stays in CRM metadata. */
export function storageObjectName(originalName: string): string {
  const extension = originalName.match(/\.([a-zA-Z0-9]{1,12})$/)?.[1].toLowerCase()
  return `${crypto.randomUUID()}${extension ? `.${extension}` : ''}`
}
