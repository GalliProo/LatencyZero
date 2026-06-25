// ─── LatencyZero v2.0 — Root Cause Analysis Engine ────────────────────
// Pure diagnostic logic. No UI, no animations.
// Analyzes temporal correlations and generates root cause findings.

import type {
  DataSource,
  RCALevel,
  RCADomain,
  RootCauseFinding,
  TemporalCorrelation,
  DiagnosticSession,
  LiveMetrics,
  SystemScanData,
  GPUScanData,
  NetworkScanData,
  ProcessScanData,
  DisplayScanData,
  ControllerScanData,
  LatencyMonData,
  PresentMonData,
  DataSourceInfo,
} from '@/lib/types'
import { DPC_THRESHOLDS, ISR_THRESHOLDS, GPU_TEMP_THRESHOLDS } from '@/lib/types'

// ─── Helpers ──────────────────────────────────────────────────────────

function isRealSource(source: DataSourceInfo | null | undefined): boolean {
  if (!source) return false
  return source.source === 'measured' || source.source === 'imported'
}

function hasRealData(value: unknown): boolean {
  if (value === null || value === undefined) return false
  if (typeof value === 'object' && 'source' in value) {
    return isRealSource((value as { source: DataSourceInfo }).source)
  }
  // For imported data (LatencyMon, PresentMon), presence = real
  return true
}

let findingIdCounter = 0
function nextFindingId(): string {
  findingIdCounter++
  return `rca-${Date.now()}-${findingIdCounter.toString(36)}`
}

/** Determine RCALevel based on available evidence */
function determineLevel(
  hasDirectEvidence: boolean,
  hasStrongCorrelation: boolean,
  hasPlausibleHypothesis: boolean
): RCALevel {
  if (hasDirectEvidence) return 'confirmed'
  if (hasStrongCorrelation) return 'likely'
  if (hasPlausibleHypothesis) return 'possible'
  return 'unknown'
}

/** Map numeric severity to string */
function severityFromScore(impact: 'low' | 'medium' | 'high' | 'critical'): RootCauseFinding['severity'] {
  switch (impact) {
    case 'critical': return 'critical'
    case 'high': return 'high'
    case 'medium': return 'warning'
    case 'low': return 'info'
  }
}

/** Deduplicate findings by title similarity */
function deduplicateFindings(findings: RootCauseFinding[]): RootCauseFinding[] {
  const seen = new Set<string>()
  const result: RootCauseFinding[] = []

  for (const finding of findings) {
    // Create a normalized key from domain + first few words of title
    const normalizedTitle = finding.title
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .split(/\s+/)
      .slice(0, 5)
      .join(' ')

    const key = `${finding.domain}:${normalizedTitle}`
    if (!seen.has(key)) {
      seen.add(key)
      result.push(finding)
    } else {
      // Merge: keep the one with higher confidence
      const existing = result.find((r) => {
        const existKey = `${r.domain}:${r.title.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).slice(0, 5).join(' ')}`
        return existKey === key
      })
      if (existing && finding.confidence > existing.confidence) {
        Object.assign(existing, finding)
      }
    }
  }

  return result
}

// ─── Temporal Correlation Finder ──────────────────────────────────────

/**
 * Find temporal correlations between different metric events.
 * Cross-references events within configurable time windows.
 *
 * @param session - The complete diagnostic session with all collected data
 * @param windowMs - Time window for correlation detection (default 200ms)
 */
