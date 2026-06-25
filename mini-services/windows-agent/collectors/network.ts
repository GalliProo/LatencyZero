// ─── Network Collector ────────────────────────────────────────────────
import { measuredSource, findingId, type NetworkScanData, type RootCauseFinding } from '../types'
import { runPowerShell, runCommand, safe } from './_shared'

// ── Parse ping output (Windows format) ────────────────────────────────
// "Minimum = 1ms, Maximum = 2ms, Average = 1ms"
// "Reply from 1.1.1.1: bytes=32 time=1ms TTL=57"
// "Request timed out."

interface PingResult {
  avgMs: number | null
  minMs: number | null
  maxMs: number | null
  allReplyMs: number[]
  packetLossPct: number
  timedOutCount: number
}

function parsePingOutput(output: string, totalPings: number): PingResult {
  const allReplyMs: number[] = []
  let timedOutCount = 0

  for (const line of output.split('\n')) {
    const trimmed = line.trim()

    // Match reply lines: "Reply from x.x.x.x: bytes=32 time=1ms TTL=57"
    const replyMatch = trimmed.match(/time[=<](\d+)ms/i)
    if (replyMatch) {
      allReplyMs.push(parseInt(replyMatch[1], 10))
    }

    if (trimmed.toLowerCase().includes('request timed out') || trimmed.toLowerCase().includes('destination host unreachable')) {
      timedOutCount++
    }
  }

  // Parse summary line
  let avgMs: number | null = null
  let minMs: number | null = null
  let maxMs: number | null = null

  const summaryMatch = output.match(/Minimum\s*=\s*(\d+)ms.*Maximum\s*=\s*(\d+)ms.*Average\s*=\s*(\d+)ms/i)
  if (summaryMatch) {
    minMs = parseInt(summaryMatch[1], 10)
    maxMs = parseInt(summaryMatch[2], 10)
    avgMs = parseInt(summaryMatch[3], 10)
  } else if (allReplyMs.length > 0) {
    // Fallback: compute from reply times
    avgMs = Math.round(allReplyMs.reduce((a, b) => a + b, 0) / allReplyMs.length)
    minMs = Math.min(...allReplyMs)
    maxMs = Math.max(...allReplyMs)
  }

  const packetLossPct = totalPings > 0 ? (timedOutCount / totalPings) * 100 : 0

  return { avgMs, minMs, maxMs, allReplyMs, packetLossPct, timedOutCount }
}

/** Standard deviation of an array of numbers */
function stdDev(values: number[]): number {
  if (values.length < 2) return 0
  const mean = values.reduce((a, b) => a + b, 0) / values.length
  const squaredDiffs = values.map((v) => (v - mean) ** 2)
  return Math.sqrt(squaredDiffs.reduce((a, b) => a + b, 0) / values.length)
}

/** Parse link speed string like "1 Gbps" or "866.7 Mbps" to Mbps */
function parseLinkSpeedMbps(speedStr: string): number {
  const gbpsMatch = speedStr.match(/([\d.]+)\s*Gbps/i)
  if (gbpsMatch) return parseFloat(gbpsMatch[1]) * 1000
  const mbpsMatch = speedStr.match(/([\d.]+)\s*Mbps/i)
  if (mbpsMatch) return parseFloat(mbpsMatch[1])
  return 0
}

/** Per-ping timeout in milliseconds (Windows ping -w flag uses ms) */
const PING_TIMEOUT_MS = 3000

