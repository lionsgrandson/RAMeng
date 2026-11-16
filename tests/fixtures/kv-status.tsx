import React from 'react'
import { createRoot } from 'react-dom/client'
import TaskCalendarSync from '../../src/components/TaskCalendarSync'
import { cloneWorkspace } from '../../src/seed'
import { integrationsApi } from '../../src/lib/api'
import { configureBackend } from '../../src/lib/backend'
configureBackend({ configured: false, apiBase: '', supabaseUrl: '', supabaseAnonKey: '' })
function Harness() {
  const [result, setResult] = React.useState('')
  return <main><h1>Projects remain available</h1><button onClick={() => void Promise.all(Array.from({ length: 25 }, () => integrationsApi.status())).then(values => setResult(String(values.length)))}>Concurrent status</button><output>{result}</output><TaskCalendarSync orgId="synthetic" userId="owner" workspace={cloneWorkspace()} enabled ready /></main>
}
createRoot(document.getElementById('root')!).render(<Harness />)
