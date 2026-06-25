// ─── LatencyZero — Preload Script ───────────────────────────────────────
// Minimal IPC bridge exposing a typed API to the renderer via contextBridge.

import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron'
import type { ScanProgressEvent, ScanCompleteEvent, SystemCheckResult, AppInfo } from './types'
import { IPC_CHANNELS } from './types'

// ─── Helper: wrap removeEventListener for clean teardown ────────────────
function makeSubscription<T>(channel: string) {
  return (callback: (data: T) => void): (() => void) => {
    const handler = (_event: IpcRendererEvent, data: T): void => {
      callback(data)
    }
    ipcRenderer.on(channel, handler)
    // Return an unsubscribe function
    return () => {
      ipcRenderer.removeListener(channel, handler)
    }
  }
}

contextBridge.exposeInMainWorld('electronAPI', {
  // ─── Properties ──────────────────────────────────────────────────────
  isElectron: true,

  // ─── Methods ─────────────────────────────────────────────────────────
  startScan: (): Promise<{ status: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.START_SCAN),

  systemCheck: (): Promise<SystemCheckResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.SYSTEM_CHECK),

  getAppInfo: (): Promise<AppInfo> =>
    ipcRenderer.invoke(IPC_CHANNELS.GET_APP_INFO),

  openExternal: (url: string): Promise<{ status: string; message?: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.OPEN_EXTERNAL, url),

  // ─── Event Subscriptions ────────────────────────────────────────────
  onScanProgress: makeSubscription<ScanProgressEvent>(IPC_CHANNELS.SCAN_PROGRESS),
  onScanComplete: makeSubscription<ScanCompleteEvent>(IPC_CHANNELS.SCAN_COMPLETE),
})