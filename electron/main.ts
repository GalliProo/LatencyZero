// ─── LatencyZero — Electron Main Process ────────────────────────────────
// Spawns an embedded Next.js standalone server and provides native
// system scanning via the windows-agent collectors.

import {
  app,
  BrowserWindow,
  ipcMain,
  Tray,
  Menu,
  shell,
  nativeImage,
} from 'electron'
import { spawn, ChildProcess, execSync } from 'child_process'
import * as path from 'path'
import * as fs from 'fs'
import * as http from 'http'
import * as net from 'net'

// ─── Collector imports (windows-agent) ──────────────────────────────────
import { collectSystem } from '../mini-services/windows-agent/collectors/system'
import { collectGpu } from '../mini-services/windows-agent/collectors/gpu'
import { collectNetwork } from '../mini-services/windows-agent/collectors/network'
import { collectProcesses } from '../mini-services/windows-agent/collectors/processes'
import { collectDisplay } from '../mini-services/windows-agent/collectors/display'
import { collectController } from '../mini-services/windows-agent/collectors/controller'

import { IPC_CHANNELS, COLLECTOR_ENDPOINTS } from './types'
import type { ScanProgressEvent, ScanCompleteEvent, SystemCheckResult, AppInfo } from './types'

// ─── Constants ──────────────────────────────────────────────────────────
const APP_VERSION = '1.0.0'
const PORT_RANGE_START = 3000
const PORT_RANGE_END = 3010
const HEARTBEAT_INTERVAL_MS = 5_000
const APP_NAME = 'LatencyZero'

// ─── Global state ───────────────────────────────────────────────────────
let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let nextServerProcess: ChildProcess | null = null
let serverPort = 3000
let heartbeatTimer: ReturnType<typeof setInterval> | null = null
const appStartTime = Date.now()

// ─── Paths ──────────────────────────────────────────────────────────────
function getAppDataPath(): string {
  return app.getPath('appData')
}

function getDbPath(): string {
  return path.join(getAppDataPath(), APP_NAME, 'db', 'latencyzero.db')
}

function getLogPath(): string {
  return path.join(getAppDataPath(), APP_NAME, 'logs', 'latencyzero.log')
}

function getResourcesPath(): string {
  return app.isPackaged ? process.resourcesPath : path.resolve(__dirname, '..')
}

// ─── Logger ─────────────────────────────────────────────────────────────
function ensureDir(filePath: string): void {
  const dir = path.dirname(filePath)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
}

function log(message: string, level: 'info' | 'error' | 'warn' = 'info'): void {
  const timestamp = new Date().toISOString()
  const line = `[${timestamp}] [${level.toUpperCase()}] ${message}\n`
  const logFile = getLogPath()

  try {
    ensureDir(logFile)
    fs.appendFileSync(logFile, line, 'utf-8')
  } catch {
    // Silent fail — logging should never crash the app
  }

  if (level === 'error') {
    console.error(line.trim())
  } else {
    console.log(line.trim())
  }
}

// ─── Port Finder ────────────────────────────────────────────────────────
function findFreePort(start: number, end: number): Promise<number> {
  return new Promise((resolve, reject) => {
    let current = start

    function tryPort(): void {
      if (current > end) {
        reject(new Error(`No free port found in range ${start}-${end}`))
        return
      }

      const server = net.createServer()
      server.once('listening', () => {
        server.close(() => resolve(current))
      })
      server.once('error', () => {
        current++
        tryPort()
      })
      server.listen(current, '127.0.0.1')
    }

    tryPort()
  })
}