export function findCorrelations(
  session: DiagnosticSession,
  windowMs = 200
): TemporalCorrelation[] {
  const correlations: TemporalCorrelation[] = []

  // ─── Frame time spike analysis (requires PresentMon data) ───
  if (session.presentMonData && session.presentMonData.frameTimeData.length > 0) {
    const ftData = session.presentMonData.frameTimeData
    const avgFrameTime = session.presentMonData.avgFrameTime || 16.67
    const spikeThreshold = avgFrameTime * 2.5 // 2.5x average = spike

    // Find frame time spikes
    const frameSpikes = ftData
      .filter((d) => d.frameTime > spikeThreshold)
      .map((d) => ({
        time: new Date(d.time).getTime(),
        value: d.frameTime,
      }))

    // ─── Correlate frame spikes with GPU throttle ───
    if (session.gpuInfo && isRealSource(session.gpuInfo.source) && session.gpuInfo.throttleReason) {
      for (const spike of frameSpikes) {
        // GPU throttling is a sustained condition, correlate with all spikes
        correlations.push({
          timestamp: spike.time,
          metricA: { name: 'Frame Time', value: spike.value, unit: 'ms' },
          metricB: { name: 'GPU Throttle', value: 1, unit: 'active' },
          timeDeltaMs: 0,
          confidence: 0.8,
          explanation: `Frame time spike to ${spike.value.toFixed(1)}ms coincides with GPU throttling (${session.gpuInfo.throttleReason}). GPU throttling directly reduces clock speeds, causing frame time increases.`,
        })
        // Only report one correlation for throttling (it's a sustained condition)
        break
      }
    }

    // ─── Correlate frame spikes with high GPU temp ───
    if (session.gpuInfo && isRealSource(session.gpuInfo.source) && session.gpuInfo.temperature !== null) {
      if (session.gpuInfo.temperature >= GPU_TEMP_THRESHOLDS.lightWarning) {
        for (const spike of frameSpikes.slice(0, 3)) {
          correlations.push({
            timestamp: spike.time,
            metricA: { name: 'Frame Time', value: spike.value, unit: 'ms' },
            metricB: { name: 'GPU Temperature', value: session.gpuInfo.temperature, unit: '°C' },
            timeDeltaMs: 0,
            confidence: 0.6,
            explanation: `Frame time spike to ${spike.value.toFixed(1)}ms with GPU at ${session.gpuInfo.temperature}°C. High temperatures cause thermal throttling which increases frame times.`,
          })
        }
      }
    }

    // ─── Correlate frame spikes with LatencyMon DPC data ───
    if (session.latencyMonData) {
      const lm = session.latencyMonData
      if (lm.highestDpcExecutionTime > DPC_THRESHOLDS.warning) {
        for (const spike of frameSpikes.slice(0, 3)) {
          correlations.push({
            timestamp: spike.time,
            metricA: { name: 'Frame Time', value: spike.value, unit: 'ms' },
            metricB: { name: 'DPC Max', value: lm.highestDpcExecutionTime, unit: 'µs' },
            timeDeltaMs: 0,
            confidence: 0.7,
            explanation: `Frame time spike to ${spike.value.toFixed(1)}ms with DPC max of ${lm.highestDpcExecutionTime.toFixed(0)}µs. High DPC execution times directly delay frame presentation.`,
          })
        }
      }
      if (lm.highestIsrExecutionTime > ISR_THRESHOLDS.warning) {
        correlations.push({
          timestamp: Date.now(),
          metricA: { name: 'DPC Max', value: lm.highestDpcExecutionTime, unit: 'µs' },
          metricB: { name: 'ISR Max', value: lm.highestIsrExecutionTime, unit: 'µs' },
          timeDeltaMs: 0,
          confidence: 0.85,
          explanation: `High DPC (${lm.highestDpcExecutionTime.toFixed(0)}µs) and ISR (${lm.highestIsrExecutionTime.toFixed(0)}µs) indicate driver-level interrupt issues affecting real-time performance.`,
        })
      }
    }

    // ─── Correlate frame spikes with dropped frames ───
    if (session.presentMonData.droppedFrames !== null && session.presentMonData.droppedFrames > 0) {
      const dropRate = session.presentMonData.droppedFrames / Math.max(1, session.presentMonData.totalFrames)
      if (dropRate > 0.001) {
        correlations.push({
          timestamp: Date.now(),
          metricA: { name: 'Dropped Frames', value: session.presentMonData.droppedFrames, unit: 'frames' },
          metricB: { name: 'Drop Rate', value: dropRate * 100, unit: '%' },
          timeDeltaMs: 0,
          confidence: 0.9,
          explanation: `${session.presentMonData.droppedFrames} dropped frames (${(dropRate * 100).toFixed(2)}% drop rate). Dropped frames indicate the GPU or CPU failed to deliver frames in time, causing visual stutter.`,
        })
      }
    }
  }

  // ─── Network + frame pacing correlation ───
  if (session.networkInfo && isRealSource(session.networkInfo.source)) {
    const ni = session.networkInfo
    const networkIssues: string[] = []

    if (ni.packetLoss !== null && ni.packetLoss > 0.1) {
      networkIssues.push(`packet loss: ${ni.packetLoss.toFixed(2)}%`)
    }
    if (ni.jitter !== null && ni.jitter > 10) {
      networkIssues.push(`jitter: ${ni.jitter.toFixed(1)}ms`)
    }
    if (ni.avgPing !== null && ni.avgPing > 50) {
      networkIssues.push(`ping: ${ni.avgPing.toFixed(0)}ms`)
    }

    if (networkIssues.length > 0 && session.presentMonData) {
      // Check if frame time variability is also high
      const ftVariance = session.presentMonData.frameTimeP99 - session.presentMonData.avgFrameTime
      if (ftVariance > session.presentMonData.avgFrameTime * 0.5) {
        correlations.push({
          timestamp: Date.now(),
          metricA: { name: 'Frame Time P99-P50 Spread', value: ftVariance, unit: 'ms' },
          metricB: { name: 'Network Issues', value: networkIssues.length, unit: 'issues' },
          timeDeltaMs: 0,
          confidence: 0.45,
          explanation: `Frame time spread of ${ftVariance.toFixed(1)}ms coincides with network issues (${networkIssues.join(', ')}). Network instability can cause server-side frame desync and client-side rendering stalls.`,
        })
      }
    }
  }

  // ─── Process impact + DPC correlation ───
  if (session.processInfo && isRealSource(session.processInfo.source) && session.latencyMonData) {
    const highImpactProcs = session.processInfo.processes.filter(
      (p) => p.impact === 'high' || p.impact === 'medium'
    )
    const badDrivers = session.latencyMonData.drivers.filter(
      (d) => d.severity === 'critical' || d.severity === 'warning'
    )

    if (highImpactProcs.length > 0 && badDrivers.length > 0) {
      correlations.push({
        timestamp: Date.now(),
        metricA: {
          name: 'High Impact Processes',
          value: highImpactProcs.length,
          unit: 'processes',
        },
        metricB: {
          name: 'Problematic Drivers',
          value: badDrivers.length,
          unit: 'drivers',
        },
        timeDeltaMs: 0,
        confidence: 0.5,
        explanation: `${highImpactProcs.length} high/medium impact processes and ${badDrivers.length} problematic drivers detected simultaneously. Background software often installs kernel drivers that contribute to DPC/ISR latency.`,
      })
    }
  }

  // ─── Windows config + DPC correlation ───
  if (session.systemInfo && isRealSource(session.systemInfo.source)) {
    const si = session.systemInfo

    if (si.vbsMemoryIntegrity === true && session.latencyMonData) {
      if (session.latencyMonData.highestDpcExecutionTime > DPC_THRESHOLDS.lightWarning) {
        correlations.push({
          timestamp: Date.now(),
          metricA: { name: 'VBS Memory Integrity', value: 1, unit: 'enabled' },
          metricB: { name: 'DPC Max', value: session.latencyMonData.highestDpcExecutionTime, unit: 'µs' },
          timeDeltaMs: 0,
          confidence: 0.75,
          explanation: `VBS Memory Integrity is enabled with DPC max of ${session.latencyMonData.highestDpcExecutionTime.toFixed(0)}µs. VBS/CI is a well-documented cause of elevated DPC/ISR latency on Windows.`,
        })
      }
    }

    if (si.powerPlan !== null) {
      const planLower = si.powerPlan.toLowerCase()
      if (!planLower.includes('high performance') && !planLower.includes('ultimate')) {
        if (session.presentMonData) {
          const ftSpread = session.presentMonData.frameTimeP99 - session.presentMonData.avgFrameTime
          if (ftSpread > 5) {
            correlations.push({
              timestamp: Date.now(),
              metricA: { name: 'Power Plan', value: 1, unit: 'suboptimal' },
              metricB: { name: 'Frame Time Spread', value: ftSpread, unit: 'ms' },
              timeDeltaMs: 0,
              confidence: 0.55,
              explanation: `Non-performance power plan ("${si.powerPlan}") with frame time spread of ${ftSpread.toFixed(1)}ms. Power management can cause CPU clock fluctuations leading to inconsistent frame delivery.`,
            })
          }
        }
      }
    }
  }

  return correlations
}

// ─── Root Cause Analyzers (per domain) ────────────────────────────────

