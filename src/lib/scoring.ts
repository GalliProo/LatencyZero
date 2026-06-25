// ─── LatencyZero v2.0 — Scoring Engine ─────────────────────────────────
// Pure diagnostic logic. No UI, no animations.
// NEVER gives a high score based on simulated data.

import type {
  DataSourceInfo,
  DataSource,
  ScoreCategory,
  CategoryScore,
  OverallScore,
  LiveMetrics,
  SystemScanData,
  GPUScanData,
  NetworkScanData,
  ProcessScanData,
  DisplayScanData,
  ControllerScanData,
  LatencyMonData,
  PresentMonData,
} from '@/lib/types'
import { DPC_THRESHOLDS, ISR_THRESHOLDS, GPU_TEMP_THRESHOLDS } from '@/lib/types'

// ─── Helpers ──────────────────────────────────────────────────────────

/** Check if a data source is "real" (measured or imported) */
function isRealSource(source: DataSourceInfo | null | undefined): boolean {
  if (!source) return false
  return source.source === 'measured' || source.source === 'imported'
}

/** Check if a data source is simulated or unavailable */
function isNoData(source: DataSourceInfo | null | undefined): boolean {
  if (!source) return true
  return source.source === 'simulated' || source.source === 'unavailable'
}

/** Clamp a value between min and max */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

/** Linearly map a value from one range to a 0-100 score. Below good = 100, above critical = 0. */
function linearScore(
  value: number,
  goodThreshold: number,
  criticalThreshold: number,
  invert = false
): number {
  if (invert) {
    // For metrics where lower is better
    if (value <= goodThreshold) return 100
    if (value >= criticalThreshold) return 0
    return Math.round(100 * (1 - (value - goodThreshold) / (criticalThreshold - goodThreshold)))
  }
  // For metrics where higher is better
  if (value >= goodThreshold) return 100
  if (value <= criticalThreshold) return 0
  return Math.round(100 * ((value - criticalThreshold) / (goodThreshold - criticalThreshold)))
}

/** Average confidence from a list of DataSourceInfo, ignoring nulls */
function avgConfidence(sources: Array<DataSourceInfo | null | undefined>): number {
  const valid = sources.filter((s): s is DataSourceInfo => s != null && isRealSource(s))
  if (valid.length === 0) return 0
  return valid.reduce((sum, s) => sum + s.confidence, 0) / valid.length
}

// ─── Category Scorers ─────────────────────────────────────────────────

function scoreKernelLatency(
  liveMetrics: LiveMetrics | null,
  latencyMonData: LatencyMonData | null
): CategoryScore {
  const issues: string[] = []
  let score = -1
  let confidence = 0
  let source: DataSource = 'unavailable'
  let finding = 'No kernel latency data available.'

  // Determine if we have real data from either source
  const liveDpcReal = liveMetrics && isRealSource(liveMetrics.source)
  const lmReal = latencyMonData !== null

  // Check if ALL available sources are simulated
  const liveDpcSimulated = liveMetrics && isNoData(liveMetrics.source)
  const allSimulated = liveMetrics === null || liveDpcSimulated

  if (allSimulated && !lmReal) {
    return {
      category: 'kernel_latency',
      label: 'Kernel Latency',
      score: -1,
      source: 'unavailable',
      confidence: 0,
      issues: [],
      finding: 'Insufficient real data. Only simulated data present.',
    }
  }

  // Gather real metrics
  let maxDpcUs = Infinity
  let maxIsrUs = Infinity
  let avgDpcUs = 0
  let avgIsrUs = 0
  let hasRealDpc = false
  let hasRealIsr = false

  if (liveDpcReal) {
    source = liveMetrics.source.source
    confidence = liveMetrics.source.confidence

    if (liveMetrics.dpc.max.value !== null) {
      maxDpcUs = liveMetrics.dpc.max.value
      hasRealDpc = true
    }
    if (liveMetrics.dpc.avg.value !== null) {
      avgDpcUs = liveMetrics.dpc.avg.value
    }
    if (liveMetrics.isr.max.value !== null) {
      maxIsrUs = liveMetrics.isr.max.value
      hasRealIsr = true
    }
    if (liveMetrics.isr.avg.value !== null) {
      avgIsrUs = liveMetrics.isr.avg.value
    }
  }

  if (lmReal && latencyMonData) {
    // LatencyMon data is imported = real
    source = 'imported'
    if (isRealSource(liveMetrics?.source)) {
      // Prefer measured if both are available
      source = 'measured'
    }
    // LatencyMon provides highest values which are critical
    if (latencyMonData.highestDpcExecutionTime > 0) {
      maxDpcUs = Math.min(maxDpcUs, latencyMonData.highestDpcExecutionTime)
      hasRealDpc = true
    }
    if (latencyMonData.highestIsrExecutionTime > 0) {
      maxIsrUs = Math.min(maxIsrUs, latencyMonData.highestIsrExecutionTime)
      hasRealIsr = true
    }
    // Boost confidence for imported data
    confidence = Math.max(confidence, 0.85)
  }

  if (!hasRealDpc && !hasRealIsr) {
    return {
      category: 'kernel_latency',
      label: 'Kernel Latency',
      score: -1,
      source: 'unavailable',
      confidence: 0,
      issues: [],
      finding: 'Insufficient real data. Only simulated data present.',
    }
  }

  // Score DPC execution time
  let dpcScore = 100
  if (hasRealDpc) {
    dpcScore = linearScore(maxDpcUs, DPC_THRESHOLDS.good, DPC_THRESHOLDS.high, true)
    if (maxDpcUs > DPC_THRESHOLDS.high) {
      issues.push(`Critical DPC spike: ${maxDpcUs.toFixed(0)}µs (threshold: ${DPC_THRESHOLDS.high}µs)`)
    } else if (maxDpcUs > DPC_THRESHOLDS.warning) {
      issues.push(`High DPC latency: ${maxDpcUs.toFixed(0)}µs (threshold: ${DPC_THRESHOLDS.warning}µs)`)
    } else if (maxDpcUs > DPC_THRESHOLDS.lightWarning) {
      issues.push(`Elevated DPC: ${maxDpcUs.toFixed(0)}µs (threshold: ${DPC_THRESHOLDS.lightWarning}µs)`)
    }
  }

  // Score ISR execution time
  let isrScore = 100
  if (hasRealIsr) {
    isrScore = linearScore(maxIsrUs, ISR_THRESHOLDS.good, ISR_THRESHOLDS.high, true)
    if (maxIsrUs > ISR_THRESHOLDS.high) {
      issues.push(`Critical ISR spike: ${maxIsrUs.toFixed(0)}µs (threshold: ${ISR_THRESHOLDS.high}µs)`)
    } else if (maxIsrUs > ISR_THRESHOLDS.warning) {
      issues.push(`High ISR latency: ${maxIsrUs.toFixed(0)}µs (threshold: ${ISR_THRESHOLDS.warning}µs)`)
    }
  }

  // Combine: DPC weighted more heavily (kernel latency is dominated by DPC)
  score = hasRealDpc && hasRealIsr
    ? Math.round(dpcScore * 0.65 + isrScore * 0.35)
    : hasRealDpc
      ? dpcScore
      : isrScore

  score = clamp(score, 0, 100)

  // Identify problematic drivers from LatencyMon
  if (lmReal && latencyMonData) {
    const badDrivers = latencyMonData.drivers.filter(
      (d) => d.severity === 'critical' || d.severity === 'warning'
    )
    for (const driver of badDrivers.slice(0, 3)) {
      issues.push(`${driver.severity === 'critical' ? 'Critical' : 'Warning'} driver: ${driver.module} (DPC: ${driver.dpcTime.toFixed(0)}µs, ISR: ${driver.isrTime.toFixed(0)}µs)`)
    }
  }

  if (issues.length === 0) {
    finding = `Kernel latency is excellent. Max DPC: ${hasRealDpc ? maxDpcUs.toFixed(0) + 'µs' : 'N/A'}, Max ISR: ${hasRealIsr ? maxIsrUs.toFixed(0) + 'µs' : 'N/A'}.`
  } else {
    finding = `Kernel latency has ${issues.length} issue(s). ${issues[0]}`
  }

  return {
    category: 'kernel_latency',
    label: 'Kernel Latency',
    score,
    source,
    confidence,
    issues,
    finding,
  }
}

