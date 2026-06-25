// ─── Process Collector ────────────────────────────────────────────────
import { measuredSource, findingId, type ProcessScanData, type RootCauseFinding } from '../types'
import { runPowerShell, safe } from './_shared'

// ── Known gaming-impact process categories ────────────────────────────
const PROCESS_CATEGORIES: Record<string, { category: ProcessScanData['processes'][0]['category']; impact: ProcessScanData['processes'][0]['impact']; note?: string }> = {
  'discord':       { category: 'overlay',  impact: 'low',    note: 'Discord overlay + voice chat' },
  'discordcanary': { category: 'overlay',  impact: 'low',    note: 'Discord Canary' },
  'discordptb':    { category: 'overlay',  impact: 'low',    note: 'Discord PTB' },
  'nvidiaoverlay': { category: 'overlay',  impact: 'low',    note: 'NVIDIA GeForce Experience overlay' },
  'nvcontainer':   { category: 'overlay',  impact: 'low',    note: 'NVIDIA container (ShadowPlay/overlay)' },
  'gamebar':       { category: 'overlay',  impact: 'medium', note: 'Xbox Game Bar overlay' },
  'xboxgamebar':   { category: 'overlay',  impact: 'medium', note: 'Xbox Game Bar' },
  'steam':         { category: 'launcher', impact: 'low',    note: 'Steam (close overlay in settings)' },
  'steamservice':  { category: 'launcher', impact: 'low',    note: 'Steam Service' },
  'chrome':        { category: 'browser',  impact: 'medium', note: 'Google Chrome (close during gaming)' },
  'msedge':        { category: 'browser',  impact: 'medium', note: 'Microsoft Edge' },
  'firefox':       { category: 'browser',  impact: 'medium', note: 'Firefox' },
  'onedrive':      { category: 'sync',     impact: 'medium', note: 'OneDrive sync (pause during gaming)' },
  'msmpeng':       { category: 'antivirus',impact: 'high',   note: 'Windows Defender (real-time scan active)' },
  'nzxtcam':       { category: 'rgb',      impact: 'low',    note: 'NZXT CAM (RGB + monitoring)' },
  'icue':          { category: 'rgb',      impact: 'low',    note: 'iCUE (Corsair RGB)' },
  'synapse3':      { category: 'rgb',      impact: 'low',    note: 'Razer Synapse' },
  'razer':         { category: 'rgb',      impact: 'low',    note: 'Razer software' },
  'obs64':         { category: 'recording',impact: 'high',   note: 'OBS Studio (recording/streaming)' },
  'obs32':         { category: 'recording',impact: 'high',   note: 'OBS Studio 32-bit' },
  'shadowplay':    { category: 'recording',impact: 'medium', note: 'NVIDIA ShadowPlay' },
  'epicgameslaun': { category: 'launcher', impact: 'low',    note: 'Epic Games Launcher' },
  'battlenet':     { category: 'launcher', impact: 'low',    note: 'Battle.net Launcher' },
  'riotclient':    { category: 'launcher', impact: 'low',    note: 'Riot Client (Valorant etc.)' },
}

// Known system processes to skip in findings
const SYSTEM_PROCESSES = new Set([
  'system', 'system idle process', 'smss.exe', 'csrss.exe',
  'wininit.exe', 'services.exe', 'lsass.exe', 'svchost.exe',
  'fontdrvhost.exe', 'dwm.exe', 'explorer.exe', 'taskhostw.exe',
  'registry', 'memory compression',
])

/** Upgrade impact by one severity level */
function upgradeImpact(
  impact: ProcessScanData['processes'][0]['impact'],
): ProcessScanData['processes'][0]['impact'] {
  const levels: ProcessScanData['processes'][0]['impact'][] = ['none', 'low', 'medium', 'high']
  const idx = levels.indexOf(impact)
  return levels[Math.min(idx + 1, levels.length - 1)]
}