function analyzeKernelRootCauses(
  liveMetrics: LiveMetrics | null,
  latencyMonData: LatencyMonData | null,
  processInfo: ProcessScanData | null,
  systemInfo: SystemScanData | null
): RootCauseFinding[] {
  const findings: RootCauseFinding[] = []

  // From LatencyMon: problematic drivers
  if (latencyMonData) {
    for (const driver of latencyMonData.drivers) {
      if (driver.severity === 'critical') {
        findings.push({
          id: nextFindingId(),
          title: `Critical DPC/ISR from ${driver.module}`,
          domain: 'kernel',
          severity: 'critical',
          level: 'confirmed',
          confidence: 0.95,
          dataSource: 'imported',
          observed: {
            driver: driver.module,
            dpcTime: `${driver.dpcTime.toFixed(0)}µs`,
            isrTime: `${driver.isrTime.toFixed(0)}µs`,
            dpcCount: driver.dpcCount,
            isrCount: driver.isrCount,
          },
          sources: ['LatencyMon'],
          recommendation: `Update, disable, or replace the "${driver.module}" driver. Check manufacturer website for latest version. If not needed, disable the associated device in Device Manager.`,
          risk: 'high',
        })
      } else if (driver.severity === 'warning') {
        findings.push({
          id: nextFindingId(),
          title: `Elevated DPC/ISR from ${driver.module}`,
          domain: 'kernel',
          severity: 'warning',
          level: 'confirmed',
          confidence: 0.85,
          dataSource: 'imported',
          observed: {
            driver: driver.module,
            dpcTime: `${driver.dpcTime.toFixed(0)}µs`,
            isrTime: `${driver.isrTime.toFixed(0)}µs`,
          },
          sources: ['LatencyMon'],
          recommendation: `Monitor "${driver.module}" driver. Consider updating or checking if the associated hardware is necessary.`,
          risk: 'medium',
        })
      }
    }

    // High hard pagefaults
    if (latencyMonData.totalHardPagefaults > 100) {
      findings.push({
        id: nextFindingId(),
        title: `Excessive hard page faults: ${latencyMonData.totalHardPagefaults}`,
        domain: 'kernel',
        severity: latencyMonData.totalHardPagefaults > 1000 ? 'high' : 'warning',
        level: 'confirmed',
        confidence: 0.9,
        dataSource: 'imported',
        observed: {
          totalHardPagefaults: latencyMonData.totalHardPagefaults,
          worstProcess: latencyMonData.processWithHighestPagefaults || 'unknown',
        },
        sources: ['LatencyMon'],
        recommendation: `High hard page faults indicate memory pressure. Close unnecessary applications, add more RAM, or check "${latencyMonData.processWithHighestPagefaults}" for memory leaks.`,
        risk: latencyMonData.totalHardPagefaults > 1000 ? 'high' : 'medium',
      })
    }
  }

  // From live metrics: DPC/ISR spikes
  if (liveMetrics && isRealSource(liveMetrics.source)) {
    if (liveMetrics.dpc.max.value !== null && liveMetrics.dpc.max.value > DPC_THRESHOLDS.high) {
      findings.push({
        id: nextFindingId(),
        title: 'Critical DPC execution spike detected',
        domain: 'kernel',
        severity: 'critical',
        level: 'likely',
        confidence: liveMetrics.source.confidence,
        dataSource: liveMetrics.source.source,
        observed: {
          maxDpc: `${liveMetrics.dpc.max.value.toFixed(0)}µs`,
          avgDpc: `${liveMetrics.dpc.avg.value?.toFixed(0) ?? 'N/A'}µs`,
          threshold: `${DPC_THRESHOLDS.high}µs`,
        },
        sources: [liveMetrics.source.collector || 'live_agent'],
        recommendation: 'Run LatencyMon to identify the specific driver causing DPC spikes. Common culprits: audio drivers, network drivers, RGB software, antivirus.',
        risk: 'high',
      })
    }

    if (liveMetrics.isr.max.value !== null && liveMetrics.isr.max.value > ISR_THRESHOLDS.high) {
      findings.push({
        id: nextFindingId(),
        title: 'Critical ISR execution spike detected',
        domain: 'kernel',
        severity: 'high',
        level: 'likely',
        confidence: liveMetrics.source.confidence,
        dataSource: liveMetrics.source.source,
        observed: {
          maxIsr: `${liveMetrics.isr.max.value.toFixed(0)}µs`,
          avgIsr: `${liveMetrics.isr.avg.value?.toFixed(0) ?? 'N/A'}µs`,
          threshold: `${ISR_THRESHOLDS.high}µs`,
        },
        sources: [liveMetrics.source.collector || 'live_agent'],
        recommendation: 'Run LatencyMon to identify the specific driver causing ISR spikes. Check for hardware interrupts from USB devices, audio, or storage.',
        risk: 'high',
      })
    }
  }

  // VBS correlation
  if (systemInfo && isRealSource(systemInfo.source) && systemInfo.vbsMemoryIntegrity === true) {
    const hasDpcEvidence = latencyMonData
      ? latencyMonData.highestDpcExecutionTime > DPC_THRESHOLDS.lightWarning
      : liveMetrics
        ? (liveMetrics.dpc.max.value ?? 0) > DPC_THRESHOLDS.lightWarning
        : false

    findings.push({
      id: nextFindingId(),
      title: 'VBS Memory Integrity (Core Isolation) is enabled',
      domain: 'windows_config',
      severity: hasDpcEvidence ? 'high' : 'warning',
      level: hasDpcEvidence ? 'confirmed' : 'likely',
      confidence: hasDpcEvidence ? 0.9 : 0.7,
      dataSource: systemInfo.source.source,
      observed: {
        vbsMemoryIntegrity: 'enabled',
        ...(hasDpcEvidence && latencyMonData
          ? { dpcMax: `${latencyMonData.highestDpcExecutionTime.toFixed(0)}µs` }
          : {}),
      },
      sources: ['WMI/PowerShell'],
      recommendation: 'Disable VBS Memory Integrity in Windows Security > Device Security > Core Isolation. This is the single most impactful Windows setting for reducing DPC/ISR latency. Reboot required.',
      risk: 'high',
    })
  }

  // Process-caused kernel issues
  if (processInfo && isRealSource(processInfo.source)) {
    const kernelProblematicCategories = ['antivirus', 'rgb', 'recording', 'monitoring']
    const suspectProcesses = processInfo.processes.filter(
      (p) => kernelProblematicCategories.includes(p.category) && (p.impact === 'high' || p.impact === 'medium')
    )

    for (const proc of suspectProcesses) {
      findings.push({
        id: nextFindingId(),
        title: `Potentially problematic process: ${proc.name}`,
        domain: 'processes',
        severity: proc.impact === 'high' ? 'warning' : 'info',
        level: 'possible',
        confidence: 0.55,
        dataSource: processInfo.source.source,
        observed: {
          process: proc.name,
          category: proc.category,
          cpuUsage: `${proc.cpuUsage.toFixed(1)}%`,
          impact: proc.impact,
        },
        sources: ['ProcessScanner'],
        recommendation: `Consider closing "${proc.name}" during competitive play. ${proc.category} software is known to cause DPC/ISR spikes and frame time instability.`,
        risk: proc.impact === 'high' ? 'medium' : 'low',
      })
    }
  }

  return findings
}

