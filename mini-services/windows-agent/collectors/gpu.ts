// ─── GPU Collector (nvidia-smi primary, WMI fallback) ─────────────────
import { measuredSource, unavailableSource, findingId, type GPUScanData, type RootCauseFinding } from '../types'
import { runCommand, runPowerShell, safe } from './_shared'

/**
 * Run nvidia-smi with CSV output, no units.
 * Query order: name, driver_version, util.gpu, mem.used, mem.total,
 *   clocks.gr, clocks.mem, temp.gpu, temp.gpu, temp.gpu,
 *   power.draw, power.limit, fan.speed, clocks_throttle_reasons.active,
 *   pcie.link.gen.current, pcie.link.width.current
 */
async function runNvidiaSmi(): Promise<string> {
  return runCommand('nvidia-smi', [
    '--query-gpu=' + [
      'name',
      'driver_version',
      'utilization.gpu',
      'memory.used',
      'memory.total',
      'clocks.gr',
      'clocks.mem',
      'temperature.gpu',
      'temperature.gpu',
      'temperature.gpu',
      'power.draw',
      'power.limit',
      'fan.speed',
      'clocks_throttle_reasons.active',
      'pcie.link.gen.current',
      'pcie.link.width.current',
    ].join(','),
    '--format=csv,noheader,nounits',
  ])
}

/**
 * Fallback: collect basic GPU info via WMI when nvidia-smi is not available.
 * Uses a single combined WMI query for efficiency.
 */
async function collectGpuWmi(): Promise<GPUScanData> {
  const findings: RootCauseFinding[] = []
  const now = Date.now()

  let gpuName: string | null = null
  let driverVersion: string | null = null

  // Primary: single combined CimInstance query
  const wmiRaw = await safe(() =>
    runPowerShell(
      'Get-CimInstance Win32_VideoController | Select-Object -First 1 Name, DriverVersion, AdapterRAM, AdapterCompatibility | ConvertTo-Json',
    ),
  )

  if (wmiRaw) {
    try {
      const parsed = JSON.parse(wmiRaw)
      gpuName = parsed.Name?.trim() || null
      driverVersion = parsed.DriverVersion?.trim() || null
    } catch {
      // JSON parse failed — try individual fallbacks
    }
  }

  // Secondary fallback: if combined query returned nothing, try PnP entity
  if (!gpuName) {
    const pnpName = await safe(() =>
      runPowerShell(
        "(Get-WmiObject Win32_PnPEntity | Where-Object { $_.PNPClass -eq 'Display' } | Select-Object -First 1).Name",
      ),
    )
    if (pnpName) {
      gpuName = pnpName.trim() || null
    }
  }

  // Tertiary fallback: try a simple DirectX diagnostic
  if (!gpuName) {
    const dxName = await safe(() =>
      runPowerShell(
        '(Get-CimInstance Win32_VideoController).Name',
      ),
    )
    if (dxName) {
      // May return multiline if multiple GPUs — take first line
      gpuName = dxName.split('\n')[0].trim() || null
    }
  }

  return {
    module: 'nvidia_gpu',
    source: measuredSource('WMI/PowerShell', 0.85),
    gpuName,
    driverVersion,
    gpuUsage: null,
    vramUsage: null,
    vramTotal: null,
    gpuClock: null,
    memClock: null,
    temperature: null,
    temperatureHotspot: null,
    powerDraw: null,
    powerLimit: null,
    fanSpeed: null,
    throttleReason: null,
    pcieBusInfo: null,
    findings,
  }
}

