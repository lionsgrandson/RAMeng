import {test} from 'node:test'
import assert from 'node:assert/strict'
import worker from '../worker/src/index.js'
import {gmailUnreadResponse} from '../worker/src/upstream.js'
import {enqueueApplicationError,safeDiagnostic} from '../worker/src/applicationErrors.js'

function fixture(t, {googleStatus=200, googleBody={messagesUnread:7}, tokenError, authError, oauthError}={}) {
  const config={supabaseUrl:'https://synthetic.supabase.co',supabaseAnonKey:'public',googleClientId:'client',googleClientSecret:'secret'}
  const values=new Map([['rameng:admin-config:v1',config],['rameng:google-tokens:v2:owner',{access_token:'private',refresh_token:'private-refresh',expires_at:oauthError?1:Date.now()+3600000}]])
  let writes=0
  const env={WORKER_VERSION:{id:'test-deployment'},CONFIG:{get:async key=>{if(tokenError&&key.includes('tokens'))throw tokenError;return values.get(key)||null},put:async()=>{writes++}}}
  t.mock.method(console,'log',()=>{});t.mock.method(console,'error',()=>{})
  t.mock.method(globalThis,'fetch',async url=>{
    if(String(url).includes('/auth/v1/user')) {if(authError)throw authError;return Response.json({id:'owner'})}
    if(String(url).includes('/memberships')) return Response.json([{role:'viewer'}])
    if(String(url).includes('oauth2'))return oauthError ? Response.json({error:oauthError},{status:400}) : Response.json({access_token:'refreshed',expires_in:3600})
    if(String(url).includes('/labels/INBOX'))return Response.json(googleBody,{status:googleStatus})
    throw Error('Unexpected upstream')
  })
  return {request:()=>worker.fetch(new Request('https://app.test/api/google/gmail/unread',{headers:{authorization:'Bearer fake','x-request-id':'browser-correlation-1234'}}),env),writes:()=>writes}
}
for(const [status,body,expected,category] of [[500,{error:{}},503,'provider_unavailable'],[429,{error:{}},429,'provider_rate_limit'],[403,{error:{errors:[{reason:'userRateLimitExceeded'}]}},429,'provider_rate_limit'],[401,{error:{}},409,'reconnect_required'],[200,{},502,'provider_response']])test(`unread provider ${status} is classified ${category}`,async t=>{
 const f=fixture(t,{googleStatus:status,googleBody:body});const response=await f.request();const result=await response.json()
 assert.equal(response.status,expected);assert.equal(result.category,category);assert.equal(result.dependency,'gmail')
 assert.equal(response.headers.get('x-request-id'),'browser-correlation-1234');assert.equal(result.requestId,'browser-correlation-1234');assert.equal(response.headers.get('x-worker-version'),'test-deployment')
 assert.doesNotMatch(JSON.stringify(result),/private|access_token/);assert.equal(f.writes(),status === 401 ? 1 : 0)
})
test('KV exhaustion keeps 503 category and writes no reports',async t=>{const f=fixture(t,{tokenError:Error('KV daily quota exceeded')});const r=await f.request();assert.equal(r.status,503);assert.equal((await r.json()).category,'quota_exceeded');assert.equal(f.writes(),0)})
for(const cause of [new TypeError('Failed to fetch'),new DOMException('deadline','TimeoutError')])test(`Supabase ${cause.name} stays temporary`,async t=>{const f=fixture(t,{authError:cause});const r=await f.request();assert.equal(r.status,503);const body=await r.json();assert.equal(body.dependency,'supabase_auth');assert.equal(body.category,cause.name==='TimeoutError'?'timeout':'upstream_network')})
test('OAuth invalid grant is classified without accepting stale credentials',async t=>{const f=fixture(t,{oauthError:'invalid_grant'});const r=await f.request();assert.equal(r.status,409);assert.equal((await r.json()).category,'reconnect_required');assert.equal(f.writes(),0)})
test('Unread does not invent zero from invalid JSON and recovers on valid response',async()=>{await assert.rejects(gmailUnreadResponse(new Response('<html>error</html>',{status:500})),{category:'provider_response'});assert.equal(await gmailUnreadResponse(Response.json({messagesUnread:9})),9);assert.equal(await gmailUnreadResponse(Response.json({messagesUnread:0})),0)})

test('notification batches accumulate evidence without resending or writing on identical replay',async()=>{
 const data=new Map();let writes=0
 const env={CONFIG:{get:async key=>data.get(key),put:async(key,value)=>{writes++;data.set(key,JSON.parse(value))}}}
 const input={orgId:'org',userId:'owner',operation:'connectivity',code:'CONNECTIVITY',message:'network',page:'projects',count:3,batchId:'batch-one-1234567890',endpoints:['/api/google/gmail/unread'],events:[{requestId:'request-one',authorization:'Bearer private',body:'private customer'}]}
 const first=await enqueueApplicationError(env,input,[]);assert.equal(writes,2)
 const duplicate=await enqueueApplicationError(env,input,[]);assert.equal(duplicate.duplicate,true);assert.equal(writes,2)
 const next=await enqueueApplicationError(env,{...input,count:2,batchId:'batch-two-1234567890',endpoints:['/api/integrations/status']},[])
 assert.equal(writes,3);assert.equal(next.duplicate,true);assert.equal(next.report.count,5);assert.equal(next.report.endpoints.length,2)
 assert.doesNotMatch(JSON.stringify(next.report),/private|authorization|customer/);assert.equal(next.key,first.key)
 assert.doesNotMatch(safeDiagnostic('private@example.test Bearer private-token'),/private@example|private-token/)
})

test('notification daily cap retains serious error evidence without sending it',async()=>{
 const data=new Map();const env={CONFIG:{get:async key=>key.startsWith('application-error-rate:')?20:data.get(key),put:async(key,value)=>data.set(key,JSON.parse(value))}}
 const queued=await enqueueApplicationError(env,{orgId:'org',userId:'owner',operation:'critical',code:'HTTP_500',message:'failure',count:4},[])
 assert.equal(queued.report.state,'rate-limited');assert.equal(data.get(queued.key).count,4)
})

test('missing frontend chunks return non-cacheable 404 instead of SPA HTML success',async()=>{
 const response=await worker.fetch(new Request('https://app.test/assets/removed.js'),{ASSETS:{fetch:async()=>new Response('<html>app</html>',{headers:{'content-type':'text/html','cache-control':'immutable'}})}})
 assert.equal(response.status,404);assert.equal(response.headers.get('cache-control'),'no-store');assert.doesNotMatch(await response.text(),/<html>/)
})
