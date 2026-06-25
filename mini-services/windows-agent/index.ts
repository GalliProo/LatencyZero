// ─── LatencyZero Windows Agent — Main Entry ───────────────────────────
// HTTP server on port 3010, heartbeat to dashboard, collector orchestration.
import { serve } from 'bun'
import { config } from './config'
import type { AnyScanData } from './types'
import { collectSystem } from './collectors/system'
import { collectGpu } from './collectors/gpu'
import { collectNetwork } from './collectors/network'
import { collectProcesses } from './collectors/processes'
import { collectDisplay } from './collectors/display'
import { collectController } from './collectors/controller'

// ── State ──────────────────────────────────────────────────────────────
const startTime = Date.now()
let lastCollectionTime: number | null = null
let lastCollectionResults: Record<string, AnyScanData> = {}
let heartbeatTimer: ReturnType<typeof setInterval> | null = null

// ── Collector Map ──────────────────────────────────────────────────────
type CollectorFn = () => Promise<AnyScanData>

const COLLECTORS: Record<string, { fn: CollectorFn; endpoint: string }> = {
  system:     { fn: collectSystem,     endpoint: config.endpoints.system },
  gpu:        { fn: collectGpu,        endpoint: config.endpoints.gpu },
  network:    { fn: collectNetwork,    endpoint: config.endpoints.network },
  processes:  { fn: collectProcesses,  endpoint: config.endpoints.processes },
  display:    { fn: collectDisplay,    endpoint: config.endpoints.display },
  controller: { fn: collectController, endpoint: config.endpoints.controller },
}