function scoreFramePacing(
  liveMetrics: LiveMetrics | null,
  presentMonData: PresentMonData | null
): CategoryScore {
  const issues: string[] = []
  let score = -1
  let confidence = 0
  let source: DataSource = 'unavailable'
  let finding = 'No frame pacing data available.'

  const liveReal = liveMetrics && isRealSource(liveMetrics.source)
  const pmReal = presentMonData !== null

  if (!liveReal && !pmReal) {
    return {
      category: 'frame_pacing',
      label: 'Frame Pacing',
      score: -1,
      source: 'unavailable',
      confidence: 0,
      issues: [],
      finding: 'Insufficient real data. Only simulated data present.',
    }
  }

  // Gather frame time data
  let p95Ms: number | null = null
  let p99Ms: number | null = null
  let onePercentLowMs: number | null = null
  let pointOnePercentLowMs: number | null = null
  let avgFrameTimeMs: number | null = null
  let avgFps: number | null = null
  let droppedFrames: number | null = null

  if (liveReal) {
    source = liveMetrics.source.source
    confidence = liveMetrics.source.confidence

    if (liveMetrics.frameTime.p95.value !== null) p95Ms = liveMetrics.frameTime.p95.value
    if (liveMetrics.frameTime.p99.value !== null) p99Ms = liveMetrics.frameTime.p99.value
    if (liveMetrics.frameTime.min1pct.value !== null) onePercentLowMs = liveMetrics.frameTime.min1pct.value
    if (liveMetrics.frameTime.min01pct.value !== null) pointOnePercentLowMs = liveMetrics.frameTime.min01pct.value
    if (liveMetrics.frameTime.avg.value !== null) avgFrameTimeMs = liveMetrics.frameTime.avg.value
    if (liveMetrics.fps.avg.value !== null) avgFps = liveMetrics.fps.avg.value
  }

  if (pmReal && presentMonData) {
    source = 'imported'
    if (liveReal) source = liveMetrics.source.source

    if (presentMonData.frameTimeP95 > 0) p95Ms = p95Ms ?? presentMonData.frameTimeP95
    if (presentMonData.frameTimeP99 > 0) p99Ms = p99Ms ?? presentMonData.frameTimeP99
    if (presentMonData.avgFps > 0) avgFps = avgFps ?? presentMonData.avgFps
    if (presentMonData.avgFrameTime > 0) avgFrameTimeMs = avgFrameTimeMs ?? presentMonData.avgFrameTime
    if (presentMonData.droppedFrames !== null) droppedFrames = presentMonData.droppedFrames

    // PresentMon gives 1% low / 0.1% low as FPS, convert to frame time
    if (presentMonData.onePercentLow > 0) {
      const ft = 1000 / presentMonData.onePercentLow
      onePercentLowMs = onePercentLowMs ?? ft
    }
    if (presentMonData.pointOnePercentLow > 0) {
      const ft = 1000 / presentMonData.pointOnePercentLow
      pointOnePercentLowMs = pointOnePercentLowMs ?? ft
    }

    confidence = Math.max(confidence, 0.85)
  }

  // Calculate frame budget for reference
  const frameBudgetMs = avgFps && avgFps > 0 ? 1000 / avgFps : null

  // Score based on how much frame times deviate
  const scoreComponents: number[] = []

  // P95 score: p95 should be within 150% of frame budget
  if (p95Ms !== null && frameBudgetMs !== null) {
    const ratio = p95Ms / frameBudgetMs
    if (ratio <= 1.2) scoreComponents.push(100)
    else if (ratio <= 1.5) scoreComponents.push(Math.round(100 - (ratio - 1.2) * 200))
    else if (ratio <= 2.5) scoreComponents.push(Math.round(40 - (ratio - 1.5) * 30))
    else scoreComponents.push(5)

    if (ratio > 2.0) {
      issues.push(`P95 frame time (${p95Ms.toFixed(1)}ms) is ${(ratio * 100).toFixed(0)}% of frame budget (${frameBudgetMs.toFixed(1)}ms)`)
    } else if (ratio > 1.5) {
      issues.push(`P95 frame time (${p95Ms.toFixed(1)}ms) exceeds 1.5× frame budget`)
    }
  } else if (p95Ms !== null) {
    // No frame budget, use absolute thresholds
    // Good: <12ms (83fps), Critical: >50ms (20fps)
    const s = linearScore(p95Ms, 12, 50, true)
    scoreComponents.push(s)
    if (p95Ms > 33.3) {
      issues.push(`P95 frame time ${p95Ms.toFixed(1)}ms exceeds 30fps equivalent`)
    }
  }

  // P99 score: much more sensitive
  if (p99Ms !== null && frameBudgetMs !== null) {
    const ratio = p99Ms / frameBudgetMs
    if (ratio <= 1.5) scoreComponents.push(100)
    else if (ratio <= 2.5) scoreComponents.push(Math.round(100 - (ratio - 1.5) * 100))
    else if (ratio <= 4.0) scoreComponents.push(Math.round(50 - (ratio - 2.5) * 25))
    else scoreComponents.push(5)

    if (ratio > 3.0) {
      issues.push(`P99 frame time (${p99Ms.toFixed(1)}ms) is ${(ratio * 100).toFixed(0)}% of frame budget — severe stuttering`)
    } else if (ratio > 2.0) {
      issues.push(`P99 frame time (${p99Ms.toFixed(1)}ms) is ${(ratio * 100).toFixed(0)}% of frame budget`)
    }
  } else if (p99Ms !== null) {
    const s = linearScore(p99Ms, 16.6, 66, true)
    scoreComponents.push(s)
    if (p99Ms > 50) {
      issues.push(`P99 frame time ${p99Ms.toFixed(1)}ms indicates significant stuttering`)
    }
  }

  // 1% low score
  if (onePercentLowMs !== null) {
    if (onePercentLowMs > 50) {
      scoreComponents.push(10)
      issues.push(`1% low frame time ${onePercentLowMs.toFixed(1)}ms — consistent micro-stutters`)
    } else if (onePercentLowMs > 33.3) {
      scoreComponents.push(40)
      issues.push(`1% low frame time ${onePercentLowMs.toFixed(1)}ms — occasional drops below 30fps`)
    } else if (onePercentLowMs > 20) {
      scoreComponents.push(70)
      issues.push(`1% low frame time ${onePercentLowMs.toFixed(1)}ms — minor frame drops`)
    } else {
      scoreComponents.push(95)
    }
  }

  // 0.1% low score
  if (pointOnePercentLowMs !== null) {
    if (pointOnePercentLowMs > 100) {
      scoreComponents.push(0)
      issues.push(`0.1% low frame time ${pointOnePercentLowMs.toFixed(1)}ms — extreme frame spike`)
    } else if (pointOnePercentLowMs > 50) {
      scoreComponents.push(20)
      issues.push(`0.1% low frame time ${pointOnePercentLowMs.toFixed(1)}ms — severe stutter`)
    } else {
      scoreComponents.push(85)
    }
  }

  // Dropped frames
  if (droppedFrames !== null && avgFps && avgFps > 0) {
    const dropRate = droppedFrames / (avgFps * 60) // Approximate for 60s session
    if (dropRate > 0.05) {
      scoreComponents.push(20)
      issues.push(`${droppedFrames} dropped frames detected (${(dropRate * 100).toFixed(1)}% drop rate)`)
    } else if (dropRate > 0.01) {
      scoreComponents.push(60)
      issues.push(`${droppedFrames} dropped frames detected`)
    }
  }

  if (scoreComponents.length > 0) {
    score = Math.round(scoreComponents.reduce((a, b) => a + b, 0) / scoreComponents.length)
    score = clamp(score, 0, 100)
  }

  if (issues.length === 0 && score >= 0) {
    finding = `Frame pacing is excellent. P95: ${p95Ms?.toFixed(1) ?? 'N/A'}ms, P99: ${p99Ms?.toFixed(1) ?? 'N/A'}ms.`
  } else if (score >= 0) {
    finding = `Frame pacing has ${issues.length} issue(s). ${issues[0]}`
  }

  return {
    category: 'frame_pacing',
    label: 'Frame Pacing',
    score,
    source,
    confidence,
    issues,
    finding,
  }
}