function analyzeGPURootCauses(
  liveMetrics: LiveMetrics | null,
  gpuInfo: GPUScanData | null,
  presentMonData: PresentMonData | null
): RootCauseFinding[] {
  const findings: RootCauseFinding[] = []

  if (!gpuInfo || !isRealSource(gpuInfo.source)) {
    // Check live metrics for GPU data
    if (liveMetrics && isRealSource(liveMetrics.source) && liveMetrics.hardware.gpu.temp.value !== null) {
      const temp = liveMetrics.hardware.gpu.temp.value
      if (temp >= GPU_TEMP_THRESHOLDS.high) {
        findings.push({
          id: nextFindingId(),
          title: `Critical GPU temperature: ${temp}°C`,
          domain: 'gpu',
          severity: 'critical',
          level: 'likely',
          confidence: liveMetrics.source.confidence,
          dataSource: liveMetrics.source.source,
          observed: { gpuTemp: `${temp}°C`, threshold: `${GPU_TEMP_THRESHOLDS.high}°C` },
          sources: [liveMetrics.source.collector || 'live_agent'],
          recommendation: 'Improve GPU cooling. Clean dust from heatsink/fans, check thermal paste, improve case airflow, or reduce ambient temperature.',
          risk: 'high',
        })
      }
    }
    return findings
  }

  // Throttling
  if (gpuInfo.throttleReason && gpuInfo.throttleReason !== '' && gpuInfo.throttleReason !== 'none') {
    findings.push({
      id: nextFindingId(),
      title: `GPU throttling: ${gpuInfo.throttleReason}`,
      domain: 'gpu',
      severity: 'critical',
      level: 'confirmed',
      confidence: gpuInfo.source.confidence,
      dataSource: gpuInfo.source.source,
      observed: {
        throttleReason: gpuInfo.throttleReason,
        temperature: gpuInfo.temperature ? `${gpuInfo.temperature}°C` : 'unknown',
        gpuClock: gpuInfo.gpuClock ? `${gpuInfo.gpuClock}MHz` : 'unknown',
      },
      sources: [gpuInfo.source.collector || 'nvidia-smi'],
      recommendation: `GPU is throttling due to ${gpuInfo.throttleReason}. Address the root cause (temperature, power limit, or current limit) to maintain consistent performance.`,
      risk: 'high',
    })
  }

  // High temperature
  if (gpuInfo.temperature !== null && gpuInfo.temperature >= GPU_TEMP_THRESHOLDS.high) {
    findings.push({
      id: nextFindingId(),
      title: `GPU temperature critical: ${gpuInfo.temperature}°C`,
      domain: 'gpu',
      severity: 'high',
      level: 'confirmed',
      confidence: gpuInfo.source.confidence,
      dataSource: gpuInfo.source.source,
      observed: {
        temperature: `${gpuInfo.temperature}°C`,
        hotspot: gpuInfo.temperatureHotspot ? `${gpuInfo.temperatureHotspot}°C` : 'unknown',
        threshold: `${GPU_TEMP_THRESHOLDS.high}°C`,
      },
      sources: [gpuInfo.source.collector || 'nvidia-smi'],
      recommendation: 'Improve GPU cooling immediately. Clean dust, repaste if needed, improve case airflow. Consider fan curve adjustment.',
      risk: 'high',
    })
  } else if (gpuInfo.temperature !== null && gpuInfo.temperature >= GPU_TEMP_THRESHOLDS.lightWarning) {
    findings.push({
      id: nextFindingId(),
      title: `GPU temperature elevated: ${gpuInfo.temperature}°C`,
      domain: 'gpu',
      severity: 'warning',
      level: 'confirmed',
      confidence: gpuInfo.source.confidence,
      dataSource: gpuInfo.source.source,
      observed: {
        temperature: `${gpuInfo.temperature}°C`,
        hotspot: gpuInfo.temperatureHotspot ? `${gpuInfo.temperatureHotspot}°C` : 'unknown',
      },
      sources: [gpuInfo.source.collector || 'nvidia-smi'],
      recommendation: 'Monitor GPU temperature. Consider improving case airflow or adjusting fan curve to prevent thermal throttling.',
      risk: 'medium',
    })
  }

  // VRAM pressure
  if (gpuInfo.vramUsage !== null && gpuInfo.vramTotal !== null && gpuInfo.vramTotal > 0) {
    const ratio = gpuInfo.vramUsage / gpuInfo.vramTotal
    if (ratio > 0.95) {
      findings.push({
        id: nextFindingId(),
        title: 'VRAM nearly exhausted',
        domain: 'gpu',
        severity: 'high',
        level: 'confirmed',
        confidence: gpuInfo.source.confidence,
        dataSource: gpuInfo.source.source,
        observed: {
          vramUsed: `${(gpuInfo.vramUsage / 1024).toFixed(1)}GB`,
          vramTotal: `${(gpuInfo.vramTotal / 1024).toFixed(1)}GB`,
          usagePercent: `${(ratio * 100).toFixed(1)}%`,
        },
        sources: [gpuInfo.source.collector || 'nvidia-smi'],
        recommendation: 'Reduce texture quality or close other GPU-intensive applications. VRAM overflow causes significant frame time spikes as data is paged to system RAM.',
        risk: 'high',
      })
    }
  }

  // GPU present telemetry correlation
  if (presentMonData && gpuInfo) {
    if (presentMonData.gpuBusy !== null && presentMonData.gpuBusy > 98) {
      findings.push({
        id: nextFindingId(),
        title: 'GPU bound: GPU busy >98%',
        domain: 'gpu',
        severity: presentMonData.gpuBusy > 99.5 ? 'high' : 'warning',
        level: 'confirmed',
        confidence: 0.9,
        dataSource: 'imported',
        observed: {
          gpuBusy: `${presentMonData.gpuBusy.toFixed(1)}%`,
          avgFrameTime: `${presentMonData.avgFrameTime.toFixed(1)}ms`,
          avgFps: presentMonData.avgFps.toFixed(0),
        },
        sources: ['PresentMon', gpuInfo.source.collector || 'nvidia-smi'],
        recommendation: presentMonData.gpuBusy > 99.5
          ? 'GPU is maxed out. Reduce graphical settings (shadows, reflections, AA) or lower resolution to improve frame rates and consistency.'
          : 'GPU is near maximum utilization. Minor setting adjustments may improve frame time consistency.',
        risk: presentMonData.gpuBusy > 99.5 ? 'medium' : 'low',
      })
    }

    // CPU bound detection
    if (presentMonData.cpuBusy !== null && presentMonData.cpuWait !== null && presentMonData.gpuBusy !== null) {
      if (presentMonData.cpuWait > 30 && presentMonData.gpuBusy < 80) {
        findings.push({
          id: nextFindingId(),
          title: 'CPU bound: high CPU wait with GPU headroom',
          domain: 'gpu',
          severity: 'info',
          level: 'likely',
          confidence: 0.7,
          dataSource: 'imported',
          observed: {
            cpuWait: `${presentMonData.cpuWait.toFixed(1)}%`,
            cpuBusy: `${presentMonData.cpuBusy.toFixed(1)}%`,
            gpuBusy: `${presentMonData.gpuBusy.toFixed(1)}%`,
          },
          sources: ['PresentMon'],
          recommendation: 'System is CPU-limited. Consider lowering CPU-bound settings (draw distance, physics, AI), disabling background processes, or upgrading CPU.',
          risk: 'low',
        })
      }
    }
  }

  return findings
}

