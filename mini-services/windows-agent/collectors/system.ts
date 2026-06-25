// ─── System Collector (WMI / PowerShell) ──────────────────────────────
import { measuredSource, findingId, type SystemScanData, type RootCauseFinding } from '../types'
import { runPowerShell, safe } from './_shared'

export async function collectSystem(): Promise<SystemScanData> {
  const now = Date.now()
  const findings: RootCauseFinding[] = []

  // ── Parallel field collection ────────────────────────────────────────
  const [
    cpuName,
    gpuName,
    ramTotalRaw,
    ramSpeedRaw,
    windowsVersion,
    windowsBuild,
    motherboard,
    biosVersion,
    powerPlanRaw,
    secureBootRaw,
    tpmRaw,
    vbsRaw,
  ] = await Promise.all([
    safe(() => runPowerShell('(Get-CimInstance Win32_Processor).Name')),
    safe(() => runPowerShell('(Get-CimInstance Win32_VideoController | Select-Object -First 1).Name')),
    safe(() => runPowerShell('(Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory')),
    safe(() => runPowerShell('(Get-CimInstance Win32_PhysicalMemory | Select-Object -First 1).Speed')),
    safe(() => runPowerShell('(Get-CimInstance Win32_OperatingSystem).Caption')),
    safe(() => runPowerShell('(Get-CimInstance Win32_OperatingSystem).BuildNumber')),
    safe(() =>
      runPowerShell(
        "(Get-CimInstance Win32_BaseBoard).Product + ' ' + (Get-CimInstance Win32_BaseBoard).Manufacturer",
      ),
    ),
    safe(() =>
      runPowerShell(
        "(Get-CimInstance Win32_BIOS).SMBIOSBIOSVersion + ' ' + (Get-CimInstance Win32_BIOS).ReleaseDate",
      ),
    ),
    safe(() => runPowerShell('powercfg /getactivescheme')),
    safe(() => runPowerShell('Confirm-SecureBootUEFI')),
    safe(() => runPowerShell('(Get-Tpm).TpmPresent')),
    safe(() =>
      runPowerShell(
        "Get-CimInstance -ClassName Win32_DeviceGuard -Namespace root\\Microsoft\\Windows\\DeviceGuard | Select-Object -ExpandProperty VirtualizationBasedSecurityStatus",
      ),
    ),
  ])

  // ── Parse RAM (bytes → GB) ───────────────────────────────────────────
  const ramTotal: number | null = ramTotalRaw != null
    ? Math.round(parseInt(ramTotalRaw, 10) / (1024 ** 3))
    : null

  // ── Parse RAM Speed (MHz) ────────────────────────────────────────────
  const ramSpeed: number | null = ramSpeedRaw != null
    ? parseInt(ramSpeedRaw, 10) || null
    : null

  // ── Parse Power Plan ─────────────────────────────────────────────────
  // Output format: "Power Scheme GUID: 8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c  (Balanced)"
  let powerPlan: string | null = null
  if (powerPlanRaw) {
    const match = powerPlanRaw.match(/\((.+)\)/)
    powerPlan = match ? match[1].trim() : powerPlanRaw.trim()
  }

  // ── Parse Secure Boot ────────────────────────────────────────────────
  const secureBoot: boolean | null = secureBootRaw != null
    ? secureBootRaw.toLowerCase().startsWith('true')
    : null

  // ── Parse TPM ────────────────────────────────────────────────────────
  const tpm: boolean | null = tpmRaw != null
    ? tpmRaw.toLowerCase().startsWith('true')
    : null

  // ── Parse VBS / Memory Integrity ─────────────────────────────────────
  // VBS status: 0 = Off, 1 = Enabled (not running), 2 = Running
  let vbsMemoryIntegrity: boolean | null = null
  if (vbsRaw != null) {
    const status = parseInt(vbsRaw, 10)
    vbsMemoryIntegrity = status === 2
  }

  // ── Generate findings ────────────────────────────────────────────────

  // Power plan not High Performance / Ultimate Performance
  if (powerPlan && !['High Performance', 'Ultimate Performance'].includes(powerPlan)) {
    findings.push({
      id: findingId(),
      title: 'Sub-optimal power plan',
      domain: 'windows_config',
      severity: 'warning',
      level: 'confirmed',
      confidence: 0.95,
      dataSource: 'measured',
      observed: { powerPlan },
      sources: ['WMI/PowerShell'],
      recommendation:
        'Switch to "High Performance" or "Ultimate Performance" power plan via Windows Settings → Power Options for maximum CPU performance.',
      risk: 'medium',
      timestamp: now,
    })
  }

  // Secure Boot disabled
  if (secureBoot === false) {
    findings.push({
      id: findingId(),
      title: 'Secure Boot is disabled',
      domain: 'windows_config',
      severity: 'warning',
      level: 'confirmed',
      confidence: 0.95,
      dataSource: 'measured',
      observed: { secureBoot: 'false' },
      sources: ['WMI/PowerShell'],
      recommendation:
        'Enable Secure Boot in BIOS/UEFI. While not directly related to gaming performance, it ensures a trusted boot chain and is required by some anti-cheat systems.',
      risk: 'low',
      timestamp: now,
    })
  }

  // TPM not present
  if (tpm === false) {
    findings.push({
      id: findingId(),
      title: 'TPM not detected',
      domain: 'windows_config',
      severity: 'warning',
      level: 'confirmed',
      confidence: 0.95,
      dataSource: 'measured',
      observed: { tpm: 'false' },
      sources: ['WMI/PowerShell'],
      recommendation:
        'Enable TPM 2.0 in BIOS/UEFI. Required by some games and anti-cheat systems.',
      risk: 'low',
      timestamp: now,
    })
  }

  // VBS / Core Isolation enabled → performance impact
  if (vbsMemoryIntegrity === true) {
    findings.push({
      id: findingId(),
      title: 'Memory Integrity (Core Isolation) is enabled',
      domain: 'windows_config',
      severity: 'high',
      level: 'confirmed',
      confidence: 0.9,
      dataSource: 'measured',
      observed: { vbsMemoryIntegrity: 'true' },
      sources: ['WMI/PowerShell'],
      recommendation:
        'Memory Integrity / Core Isolation adds ~5-15% CPU overhead. Disable in Windows Security → Device Security → Core Isolation if you need maximum performance. Note: this reduces security against kernel-level exploits.',
      risk: 'medium',
      timestamp: now,
    })
  }

  // RAM < 16 GB
  if (ramTotal !== null && ramTotal < 16) {
    findings.push({
      id: findingId(),
      title: `Only ${ramTotal} GB RAM detected`,
      domain: 'windows_config',
      severity: 'warning',
      level: 'confirmed',
      confidence: 0.95,
      dataSource: 'measured',
      observed: { ramTotalGB: ramTotal },
      sources: ['WMI/PowerShell'],
      recommendation:
        '16 GB RAM is the recommended minimum for modern competitive gaming. Consider upgrading to 32 GB for best results with background apps.',
      risk: 'medium',
      timestamp: now,
    })
  }

  return {
    module: 'windows_system',
    source: measuredSource('WMI/PowerShell', 0.95),
    cpuName: cpuName ?? null,
    gpuName: gpuName ?? null,
    ramTotal,
    ramSpeed,
    windowsVersion: windowsVersion ?? null,
    windowsBuild: windowsBuild ?? null,
    motherboard: motherboard ?? null,
    biosVersion: biosVersion ?? null,
    powerPlan,
    secureBoot,
    tpm,
    vbsMemoryIntegrity,
    findings,
  }
}