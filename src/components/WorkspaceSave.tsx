import { createContext, useContext } from 'react'
import { Save } from 'lucide-react'

export const WorkspaceSaveContext = createContext({ save: () => {}, state: 'idle', allowed: false })

export function SaveButton() {
  const { save, state, allowed } = useContext(WorkspaceSaveContext)
  if (!allowed) return null
  return <button type="button" className="secondary workspace-save-button" onClick={save} disabled={state === 'saving' || state === 'conflict'}><Save />{state === 'saving' ? 'שומר...' : state === 'saved' ? 'נשמר' : 'שמירה'}</button>
}