function scoreGPUStability(
  liveMetrics: LiveMetrics | null,
  gpuInfo: GPUScanData | null
): CategoryScore {
  const issues: string[] = []
  let score = -1
  let confidence = 0
  let source: DataSource = 'unavailable'
  let finding = 'No GPU stability data available.'

  const liveReal = liveMetrics && isRealSource(liveMetrics.source)
  const scanReal = gpuInfo !== null && isRealSource(gpuInfo.source)

  if (!liveReal && !scanReal) {
    return {
      category: 'gpu_stability',
      label: 'GPU Stability',
      score: -1,
      source: 'unavailable',
      confidence: 0,
      issues: [],
      finding: 'Insufficient real data. Only simulated data present.',
    }
  }

  // Gather GPU data
  let temperature: number | null = null
  let temperatureHotspot: number | null = null
  let throttleReason: string | null = null
  let gpuClock: number | null = null
  let gpuUsage: number | null = null
  let vramUsage: number | null = null
  let vramTotal: number | null = null
  let powerDraw: number | null = null
  let powerLimit: number | null = null

  if (liveReal) {
    source = liveMetrics.source.source
    confidence = liveMetrics.source.confidence
    if (liveMetrics.hardware.gpu.temp.value !== null) temperature = liveMetrics.hardware.gpu.temp.value
    if (liveMetrics.hardware.gpu.clock.value !== null) gpuClock = liveMetrics.hardware.gpu.clock.value
    if (liveMetrics.hardware.gpu.usage.value !== null) gpuUsage = liveMetrics.hardware.gpu.usage.value
    if (liveMetrics.hardware.gpu.vram.value !== null) vramUsage = liveMetrics.hardware.gpu.vram.value
  }

  if (scanReal && gpuInfo) {
    source = 'measured'
    if (liveReal && liveMetrics.source.source === 'imported') {
      // Prefer measured over imported
    }
    confidence = Math.max(confidence, gpuInfo.source.confidence)

    if (gpuInfo.temperature !== null) temperature = temperature ?? gpuInfo.temperature
    if (gpuInfo.temperatureHotspot !== null) temperatureHotspot = gpuInfo.temperatureHotspot
    if (gpuInfo.throttleReason !== null) throttleReason = gpuInfo.throttleReason
    if (gpuInfo.gpuClock !== null) gpuClock = gpuClock ?? gpuInfo.gpuClock
    if (gpuInfo.gpuUsage !== null) gpuUsage = gpuUsage ?? gpuInfo.gpuUsage
    if (gpuInfo.vramUsage !== null) vramUsage = vramUsage ?? gpuInfo.vramUsage
    if (gpuInfo.vramTotal !== null) vramTotal = gpuInfo.vramTotal
    if (gpuInfo.powerDraw !== null) powerDraw = gpuInfo.powerDraw
    if (gpuInfo.powerLimit !== null) powerLimit = gpuInfo.powerLimit
  }

  const scoreComponents: number[] = []

  // Temperature scoring
  if (temperature !== null) {
    const tempScore = linearScore(temperature, GPU_TEMP_THRESHOLDS.good, GPU_TEMP_THRESHOLDS.high, true)
    scoreComponents.push(tempScore)

    if (temperature >= GPU_TEMP_THRESHOLDS.high) {
      issues.push(`GPU temperature critical: ${temperature}°C (threshold: ${GPU_TEMP_THRESHOLDS.high}°C)`)
    } else if (temperature >= GPU_TEMP_THRESHOLDS.warning) {
      issues.push(`GPU temperature high: ${temperature}°C (threshold: ${GPU_TEMP_THRESHOLDS.warning}°C)`)
    } else if (temperature >= GPU_TEMP_THRESHOLDS.lightWarning) {
      issues.push(`GPU temperature elevated: ${temperature}°C`)
    }
  }

  // Hotspot temperature
  if (temperatureHotspot !== null) {
    if (temperatureHotspot >= GPU_TEMP_THRESHOLDS.hotspotCritical) {
      scoreComponents.push(0)
      issues.push(`GPU hotspot critical: ${temperatureHotspot}°C`)
    } else if (temperatureHotspot >= GPU_TEMP_THRESHOLDS.high) {
      scoreComponents.push(30)
      issues.push(`GPU hotspot high: ${temperatureHotspot}°C`)
    } else {
      scoreComponents.push(90)
    }
  }

  // Throttle check
  if (throttleReason !== null && throttleReason !== '' && throttleReason !== 'none') {
    scoreComponents.push(5)
    issues.push(`GPU throttling detected: ${throttleReason}`)
  } else if (throttleReason === 'none' || throttleReason === null) {
    // No throttle is good
    scoreComponents.push(100)
  }

  // Power headroom
  if (powerDraw !== null && powerLimit !== null && powerLimit > 0) {
    const powerRatio = powerDraw / powerLimit
    if (powerRatio > 0.95) {
      scoreComponents.push(60)
      issues.push(`GPU power draw near limit: ${(powerRatio * 100).toFixed(0)}%`)
    } else {
      scoreComponents.push(95)
    }
  }

  // VRAM usage
  if (vramUsage !== null && vramTotal !== null && vramTotal > 0) {
    const vramRatio = vramUsage / vramTotal
    if (vramRatio > 0.95) {
      scoreComponents.push(40)
      issues.push(`VRAM nearly full: ${(vramRatio * 100).toFixed(0)}% used`)
    } else if (vramRatio > 0.85) {
      scoreComponents.push(70)
      issues.push(`VRAM usage high: ${(vramRatio * 100).toFixed(0)}% used`)
    } else {
      scoreComponents.push(95)
    }
  }

  if (scoreComponents.length > 0) {
    // Throttle is a heavy penalty — if throttling, minimum score of 30
    score = Math.round(scoreComponents.reduce((a, b) => a + b, 0) / scoreComponents.length)
    score = clamp(score, 0, 100)
  }

  if (issues.length === 0 && score >= 0) {
    finding = `GPU stability is excellent. Temp: ${temperature?.toFixed(0) ?? 'N/A'}°C, No throttling detected.`
  } else if (score >= 0) {
    finding = `GPU stability has ${issues.length} issue(s). ${issues[0]}`
  }

  return {
    category: 'gpu_stability',
    label: 'GPU Stability',
    score,
    source,
    confidence,
    issues,
    finding,
  }
}

