// ─── LatencyZero v2.0 — Core Data Types (Agent Copy) ──────────────────
// These types mirror src/lib/types.ts so the agent can produce
// correctly-typed payloads without importing from the Next.js project.

// ─── Data Source ───────────────────────────────────────────────────────
export type DataSource = 'measured' | 'imported' | 'estimated' | 'simulated' | 'unavailable'

export interface DataSourceInfo {
  source: DataSource
  collector: string | null
  confidence: number          // 0.0 – 1.0
  reason?: string
  lastUpdated?: number        // timestamp ms
}

// ─── Root Cause Analysis ──────────────────────────────────────────────
export type RCALevel = 'confirmed' | 'likely' | 'possible' | 'unknown'
export type RCADomain =
  | 'kernel' | 'gpu' | 'frame_pacing' | 'network' | 'controller'
  | 'display' | 'windows_config' | 'processes'

export interface RootCauseFinding {
  id: string
  title: string
  domain: RCADomain
  severity: 'info' | 'warning' | 'high' | 'critical'
  level: RCALevel
  confidence: number          // 0–1.0
  dataSource: DataSource
  observed: Record<string, number | string>
  sources: string[]
  recommendation: string
  risk: 'none' | 'low' | 'medium' | 'high'
  timestamp?: number
}

// ─── System Scanner Data ──────────────────────────────────────────────
export interface SystemScanData {
  module: 'windows_system'
  source: DataSourceInfo
  cpuName: string | null
  gpuName: string | null
  ramTotal: number | null
  ramSpeed: number | null
  windowsVersion: string | null
  windowsBuild: string | null
  motherboard: string | null
  biosVersion: string | null
  powerPlan: string | null
  secureBoot: boolean | null
  tpm: boolean | null
  vbsMemoryIntegrity: boolean | null
  findings: RootCauseFinding[]
}

// ─── GPU Scanner Data ─────────────────────────────────────────────────
export interface GPUScanData {
  module: 'nvidia_gpu'
  source: DataSourceInfo
  gpuName: string | null
  driverVersion: string | null
  gpuUsage: number | null
  vramUsage: number | null
  vramTotal: number | null
  gpuClock: number | null
  memClock: number | null
  temperature: number | null
  temperatureHotspot: number | null
  powerDraw: number | null
  powerLimit: number | null
  fanSpeed: number | null
  throttleReason: string | null
  pcieBusInfo: string | null
  findings: RootCauseFinding[]
}

// ─── Network Scanner Data ─────────────────────────────────────────────
export interface NetworkScanData {
  module: 'network'
  source: DataSourceInfo
  adapterName: string | null
  adapterType: 'ethernet' | 'wifi' | 'unknown' | null
  linkSpeed: number | null
  pingGateway: number | null
  ping1_1_1_1: number | null
  ping8_8_8_8: number | null
  avgPing: number | null
  jitter: number | null
  packetLoss: number | null
  dnsTiming: number | null
  findings: RootCauseFinding[]
}

// ─── Process Scanner Data ─────────────────────────────────────────────
export interface ProcessScanData {
  module: 'processes'
  source: DataSourceInfo
  processes: Array<{
    name: string
    pid: number
    cpuUsage: number
    ramUsage: number
    category: 'overlay' | 'launcher' | 'browser' | 'sync' | 'antivirus' | 'rgb' | 'recording' | 'monitoring' | 'system' | 'game' | 'other'
    impact: 'none' | 'low' | 'medium' | 'high'
    note?: string
  }>
  findings: RootCauseFinding[]
}

// ─── Display Scanner Data ─────────────────────────────────────────────
export interface DisplayScanData {
  module: 'display'
  source: DataSourceInfo
  monitorName: string | null
  activeResolution: string | null
  activeRefreshHz: number | null
  maxRefreshHz: number | null
  hdrEnabled: boolean | null
  vrrEnabled: boolean | null
  vrrType: 'g-sync' | 'freesync' | 'unknown' | null
  scaling: string | null
  multiMonitor: boolean | null
  findings: RootCauseFinding[]
}

// ─── Controller Scanner Data ──────────────────────────────────────────
export interface ControllerScanData {
  module: 'controller'
  source: DataSourceInfo
  controllerName: string | null
  transport: 'usb' | 'bluetooth' | 'wireless' | 'unknown' | null
  api: 'xinput' | 'gameinput' | 'hid' | 'unknown' | null
  avgPollingMs: number | null
  p95PollingMs: number | null
  inputJitterMs: number | null
  estimatedDropRate: number | null
  findings: RootCauseFinding[]
}

// ─── Union type for any scan result ───────────────────────────────────
export type AnyScanData =
  | SystemScanData
  | GPUScanData
  | NetworkScanData
  | ProcessScanData
  | DisplayScanData
  | ControllerScanData

// ─── Helpers ──────────────────────────────────────────────────────────

export function measuredSource(collector: string, confidence: number): DataSourceInfo {
  return {
    source: 'measured',
    collector,
    confidence,
    lastUpdated: Date.now(),
  }
}

export function unavailableSource(reason: string): DataSourceInfo {
  return {
    source: 'unavailable',
    collector: null,
    confidence: 0,
    reason,
  }
}

/** Short UUID-like id generator for findings */
export function findingId(): string {
  return `f-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}