export async function collectProcesses(): Promise<ProcessScanData> {
  const findings: RootCauseFinding[] = []
  const now = Date.now()

  const rawOutput = await safe(() =>
    runPowerShell(`
$procs = Get-Process | Where-Object { $_.WorkingSet64 -gt 10MB -or $_.CPU -gt 1 } |
  Select-Object Name, Id, CPU, @{N='WorkingSetMB';E={[math]::Round($_.WorkingSet64/1MB,1)}} |
  Sort-Object WorkingSetMB -Descending |
  Select-Object -First 50
$procs | ConvertTo-Json -Compress
    `.trim()),
  )

  if (!rawOutput) {
    return {
      module: 'processes',
      source: measuredSource('WMI/PowerShell', 0),
      processes: [],
      findings: [],
    }
  }

  let parsedProcs: Array<{ Name: string; Id: number; CPU: number; WorkingSetMB: number }> = []
  try {
    // Handle edge cases: empty string, null JSON, whitespace-only output
    const trimmed = (rawOutput ?? '').trim()
    if (!trimmed) {
      return {
        module: 'processes',
        source: measuredSource('WMI/PowerShell', 0),
        processes: [],
        findings: [],
      }
    }
    const parsed = JSON.parse(trimmed)
    // Guard against null (e.g. JSON.parse('null')) and non-array/non-object results
    if (parsed == null || (typeof parsed !== 'object' && typeof parsed !== 'number' && typeof parsed !== 'boolean')) {
      return {
        module: 'processes',
        source: measuredSource('WMI/PowerShell', 0),
        processes: [],
        findings: [],
      }
    }
    parsedProcs = Array.isArray(parsed) ? parsed : [parsed]
    // Filter out any entries that aren't valid objects with Name
    parsedProcs = parsedProcs.filter((p): p is NonNullable<typeof p> =>
      p != null && typeof p === 'object' && typeof (p as Record<string, unknown>).Name === 'string',
    )
  } catch {
    return {
      module: 'processes',
      source: measuredSource('WMI/PowerShell', 0.5),
      processes: [],
      findings: [{
        id: findingId(),
        title: 'Failed to parse process list',
        domain: 'processes',
        severity: 'warning',
        level: 'possible',
        confidence: 0.3,
        dataSource: 'measured',
        observed: {},
        sources: ['WMI/PowerShell'],
        recommendation: 'Could not parse process data. This may be a PowerShell version issue.',
        risk: 'low',
        timestamp: now,
      }],
    }
  }

  // ── Categorize processes ─────────────────────────────────────────────
  const processes = parsedProcs.map((p) => {
    const nameLower = p.Name.toLowerCase().replace(/\.exe$/i, '')

    // Try to find a known category
    let matched = false
    let category: ProcessScanData['processes'][0]['category'] = 'other'
    let impact: ProcessScanData['processes'][0]['impact'] = 'none'
    let note: string | undefined

    for (const [key, val] of Object.entries(PROCESS_CATEGORIES)) {
      if (nameLower.includes(key)) {
        category = val.category
        impact = val.impact
        note = val.note
        matched = true
        break
      }
    }

    // System processes
    if (!matched && SYSTEM_PROCESSES.has(nameLower)) {
      category = 'system'
      impact = 'none'
    }

    // Adjust impact based on actual CPU/RAM usage
    const cpuUsage = p.CPU ?? 0
    const ramUsage = p.WorkingSetMB ?? 0

    if (cpuUsage > 15 || ramUsage > 1000) {
      impact = 'high'
    } else if (cpuUsage > 5 || ramUsage > 500) {
      impact = upgradeImpact(impact)
    }

    return {
      name: p.Name,
      pid: p.Id,
      cpuUsage: Math.round(cpuUsage * 100) / 100,
      ramUsage: Math.round(ramUsage * 100) / 100,
      category,
      impact,
      note,
    }
  })

  // ── Generate findings ────────────────────────────────────────────────

  // Windows Defender running
  const defender = processes.find((p) => p.name.toLowerCase().includes('msmpeng'))
  if (defender) {
    findings.push({
      id: findingId(),
      title: 'Windows Defender real-time protection active',
      domain: 'processes',
      severity: 'info',
      level: 'confirmed',
      confidence: 0.95,
      dataSource: 'measured',
      observed: { defenderRamMB: defender.ramUsage, defenderCpu: defender.cpuUsage },
      sources: ['WMI/PowerShell'],
      recommendation:
        'Windows Defender real-time scanning can cause micro-stutters. Enable "Gaming Mode" in Windows Security to reduce scan frequency. Alternatively, add game directories to exclusions (reduces security).',
      risk: 'low',
      timestamp: now,
    })
  }

  // Recording software
  const recorders = processes.filter(
    (p) => p.category === 'recording' && p.impact === 'high',
  )
  for (const rec of recorders) {
    findings.push({
      id: findingId(),
      title: `Recording software active: ${rec.name}`,
      domain: 'processes',
      severity: 'warning',
      level: 'confirmed',
      confidence: 0.95,
      dataSource: 'measured',
      observed: { name: rec.name, ramMB: rec.ramUsage, cpuPercent: rec.cpuUsage },
      sources: ['WMI/PowerShell'],
      recommendation:
        `${rec.note ?? rec.name} is running and using significant resources. Close recording/streaming software during competitive matches for best performance.`,
      risk: 'medium',
      timestamp: now,
    })
  }

  // Browser with >5% CPU
  const heavyBrowsers = processes.filter(
    (p) => p.category === 'browser' && p.cpuUsage > 5,
  )
  for (const browser of heavyBrowsers) {
    findings.push({
      id: findingId(),
      title: `Browser using significant CPU: ${browser.name} (${browser.cpuUsage}%)`,
      domain: 'processes',
      severity: 'warning',
      level: 'confirmed',
      confidence: 0.95,
      dataSource: 'measured',
      observed: { name: browser.name, cpuPercent: browser.cpuUsage, ramMB: browser.ramUsage },
      sources: ['WMI/PowerShell'],
      recommendation:
        'Close browser tabs and the browser itself during competitive gaming. Modern browsers can consume significant CPU and RAM.',
      risk: 'medium',
      timestamp: now,
    })
  }

  // Any process with >10% CPU that isn't system/game
  const highCpuProcs = processes.filter(
    (p) => p.cpuUsage > 10 && p.category !== 'system' && p.category !== 'game',
  )
  for (const proc of highCpuProcs) {
    findings.push({
      id: findingId(),
      title: `High CPU process detected: ${proc.name} (${proc.cpuUsage}%)`,
      domain: 'processes',
      severity: 'warning',
      level: 'confirmed',
      confidence: 0.9,
      dataSource: 'measured',
      observed: { name: proc.name, cpuPercent: proc.cpuUsage, ramMB: proc.ramUsage, category: proc.category },
      sources: ['WMI/PowerShell'],
      recommendation:
        `${proc.name} is using ${proc.cpuUsage}% CPU. Consider closing it before gaming to free up CPU resources.`,
      risk: 'medium',
      timestamp: now,
    })
  }

  return {
    module: 'processes',
    source: measuredSource('WMI/PowerShell', 0.95),
    processes,
    findings,
  }
}