function scoreNetworkQuality(
  liveMetrics: LiveMetrics | null,
  networkInfo: NetworkScanData | null
): CategoryScore {
  const issues: string[] = []
  let score = -1
  let confidence = 0
  let source: DataSource = 'unavailable'
  let finding = 'No network quality data available.'

  const liveReal = liveMetrics && isRealSource(liveMetrics.source)
  const scanReal = networkInfo !== null && isRealSource(networkInfo.source)

  if (!liveReal && !scanReal) {
    return {
      category: 'network_quality',
      label: 'Network Quality',
      score: -1,
      source: 'unavailable',
      confidence: 0,
      issues: [],
      finding: 'Insufficient real data. Only simulated data present.',
    }
  }

  let ping: number | null = null
  let jitter: number | null = null
  let packetLoss: number | null = null

  if (liveReal) {
    source = liveMetrics.source.source
    confidence = liveMetrics.source.confidence
    if (liveMetrics.network.ping.value !== null) ping = liveMetrics.network.ping.value
    if (liveMetrics.network.jitter.value !== null) jitter = liveMetrics.network.jitter.value
    if (liveMetrics.network.packetLoss.value !== null) packetLoss = liveMetrics.network.packetLoss.value
  }

  if (scanReal && networkInfo) {
    source = 'measured'
    confidence = Math.max(confidence, networkInfo.source.confidence)

    // Use avgPing from scan if live doesn't have it
    if (networkInfo.avgPing !== null) ping = ping ?? networkInfo.avgPing
    if (networkInfo.jitter !== null) jitter = jitter ?? networkInfo.jitter
    if (networkInfo.packetLoss !== null) packetLoss = packetLoss ?? networkInfo.packetLoss

    // Use best ping available
    if (networkInfo.ping1_1_1_1 !== null && (ping === null || networkInfo.ping1_1_1_1 < ping)) {
      // Keep live ping if available (more relevant to game server)
    }
  }

  const scoreComponents: number[] = []

  // Ping scoring
  if (ping !== null) {
    // Good: <20ms, Warning: >50ms, Critical: >100ms
    if (ping <= 15) scoreComponents.push(100)
    else if (ping <= 30) scoreComponents.push(90)
    else if (ping <= 50) scoreComponents.push(70)
    else if (ping <= 80) scoreComponents.push(45)
    else if (ping <= 100) scoreComponents.push(25)
    else scoreComponents.push(10)

    if (ping > 100) {
      issues.push(`Very high ping: ${ping.toFixed(0)}ms — unsuitable for competitive play`)
    } else if (ping > 50) {
      issues.push(`High ping: ${ping.toFixed(0)}ms — noticeable input delay`)
    } else if (ping > 30) {
      issues.push(`Elevated ping: ${ping.toFixed(0)}ms`)
    }
  }

  // Jitter scoring
  if (jitter !== null) {
    // Good: <2ms, Warning: >10ms, Critical: >30ms
    if (jitter <= 2) scoreComponents.push(100)
    else if (jitter <= 5) scoreComponents.push(85)
    else if (jitter <= 10) scoreComponents.push(60)
    else if (jitter <= 20) scoreComponents.push(30)
    else scoreComponents.push(10)

    if (jitter > 20) {
      issues.push(`Very high jitter: ${jitter.toFixed(1)}ms — unstable connection`)
    } else if (jitter > 10) {
      issues.push(`High jitter: ${jitter.toFixed(1)}ms — inconsistent latency`)
    } else if (jitter > 5) {
      issues.push(`Elevated jitter: ${jitter.toFixed(1)}ms`)
    }
  }

  // Packet loss scoring
  if (packetLoss !== null) {
    // packetLoss is a percentage (0-100)
    const lossPercent = packetLoss
    if (lossPercent <= 0) scoreComponents.push(100)
    else if (lossPercent <= 0.1) scoreComponents.push(85)
    else if (lossPercent <= 0.5) scoreComponents.push(60)
    else if (lossPercent <= 1.0) scoreComponents.push(35)
    else if (lossPercent <= 3.0) scoreComponents.push(15)
    else scoreComponents.push(0)

    if (lossPercent > 1.0) {
      issues.push(`Significant packet loss: ${lossPercent.toFixed(1)}% — teleports and rubber-banding likely`)
    } else if (lossPercent > 0.1) {
      issues.push(`Packet loss detected: ${lossPercent.toFixed(2)}%`)
    }
  }

  // WiFi penalty if detected
  if (scanReal && networkInfo?.adapterType === 'wifi') {
    scoreComponents.push(70) // WiFi is inherently worse than ethernet
    issues.push('Using WiFi — ethernet recommended for competitive play')
  }

  if (scoreComponents.length > 0) {
    score = Math.round(scoreComponents.reduce((a, b) => a + b, 0) / scoreComponents.length)
    score = clamp(score, 0, 100)
  }

  if (issues.length === 0 && score >= 0) {
    finding = `Network quality is excellent. Ping: ${ping?.toFixed(0) ?? 'N/A'}ms, Jitter: ${jitter?.toFixed(1) ?? 'N/A'}ms, No packet loss.`
  } else if (score >= 0) {
    finding = `Network quality has ${issues.length} issue(s). ${issues[0]}`
  }

  return {
    category: 'network_quality',
    label: 'Network Quality',
    score,
    source,
    confidence,
    issues,
    finding,
  }
}

