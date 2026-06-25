// ─── Electron IPC Type Definitions ──────────────────────────────────────

/** Progress event sent during a scan (one per collector completing) */
export interface ScanProgressEvent {
  collector: string
  module: string
  status: 'collecting' | 'posting' | 'done' | 'error'
  timestamp: number
  error?: string
}

/** Event sent when the full scan is complete */
export interface ScanCompleteEvent {
  totalCollectors: number
  completedCollectors: number
  durationMs: number
  timestamp: number
  errors: string[]
}

/** Result from a system-check IPC call */
export interface SystemCheckResult {
  powershell: { available: boolean; version: string | null }
  nvidiaSmi: { available: boolean; version: string | null }
  ping: { available: boolean }
  admin: { isElevated: boolean }
}

/** App info returned by get-app-info */
export interface AppInfo {
  version: string
  isElectron: boolean
  isPackaged: boolean
  platform: string
  arch: string
}

// ─── IPC channel names ──────────────────────────────────────────────────

export const IPC_CHANNELS = {
  START_SCAN: 'start-scan',
  SYSTEM_CHECK: 'system-check',
  GET_APP_INFO: 'get-app-info',
  OPEN_EXTERNAL: 'open-external',
  SCAN_PROGRESS: 'scan-progress',
  SCAN_COMPLETE: 'scan-complete',
} as const

// ─── Collector endpoint mapping ─────────────────────────────────────────
// Maps collector module names to their API endpoint paths

export const COLLECTOR_ENDPOINTS: Record<string, string> = {
  windows_system: 'system',
  nvidia_gpu: 'gpu',
  network: 'network',
  processes: 'processes',
  display: 'display',
  controller: 'controller',
}