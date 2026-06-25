// ─── LatencyZero Windows Agent Configuration ──────────────────────────

export const config = {
  /** Port this agent HTTP server listens on */
  agentPort: 3010,

  /** Base URL of the LatencyZero Next.js dashboard */
  dashboardUrl: 'http://localhost:3000',

  /** How often to send heartbeat pings to the dashboard */
  heartbeatIntervalMs: 5000,

  /** Maximum time (ms) to wait for all collectors to finish */
  collectionTimeoutMs: 60_000,

  /** Per-command timeout for PowerShell/nvidia-smi executions */
  commandTimeoutMs: 30_000,

  /** Agent version reported in heartbeats */
  version: '1.0.0',

  /** Dashboard API endpoints (relative to dashboardUrl) */
  endpoints: {
    status: '/api/scan/status',
    system: '/api/scan/system',
    gpu: '/api/scan/gpu',
    network: '/api/scan/network',
    processes: '/api/scan/processes',
    display: '/api/scan/display',
    controller: '/api/scan/controller',
  },
} as const