function scoreControllerInput(controllerInfo: ControllerScanData | null): CategoryScore {
  const issues: string[] = []
  let score = -1
  let confidence = 0
  let source: DataSource = 'unavailable'
  let finding = 'No controller input data available.'

  if (!controllerInfo || isNoData(controllerInfo.source)) {
    return {
      category: 'controller_input',
      label: 'Controller Input',
      score: -1,
      source: 'unavailable',
      confidence: 0,
      issues: [],
      finding: 'Controller input data unavailable.',
    }
  }

  source = controllerInfo.source.source
  confidence = controllerInfo.source.confidence

  const scoreComponents: number[] = []

  // Transport type scoring
  if (controllerInfo.transport !== null) {
    switch (controllerInfo.transport) {
      case 'usb':
        scoreComponents.push(100)
        break
      case 'wireless':
        scoreComponents.push(85)
        issues.push('Wireless controller — verify 2.4GHz dongle for lowest latency')
        break
      case 'bluetooth':
        scoreComponents.push(50)
        issues.push('Bluetooth controller — higher latency than USB/wireless dongle')
        break
      case 'unknown':
        scoreComponents.push(60)
        break
    }
  }

  // API scoring
  if (controllerInfo.api !== null) {
    switch (controllerInfo.api) {
      case 'xinput':
        scoreComponents.push(100)
        break
      case 'gameinput':
        scoreComponents.push(90)
        break
      case 'hid':
        scoreComponents.push(60)
        issues.push('HID API — consider enabling XInput for lower input latency')
        break
      case 'unknown':
        scoreComponents.push(70)
        break
    }
  }

  // Polling rate scoring
  if (controllerInfo.avgPollingMs !== null) {
    const pollingHz = 1000 / controllerInfo.avgPollingMs
    if (pollingHz >= 1000) {
      scoreComponents.push(100)
    } else if (pollingHz >= 500) {
      scoreComponents.push(85)
    } else if (pollingHz >= 250) {
      scoreComponents.push(65)
      issues.push(`Polling rate ${pollingHz.toFixed(0)}Hz — upgrade to 1000Hz for competitive advantage`)
    } else if (pollingHz >= 125) {
      scoreComponents.push(40)
      issues.push(`Low polling rate ${pollingHz.toFixed(0)}Hz — significant input delay`)
    } else {
      scoreComponents.push(15)
      issues.push(`Very low polling rate ${pollingHz.toFixed(0)}Hz — major input latency`)
    }
  }

  // P95 polling consistency
  if (controllerInfo.p95PollingMs !== null && controllerInfo.avgPollingMs !== null) {
    const consistency = controllerInfo.avgPollingMs / controllerInfo.p95PollingMs
    if (consistency < 0.8) {
      scoreComponents.push(40)
      issues.push(`Polling rate inconsistent: avg ${controllerInfo.avgPollingMs.toFixed(1)}ms vs p95 ${controllerInfo.p95PollingMs.toFixed(1)}ms`)
    } else {
      scoreComponents.push(90)
    }
  }

  // Input jitter
  if (controllerInfo.inputJitterMs !== null) {
    if (controllerInfo.inputJitterMs > 2) {
      scoreComponents.push(40)
      issues.push(`High input jitter: ${controllerInfo.inputJitterMs.toFixed(1)}ms`)
    } else if (controllerInfo.inputJitterMs > 0.5) {
      scoreComponents.push(75)
      issues.push(`Elevated input jitter: ${controllerInfo.inputJitterMs.toFixed(2)}ms`)
    } else {
      scoreComponents.push(95)
    }
  }

  // Drop rate
  if (controllerInfo.estimatedDropRate !== null) {
    if (controllerInfo.estimatedDropRate > 0.01) {
      scoreComponents.push(20)
      issues.push(`Input drop rate: ${(controllerInfo.estimatedDropRate * 100).toFixed(2)}%`)
    } else if (controllerInfo.estimatedDropRate > 0.001) {
      scoreComponents.push(60)
    } else {
      scoreComponents.push(95)
    }
  }

  if (scoreComponents.length > 0) {
    score = Math.round(scoreComponents.reduce((a, b) => a + b, 0) / scoreComponents.length)
    score = clamp(score, 0, 100)
  }

  if (issues.length === 0 && score >= 0) {
    finding = `Controller input is excellent. ${controllerInfo.controllerName ?? 'Unknown controller'} via ${controllerInfo.transport ?? 'unknown'}.`
  } else if (score >= 0) {
    finding = `Controller input has ${issues.length} issue(s). ${issues[0]}`
  }

  return {
    category: 'controller_input',
    label: 'Controller Input',
    score,
    source,
    confidence,
    issues,
    finding,
  }
}

