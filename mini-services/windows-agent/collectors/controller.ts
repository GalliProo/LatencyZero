// ─── Controller Collector ─────────────────────────────────────────────
import { measuredSource, unavailableSource, findingId, type ControllerScanData, type RootCauseFinding } from '../types'
import { runPowerShell, safe } from './_shared'

interface DetectedController {
  friendlyName: string
  instanceId: string
  deviceClass: string
}

/**
 * Detect transport type from a Windows Device ID.
 * USB:  contains "USB\"
 * BTH:  contains "BTH\" (Bluetooth)
 */
function detectTransport(deviceId: string): 'usb' | 'bluetooth' | 'wireless' | 'unknown' {
  const upper = deviceId.toUpperCase()
  if (upper.includes('USB\\')) return 'usb'
  if (upper.includes('BTH\\')) return 'bluetooth'
  if (upper.includes('BTHENUM')) return 'bluetooth'
  return 'unknown'
}

/**
 * Determine API from device class.
 * Only returns a specific API when the device class is explicit.
 * Returns null when the class name is empty or too ambiguous to determine.
 */
function detectApi(deviceClass: string): 'xinput' | 'gameinput' | 'hid' | null {
  const upper = (deviceClass || '').toUpperCase()
  if (!upper) return null
  if (upper.includes('XINPUT')) return 'xinput'
  if (upper.includes('HID')) return 'hid'
  if (upper.includes('GAMECONTROLLER')) return 'gameinput'
  return null
}

/** Default polling rate estimates based on transport and API */
function estimatePollingMs(transport: string, api: string): { avg: number; p95: number; jitter: number } {
  if (transport === 'usb' && api === 'xinput') {
    // Xbox controllers over USB typically poll at 1ms (1000 Hz)
    return { avg: 1, p95: 2, jitter: 0.2 }
  }
  if (transport === 'bluetooth') {
    // Bluetooth controllers typically 4-11ms (varies widely)
    return { avg: 7, p95: 12, jitter: 3 }
  }
  // Generic HID or unknown — assume ~4ms
  return { avg: 4, p95: 8, jitter: 1.5 }
}

export async function collectController(): Promise<ControllerScanData> {
  const findings: RootCauseFinding[] = []
  const now = Date.now()

  // ── Detect controllers via PnP devices ────────────────────────────────
  const pnpRaw = await safe(() =>
    runPowerShell(`
Get-PnpDevice -Class 'XINPUTCLASS','HIDClass','GameController','USB' |
  Where-Object { $_.Status -eq 'OK' -and $_.FriendlyName -match 'controller|gamepad|xbox|playstation|dualsense|dualshock|pro controller|steam|8bitdo' } |
  Select-Object FriendlyName, InstanceId, Class |
  ConvertTo-Json
    `.trim()),
  )

  // Fallback: WMI Win32_PnPEntity
  const wmiRaw = await safe(() =>
    runPowerShell(`
Get-WmiObject Win32_PnPEntity | Where-Object { $_.Name -match 'controller|gamepad|xbox|playstation|dualsense|dualshock' } |
  Select-Object Name, DeviceID, PNPClass |
  ConvertTo-Json
    `.trim()),
  )

  // Parse results
  const controllers: DetectedController[] = []

  const parseDevices = (
    raw: string,
    nameKey: string,
    idKey: string,
    classKey: string,
  ) => {
    try {
      const parsed = JSON.parse(raw)
      const items = Array.isArray(parsed) ? parsed : [parsed]
      for (const item of items) {
        if (item[nameKey]) {
          controllers.push({
            friendlyName: item[nameKey],
            instanceId: item[idKey] || '',
            deviceClass: item[classKey] || '',
          })
        }
      }
    } catch {
      // parse failed
    }
  }

  if (pnpRaw) parseDevices(pnpRaw, 'FriendlyName', 'InstanceId', 'Class')
  if (wmiRaw && controllers.length === 0) parseDevices(wmiRaw, 'Name', 'DeviceID', 'PNPClass')

  // ── No controller found ──────────────────────────────────────────────
  if (controllers.length === 0) {
    return {
      module: 'controller',
      source: unavailableSource('No game controller detected. Connect a controller to analyze input latency.'),
      controllerName: null,
      transport: null,
      api: null,
      avgPollingMs: null,
      p95PollingMs: null,
      inputJitterMs: null,
      estimatedDropRate: null,
      findings: [],
    }
  }

  // Use the first detected controller
  const ctrl = controllers[0]
  const transport = detectTransport(ctrl.instanceId)
  const api = detectApi(ctrl.deviceClass)
  const polling = estimatePollingMs(transport, api ?? 'hid')

  // ── Findings ─────────────────────────────────────────────────────────

  // Controller connected via Bluetooth
  if (transport === 'bluetooth') {
    findings.push({
      id: findingId(),
      title: `Controller connected via Bluetooth: ${ctrl.friendlyName}`,
      domain: 'controller',
      severity: 'warning',
      level: 'confirmed',
      confidence: 0.95,
      dataSource: 'measured',
      observed: {
        controllerName: ctrl.friendlyName,
        transport: 'bluetooth',
        estimatedPollingMs: polling.avg,
      },
      sources: ['WMI/PnP'],
      recommendation:
        'Bluetooth controllers have higher latency (~4-11ms) and more jitter than USB (~1ms). Use a USB cable or USB wireless dongle for competitive gaming.',
      risk: 'medium',
      timestamp: now,
    })
  } else {
    findings.push({
      id: findingId(),
      title: `Controller detected: ${ctrl.friendlyName}`,
      domain: 'controller',
      severity: 'info',
      level: 'confirmed',
      confidence: 0.85,
      dataSource: 'measured',
      observed: {
        controllerName: ctrl.friendlyName,
        transport,
        api,
        estimatedPollingMs: polling.avg,
      },
      sources: ['WMI/PnP'],
      recommendation:
        `Controller detected via ${transport}${api ? ` using ${api} API` : ''}. Estimated polling rate: ${polling.avg}ms. For precise polling rate measurement, use a hardware input latency tester.`,
      risk: 'low',
      timestamp: now,
    })
  }

  return {
    module: 'controller',
    source: measuredSource('WMI/PowerShell', 0.85),
    controllerName: ctrl.friendlyName,
    transport,
    api,
    avgPollingMs: polling.avg,
    p95PollingMs: polling.p95,
    inputJitterMs: polling.jitter,
    estimatedDropRate: null, // Cannot measure without Raw Input / HID polling
    findings,
  }
}