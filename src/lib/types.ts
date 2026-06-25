// ─── LatencyZero v2.0 — Core Data Types ───────────────────────────────
// Every metric must declare its source. No metric is trusted without provenance.

// ─── Data Source ───────────────────────────────────────────────────────
export type DataSource = 'measured' | 'imported' | 'estimated' | 'simulated' | 'unavailable'

export interface DataSourceInfo {
  source: DataSource
  collector: string | null       // e.g. 'nvidia-smi', 'LatencyMon TXT', 'WMI/PowerShell'
  confidence: number              // 0.0 – 1.0
  reason?: string                 // e.g. 'Absolute measurement requires external hardware probe'
  lastUpdated?: number            // timestamp ms
}

// ─── Typed Metric ──────────────────────────────────────────────────────
export interface Metric<T = number> {
  metric: string
  value: T | null
  unit: string
  source: DataSourceInfo
}

// ─── FPS Target Mode ───────────────────────────────────────────────────
export type FPSTargetMode = 'auto' | 'manual' | 'baseline' | 'uncapped'

export interface FPSTargetConfig {
  mode: FPSTargetMode
  // Auto mode fields
  displayRefreshHz?: number
  recommendedFpsCap?: number
  // Manual mode fields
  manualFps?: number
  // Baseline fields (measured during session)
  measuredAvgFps?: number
  measuredOnePercentLow?: number
  measuredPointOnePercentLow?: number
  frameTimeP99Ms?: number
  frameTimeP95Ms?: number
  frameTimeAvgMs?: number
  // Uncapped — no target, judge stability only
}

export interface FPSTargetResult {
  config: FPSTargetConfig
  targetFps: number | null   // null = no fixed target (baseline/uncapped)
  frameBudgetMs: number | null  // null = no budget
  judgement: string
  dataSource: 'measured' | 'estimated' | 'simulated'
}

// ─── Score System ──────────────────────────────────────────────────────
export type ScoreCategory = 
  | 'kernel_latency'
  | 'frame_pacing'
  | 'gpu_stability'
  | 'network_quality'
  | 'controller_input'
  | 'display_config'
  | 'windows_config'
  | 'background_processes'

export interface CategoryScore {
  category: ScoreCategory
  label: string
  score: number               // 0–100, -1 = insufficient data
  source: DataSource
  confidence: number
  issues: string[]
  finding: string             // human-readable summary
}

export interface OverallScore {
  score: number               // 0–100
  confidence: number          // 0–1.0
  categories: CategoryScore[]
  simulatedRatio: number      // 0–1.0, fraction of metrics that are simulated/unavailable
  mode: 'demo' | 'real'      // if >30% simulated → demo
  label: string               // e.g. 'DEMO / Insufficient Real Data' or 'COMPETITIVE READY'
  grade: string               // S/A/B/C/F
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
  confidence: number           // 0–1.0
  dataSource: DataSource
  observed: Record<string, number | string>
  correlation?: {
    metricA: string
    metricB: string
    timeDeltaMs: number
    description: string
  }
  sources: string[]            // e.g. ['ETW', 'PresentMon', 'NetworkScanner']
  recommendation: string
  risk: 'none' | 'low' | 'medium' | 'high'
  timestamp?: number
}

// ─── Temporal Correlation ─────────────────────────────────────────────
export interface TemporalCorrelation {
  timestamp: number
  metricA: { name: string; value: number; unit: string }
  metricB: { name: string; value: number; unit: string }
  timeDeltaMs: number
  confidence: number
  explanation: string
}

// ─── Imported Data (LatencyMon) ───────────────────────────────────────
export interface LatencyMonData {
  source: 'latencymon_txt'
  conclusion: string
  testDuration: string
  osBuild: string
  cpu: string
  biosVersion: string
  highestInterruptToProcessLatency: number
  highestInterruptToDpcLatency: number
  highestIsrExecutionTime: number
  highestIsrDriver: string
  highestDpcExecutionTime: number
  highestDpcDriver: string
  totalHardPagefaults: number
  processWithHighestPagefaults: string
  perCpuDpcIsr?: Record<string, { dpc: number; isr: number }>
  drivers: Array<{
    module: string
    dpcCount: number
    dpcTime: number
    isrCount: number
    isrTime: number
    severity: 'good' | 'warning' | 'critical'
  }>
  findings: RootCauseFinding[]
}