function scoreDisplayConfig(displayInfo: DisplayScanData | null): CategoryScore {
  const issues: string[] = []
  let score = -1
  let confidence = 0
  let source: DataSource = 'unavailable'
  let finding = 'No display configuration data available.'

  if (!displayInfo || isNoData(displayInfo.source)) {
    return {
      category: 'display_config',
      label: 'Display Config',
      score: -1,
      source: 'unavailable',
      confidence: 0,
      issues: [],
      finding: 'Display configuration data unavailable.',
    }
  }

  source = displayInfo.source.source
  confidence = displayInfo.source.confidence

  const scoreComponents: number[] = []

  // Refresh rate scoring
  if (displayInfo.activeRefreshHz !== null) {
    if (displayInfo.activeRefreshHz >= 240) {
      scoreComponents.push(100)
    } else if (displayInfo.activeRefreshHz >= 180) {
      scoreComponents.push(92)
    } else if (displayInfo.activeRefreshHz >= 144) {
      scoreComponents.push(80)
    } else if (displayInfo.activeRefreshHz >= 120) {
      scoreComponents.push(65)
      issues.push(`${displayInfo.activeRefreshHz}Hz — consider 144Hz+ for competitive advantage`)
    } else if (displayInfo.activeRefreshHz >= 60) {
      scoreComponents.push(35)
      issues.push(`${displayInfo.activeRefreshHz}Hz — significant competitive disadvantage`)
    } else {
      scoreComponents.push(10)
      issues.push(`Low refresh rate: ${displayInfo.activeRefreshHz}Hz`)
    }
  }

  // Refresh rate match (active vs max)
  if (displayInfo.activeRefreshHz !== null && displayInfo.maxRefreshHz !== null) {
    if (displayInfo.activeRefreshHz < displayInfo.maxRefreshHz) {
      scoreComponents.push(50)
      issues.push(`Display running at ${displayInfo.activeRefreshHz}Hz but supports ${displayInfo.maxRefreshHz}Hz — enable maximum refresh rate`)
    } else {
      scoreComponents.push(100)
    }
  }

  // VRR status
  if (displayInfo.vrrEnabled !== null) {
    if (displayInfo.vrrEnabled) {
      scoreComponents.push(95)
      // Note the type for reference
      if (displayInfo.vrrType === 'g-sync') {
        // Good
      } else if (displayInfo.vrrType === 'freesync') {
        // Also good
      }
    } else {
      scoreComponents.push(60)
      if (displayInfo.vrrType === null) {
        issues.push('VRR not detected — enable G-Sync/FreeSync for smoother frame delivery')
      } else {
        issues.push(`VRR available (${displayInfo.vrrType}) but not enabled`)
      }
    }
  }

  // HDR scoring (for gaming, HDR can add latency on some panels)
  if (displayInfo.hdrEnabled !== null) {
    if (displayInfo.hdrEnabled) {
      scoreComponents.push(70)
      issues.push('HDR enabled — may add input latency on some displays. Disable for competitive play if latency is a concern.')
    } else {
      scoreComponents.push(100)
    }
  }

  // Multi-monitor penalty
  if (displayInfo.multiMonitor === true) {
    scoreComponents.push(70)
    issues.push('Multi-monitor setup may increase DPC latency and GPU overhead')
  }

  // Scaling check
  if (displayInfo.scaling !== null) {
    if (displayInfo.scaling.toLowerCase().includes('gpu') || displayInfo.scaling.toLowerCase().includes('custom')) {
      scoreComponents.push(70)
      issues.push(`Non-native scaling: "${displayInfo.scaling}" — use native resolution for best performance`)
    } else if (displayInfo.scaling.toLowerCase().includes('native')) {
      scoreComponents.push(100)
    }
  }

  if (scoreComponents.length > 0) {
    score = Math.round(scoreComponents.reduce((a, b) => a + b, 0) / scoreComponents.length)
    score = clamp(score, 0, 100)
  }

  if (issues.length === 0 && score >= 0) {
    finding = `Display config is optimal. ${displayInfo.activeRefreshHz}Hz, ${displayInfo.vrrEnabled ? 'VRR enabled' : 'VRR not available'}, ${displayInfo.hdrEnabled ? 'HDR on' : 'HDR off'}.`
  } else if (score >= 0) {
    finding = `Display config has ${issues.length} issue(s). ${issues[0]}`
  }

  return {
    category: 'display_config',
    label: 'Display Config',
    score,
    source,
    confidence,
    issues,
    finding,
  }
}