// ─── Next.js Server Spawn ───────────────────────────────────────────────
async function startNextServer(): Promise<number> {
  // In dev mode, assume the user's dev server is already running on port 3000
  if (!app.isPackaged) {
    serverPort = PORT_RANGE_START
    log(`Dev mode — using existing dev server on port ${serverPort}`)
    return serverPort
  }

  // Production: find a free port and spawn the standalone server
  serverPort = await findFreePort(PORT_RANGE_START, PORT_RANGE_END)
  log(`Production mode — spawning Next.js standalone server on port ${serverPort}`)

  const serverScript = path.join(getResourcesPath(), '.next', 'standalone', 'server.js')

  if (!fs.existsSync(serverScript)) {
    throw new Error(`Next.js standalone server not found at ${serverScript}`)
  }

  // Ensure the DB directory exists for the portable SQLite
  const dbPath = getDbPath()
  ensureDir(dbPath)

  const env = {
    ...process.env,
    PORT: String(serverPort),
    HOSTNAME: '127.0.0.1',
    DATABASE_URL: `file:${dbPath}`,
    NODE_ENV: 'production',
  }

  nextServerProcess = spawn('node', [serverScript], {
    cwd: getResourcesPath(),
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  nextServerProcess.stdout?.on('data', (data: Buffer) => {
    log(`Next.js: ${data.toString().trim()}`)
  })

  nextServerProcess.stderr?.on('data', (data: Buffer) => {
    log(`Next.js stderr: ${data.toString().trim()}`, 'warn')
  })

  nextServerProcess.on('error', (err) => {
    log(`Next.js process error: ${err.message}`, 'error')
  })

  nextServerProcess.on('exit', (code, signal) => {
    log(`Next.js process exited (code: ${code}, signal: ${signal})`, code !== 0 ? 'error' : 'info')
    nextServerProcess = null
  })

  // Wait for the server to be ready
  await waitForServer(serverPort)

  return serverPort
}

function waitForServer(port: number, timeoutMs = 15000): Promise<void> {
  return new Promise((resolve, reject) => {
    const start = Date.now()

    function check(): void {
      if (Date.now() - start > timeoutMs) {
        reject(new Error(`Server did not respond within ${timeoutMs}ms on port ${port}`))
        return
      }

      const req = http.get(`http://127.0.0.1:${port}/api/scan/status`, (res) => {
        // Any response means the server is up
        res.resume()
        resolve()
      })

      req.on('error', () => {
        setTimeout(check, 300)
      })

      req.setTimeout(2000, () => {
        req.destroy()
        setTimeout(check, 300)
      })
    }

    check()
  })
}

// ─── Heartbeat ──────────────────────────────────────────────────────────
function startHeartbeat(): void {
  stopHeartbeat()

  heartbeatTimer = setInterval(() => {
    const uptime = Math.round((Date.now() - appStartTime) / 1000)
    const payload = JSON.stringify({
      type: 'heartbeat',
      version: APP_VERSION,
      uptime,
    })

    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: serverPort,
        path: '/api/scan/status',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
        },
      },
      (res) => {
        res.resume() // Drain response
      },
    )

    req.on('error', (err) => {
      log(`Heartbeat failed: ${err.message}`, 'warn')
    })

    req.write(payload)
    req.end()
  }, HEARTBEAT_INTERVAL_MS)

  log('Heartbeat started (every 5s)')
}

function stopHeartbeat(): void {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer)
    heartbeatTimer = null
    log('Heartbeat stopped')
  }
}

// ─── Window Creation ────────────────────────────────────────────────────
function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    frame: false,
    titleBarOverlay: {
      color: '#0a0a0a',
      symbolColor: '#ffffff',
      height: 36,
    },
    show: false,
    backgroundColor: '#0a0a0a',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false, // Required for collectors that spawn child processes
    },
  })

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
    log('Main window shown')
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  // Load the app
  const url = `http://127.0.0.1:${serverPort}`
  mainWindow.loadURL(url)
  log(`Loading app from ${url}`)
}

// ─── System Tray ────────────────────────────────────────────────────────
function createTray(): void {
  const iconPath = app.isPackaged
    ? path.join(process.resourcesPath, 'electron', 'resources', 'tray-icon.png')
    : path.join(__dirname, 'resources', 'tray-icon.png')

  let trayIcon: Electron.NativeImage
  try {
    trayIcon = nativeImage.createFromPath(iconPath)
    if (trayIcon.isEmpty()) {
      // Fallback: create a 16x16 placeholder icon
      trayIcon = nativeImage.createEmpty()
    }
  } catch {
    trayIcon = nativeImage.createEmpty()
  }

  tray = new Tray(trayIcon)
  tray.setToolTip(`${APP_NAME} v${APP_VERSION}`)

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Start Scan',
      click: () => {
        runScan()
        if (mainWindow && !mainWindow.isMinimized()) {
          mainWindow.focus()
        } else if (mainWindow && mainWindow.isMinimized()) {
          mainWindow.restore()
          mainWindow.focus()
        }
      },
    },
    {
      label: 'Show Window',
      click: () => {
        if (mainWindow) {
          if (mainWindow.isMinimized()) mainWindow.restore()
          mainWindow.show()
          mainWindow.focus()
        } else {
          createWindow()
        }
      },
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        app.quit()
      },
    },
  ])

  tray.setContextMenu(contextMenu)

  tray.on('double-click', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.show()
      mainWindow.focus()
    }
  })
}