// ── Heartbeat ──────────────────────────────────────────────────────────
async function sendHeartbeat(): Promise<void> {
  const uptime = Math.round((Date.now() - startTime) / 1000)
  try {
    const resp = await fetch(`${config.dashboardUrl}${config.endpoints.status}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'heartbeat',
        version: config.version,
        uptime,
      }),
    })
    if (resp.ok) {
      console.log(`[heartbeat] ack — uptime ${uptime}s`)
    } else {
      console.warn(`[heartbeat] dashboard returned ${resp.status}`)
    }
  } catch (err) {
    console.warn(`[heartbeat] failed: ${(err as Error).message}`)
  }
}

function startHeartbeat(): void {
  // Send immediately on start
  sendHeartbeat()
  heartbeatTimer = setInterval(sendHeartbeat, config.heartbeatIntervalMs)
}

// ── Push data to dashboard ─────────────────────────────────────────────
async function pushToDashboard(
  moduleName: string,
  endpoint: string,
  data: AnyScanData,
): Promise<{ ok: boolean; status?: number; error?: string }> {
  try {
    const resp = await fetch(`${config.dashboardUrl}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    if (resp.ok) {
      console.log(`[push] ${moduleName} → ${resp.status}`)
      return { ok: true }
    } else {
      const text = await resp.text().catch(() => '')
      return { ok: false, status: resp.status, error: text }
    }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}

// ── Run collectors (all or specific) ───────────────────────────────────
async function runCollection(
  modules?: string[],
  pushToDash = true,
): Promise<Record<string, AnyScanData>> {
  const targets = modules
    ? modules.filter((m) => COLLECTORS[m])
    : Object.keys(COLLECTORS)

  console.log(`[collect] starting ${targets.length} collector(s): ${targets.join(', ')}`)

  // Run all target collectors in parallel
  const entries = await Promise.all(
    targets.map(async (name) => {
      const { fn, endpoint } = COLLECTORS[name]
      try {
        const data = await fn()
        if (pushToDash) {
          await pushToDashboard(name, endpoint, data)
        }
        return [name, data] as const
      } catch (err) {
        console.error(`[collect] ${name} failed: ${(err as Error).message}`)
        return [name, null] as const
      }
    }),
  )

  const results: Record<string, AnyScanData> = {}
  for (const [name, data] of entries) {
    if (data) results[name] = data
  }

  lastCollectionTime = Date.now()
  lastCollectionResults = { ...lastCollectionResults, ...results }
  return results
}

// ── HTML Status Page ───────────────────────────────────────────────────
const STATUS_HTML = (state: { connected: boolean; lastCollection: string | null; results: Record<string, AnyScanData> }) => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>LatencyZero Windows Agent</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Segoe UI', system-ui, sans-serif; background: #0a0a0a; color: #e5e5e5; padding: 2rem; }
    h1 { font-size: 1.5rem; margin-bottom: 0.5rem; }
    .badge { display: inline-block; padding: 2px 10px; border-radius: 9999px; font-size: 0.75rem; font-weight: 600; }
    .badge-ok { background: #14532d; color: #4ade80; }
    .badge-off { background: #7f1d1d; color: #f87171; }
    .info { color: #a3a3a3; font-size: 0.875rem; margin-top: 0.25rem; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 1rem; margin-top: 1.5rem; }
    .card { background: #171717; border: 1px solid #262626; border-radius: 0.75rem; padding: 1rem; }
    .card h3 { font-size: 0.875rem; color: #a3a3a3; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.5rem; }
    .card pre { font-size: 0.75rem; color: #737373; white-space: pre-wrap; word-break: break-all; max-height: 200px; overflow-y: auto; }
    code { font-family: 'Cascadia Code', 'Fira Code', monospace; }
    .endpoints { margin-top: 1.5rem; }
    .endpoints h2 { font-size: 1rem; margin-bottom: 0.5rem; }
    table { width: 100%; font-size: 0.8rem; }
    td, th { padding: 0.375rem 0.75rem; text-align: left; border-bottom: 1px solid #262626; }
    th { color: #737373; }
  </style>
</head>
<body>
  <h1>🖥️ LatencyZero Windows Agent <span class="badge ${state.connected ? 'badge-ok' : 'badge-off'}">${state.connected ? 'CONNECTED' : 'OFFLINE'}</span></h1>
  <p class="info">v${config.version} • Port ${config.agentPort} • Dashboard: ${config.dashboardUrl}</p>
  <p class="info">Uptime: ${Math.round((Date.now() - startTime) / 1000)}s ${state.lastCollection ? '• Last scan: ' + new Date(state.lastCollection).toLocaleTimeString() : '• No scans yet'}</p>

  <div class="grid">
    ${Object.entries(state.results).map(([mod, data]) => `
    <div class="card">
      <h3>${mod}</h3>
      <pre><code>${JSON.stringify(data, null, 2)}</code></pre>
    </div>
    `).join('')}
  </div>

  <div class="endpoints">
    <h2>API Endpoints</h2>
    <table>
      <tr><th>Method</th><th>Path</th><th>Description</th></tr>
      <tr><td>GET</td><td>/</td><td>This status page</td></tr>
      <tr><td>GET</td><td>/status</td><td>Agent status JSON</td></tr>
      <tr><td>POST</td><td>/collect</td><td>Collect all modules, push to dashboard</td></tr>
      <tr><td>GET</td><td>/collect</td><td>Collect all modules, return without pushing</td></tr>
      ${Object.keys(COLLECTORS).map((m) => `
      <tr><td>POST</td><td>/collect/${m}</td><td>Collect & push ${m} only</td></tr>
      `).join('')}
    </table>
  </div>
</body>
</html>`

// ── HTTP Server ────────────────────────────────────────────────────────
const server = serve({
  port: config.agentPort,
  hostname: '0.0.0.0',
  fetch(req) {
    const url = new URL(req.url)
    const path = url.pathname
    const method = req.method

    // GET / — Status page
    if (method === 'GET' && path === '/') {
      const html = STATUS_HTML({
        connected: true,
        lastCollection: lastCollectionTime ? new Date(lastCollectionTime).toISOString() : null,
        results: lastCollectionResults,
      })
      return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
    }

    // GET /status — Agent status JSON
    if (method === 'GET' && path === '/status') {
      return Response.json({
        status: 'running',
        version: config.version,
        port: config.agentPort,
        dashboardUrl: config.dashboardUrl,
        uptime: Math.round((Date.now() - startTime) / 1000),
        lastCollection: lastCollectionTime,
        lastCollectionModules: Object.keys(lastCollectionResults),
      })
    }

    // POST /collect — Collect all, push to dashboard
    if (method === 'POST' && path === '/collect') {
      return handleCollect(undefined, true)
    }

    // GET /collect — Collect all, return without pushing
    if (method === 'GET' && path === '/collect') {
      return handleCollect(undefined, false)
    }

    // POST /collect/:module — Collect & push single module
    const moduleMatch = path.match(/^\/collect\/([a-z]+)$/)
    if (method === 'POST' && moduleMatch) {
      const moduleName = moduleMatch[1]
      if (!COLLECTORS[moduleName]) {
        return Response.json({ error: `Unknown module: ${moduleName}. Available: ${Object.keys(COLLECTORS).join(', ')}` }, { status: 400 })
      }
      return handleCollect([moduleName], true)
    }

    // 404
    return Response.json({ error: 'Not found' }, { status: 404 })
  },
})

async function handleCollect(
  modules: string[] | undefined,
  pushToDash: boolean,
): Promise<Response> {
  try {
    const results = await Promise.race([
      runCollection(modules, pushToDash),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Collection timed out')), config.collectionTimeoutMs),
      ),
    ])
    return Response.json({ status: pushToDash ? 'collected_and_pushed' : 'collected', results })
  } catch (err) {
    return Response.json(
      { error: `Collection failed: ${(err as Error).message}` },
      { status: 500 },
    )
  }
}

// ── Startup ────────────────────────────────────────────────────────────
console.log(`[agent] LatencyZero Windows Agent v${config.version}`)
console.log(`[agent] Listening on http://0.0.0.0:${config.agentPort}`)
console.log(`[agent] Dashboard: ${config.dashboardUrl}`)
console.log(`[agent] Available collectors: ${Object.keys(COLLECTORS).join(', ')}`)
startHeartbeat()

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n[agent] Shutting down...')
  if (heartbeatTimer) clearInterval(heartbeatTimer)

  // Send disconnect to dashboard
  fetch(`${config.dashboardUrl}${config.endpoints.status}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'disconnect' }),
  }).catch(() => {})

  server.stop()
  process.exit(0)
})

process.on('SIGTERM', () => {
  if (heartbeatTimer) clearInterval(heartbeatTimer)
  server.stop()
  process.exit(0)
})

export { server }