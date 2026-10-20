// Read-only RAM KV export. Values/credentials never go to logs or the repository.
// Windows DPAPI protects the output for the current Windows user. It is not
// an independent credential vault or a provider point-in-time snapshot.
import { execFile, spawn } from 'node:child_process'
import { promisify } from 'node:util'
import { isAbsolute, resolve, sep } from 'node:path'
import { createHash } from 'node:crypto'
import assert from 'node:assert/strict'

const run = promisify(execFile)
const output = process.env.RAMENG_KV_BACKUP_OUTPUT || ''
const namespace = '7676674ec22a440d8d946a8fe393775b'
const account = '45834d92b0992b24644537fc864542e4'
const base = ['worker/node_modules/wrangler/bin/wrangler.js', 'kv', 'key']
const flags = ['--namespace-id', namespace, '--remote', '--profile', 'rameng', '--config', 'worker/wrangler.toml']
try {
  if (!isAbsolute(output) || !output.endsWith('.dpapi') || resolve(output).toLowerCase().startsWith((resolve('.') + sep).toLowerCase())) throw Error('Use a private absolute .dpapi output outside the repository')
  const listing = await run(process.execPath, [...base, 'list', ...flags], { maxBuffer: 4 * 1024 * 1024 })
  const keys = JSON.parse(listing.stdout)
  if (!Array.isArray(keys)) throw Error('Invalid KV inventory')
  const records = [], missing = []
  let index = 0
  await Promise.all(Array.from({ length: 3 }, async () => {
    while (index < keys.length) {
      const key = keys[index++]
      if (key.expiration && key.expiration <= Date.now() / 1000) continue
      try {
        const value = await run(process.execPath, [...base, 'get', key.name, ...flags], { encoding: 'buffer', maxBuffer: 30 * 1024 * 1024 })
        records.push({ ...key, valueBase64: value.stdout.toString('base64') })
      } catch { missing.push(key.name) }
    }
  }))
  const setting=records.find(row => row.name==='rameng:admin-config:v1')
  if (!setting || JSON.parse(Buffer.from(setting.valueBase64,'base64').toString('utf8')).supabaseUrl !== 'https://qvunspguudkhwgbjvvuf.supabase.co') throw Error('RAM database target mismatch')
  records.sort((a, b) => a.name.localeCompare(b.name))
  const payload = Buffer.from(JSON.stringify({ account, namespace, capturedAt: new Date().toISOString(), records, missing, atomic: false }))
  const restored = new Map(JSON.parse(payload.toString('utf8')).records.map(row => [row.name, Buffer.from(row.valueBase64, 'base64')]))
  for (const row of records) assert.ok(restored.get(row.name).equals(Buffer.from(row.valueBase64, 'base64')))
  const hash = createHash('sha256').update(payload).digest('hex')
  const protect = `$ErrorActionPreference='Stop'; Add-Type -AssemblyName System.Security; $backupBytes=[Convert]::FromBase64String([Console]::In.ReadToEnd()); $cipher=[Security.Cryptography.ProtectedData]::Protect($backupBytes,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser); [IO.File]::WriteAllBytes($env:RAMENG_KV_BACKUP_OUTPUT,$cipher); $roundtrip=[Security.Cryptography.ProtectedData]::Unprotect($cipher,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser); $sha=[Security.Cryptography.SHA256]::Create(); if ([Convert]::ToBase64String($sha.ComputeHash($backupBytes)) -ne [Convert]::ToBase64String($sha.ComputeHash($roundtrip))) { throw 'Backup roundtrip failed' }; Write-Output 'DPAPI verification passed'`
  await new Promise((resolvePromise, reject) => {
    const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', protect], { env: { ...process.env, RAMENG_KV_BACKUP_OUTPUT: output }, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] })
    child.stdout.resume(); child.stderr.resume()
    child.on('error', reject); child.on('close', code => code === 0 ? resolvePromise() : reject(Error('Encryption failed')))
    child.stdin.end(payload.toString('base64'))
  })
  console.log(JSON.stringify({ account, namespace, keysListed: keys.length, recordsEncrypted: records.length, unavailableDuringCapture: missing.length, logicalRestore: true, dpapiRoundtrip: true, sha256: hash, atomicSnapshot: false }))
  if (missing.length) process.exitCode = 2
} catch { console.error('RAM KV private backup failed; private command output suppressed'); process.exitCode = 1 }
