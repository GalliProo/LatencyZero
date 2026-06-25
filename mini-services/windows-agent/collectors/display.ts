// ─── Display Collector ───────────────────────────────────────────────
import { measuredSource, findingId, type DisplayScanData, type RootCauseFinding } from '../types'
import { runPowerShell, safe } from './_shared'

export async function collectDisplay(): Promise<DisplayScanData> {
  const findings: RootCauseFinding[] = []
  const now = Date.now()

  // ── Parallel collection ──────────────────────────────────────────────

  // Monitor name via WMI WmiMonitorID
  const monitorRaw = await safe(() =>
    runPowerShell(`
Get-CimInstance -Namespace root\\wmi -ClassName WmiMonitorID |
  Select-Object @{N='Name';E={[System.Text.Encoding]::ASCII.GetString($_.UserFriendlyName -ne 0)}},
  @{N='Manufacturer';E={[System.Text.Encoding]::ASCII.GetString($_.ManufacturerName -ne 0)}},
  InstanceName |
  ConvertTo-Json
    `.trim()),
  )

  // Active resolution + refresh via Win32_VideoController
  const displaySettingsRaw = await safe(() =>
    runPowerShell(
      'Get-CimInstance Win32_VideoController | Select-Object CurrentHorizontalResolution, CurrentVerticalResolution, CurrentRefreshRate, MaxRefreshRate, AdapterRAM, AdapterCompatibility | ConvertTo-Json',
    ),
  )

  // Multi-monitor count
  const screenCountRaw = await safe(() =>
    runPowerShell(
      "(Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Screen]::AllScreens).Count",
    ),
  )

  // HDR status via registry
  const hdrRaw = await safe(() =>
    runPowerShell(
      "Get-ItemProperty -Path 'HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\VideoSettings' -Name EnableHDRForDisplay -ErrorAction SilentlyContinue | Select-Object -ExpandProperty EnableHDRForDisplay",
    ),
  )

  // G-Sync / VRR registry check
  const gsyncRaw = await safe(() =>
    runPowerShell(
      "Get-ItemProperty -Path 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Class\\{4d36e968-e325-11ce-bfc1-08002be10318}\\0000\\NVIDIA\\ControlPanel\\Display' -Name GSyncEnabled -ErrorAction SilentlyContinue | Select-Object -ExpandProperty GSyncEnabled",
    ),
  )

  // Display scaling
  const scalingRaw = await safe(() =>
    runPowerShell(
      "Get-ItemProperty -Path 'HKCU:\\Control Panel\\Desktop\\WindowMetrics' -Name AppliedDPI -ErrorAction SilentlyContinue | Select-Object -ExpandProperty AppliedDPI",
    ),
  )

  // ── Parse monitor name ───────────────────────────────────────────────
  let monitorName: string | null = null
  if (monitorRaw) {
    try {
      const parsed = JSON.parse(monitorRaw)
      if (parsed == null || typeof parsed !== 'object') {
        // Null or non-object result from WMI — skip
      } else {
        const monitors = Array.isArray(parsed) ? parsed : [parsed]
        if (monitors.length > 0) {
          const m = monitors[0]
          if (m != null && typeof m === 'object') {
            const name = String(m.Name || '').trim()
            const mfr = String(m.Manufacturer || '').trim()
            monitorName = name ? (mfr ? `${mfr} ${name}` : name) : mfr || null
          }
        }
      }
    } catch {
      // JSON parse failed — monitor name unavailable
    }
  }

  // ── Parse display settings ───────────────────────────────────────────
  let activeResolution: string | null = null
  let activeRefreshHz: number | null = null
  let maxRefreshHz: number | null = null
  let adapterCompat: string | null = null

  if (displaySettingsRaw) {
    try {
      const settings = JSON.parse(displaySettingsRaw)
      if (settings != null && typeof settings === 'object') {
        const s = Array.isArray(settings) ? settings[0] : settings
        if (s != null && typeof s === 'object') {
          const h = s.CurrentHorizontalResolution
          const v = s.CurrentVerticalResolution
          activeResolution = h && v ? `${h}x${v}` : null
          activeRefreshHz = s.CurrentRefreshRate ? parseFloat(s.CurrentRefreshRate) || null : null
          maxRefreshHz = s.MaxRefreshRate ? parseFloat(s.MaxRefreshRate) || null : null
          adapterCompat = s.AdapterCompatibility ? String(s.AdapterCompatibility) : null
        }
      }
    } catch {
      // parse failed — display settings unavailable
    }
  }

  // ── Multi-monitor ────────────────────────────────────────────────────
  let multiMonitor: boolean | null = null
  if (screenCountRaw != null) {
    const count = parseInt(screenCountRaw, 10)
    multiMonitor = !isNaN(count) ? count > 1 : null
  }

  // ── HDR ──────────────────────────────────────────────────────────────
  let hdrEnabled: boolean | null = null
  if (hdrRaw != null) {
    hdrEnabled = hdrRaw === '1' || hdrRaw.toLowerCase() === 'true'
  }

  // ── VRR / G-Sync ─────────────────────────────────────────────────────
  let vrrEnabled: boolean | null = null
  let vrrType: 'g-sync' | 'freesync' | 'unknown' | null = null

  if (gsyncRaw != null) {
    const val = parseInt(gsyncRaw, 10)
    vrrEnabled = val === 1
    if (vrrEnabled) {
      vrrType = adapterCompat?.toLowerCase().includes('nvidia') ? 'g-sync' : 'unknown'
    }
  }

  // If NVIDIA not detected, check AMD FreeSync via adapter compatibility
  if (vrrEnabled === null && adapterCompat?.toLowerCase().includes('amd')) {
    // AMD FreeSync is harder to detect programmatically — mark as unknown
    vrrEnabled = null
    vrrType = null
  }

  // ── Scaling ──────────────────────────────────────────────────────────
  let scaling: string | null = null
  if (scalingRaw != null) {
    const dpi = parseInt(scalingRaw, 10)
    if (dpi === 96) {
      scaling = '100%'
    } else if (dpi > 0) {
      scaling = `${Math.round((dpi / 96) * 100)}%`
    }
  }

  // ── Findings ─────────────────────────────────────────────────────────

  // Max refresh != active refresh
  if (maxRefreshHz !== null && activeRefreshHz !== null && maxRefreshHz > activeRefreshHz) {
    findings.push({
      id: findingId(),
      title: `Monitor not running at max refresh: ${activeRefreshHz} Hz active, ${maxRefreshHz} Hz max`,
      domain: 'display',
      severity: 'high',
      level: 'confirmed',
      confidence: 0.95,
      dataSource: 'measured',
      observed: { activeRefreshHz, maxRefreshHz },
      sources: ['WMI/PowerShell'],
      recommendation:
        `Your monitor supports ${maxRefreshHz} Hz but is running at ${activeRefreshHz} Hz. Change the refresh rate in Windows Display Settings → Advanced Display → Choose refresh rate.`,
      risk: 'high',
      timestamp: now,
    })
  }

  // HDR enabled
  if (hdrEnabled === true) {
    findings.push({
      id: findingId(),
      title: 'HDR is enabled',
      domain: 'display',
      severity: 'warning',
      level: 'confirmed',
      confidence: 0.9,
      dataSource: 'measured',
      observed: { hdrEnabled: true },
      sources: ['Registry'],
      recommendation:
        'HDR adds processing overhead that can increase input lag by 1-3ms. Disable HDR in Windows Display Settings for competitive gaming unless you specifically need it.',
      risk: 'medium',
      timestamp: now,
    })
  }

  // Multi-monitor
  if (multiMonitor === true) {
    findings.push({
      id: findingId(),
      title: 'Multiple monitors detected',
      domain: 'display',
      severity: 'info',
      level: 'confirmed',
      confidence: 0.95,
      dataSource: 'measured',
      observed: { multiMonitor: true },
      sources: ['System.Windows.Forms'],
      recommendation:
        'Multiple monitors can reduce GPU performance by ~3-5% due to extra rendering. Consider disabling the secondary display during competitive matches for maximum FPS.',
      risk: 'low',
      timestamp: now,
    })
  }

  // Scaling not 100%
  if (scaling !== null && scaling !== '100%') {
    findings.push({
      id: findingId(),
      title: `Display scaling is not 100%: ${scaling}`,
      domain: 'display',
      severity: 'info',
      level: 'confirmed',
      confidence: 0.9,
      dataSource: 'measured',
      observed: { scaling },
      sources: ['Registry'],
      recommendation:
        'Display scaling can cause slight blurring and may add latency in some games. Set to 100% and use in-game resolution scaling if you need larger UI elements.',
      risk: 'low',
      timestamp: now,
    })
  }

  // VRR not enabled
  if (vrrEnabled === false) {
    findings.push({
      id: findingId(),
      title: 'Variable Refresh Rate (VRR) is not enabled',
      domain: 'display',
      severity: 'warning',
      level: 'likely',
      confidence: 0.7,
      dataSource: 'measured',
      observed: { vrrEnabled: false, adapterCompatibility: adapterCompat ?? 'unknown' },
      sources: ['Registry'],
      recommendation:
        'Enable G-Sync/FreeSync in your GPU control panel and Windows Display Settings. VRR eliminates screen tearing and reduces input lag without the performance cost of VSync.',
      risk: 'medium',
      timestamp: now,
    })
  }

  return {
    module: 'display',
    source: measuredSource('WMI/PowerShell/Registry', 0.9),
    monitorName,
    activeResolution,
    activeRefreshHz,
    maxRefreshHz,
    hdrEnabled,
    vrrEnabled,
    vrrType,
    scaling,
    multiMonitor,
    findings,
  }
}