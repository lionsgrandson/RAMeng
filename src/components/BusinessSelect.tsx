import { createContext, useContext, useEffect, useState, type ComponentProps, type ReactNode } from 'react'
import { createBusinessOption, listBusinessOptions } from '../lib/backend'
import { businessFamilies, uniqueChoices, type BusinessFamily, type BusinessOption } from '../lib/businessOptions'
import type { PermissionMatrix } from '../lib/permissions'
import CreatableSelect, { textChoices } from './CreatableSelect'

const BusinessContext = createContext<{
  options: BusinessOption[]; allowed: (family: BusinessFamily) => boolean
  canCreateRecord: (area: keyof PermissionMatrix) => boolean
  create: (family: BusinessFamily, value: string) => Promise<string>
}>({ options: [], allowed: () => false, canCreateRecord: () => false, create: async () => { throw new Error('יצירת אפשרויות דורשת חיבור לשרת') } })
export const useRecordCreation = () => useContext(BusinessContext).canCreateRecord

export function BusinessOptionsProvider({ orgId, permissions, children }: { orgId: string; permissions: PermissionMatrix; children: ReactNode }) {
  const [options, setOptions] = useState<BusinessOption[]>([])
  useEffect(() => {
    let active = true
    const refresh = () => { void listBusinessOptions(orgId).then(rows => { if (active) setOptions(rows) }).catch(() => { /* Creation surfaces server errors; never claim a save on read failure. */ }) }
    setOptions([]); refresh()
    const timer = window.setInterval(refresh, 5000)
    window.addEventListener('focus', refresh)
    return () => { active = false; clearInterval(timer); window.removeEventListener('focus', refresh) }
  }, [orgId])
  return <BusinessContext.Provider value={{ options,
    canCreateRecord: area => permissions[area].view && permissions[area].create,
    allowed: family => { const access = permissions[businessFamilies[family].area]; return access.view && access.create && access.edit },
    create: async (family, value) => {
      const saved = await createBusinessOption(orgId, family, value)
      setOptions(current => [...current.filter(item => item.family !== family || item.value !== saved), { family, value: saved }])
      return saved
    },
  }}>{children}</BusinessContext.Provider>
}

export default function BusinessSelect({ family, legacy = [], allowCreate = true, ...props }: Omit<ComponentProps<typeof CreatableSelect>, 'options' | 'onCreate'> & { family: BusinessFamily; legacy?: string[]; allowCreate?: boolean }) {
  const context = useContext(BusinessContext)
  const values = uniqueChoices([...businessFamilies[family].defaults, ...context.options.filter(item => item.family === family).map(item => item.value), ...legacy])
  return <CreatableSelect {...props} options={textChoices(values)} onCreate={allowCreate && context.allowed(family) ? value => context.create(family, value) : undefined} />
}