function scoreWindowsConfig(systemInfo: SystemScanData | null): CategoryScore {
  const issues: string[] = []
  let score = -1
  let confidence = 0
  let source: DataSource = 'unavailable'
  let finding = 'No Windows configuration data available.'

  if (!systemInfo || isNoData(systemInfo.source)) {
    return {
      category: 'windows_config',
      label: 'Windows Config',
      score: -1,
      source: 'unavailable',
      confidence: 0,
      issues: [],
      finding: 'Windows configuration data unavailable.',
    }
  }

  source = systemInfo.source.source
  confidence = systemInfo.source.confidence

  const scoreComponents: number[] = []

  // VBS / Memory Integrity (major latency impact)
  if (systemInfo.vbsMemoryIntegrity !== null) {
    if (systemInfo.vbsMemoryIntegrity) {
      scoreComponents.push(20)
      issues.push('VBS Memory Integrity (Core Isolation) is ENABLED — known to cause significant DPC/ISR latency spikes. Disable for competitive play.')
    } else {
      scoreComponents.push(100)
    }
  }

  // Secure Boot (less impact but relevant)
  if (systemInfo.secureBoot !== null) {
    if (systemInfo.secureBoot) {
      // Secure boot by itself is fine; only VBS/CI is the problem
      scoreComponents.push(100)
    } else {
      scoreComponents.push(95)
    }
  }

  // Power plan
  if (systemInfo.powerPlan !== null) {
    const planLower = systemInfo.powerPlan.toLowerCase()
    if (planLower.includes('high performance') || planLower.includes('ultimate')) {
      scoreComponents.push(100)
    } else if (planLower.includes('balanced')) {
      scoreComponents.push(55)
      issues.push(`Power plan "${systemInfo.powerPlan}" — switch to High Performance for consistent clock speeds`)
    } else if (planLower.includes('power saver') || planLower.includes('eco')) {
      scoreComponents.push(20)
      issues.push(`Power saver mode "${systemInfo.powerPlan}" — major performance impact, switch to High Performance`)
    } else {
      scoreComponents.push(70)
      issues.push(`Unrecognized power plan: "${systemInfo.powerPlan}" — verify it is High Performance`)
    }
  }

  // TPM (informational, minor impact)
  if (systemInfo.tpm !== null) {
    if (systemInfo.tpm) {
      // TPM 2.0 is required for VBS, which can cause issues
      // But TPM by itself has minimal impact
      scoreComponents.push(95)
    } else {
      scoreComponents.push(100)
    }
  }

  if (scoreComponents.length > 0) {
    // VBS is a very heavy penalty — if VBS is on, cap at 50 max
    const rawScore = Math.round(scoreComponents.reduce((a, b) => a + b, 0) / scoreComponents.length)
    if (systemInfo.vbsMemoryIntegrity === true) {
      score = clamp(rawScore, 0, 50)
    } else {
      score = clamp(rawScore, 0, 100)
    }
  }

  if (issues.length === 0 && score >= 0) {
    finding = `Windows configuration is optimal. Power: ${systemInfo.powerPlan ?? 'N/A'}, VBS: ${systemInfo.vbsMemoryIntegrity ? 'OFF' : 'N/A'}.`
  } else if (score >= 0) {
    finding = `Windows configuration has ${issues.length} issue(s). ${issues[0]}`
  }

  return {
    category: 'windows_config',
    label: 'Windows Config',
    score,
    source,
    confidence,
    issues,
    finding,
  }
}

function scoreBackgroundProcesses(processInfo: ProcessScanData | null): CategoryScore {
  const issues: string[] = []
  let score = -1
  let confidence = 0
  let source: DataSource = 'unavailable'
  let finding = 'No background process data available.'

  if (!processInfo || isNoData(processInfo.source)) {
    return {
      category: 'background_processes',
      label: 'Background Processes',
      score: -1,
      source: 'unavailable',
      confidence: 0,
      issues: [],
      finding: 'Background process data unavailable.',
    }
  }

  source = processInfo.source.source
  confidence = processInfo.source.confidence

  if (!processInfo.processes || processInfo.processes.length === 0) {
    return {
      category: 'background_processes',
      label: 'Background Processes',
      score: -1,
      source: 'unavailable',
      confidence: 0,
      issues: [],
      finding: 'No processes scanned.',
    }
  }

  const processes = processInfo.processes
  const scoreComponents: number[] = []

  // Count processes by impact level
  const highImpact = processes.filter((p) => p.impact === 'high')
  const mediumImpact = processes.filter((p) => p.impact === 'medium')
  const lowImpact = processes.filter((p) => p.impact === 'low')

  // Count by concerning categories
  const overlays = processes.filter((p) => p.category === 'overlay')
  const recording = processes.filter((p) => p.category === 'recording')
  const antivirus = processes.filter((p) => p.category === 'antivirus')
  const sync = processes.filter((p) => p.category === 'sync')
  const browsers = processes.filter((p) => p.category === 'browser')
  const rgb = processes.filter((p) => p.category === 'rgb')
  const monitoring = processes.filter((p) => p.category === 'monitoring')

  // Scoring: start at 100 and penalize
  let baseScore = 100

  // High impact processes
  for (const proc of highImpact) {
    baseScore -= 15
    issues.push(`High impact process: ${proc.name} (CPU: ${proc.cpuUsage.toFixed(1)}%, RAM: ${proc.ramUsage.toFixed(0)}MB)`)
  }

  // Medium impact processes
  for (const proc of mediumImpact) {
    baseScore -= 5
    if (issues.length < 5) {
      issues.push(`Medium impact: ${proc.name} (${proc.category})`)
    }
  }

  // Category-specific penalties
  if (overlays.length > 0) {
    baseScore -= overlays.length * 10
    for (const proc of overlays) {
      if (issues.length < 5) issues.push(`Overlay running: ${proc.name} — can add input latency and frame time spikes`)
    }
  }

  if (recording.length > 0) {
    baseScore -= recording.length * 15
    for (const proc of recording) {
      issues.push(`Recording software: ${proc.name} — significant performance impact`)
    }
  }

  if (antivirus.length > 0) {
    baseScore -= 5
    issues.push(`Antivirus active: ${antivirus.map((p) => p.name).join(', ')} — may cause DPC spikes during scans`)
  }

  if (sync.length > 0) {
    baseScore -= sync.length * 5
    for (const proc of sync) {
      if (issues.length < 5) issues.push(`Sync service: ${proc.name} — can cause disk I/O spikes`)
    }
  }

  if (browsers.length > 0) {
    baseScore -= browsers.length * 3
    for (const proc of browsers) {
      if (issues.length < 5) issues.push(`Browser: ${proc.name} — uses significant RAM`)
    }
  }

  if (rgb.length > 0) {
    baseScore -= rgb.length * 5
    for (const proc of rgb) {
      if (issues.length < 5) issues.push(`RGB software: ${proc.name} — known to cause DPC/ISR spikes`)
    }
  }

  if (monitoring.length > 0) {
    baseScore -= monitoring.length * 3
    for (const proc of monitoring) {
      if (issues.length < 5) issues.push(`Monitoring tool: ${proc.name} — minor overhead`)
    }
  }

  score = clamp(baseScore, 0, 100)

  if (issues.length === 0) {
    finding = `No problematic background processes detected. ${processes.length} processes scanned, all low/no impact.`
  } else {
    finding = `${issues.length} background process issue(s) found. ${issues[0]}`
  }

  return {
    category: 'background_processes',
    label: 'Background Processes',
    score,
    source,
    confidence,
    issues,
    finding,
  }
}

