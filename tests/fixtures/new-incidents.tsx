import {createRoot} from 'react-dom/client'
import {useState,Suspense} from 'react'
import {useUnreadMail} from '../../src/lib/useUnreadMail'
import {integrationsApi} from '../../src/lib/api'
import {configureBackend,getBackend,loadOrganizationWorkspace} from '../../src/lib/backend'
import {setErrorReportingContext,reportClientError,flushPendingReports} from '../../src/lib/errorReporting'
import {offerAssetRecovery,recoverableLazy} from '../../src/lib/assetRecovery'
configureBackend({supabaseUrl:'https://synthetic.supabase.co',supabaseAnonKey:'public',apiBase:'',configured:true,googleClientId:''})
getBackend()!.auth.getSession = async () => ({data:{session:{access_token:'synthetic'}},error:null}) as any
setErrorReportingContext('synthetic-org','projects','synthetic-user')
window.addEventListener('rameng-backend-error',event=>void reportClientError('database-or-storage',Object.assign(new Error((event as CustomEvent).detail.message),{diagnostic:(event as CustomEvent).detail.diagnostic})))
const missing = '/missing-chunk-2026.js'
const MissingEditor = recoverableLazy(() => import(/* @vite-ignore */ missing))
function Unread(){const state=useUnreadMail('synthetic-user',true);return <p data-testid="unread-state">{state.unreadCount ?? 'unknown'}:{String(state.unreadStale)}</p>}
function Fixture(){const [result,setResult]=useState('ready');const [editor,setEditor]=useState(false);const [poll,setPoll]=useState(false);return <><input aria-label="Unsaved draft"/><button onClick={()=>void Promise.allSettled([integrationsApi.status(),integrationsApi.unreadMail(),loadOrganizationWorkspace('synthetic-user')]).then(()=>setResult('failed'))}>Outage</button><button onClick={()=>void integrationsApi.unreadMail().then(value=>setResult(String(value.unreadCount))).catch(()=>setResult('failed'))}>Unread</button><button onClick={()=>void flushPendingReports()}>Flush</button><button onClick={()=>void offerAssetRecovery(new TypeError('Failed to fetch dynamically imported module'))}>Missing chunk</button><button onClick={()=>setEditor(true)}>Load missing editor</button><button onClick={()=>setPoll(true)}>Start polling</button>{poll && <Unread/>}{editor && <Suspense fallback="Loading"><MissingEditor/></Suspense>}<output>{result}</output></>}
createRoot(document.getElementById('root')!).render(<Fixture/> )