export async function collectNetwork(): Promise<NetworkScanData> {
  const findings: RootCauseFinding[] = []
  const now = Date.now()
  const PING_COUNT = 4

  // ── Get active adapter info ──────────────────────────────────────────
  const adapterInfo = await safe(() =>
    runPowerShell(
      "Get-NetAdapter | Where-Object { $_.Status -eq 'Up' } | Select-Object -First 1 | Select-Object Name, InterfaceDescription, MediaType, LinkSpeed | ConvertTo-Json",
    ),
  )

  let adapterName: string | null = null
  let adapterType: 'ethernet' | 'wifi' | 'unknown' | null = null
  let linkSpeed: number | null = null

  if (adapterInfo) {
    try {
      const adapter = JSON.parse(adapterInfo)
      adapterName = adapter.Name ?? null
      const mediaType = (adapter.MediaType ?? '').toLowerCase()
      const linkSpeedStr = adapter.LinkSpeed ?? ''

      // Determine adapter type
      if (mediaType.includes('802.11') || adapterName?.toLowerCase().includes('wi-fi') || adapterName?.toLowerCase().includes('wifi')) {
        adapterType = 'wifi'
      } else if (mediaType.includes('802.3') || mediaType.includes('ethernet')) {
        adapterType = 'ethernet'
      } else {
        adapterType = 'unknown'
      }

      linkSpeed = parseLinkSpeedMbps(linkSpeedStr) || null
    } catch {
      // JSON parse failed
    }
  }

  // ── Get default gateway for ping target ──────────────────────────────
  const gatewayRaw = await safe(() =>
    runPowerShell(
      '(Get-NetRoute -DestinationPrefix "0.0.0.0/0" | Sort-Object RouteMetric | Select-Object -First 1).NextHop',
    ),
  )

  // ── Run ping tests in parallel (skip gateway if not detected) ───────
  const gatewayIp = gatewayRaw?.trim()
  const gatewayPingPromise = gatewayIp && gatewayIp.length > 0
    ? safe(() => runCommand('ping', ['-n', String(PING_COUNT), '-w', String(PING_TIMEOUT_MS), gatewayIp]))
    : Promise.resolve(null)

  const [gatewayPingOutput, ping11Output, ping88Output, dnsTimingRaw] = await Promise.all([
    gatewayPingPromise,
    safe(() => runCommand('ping', ['-n', String(PING_COUNT), '-w', String(PING_TIMEOUT_MS), '1.1.1.1'])),
    safe(() => runCommand('ping', ['-n', String(PING_COUNT), '-w', String(PING_TIMEOUT_MS), '8.8.8.8'])),
    safe(() =>
      runPowerShell("Measure-Command { Resolve-DnsName google.com -ErrorAction SilentlyContinue } | Select-Object -ExpandProperty TotalMilliseconds"),
    ),
  ])

  const gatewayPing = gatewayPingOutput ? parsePingOutput(gatewayPingOutput, PING_COUNT) : null
  const ping11 = ping11Output ? parsePingOutput(ping11Output, PING_COUNT) : null
  const ping88 = ping88Output ? parsePingOutput(ping88Output, PING_COUNT) : null

  const pingGateway = gatewayPing?.avgMs ?? null
  const ping1_1_1_1 = ping11?.avgMs ?? null
  const ping8_8_8_8 = ping88?.avgMs ?? null

  // Compute overall average and jitter from all collected ping replies
  const allReplyMs = [
    ...(gatewayPing?.allReplyMs ?? []),
    ...(ping11?.allReplyMs ?? []),
    ...(ping88?.allReplyMs ?? []),
  ]

  const avgPing = allReplyMs.length > 0
    ? Math.round(allReplyMs.reduce((a, b) => a + b, 0) / allReplyMs.length)
    : null

  const jitter = allReplyMs.length >= 2
    ? Math.round(stdDev(allReplyMs) * 100) / 100
    : null

  // Overall packet loss
  const totalTimedOut = [
    gatewayPing?.timedOutCount ?? 0,
    ping11?.timedOutCount ?? 0,
    ping88?.timedOutCount ?? 0,
  ].reduce((a, b) => a + b, 0)
  // Adjust total pings based on whether gateway ping was attempted
  const gatewayPingCount = (gatewayIp && gatewayIp.length > 0) ? PING_COUNT : 0
  const totalPings = PING_COUNT * 2 + gatewayPingCount
  const packetLoss = totalPings > 0 ? Math.round((totalTimedOut / totalPings) * 10000) / 100 : null

  // DNS timing
  const dnsTiming = dnsTimingRaw ? parseFloat(dnsTimingRaw) || null : null

  // ── Findings ─────────────────────────────────────────────────────────

  // Wi-Fi adapter
  if (adapterType === 'wifi') {
    findings.push({
      id: findingId(),
      title: 'Connected via Wi-Fi',
      domain: 'network',
      severity: 'info',
      level: 'confirmed',
      confidence: 0.95,
      dataSource: 'measured',
      observed: { adapterType: 'wifi', adapterName: adapterName ?? 'unknown' },
      sources: ['WMI/PowerShell'],
      recommendation:
        'For competitive gaming, use a wired Ethernet connection. Wi-Fi adds latency, jitter, and occasional packet loss even on fast networks.',
      risk: 'low',
      timestamp: now,
    })
  }

  // Avg ping > 60ms → high
  if (avgPing !== null && avgPing > 60) {
    findings.push({
      id: findingId(),
      title: `High average ping: ${avgPing}ms`,
      domain: 'network',
      severity: 'high',
      level: 'confirmed',
      confidence: 0.95,
      dataSource: 'measured',
      observed: { avgPing },
      sources: ['ping'],
      recommendation:
        'Average ping above 60ms will noticeably impact competitive gaming. Check for network congestion, bandwidth-heavy downloads, or consider a closer server/game region.',
      risk: 'high',
      timestamp: now,
    })
  }
  // Avg ping > 30ms → warning
  else if (avgPing !== null && avgPing > 30) {
    findings.push({
      id: findingId(),
      title: `Elevated average ping: ${avgPing}ms`,
      domain: 'network',
      severity: 'warning',
      level: 'confirmed',
      confidence: 0.95,
      dataSource: 'measured',
      observed: { avgPing },
      sources: ['ping'],
      recommendation:
        'Average ping above 30ms is borderline for competitive play. Consider wired connection, QoS settings on router, or checking for interference.',
      risk: 'medium',
      timestamp: now,
    })
  }

  // Jitter > 5ms
  if (jitter !== null && jitter > 5) {
    findings.push({
      id: findingId(),
      title: `High network jitter: ${jitter.toFixed(2)}ms`,
      domain: 'network',
      severity: 'warning',
      level: 'confirmed',
      confidence: 0.9,
      dataSource: 'measured',
      observed: { jitter },
      sources: ['ping'],
      recommendation:
        'High jitter causes inconsistent frame pacing and "teleporting" in games. Use a wired connection, enable QoS, and avoid shared networks during gaming.',
      risk: 'medium',
      timestamp: now,
    })
  }

  // Packet loss > 0%
  if (packetLoss !== null && packetLoss > 0) {
    findings.push({
      id: findingId(),
      title: `Packet loss detected: ${packetLoss}%`,
      domain: 'network',
      severity: 'high',
      level: 'confirmed',
      confidence: 0.95,
      dataSource: 'measured',
      observed: { packetLoss },
      sources: ['ping'],
      recommendation:
        'Any packet loss degrades gaming experience. Check cables, router health, and for Wi-Fi interference. Consider replacing old Ethernet cables.',
      risk: 'high',
      timestamp: now,
    })
  }

  // Link speed < 1 Gbps
  if (linkSpeed !== null && linkSpeed < 1000) {
    findings.push({
      id: findingId(),
      title: `Link speed below 1 Gbps: ${linkSpeed} Mbps`,
      domain: 'network',
      severity: 'info',
      level: 'confirmed',
      confidence: 0.95,
      dataSource: 'measured',
      observed: { linkSpeed },
      sources: ['WMI/PowerShell'],
      recommendation:
        'A link speed below 1 Gbps may limit performance. Ensure you are using a Cat5e or better Ethernet cable and a Gigabit-capable router/switch.',
      risk: 'low',
      timestamp: now,
    })
  }

  // If all pings failed completely, note it in findings
  if (allReplyMs.length === 0 && totalTimedOut > 0) {
    findings.push({
      id: findingId(),
      title: 'All network ping tests failed',
      domain: 'network',
      severity: 'high',
      level: 'confirmed',
      confidence: 0.95,
      dataSource: 'measured',
      observed: { totalTimedOut, targetsTested: 2 + (gatewayPingCount > 0 ? 1 : 0) },
      sources: ['ping'],
      recommendation: 'No ping responses were received. Check your network connection, firewall rules, and ensure you have internet connectivity.',
      risk: 'high',
      timestamp: now,
    })
  }

  return {
    module: 'network',
    source: measuredSource('PowerShell/ping', 0.95),
    adapterName,
    adapterType,
    linkSpeed,
    pingGateway,
    ping1_1_1_1,
    ping8_8_8_8,
    avgPing,
    jitter,
    packetLoss,
    dnsTiming,
    findings,
  }
}