// ─── Imported Data (PresentMon) ───────────────────────────────────────
export interface PresentMonData {
  source: 'presentmon_csv'
  totalFrames: number
  avgFps: number
  avgFrameTime: number
  frameTimeP95: number
  frameTimeP99: number
  onePercentLow: number        // FPS
  pointOnePercentLow: number   // FPS
  droppedFrames: number | null
  gpuBusy: number | null
  displayLatency: number | null
  cpuBusy: number | null
  cpuWait: number | null
  gpuBusyWait: number | null
  frameTimeData: Array<{ time: string; frameTime: number }>
  findings: RootCauseFinding[]
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

// ─── Complete Session ─────────────────────────────────────────────────
export interface DiagnosticSession {
  id: string
  startTime: number
  endTime: number | null
  mode: 'demo' | 'real'
  gameProfile: string
  fpsTarget: FPSTargetConfig
  
  // Real data collectors
  systemInfo: SystemScanData | null
  gpuInfo: GPUScanData | null
  networkInfo: NetworkScanData | null
  processInfo: ProcessScanData | null
  displayInfo: DisplayScanData | null
  controllerInfo: ControllerScanData | null
  
  // Imported data
  latencyMonData: LatencyMonData | null
  presentMonData: PresentMonData | null
  
  // Live metrics (from real agent or simulated)
  liveMetrics: LiveMetrics | null
  
  // Analysis
  overallScore: OverallScore
  rootCauses: RootCauseFinding[]
  temporalCorrelations: TemporalCorrelation[]
}

// ─── Live Metrics (what the agent streams or demo simulates) ───────────
export interface LiveMetrics {
  source: DataSourceInfo
  dpc: {
    current: Metric<number>
    max: Metric<number>
    avg: Metric<number>
  }
  isr: {
    current: Metric<number>
    max: Metric<number>
    avg: Metric<number>
  }
  frameTime: {
    current: Metric<number>
    avg: Metric<number>
    min1pct: Metric<number>
    min01pct: Metric<number>
    p95: Metric<number>
    p99: Metric<number>
  }
  fps: {
    current: Metric<number>
    avg: Metric<number>
    min1pct: Metric<number>
    min01pct: Metric<number>
  }
  hardware: {
    cpu: { usage: Metric<number>; temp: Metric<number>; clock: Metric<number> }
    gpu: { usage: Metric<number>; temp: Metric<number>; clock: Metric<number>; vram: Metric<number> }
    ram: { usage: Metric<number>; available: Metric<number>; percent: Metric<number> }
  }
  network: {
    ping: Metric<number>
    jitter: Metric<number>
    packetLoss: Metric<number>
    download: Metric<number>
    upload: Metric<number>
  }
}

// ─── DPC/ISR Severity Classifications ─────────────────────────────────
export const DPC_THRESHOLDS = {
  good: 100,      // µs
  lightWarning: 250,
  warning: 500,
  high: 1000,
  // critical: > 1000
} as const

export const ISR_THRESHOLDS = {
  good: 25,       // µs
  warning: 100,
  high: 500,
  // critical: > 500
} as const

export const GPU_TEMP_THRESHOLDS = {
  good: 70,       // °C
  lightWarning: 80,
  warning: 85,
  high: 90,
  hotspotCritical: 95,
} as const

// ─── Helper: create a simulated DataSourceInfo ────────────────────────
export function simulatedSource(collector?: string): DataSourceInfo {
  return {
    source: 'simulated',
    collector: collector ?? 'demo_generator',
    confidence: 0,
    lastUpdated: Date.now(),
  }
}

// ─── Helper: create a measured DataSourceInfo ─────────────────────────
export function measuredSource(collector: string, confidence: number): DataSourceInfo {
  return {
    source: 'measured',
    collector,
    confidence,
    lastUpdated: Date.now(),
  }
}

// ─── Helper: create an unavailable DataSourceInfo ─────────────────────
export function unavailableSource(reason: string): DataSourceInfo {
  return {
    source: 'unavailable',
    collector: null,
    confidence: 0,
    reason,
  }
}