// ─── HTTP Helper: POST collector result to Next.js API ──────────────────
function postCollectorResult(moduleName: string, data: unknown): Promise<void> {
  const endpoint = COLLECTOR_ENDPOINTS[moduleName]
  if (!endpoint) {
    log(`Unknown collector module: ${moduleName}`, 'error')
    return Promise.resolve()
  }

  return new Promise((resolve) => {
    const payload = JSON.stringify(data)
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: serverPort,
        path: `/api/scan/${endpoint}`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
        },
      },
      (res) => {
        let body = ''
        res.on('data', (chunk: Buffer) => { body += chunk.toString() })
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            log(`Posted ${moduleName} to /api/scan/${endpoint} — ${res.statusCode}`)
          } else {
            log(`Failed to post ${moduleName} — HTTP ${res.statusCode}: ${body}`, 'error')
          }
          resolve()
        })
      },
    )

    req.on('error', (err) => {
      log(`Error posting ${moduleName}: ${err.message}`, 'error')
      resolve() // Don't throw — continue with other collectors
    })

    req.write(payload)
    req.end()
  })
}

// ─── Scan Runner ────────────────────────────────────────────────────────
interface CollectorEntry {
  name: string
  collect: () => Promise<{ module: string; [key: string]: unknown }>
}

const COLLECTORS: CollectorEntry[] = [
  { name: 'system', collect: collectSystem },
  { name: 'gpu', collect: collectGpu },
  { name: 'network', collect: collectNetwork },
  { name: 'processes', collect: collectProcesses },
  { name: 'display', collect: collectDisplay },
  { name: 'controller', collect: collectController },
]

async function runScan(): Promise<void> {
  const scanStart = Date.now()
  const errors: string[] = []
  let completedCount = 0
  const total = COLLECTORS.length

  log(`Starting scan with ${total} collectors`)

  // Notify the renderer that the scan has started (first progress event)
  sendToRenderer(IPC_CHANNELS.SCAN_PROGRESS, {
    collector: '_init',
    module: '_init',
    status: 'collecting',
    timestamp: Date.now(),
  } satisfies ScanProgressEvent)

  // Run all collectors in parallel
  const results = await Promise.allSettled(
    COLLECTORS.map(async (entry) => {
      const moduleName = entry.name

      try {
        // Notify collecting
        sendToRenderer(IPC_CHANNELS.SCAN_PROGRESS, {
          collector: moduleName,
          module: moduleName,
          status: 'collecting',
          timestamp: Date.now(),
        } satisfies ScanProgressEvent)

        const data = await entry.collect()

        // Notify posting
        sendToRenderer(IPC_CHANNELS.SCAN_PROGRESS, {
          collector: moduleName,
          module: data.module,
          status: 'posting',
          timestamp: Date.now(),
        } satisfies ScanProgressEvent)

        // POST to Next.js API
        await postCollectorResult(data.module, data)

        // Notify done
        sendToRenderer(IPC_CHANNELS.SCAN_PROGRESS, {
          collector: moduleName,
          module: data.module,
          status: 'done',
          timestamp: Date.now(),
        } satisfies ScanProgressEvent)

        completedCount++
        return data
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err)
        errors.push(`${moduleName}: ${message}`)

        sendToRenderer(IPC_CHANNELS.SCAN_PROGRESS, {
          collector: moduleName,
          module: moduleName,
          status: 'error',
          timestamp: Date.now(),
          error: message,
        } satisfies ScanProgressEvent)

        completedCount++
        return null
      }
    }),
  )

  const durationMs = Date.now() - scanStart

  log(`Scan complete: ${completedCount}/${total} collectors in ${durationMs}ms` +
    (errors.length > 0 ? ` (${errors.length} errors)` : ''))

  // Send completion event
  const completeEvent: ScanCompleteEvent = {
    totalCollectors: total,
    completedCollectors: completedCount,
    durationMs,
    timestamp: Date.now(),
    errors,
  }

  sendToRenderer(IPC_CHANNELS.SCAN_COMPLETE, completeEvent)
}

function sendToRenderer(channel: string, data: unknown): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, data)
  }
}