// ─── Overall Score Calculation ────────────────────────────────────────

function calculateGrade(score: number): string {
  if (score >= 90) return 'S'
  if (score >= 80) return 'A'
  if (score >= 65) return 'B'
  if (score >= 50) return 'C'
  return 'F'
}

function generateLabel(grade: string, mode: 'demo' | 'real'): string {
  if (mode === 'demo') return 'DEMO / Insufficient Real Data'

  switch (grade) {
    case 'S': return 'COMPETITIVE READY'
    case 'A': return 'EXCELLENT'
    case 'B': return 'GOOD'
    case 'C': return 'NEEDS ATTENTION'
    case 'F': return 'CRITICAL ISSUES'
    default: return 'UNKNOWN'
  }
}

/**
 * Calculate the overall diagnostic score for a session.
 *
 * CRITICAL: This function NEVER gives a high score based on simulated data.
 * Any category with only simulated/unavailable data receives score = -1
 * and is excluded from the overall calculation.
 */
export function calculateOverallScore(session: {
  liveMetrics: LiveMetrics | null
  systemInfo: SystemScanData | null
  gpuInfo: GPUScanData | null
  networkInfo: NetworkScanData | null
  processInfo: ProcessScanData | null
  displayInfo: DisplayScanData | null
  controllerInfo: ControllerScanData | null
  latencyMonData: LatencyMonData | null
  presentMonData: PresentMonData | null
}): OverallScore {
  // Calculate each category score
  const categories: CategoryScore[] = [
    scoreKernelLatency(session.liveMetrics, session.latencyMonData),
    scoreFramePacing(session.liveMetrics, session.presentMonData),
    scoreGPUStability(session.liveMetrics, session.gpuInfo),
    scoreNetworkQuality(session.liveMetrics, session.networkInfo),
    scoreControllerInput(session.controllerInfo),
    scoreDisplayConfig(session.displayInfo),
    scoreWindowsConfig(session.systemInfo),
    scoreBackgroundProcesses(session.processInfo),
  ]

  // Determine mode: check "important" categories (kernel, frame_pacing, gpu, network)
  const importantCategories: ScoreCategory[] = ['kernel_latency', 'frame_pacing', 'gpu_stability', 'network_quality']
  const importantScores = categories.filter((c) => importantCategories.includes(c.category))
  const noDataImportantCount = importantScores.filter((c) => c.score < 0).length
  const noDataImportantRatio = noDataImportantCount / importantCategories.length

  // If >30% of important categories have no real data → demo mode
  const mode: 'demo' | 'real' = noDataImportantRatio > 0.3 ? 'demo' : 'real'

  // Only include categories with score >= 0 for overall calculation
  const availableCategories = categories.filter((c) => c.score >= 0)

  // Calculate simulated ratio
  const totalCategories = categories.length
  const simulatedCount = categories.filter((c) => c.score < 0).length
  const simulatedRatio = simulatedCount / totalCategories

  // Calculate overall score
  let overallScore: number
  let overallConfidence: number

  if (availableCategories.length === 0) {
    // No real data at all
    overallScore = 0
    overallConfidence = 0
  } else {
    // Weighted average: important categories get more weight
    const weights: Record<ScoreCategory, number> = {
      kernel_latency: 1.5,
      frame_pacing: 1.5,
      gpu_stability: 1.2,
      network_quality: 1.0,
      controller_input: 0.7,
      display_config: 0.6,
      windows_config: 0.8,
      background_processes: 0.7,
    }

    let totalWeight = 0
    let weightedSum = 0

    for (const cat of availableCategories) {
      const w = weights[cat.category]
      weightedSum += cat.score * w
      totalWeight += w
    }

    overallScore = totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 0
    overallScore = clamp(overallScore, 0, 100)

    // Overall confidence = average confidence of available categories
    overallConfidence = availableCategories.reduce((sum, c) => sum + c.confidence, 0) / availableCategories.length
  }

  const grade = calculateGrade(overallScore)
  const label = generateLabel(grade, mode)

  return {
    score: overallScore,
    confidence: overallConfidence,
    categories,
    simulatedRatio,
    mode,
    label,
    grade,
  }
}