function analyzeFramePacingRootCauses(
  liveMetrics: LiveMetrics | null,
  presentMonData: PresentMonData | null,
  gpuInfo: GPUScanData | null,
  latencyMonData: LatencyMonData | null,
  processInfo: ProcessScanData | null,
  displayInfo: DisplayScanData | null
): RootCauseFinding[] {
  const findings: RootCauseFinding[] = []

  let hasP95 = false
  let hasP99 = false
  let p95Ms: number | null = null
  let p99Ms: number | null = null
  let avgFps: number | null = null
  let avgFrameTimeMs: number | null = null

  if (presentMonData) {
    p95Ms = presentMonData.frameTimeP95 || null
    p99Ms = presentMonData.frameTimeP99 || null
    avgFps = presentMonData.avgFps || null
    avgFrameTimeMs = presentMonData.avgFrameTime || null
    hasP95 = p95Ms !== null
    hasP99 = p99Ms !== null
  }

  if (liveMetrics && isRealSource(liveMetrics.source)) {
    if (!hasP95 && liveMetrics.frameTime.p95.value !== null) {
      p95Ms = liveMetrics.frameTime.p95.value
      hasP95 = true
    }
    if (!hasP99 && liveMetrics.frameTime.p99.value !== null) {
      p99Ms = liveMetrics.frameTime.p99.value
      hasP99 = true
    }
    if (!avgFps && liveMetrics.fps.avg.value !== null) {
      avgFps = liveMetrics.fps.avg.value
    }
    if (!avgFrameTimeMs && liveMetrics.frameTime.avg.value !== null) {
      avgFrameTimeMs = liveMetrics.frameTime.avg.value
    }
  }

  if (!hasP95 && !hasP99) return findings

  const frameBudgetMs = avgFrameTimeMs || (avgFps && avgFps > 0 ? 1000 / avgFps : null)

  // Severe frame pacing issues
  if (hasP99 && p99Ms !== null && frameBudgetMs !== null) {
    const p99Ratio = p99Ms / frameBudgetMs
    if (p99Ratio > 3.0) {
      const sources: string[] = []
      if (presentMonData) sources.push('PresentMon')
      if (liveMetrics && isRealSource(liveMetrics.source)) sources.push(liveMetrics.source.collector || 'live_agent')

      // Determine likely cause
      let likelyCause = 'Unknown'
      let recommendation = 'Import PresentMon data and run LatencyMon to identify the root cause of severe stuttering.'
      let correlation: RootCauseFinding['correlation'] | undefined

      if (latencyMonData && latencyMonData.highestDpcExecutionTime > DPC_THRESHOLDS.warning) {
        likelyCause = 'Kernel-level driver latency'
        recommendation = 'DPC/ISR spikes from drivers are causing severe frame time spikes. Run LatencyMon to identify the specific driver.'
        correlation = {
          metricA: `Frame Time P99: ${p99Ms.toFixed(1)}ms`,
          metricB: `DPC Max: ${latencyMonData.highestDpcExecutionTime.toFixed(0)}µs`,
          timeDeltaMs: 0,
          description: 'High DPC execution times directly delay frame presentation, causing P99 frame time spikes.',
        }
      } else if (gpuInfo && gpuInfo.throttleReason && gpuInfo.throttleReason !== 'none') {
        likelyCause = 'GPU thermal throttling'
        recommendation = 'GPU throttling is causing frame time spikes. Improve GPU cooling to maintain consistent clock speeds.'
        correlation = {
          metricA: `Frame Time P99: ${p99Ms.toFixed(1)}ms`,
          metricB: `GPU Throttle: ${gpuInfo.throttleReason}`,
          timeDeltaMs: 0,
          description: 'GPU thermal throttling reduces clock speeds, causing intermittent frame time spikes.',
        }
      } else if (gpuInfo && gpuInfo.temperature !== null && gpuInfo.temperature >= GPU_TEMP_THRESHOLDS.lightWarning) {
        likelyCause = 'GPU thermal issues'
        recommendation = 'Elevated GPU temperature may be causing inconsistent performance. Monitor for throttling.'
      } else if (processInfo) {
        const highImpactProcs = processInfo.processes.filter((p) => p.impact === 'high')
        if (highImpactProcs.length > 0) {
          likelyCause = 'Background process interference'
          recommendation = `Close high-impact processes: ${highImpactProcs.map((p) => p.name).join(', ')}`
        }
      }

      findings.push({
        id: nextFindingId(),
        title: `Severe frame pacing issues: P99 at ${(p99Ratio * 100).toFixed(0)}% of frame budget`,
        domain: 'frame_pacing',
        severity: 'critical',
        level: correlation ? 'confirmed' : 'likely',
        confidence: 0.85,
        dataSource: presentMonData ? 'imported' : (liveMetrics?.source.source ?? 'measured'),
        observed: {
          p99FrameTime: `${p99Ms.toFixed(1)}ms`,
          frameBudget: `${frameBudgetMs.toFixed(1)}ms`,
          p99Ratio: `${(p99Ratio * 100).toFixed(0)}%`,
          likelyCause,
        },
        correlation,
        sources,
        recommendation,
        risk: 'high',
      })
    }
  }

  // Moderate frame pacing issues
  if (hasP95 && p95Ms !== null && frameBudgetMs !== null) {
    const p95Ratio = p95Ms / frameBudgetMs
    if (p95Ratio > 1.8 && p95Ratio <= 3.0) {
      const sources: string[] = []
      if (presentMonData) sources.push('PresentMon')
      if (liveMetrics && isRealSource(liveMetrics.source)) sources.push(liveMetrics.source.collector || 'live_agent')

      findings.push({
        id: nextFindingId(),
        title: `Frame pacing inconsistencies: P95 at ${(p95Ratio * 100).toFixed(0)}% of frame budget`,
        domain: 'frame_pacing',
        severity: 'warning',
        level: 'likely',
        confidence: 0.75,
        dataSource: presentMonData ? 'imported' : (liveMetrics?.source.source ?? 'measured'),
        observed: {
          p95FrameTime: `${p95Ms.toFixed(1)}ms`,
          frameBudget: `${frameBudgetMs.toFixed(1)}ms`,
          p95Ratio: `${(p95Ratio * 100).toFixed(0)}%`,
        },
        sources,
        recommendation: 'Frame time consistency is suboptimal. Check for: background processes, GPU throttling, driver issues, or VRR not being active.',
        risk: 'medium',
      })
    }
  }

  // Display refresh rate mismatch
  if (displayInfo && isRealSource(displayInfo.source) && displayInfo.activeRefreshHz !== null && displayInfo.maxRefreshHz !== null) {
    if (displayInfo.activeRefreshHz < displayInfo.maxRefreshHz) {
      findings.push({
        id: nextFindingId(),
        title: `Display refresh rate not maximized: ${displayInfo.activeRefreshHz}Hz / ${displayInfo.maxRefreshHz}Hz`,
        domain: 'display',
        severity: 'warning',
        level: 'confirmed',
        confidence: displayInfo.source.confidence,
        dataSource: displayInfo.source.source,
        observed: {
          activeRefresh: `${displayInfo.activeRefreshHz}Hz`,
          maxRefresh: `${displayInfo.maxRefreshHz}Hz`,
        },
        sources: [displayInfo.source.collector || 'display_scanner'],
        recommendation: `Enable ${displayInfo.maxRefreshHz}Hz in Windows Display Settings > Advanced display. Also verify the refresh rate in GPU control panel and in-game settings.`,
        risk: 'low',
      })
    }

    if (!displayInfo.vrrEnabled && displayInfo.vrrType !== null) {
      findings.push({
        id: nextFindingId(),
        title: `VRR available but not enabled (${displayInfo.vrrType})`,
        domain: 'display',
        severity: 'info',
        level: 'confirmed',
        confidence: displayInfo.source.confidence,
        dataSource: displayInfo.source.source,
        observed: {
          vrrType: displayInfo.vrrType,
          vrrEnabled: 'false',
        },
        sources: [displayInfo.source.collector || 'display_scanner'],
        recommendation: `Enable ${displayInfo.vrrType} in your GPU control panel and/or monitor OSD. VRR smooths frame delivery when FPS fluctuates below the refresh rate.`,
        risk: 'low',
      })
    }
  }

  return findings
}