export async function collectGpu(): Promise<GPUScanData> {
  const findings: RootCauseFinding[] = []
  const now = Date.now()

  // Try nvidia-smi first
  const smiResult = await safe(runNvidiaSmi)

  if (!smiResult) {
    // nvidia-smi not available — try WMI fallback
    const wmiData = await collectGpuWmi()
    wmiData.findings.push({
      id: findingId(),
      title: 'nvidia-smi not available',
      domain: 'gpu',
      severity: 'info',
      level: 'confirmed',
      confidence: 1.0,
      dataSource: 'measured',
      observed: { fallback: 'WMI/PowerShell' },
      sources: ['WMI/PowerShell'],
      recommendation:
        'Install NVIDIA drivers or verify GPU is NVIDIA. Detailed GPU telemetry (temperature, clocks, VRAM, power) requires nvidia-smi.',
      risk: 'low',
      timestamp: now,
    })
    return wmiData
  }

  // ── Parse CSV ────────────────────────────────────────────────────────
  // CSV columns (16): name, driver_version, gpu_util%, mem_used, mem_total,
  //   gpu_clock, mem_clock, temp, temp, temp, power_draw, power_limit,
  //   fan_speed, throttle_reasons, pcie_gen, pcie_width
  const cols = smiResult.split(',').map((c) => c.trim())
  if (cols.length < 16) {
    // Malformed output — fall back to WMI
    return collectGpuWmi()
  }

  const [
    gpuName,
    driverVersion,
    gpuUsageStr,
    vramUsageStr,
    vramTotalStr,
    gpuClockStr,
    memClockStr,
    tempStr,
    /* _temp2 */,
    /* _temp3 */,
    powerDrawStr,
    powerLimitStr,
    fanSpeedStr,
    throttleReasons,
    pcieGenStr,
    pcieWidthStr,
  ] = cols

  const gpuUsage = parseFloat(gpuUsageStr) || null
  const vramUsage = parseFloat(vramUsageStr) || null
  const vramTotal = parseFloat(vramTotalStr) || null
  const gpuClock = parseFloat(gpuClockStr) || null
  const memClock = parseFloat(memClockStr) || null
  const temperature = parseFloat(tempStr) || null
  const powerDraw = parseFloat(powerDrawStr) || null
  const powerLimit = parseFloat(powerLimitStr) || null
  const fanSpeed = parseFloat(fanSpeedStr) || null
  const pcieGen = pcieGenStr === '[N/A]' ? null : pcieGenStr
  const pcieWidth = pcieWidthStr === '[N/A]' ? null : pcieWidthStr
  const pcieBusInfo = pcieGen && pcieWidth ? `PCIe Gen ${pcieGen} x${pcieWidth}` : null

  // ── Findings ─────────────────────────────────────────────────────────

  // GPU temp > 85°C → critical
  if (temperature !== null && temperature > 85) {
    findings.push({
      id: findingId(),
      title: `GPU temperature critical: ${temperature}°C`,
      domain: 'gpu',
      severity: 'critical',
      level: 'confirmed',
      confidence: 0.98,
      dataSource: 'measured',
      observed: { temperature },
      sources: ['nvidia-smi'],
      recommendation:
        'GPU is overheating. Check case airflow, clean dust from heatsinks, verify fan curves, and ensure thermal paste is adequate. Sustained temps above 85°C cause thermal throttling.',
      risk: 'high',
      timestamp: now,
    })
  }
  // GPU temp > 80°C → warning
  else if (temperature !== null && temperature > 80) {
    findings.push({
      id: findingId(),
      title: `GPU temperature elevated: ${temperature}°C`,
      domain: 'gpu',
      severity: 'warning',
      level: 'confirmed',
      confidence: 0.98,
      dataSource: 'measured',
      observed: { temperature },
      sources: ['nvidia-smi'],
      recommendation:
        'GPU temperature is above 80°C. Consider improving case airflow or adjusting fan curve for lower temperatures.',
      risk: 'medium',
      timestamp: now,
    })
  }

  // VRAM > 90%
  if (vramUsage !== null && vramTotal !== null && vramTotal > 0) {
    const vramPct = (vramUsage / vramTotal) * 100
    if (vramPct > 90) {
      findings.push({
        id: findingId(),
        title: `VRAM nearly full: ${vramPct.toFixed(1)}% used`,
        domain: 'gpu',
        severity: 'warning',
        level: 'confirmed',
        confidence: 0.98,
        dataSource: 'measured',
        observed: { vramUsageMB: vramUsage, vramTotalMB: vramTotal, vramPct: Math.round(vramPct) },
        sources: ['nvidia-smi'],
        recommendation:
          'VRAM usage exceeds 90%. Lower texture quality or close other GPU-intensive applications to avoid swapping and stuttering.',
        risk: 'medium',
        timestamp: now,
      })
    }
  }

  // Throttle reasons active
  if (throttleReasons && throttleReasons !== 'Not Active' && throttleReasons !== '[N/A]') {
    findings.push({
      id: findingId(),
      title: `GPU throttling active: ${throttleReasons}`,
      domain: 'gpu',
      severity: 'high',
      level: 'confirmed',
      confidence: 0.98,
      dataSource: 'measured',
      observed: { throttleReasons },
      sources: ['nvidia-smi'],
      recommendation:
        'GPU is being throttled. Common causes: temperature limit, power limit, or low utilization ceiling. Check fan curves and power limits in NVIDIA Control Panel.',
      risk: 'high',
      timestamp: now,
    })
  }

  // Fan speed 0% (if GPU is under load)
  if (fanSpeed !== null && fanSpeed === 0 && gpuUsage !== null && gpuUsage > 20) {
    findings.push({
      id: findingId(),
      title: 'GPU fan not spinning under load',
      domain: 'gpu',
      severity: 'warning',
      level: 'confirmed',
      confidence: 0.98,
      dataSource: 'measured',
      observed: { fanSpeed: 0, gpuUsage },
      sources: ['nvidia-smi'],
      recommendation:
        'GPU fan is at 0% while under load. This could be a passive-cooled GPU, a broken fan, or a fan curve issue. Verify fan operation manually.',
      risk: 'medium',
      timestamp: now,
    })
  }

  return {
    module: 'nvidia_gpu',
    source: measuredSource('nvidia-smi', 0.98),
    gpuName: gpuName || null,
    driverVersion: driverVersion || null,
    gpuUsage,
    vramUsage,
    vramTotal,
    gpuClock,
    memClock,
    temperature,
    temperatureHotspot: null, // nvidia-smi doesn't expose hotspot without extra query
    powerDraw,
    powerLimit,
    fanSpeed,
    throttleReason: throttleReasons === 'Not Active' ? null : (throttleReasons || null),
    pcieBusInfo,
    findings,
  }
}