// ─── System Check ───────────────────────────────────────────────────────
function runSystemCheck(): SystemCheckResult {
  let powershellAvailable = false
  let powershellVersion: string | null = null
  let nvidiaSmiAvailable = false
  let nvidiaSmiVersion: string | null = null
  let pingAvailable = false
  let isAdmin = false

  // Check PowerShell
  try {
    const psOutput = execSync('powershell -Command "$PSVersionTable.PSVersion.ToString()"', {
      encoding: 'utf-8',
      timeout: 5000,
      windowsHide: true,
    }).trim()
    powershellAvailable = true
    powershellVersion = psOutput || null
  } catch {
    powershellAvailable = false
  }

  // Check nvidia-smi
  try {
    const smiOutput = execSync('nvidia-smi --query-gpu=driver_version --format=csv,noheader', {
      encoding: 'utf-8',
      timeout: 5000,
      windowsHide: true,
    }).trim()
    nvidiaSmiAvailable = true
    nvidiaSmiVersion = smiOutput.split('\n')[0]?.trim() || null
  } catch {
    nvidiaSmiAvailable = false
  }

  // Check ping
  try {
    execSync('ping -n 1 127.0.0.1', {
      encoding: 'utf-8',
      timeout: 5000,
      windowsHide: true,
    })
    pingAvailable = true
  } catch {
    pingAvailable = false
  }

  // Check admin (Windows)
  try {
    execSync('net session', {
      encoding: 'utf-8',
      timeout: 5000,
      windowsHide: true,
    })
    isAdmin = true
  } catch {
    isAdmin = false
  }

  return {
    powershell: { available: powershellAvailable, version: powershellVersion },
    nvidiaSmi: { available: nvidiaSmiAvailable, version: nvidiaSmiVersion },
    ping: { available: pingAvailable },
    admin: { isElevated: isAdmin },
  }
}

// ─── IPC Handlers ───────────────────────────────────────────────────────
function registerIpcHandlers(): void {
  // Start a full system scan
  ipcMain.handle(IPC_CHANNELS.START_SCAN, async () => {
    log('IPC: start-scan requested')
    await runScan()
    return { status: 'ok' }
  })

  // Check system prerequisites
  ipcMain.handle(IPC_CHANNELS.SYSTEM_CHECK, async (): Promise<SystemCheckResult> => {
    log('IPC: system-check requested')
    return runSystemCheck()
  })

  // Get app info
  ipcMain.handle(IPC_CHANNELS.GET_APP_INFO, async (): Promise<AppInfo> => {
    return {
      version: APP_VERSION,
      isElectron: true,
      isPackaged: app.isPackaged,
      platform: process.platform,
      arch: process.arch,
    }
  })

  // Open external URL
  ipcMain.handle(IPC_CHANNELS.OPEN_EXTERNAL, async (_event, url: string) => {
    if (typeof url === 'string' && (url.startsWith('http://') || url.startsWith('https://'))) {
      await shell.openExternal(url)
      return { status: 'ok' }
    }
    return { status: 'error', message: 'Invalid URL' }
  })
}

// ─── Cleanup ────────────────────────────────────────────────────────────
function cleanup(): void {
  log('Cleaning up...')

  stopHeartbeat()

  // Send disconnect to the API
  try {
    const payload = JSON.stringify({ type: 'disconnect' })
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: serverPort,
        path: '/api/scan/status',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
        },
      },
      () => {},
    )
    req.on('error', () => {}) // Ignore errors during cleanup
    req.write(payload)
    req.end()
  } catch {
    // Ignore errors during cleanup
  }

  // Kill the Next.js server process
  if (nextServerProcess) {
    log('Killing Next.js server process')
    nextServerProcess.kill('SIGTERM')
    // Force kill after 3 seconds
    const killTimeout = setTimeout(() => {
      if (nextServerProcess) {
        nextServerProcess.kill('SIGKILL')
        nextServerProcess = null
      }
    }, 3000)

    nextServerProcess.on('exit', () => {
      clearTimeout(killTimeout)
      nextServerProcess = null
    })
  }

  log('Cleanup complete')
}

// ─── App Lifecycle ──────────────────────────────────────────────────────

// Single instance lock
const gotLock = app.requestSingleInstanceLock()

if (!gotLock) {
  log('Another instance is already running — quitting')
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.show()
      mainWindow.focus()
    }
  })

  // App is ready
  app.on('ready', async () => {
    log(`${APP_NAME} v${APP_VERSION} starting...`)
    log(`Packaged: ${app.isPackaged}`)
    log(`Platform: ${process.platform} ${process.arch}`)
    log(`Resources: ${getResourcesPath()}`)
    log(`Database: ${getDbPath()}`)
    log(`Log: ${getLogPath()}`)

    try {
      const port = await startNextServer()
      serverPort = port
      log(`Next.js server ready on port ${port}`)

      startHeartbeat()
      registerIpcHandlers()
      createWindow()
      createTray()
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      log(`Failed to start: ${message}`, 'error')

      // Show an error dialog
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { dialog } = require('electron')
      dialog.showErrorBox(
        'LatencyZero — Startup Error',
        `Failed to start the application:\n\n${message}`,
      )
      app.quit()
    }
  })

  // Keep app alive when all windows are closed (tray app on Windows)
  app.on('window-all-closed', () => {
    log('All windows closed — keeping tray alive')
    // Don't quit — the system tray keeps the app running
  })

  // App is quitting
  app.on('before-quit', () => {
    log('App is quitting')
    cleanup()
  })

  app.on('quit', () => {
    log('App quit')
  })
}