function analyzeNetworkRootCauses(
  liveMetrics: LiveMetrics | null,
  networkInfo: NetworkScanData | null
): RootCauseFinding[] {
  const findings: RootCauseFinding[] = []

  let ping: number | null = null
  let jitter: number | null = null
  let packetLoss: number | null = null
  let adapterType: string | null = null

  if (liveMetrics && isRealSource(liveMetrics.source)) {
    if (liveMetrics.network.ping.value !== null) ping = liveMetrics.network.ping.value
    if (liveMetrics.network.jitter.value !== null) jitter = liveMetrics.network.jitter.value
    if (liveMetrics.network.packetLoss.value !== null) packetLoss = liveMetrics.network.packetLoss.value
  }

  if (networkInfo && isRealSource(networkInfo.source)) {
    if (networkInfo.avgPing !== null) ping = ping ?? networkInfo.avgPing
    if (networkInfo.jitter !== null) jitter = jitter ?? networkInfo.jitter
    if (networkInfo.packetLoss !== null) packetLoss = packetLoss ?? networkInfo.packetLoss
    if (networkInfo.adapterType !== null) adapterType = networkInfo.adapterType
  }

  if (ping === null && jitter === null && packetLoss === null && !adapterType) {
    return findings
  }

  // WiFi detection
  if (adapterType === 'wifi') {
    findings.push({
      id: nextFindingId(),
      title: 'Using WiFi connection instead of Ethernet',
      domain: 'network',
      severity: 'warning',
      level: 'confirmed',
      confidence: 0.9,
      dataSource: networkInfo?.source.source ?? 'measured',
      observed: { connectionType: 'WiFi', adapter: networkInfo?.adapterName ?? 'unknown' },
      sources: ['NetworkScanner'],
      recommendation: 'Switch to a wired Ethernet connection for competitive play. WiFi adds latency, jitter, and packet loss compared to wired connections.',
      risk: 'medium',
    })
  }

  // High ping
  if (ping !== null && ping > 50) {
    findings.push({
      id: nextFindingId(),
      title: `High latency: ${ping.toFixed(0)}ms`,
      domain: 'network',
      severity: ping > 100 ? 'high' : 'warning',
      level: 'confirmed',
      confidence: 0.9,
      dataSource: networkInfo?.source.source ?? liveMetrics?.source.source ?? 'measured',
      observed: { ping: `${ping.toFixed(0)}ms` },
      sources: ['NetworkScanner'],
      recommendation: ping > 100
        ? 'Very high ping will cause noticeable input delay. Use a wired connection, check for bandwidth-heavy downloads, consider a closer game server.'
        : 'Ping is elevated. Use a wired connection, close background downloads, and check for network congestion.',
      risk: ping > 100 ? 'high' : 'medium',
    })
  }

  // High jitter
  if (jitter !== null && jitter > 10) {
    findings.push({
      id: nextFindingId(),
      title: `High network jitter: ${jitter.toFixed(1)}ms`,
      domain: 'network',
      severity: jitter > 30 ? 'high' : 'warning',
      level: 'confirmed',
      confidence: 0.9,
      dataSource: networkInfo?.source.source ?? liveMetrics?.source.source ?? 'measured',
      observed: { jitter: `${jitter.toFixed(1)}ms` },
      sources: ['NetworkScanner'],
      recommendation: 'High jitter causes inconsistent latency. Use wired Ethernet, check for QoS conflicts, avoid shared connections, and consider a gaming router.',
      risk: 'medium',
    })
  }

  // Packet loss
  if (packetLoss !== null && packetLoss > 0.1) {
    findings.push({
      id: nextFindingId(),
      title: `Packet loss detected: ${packetLoss.toFixed(2)}%`,
      domain: 'network',
      severity: packetLoss > 1.0 ? 'high' : 'warning',
      level: 'confirmed',
      confidence: 0.9,
      dataSource: networkInfo?.source.source ?? liveMetrics?.source.source ?? 'measured',
      observed: { packetLoss: `${packetLoss.toFixed(2)}%` },
      sources: ['NetworkScanner'],
      recommendation: packetLoss > 1.0
        ? 'Significant packet loss will cause teleportation and rubber-banding. Check network cables, router health, and ISP quality. Contact ISP if persistent.'
        : 'Minor packet loss detected. Check Ethernet cable quality, router age, and for local network interference.',
      risk: packetLoss > 1.0 ? 'high' : 'medium',
    })
  }

  return findings
}

function analyzeControllerRootCauses(controllerInfo: ControllerScanData | null): RootCauseFinding[] {
  const findings: RootCauseFinding[] = []

  if (!controllerInfo || !isRealSource(controllerInfo.source)) return findings

  // Bluetooth concern
  if (controllerInfo.transport === 'bluetooth') {
    findings.push({
      id: nextFindingId(),
      title: `Controller using Bluetooth: ${controllerInfo.controllerName || 'Unknown'}`,
      domain: 'controller',
      severity: 'warning',
      level: 'confirmed',
      confidence: controllerInfo.source.confidence,
      dataSource: controllerInfo.source.source,
      observed: { transport: 'bluetooth', controller: controllerInfo.controllerName || 'unknown' },
      sources: [controllerInfo.source.collector || 'controller_scanner'],
      recommendation: 'Bluetooth adds ~5-15ms input latency. Use a USB cable or 2.4GHz wireless dongle for lower input latency.',
      risk: 'medium',
    })
  }

  // Low polling rate
  if (controllerInfo.avgPollingMs !== null) {
    const pollingHz = 1000 / controllerInfo.avgPollingMs
    if (pollingHz < 250) {
      findings.push({
        id: nextFindingId(),
        title: `Low controller polling rate: ${pollingHz.toFixed(0)}Hz`,
        domain: 'controller',
        severity: pollingHz < 125 ? 'high' : 'warning',
        level: 'confirmed',
        confidence: controllerInfo.source.confidence,
        dataSource: controllerInfo.source.source,
        observed: { pollingRate: `${pollingHz.toFixed(0)}Hz`, pollingMs: `${controllerInfo.avgPollingMs.toFixed(1)}ms` },
        sources: [controllerInfo.source.collector || 'controller_scanner'],
        recommendation: pollingHz < 125
          ? 'Very low polling rate adds significant input latency. Enable 1000Hz polling in controller settings or use a compatible controller/dongle.'
          : 'Polling rate is below competitive standard. Enable 1000Hz polling in controller software or firmware if supported.',
        risk: 'medium',
      })
    }
  }

  // Input drops
  if (controllerInfo.estimatedDropRate !== null && controllerInfo.estimatedDropRate > 0.005) {
    findings.push({
      id: nextFindingId(),
      title: `Controller input drop rate: ${(controllerInfo.estimatedDropRate * 100).toFixed(2)}%`,
      domain: 'controller',
      severity: 'high',
      level: 'confirmed',
      confidence: controllerInfo.source.confidence,
      dataSource: controllerInfo.source.source,
      observed: { dropRate: `${(controllerInfo.estimatedDropRate * 100).toFixed(2)}%` },
      sources: [controllerInfo.source.collector || 'controller_scanner'],
      recommendation: 'Input drops cause missed inputs. Check controller battery, USB port, wireless dongle position, and for wireless interference.',
      risk: 'high',
    })
  }

  return findings
}

function analyzeWindowsConfigRootCauses(systemInfo: SystemScanData | null): RootCauseFinding[] {
  const findings: RootCauseFinding[] = []

  if (!systemInfo || !isRealSource(systemInfo.source)) return findings

  // Power plan
  if (systemInfo.powerPlan !== null) {
    const planLower = systemInfo.powerPlan.toLowerCase()
    if (planLower.includes('power saver') || planLower.includes('eco')) {
      findings.push({
        id: nextFindingId(),
        title: `Power saver mode active: "${systemInfo.powerPlan}"`,
        domain: 'windows_config',
        severity: 'high',
        level: 'confirmed',
        confidence: systemInfo.source.confidence,
        dataSource: systemInfo.source.source,
        observed: { powerPlan: systemInfo.powerPlan },
        sources: ['WMI/PowerShell'],
        recommendation: 'Switch to High Performance power plan. Power saver mode limits CPU performance and causes clock speed fluctuations.',
        risk: 'high',
      })
    } else if (planLower.includes('balanced') && !planLower.includes('high')) {
      findings.push({
        id: nextFindingId(),
        title: `Non-performance power plan: "${systemInfo.powerPlan}"`,
        domain: 'windows_config',
        severity: 'warning',
        level: 'confirmed',
        confidence: systemInfo.source.confidence,
        dataSource: systemInfo.source.source,
        observed: { powerPlan: systemInfo.powerPlan },
        sources: ['WMI/PowerShell'],
        recommendation: 'Switch to High Performance power plan for consistent CPU clock speeds during gaming.',
        risk: 'medium',
      })
    }
  }

  // Multi-monitor (from system info context)
  // This is handled in display scorer, but we can add a Windows-level finding
  // about DPI scaling issues if detected

  return findings
}

function analyzeProcessRootCauses(processInfo: ProcessScanData | null): RootCauseFinding[] {
  const findings: RootCauseFinding[] = []

  if (!processInfo || !isRealSource(processInfo.source)) return findings
  if (!processInfo.processes || processInfo.processes.length === 0) return findings

  // Overlay software
  const overlays = processInfo.processes.filter((p) => p.category === 'overlay')
  if (overlays.length > 0) {
    const names = overlays.map((p) => p.name).join(', ')
    findings.push({
      id: nextFindingId(),
      title: `Overlay software detected: ${names}`,
      domain: 'processes',
      severity: overlays.some((p) => p.impact === 'high') ? 'warning' : 'info',
      level: 'confirmed',
      confidence: processInfo.source.confidence,
      dataSource: processInfo.source.source,
      observed: { overlays: names, count: overlays.length },
      sources: ['ProcessScanner'],
      recommendation: 'Disable overlays (Discord overlay, Steam overlay, GeForce Experience, etc.) during competitive play. Overlays inject into the game render pipeline and can cause frame time spikes.',
      risk: 'medium',
    })
  }

  // Recording/streaming software
  const recording = processInfo.processes.filter((p) => p.category === 'recording')
  if (recording.length > 0) {
    const names = recording.map((p) => p.name).join(', ')
    findings.push({
      id: nextFindingId(),
      title: `Recording/streaming software active: ${names}`,
      domain: 'processes',
      severity: recording.some((p) => p.impact === 'high') ? 'high' : 'warning',
      level: 'confirmed',
      confidence: processInfo.source.confidence,
      dataSource: processInfo.source.source,
      observed: { recording: names, count: recording.length },
      sources: ['ProcessScanner'],
      recommendation: 'Recording software uses GPU and CPU resources, causing frame time instability. Disable during competitive matches or use a dedicated streaming PC.',
      risk: 'high',
    })
  }

  // RGB software
  const rgb = processInfo.processes.filter((p) => p.category === 'rgb')
  if (rgb.length > 0) {
    const names = rgb.map((p) => p.name).join(', ')
    findings.push({
      id: nextFindingId(),
      title: `RGB software running: ${names}`,
      domain: 'processes',
      severity: 'info',
      level: 'possible',
      confidence: 0.6,
      dataSource: processInfo.source.source,
      observed: { rgb: names },
      sources: ['ProcessScanner'],
      recommendation: 'RGB software (iCUE, Razer Synapse, etc.) is known to cause DPC/ISR latency spikes. Set lighting profile and close the software, or use hardware-based lighting control.',
      risk: 'low',
    })
  }

  // Antivirus
  const antivirus = processInfo.processes.filter((p) => p.category === 'antivirus')
  if (antivirus.length > 0) {
    const names = antivirus.map((p) => p.name).join(', ')
    findings.push({
      id: nextFindingId(),
      title: `Antivirus software active: ${names}`,
      domain: 'processes',
      severity: 'info',
      level: 'possible',
      confidence: 0.55,
      dataSource: processInfo.source.source,
      observed: { antivirus: names },
      sources: ['ProcessScanner'],
      recommendation: 'Antivirus real-time scanning can cause DPC spikes during file access. Consider adding game directories to exclusions or using Windows Defender (lighter than most third-party options).',
      risk: 'low',
    })
  }

  // High CPU usage processes
  const highCpuProcs = processInfo.processes.filter(
    (p) => p.cpuUsage > 10 && p.category !== 'game'
  )
  if (highCpuProcs.length > 0) {
    for (const proc of highCpuProcs.slice(0, 3)) {
      findings.push({
        id: nextFindingId(),
        title: `High CPU usage process: ${proc.name} (${proc.cpuUsage.toFixed(1)}%)`,
        domain: 'processes',
        severity: proc.cpuUsage > 25 ? 'warning' : 'info',
        level: 'confirmed',
        confidence: processInfo.source.confidence,
        dataSource: processInfo.source.source,
        observed: {
          process: proc.name,
          cpuUsage: `${proc.cpuUsage.toFixed(1)}%`,
          ramUsage: `${proc.ramUsage.toFixed(0)}MB`,
          category: proc.category,
        },
        sources: ['ProcessScanner'],
        recommendation: `Close ${proc.name} during gameplay to free CPU resources.`,
        risk: proc.cpuUsage > 25 ? 'medium' : 'low',
      })
    }
  }

  return findings
}

// ─── Main Analysis Functions ──────────────────────────────────────────

/**
 * Analyze root causes from all available data sources in a diagnostic session.
 *
 * Combines:
 * - Pre-existing findings from each scanner
 * - Engine-generated findings based on cross-domain analysis
 * - Deduplication and ranking by severity/confidence
 *
 * @param session - The complete diagnostic session
 * @returns Deduplicated, ranked root cause findings
 */
export function analyzeRootCauses(session: DiagnosticSession): RootCauseFinding[] {
  // Reset ID counter for deterministic-ish IDs
  findingIdCounter = 0

  const allFindings: RootCauseFinding[] = []

  // ─── Collect pre-existing findings from scanners ───
  const scannerFindings = [
    ...(session.systemInfo?.findings || []),
    ...(session.gpuInfo?.findings || []),
    ...(session.networkInfo?.findings || []),
    ...(session.processInfo?.findings || []),
    ...(session.displayInfo?.findings || []),
    ...(session.controllerInfo?.findings || []),
    ...(session.latencyMonData?.findings || []),
    ...(session.presentMonData?.findings || []),
  ]

  allFindings.push(...scannerFindings)

  // ─── Generate engine-level findings by domain ───
  allFindings.push(
    ...analyzeKernelRootCauses(
      session.liveMetrics,
      session.latencyMonData,
      session.processInfo,
      session.systemInfo
    )
  )

  allFindings.push(
    ...analyzeGPURootCauses(
      session.liveMetrics,
      session.gpuInfo,
      session.presentMonData
    )
  )

  allFindings.push(
    ...analyzeFramePacingRootCauses(
      session.liveMetrics,
      session.presentMonData,
      session.gpuInfo,
      session.latencyMonData,
      session.processInfo,
      session.displayInfo
    )
  )

  allFindings.push(
    ...analyzeNetworkRootCauses(
      session.liveMetrics,
      session.networkInfo
    )
  )

  allFindings.push(
    ...analyzeControllerRootCauses(session.controllerInfo)
  )

  allFindings.push(
    ...analyzeWindowsConfigRootCauses(session.systemInfo)
  )

  allFindings.push(
    ...analyzeProcessRootCauses(session.processInfo)
  )

  // ─── Deduplicate ───
  const deduped = deduplicateFindings(allFindings)

  // ─── Sort by severity (critical first), then confidence (high first) ───
  const severityOrder: Record<string, number> = { critical: 0, high: 1, warning: 2, info: 3 }
  deduped.sort((a, b) => {
    const sevDiff = (severityOrder[a.severity] ?? 4) - (severityOrder[b.severity] ?? 4)
    if (sevDiff !== 0) return sevDiff
    return b.confidence - a.confidence
  })

  return deduped
}

// ─── Human-Readable Report Generator ──────────────────────────────────

/**
 * Generate a human-readable root cause analysis report from findings.
 *
 * @param findings - Root cause findings (usually from analyzeRootCauses)
 * @returns Structured report with summary and detailed findings
 */
export function generateRCAReport(findings: RootCauseFinding[]): {
  summary: string
  findings: Array<{
    title: string
    severity: string
    level: string
    confidence: number
    domain: string
    observed: string
    correlation: string | null
    recommendation: string
    risk: string
    dataSource: string
  }>
} {
  const criticalCount = findings.filter((f) => f.severity === 'critical').length
  const highCount = findings.filter((f) => f.severity === 'high').length
  const warningCount = findings.filter((f) => f.severity === 'warning').length
  const infoCount = findings.filter((f) => f.severity === 'info').length

  // Generate summary
  let summary: string
  if (findings.length === 0) {
    summary = 'No root cause findings. System appears to be well-optimized for competitive play.'
  } else if (criticalCount > 0) {
    summary = `Found ${findings.length} issue(s): ${criticalCount} critical, ${highCount} high, ${warningCount} warning, ${infoCount} informational. Critical issues require immediate attention as they directly impact competitive performance.`
  } else if (highCount > 0) {
    summary = `Found ${findings.length} issue(s): ${highCount} high, ${warningCount} warning, ${infoCount} informational. High-severity issues should be addressed for optimal competitive performance.`
  } else if (warningCount > 0) {
    summary = `Found ${findings.length} issue(s): ${warningCount} warning, ${infoCount} informational. No critical issues detected, but addressing warnings may improve performance consistency.`
  } else {
    summary = `Found ${findings.length} informational finding(s). No significant issues detected. System is in good shape for competitive play.`
  }

  // Highlight top domain issues in summary
  const domainCounts: Record<string, number> = {}
  for (const f of findings) {
    if (f.severity === 'critical' || f.severity === 'high') {
      domainCounts[f.domain] = (domainCounts[f.domain] || 0) + 1
    }
  }

  const domainNames: Record<string, string> = {
    kernel: 'Kernel/DPC/ISR',
    gpu: 'GPU',
    frame_pacing: 'Frame Pacing',
    network: 'Network',
    controller: 'Controller Input',
    display: 'Display',
    windows_config: 'Windows Configuration',
    processes: 'Background Processes',
  }

  const problemDomains = Object.entries(domainCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([domain, count]) => `${domainNames[domain] || domain} (${count})`)

  if (problemDomains.length > 0) {
    summary += ` Primary problem areas: ${problemDomains.join(', ')}.`
  }

  // Format findings for human consumption
  const formattedFindings = findings.map((f) => ({
    title: f.title,
    severity: f.severity.toUpperCase(),
    level: f.level.toUpperCase(),
    confidence: Math.round(f.confidence * 100),
    domain: domainNames[f.domain] || f.domain,
    observed: Object.entries(f.observed)
      .map(([key, value]) => `${key}: ${value}`)
      .join('; '),
    correlation: f.correlation
      ? `${f.correlation.metricA} ↔ ${f.correlation.metricB} — ${f.correlation.description}`
      : null,
    recommendation: f.recommendation,
    risk: f.risk.toUpperCase(),
    dataSource: f.dataSource,
  }))

  return {
    summary,
    findings: formattedFindings,
  }
}