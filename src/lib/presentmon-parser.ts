// ─── LatencyZero — PresentMon CSV Parser ──────────────────────────────
// Robust parser for Intel PresentMon CSV captures.
// Handles column name variations, large files, and auto-detection.

import type { PresentMonData, RootCauseFinding } from '@/lib/types'

// ─── Column Alias Map ────────────────────────────────────────────────
// Maps canonical names to possible variations found in CSV headers
const COLUMN_ALIASES: Record<string, string[]> = {
  Application: ['Application', 'application', 'App', 'app', 'AppName'],
  ProcessID: ['ProcessID', 'processid', 'PID', 'pid', 'ProcessId'],
  TimeInSeconds: ['TimeInSeconds', 'timeinseconds', 'Time', 'time', 'TimeInSeconds(s)', 'TimeInSecond'],
  msBetweenPresents: ['msBetweenPresents', 'msbetweenpresents', 'msBetweenPresents(ms)', 'FrameTime', 'frametime', 'msBetweenPresent'],
  msInPresentAPI: ['msInPresentAPI', 'msinpresentapi', 'msInPresentAPI(ms)'],
  msUntilRenderComplete: ['msUntilRenderComplete', 'msuntilrendercomplete', 'msUntilRenderComplete(ms)', 'msUntilRender'],
  msUntilDisplayed: ['msUntilDisplayed', 'msuntildisplayed', 'msUntilDisplayed(ms)', 'DisplayLatency'],
  msBetweenDisplayChange: ['msBetweenDisplayChange', 'msbetweendisplaychange', 'msBetweenDisplayChange(ms)'],
  msUntilNextVSync: ['msUntilNextVSync', 'msuntilnextvsync', 'msUntilNextVSync(ms)', 'VSync'],
  GPUBusy: ['GPUBusy', 'gpubusy', 'GPU Busy', 'GpuBusy', 'GPU_Busy', 'GPUBusy(%)'],
  GPUBusy_details: ['GPUBusy_details', 'GPUBusy_Details', 'gpubusy_details'],
  WaitForPresent: ['WaitForPresent', 'waitforpresent', 'WaitForPresent(ms)'],
  WaitForVSync: ['WaitForVSync', 'waitforvsync', 'WaitForVSync(ms)'],
  VideoBusy: ['VideoBusy', 'videobusy', 'VideoBusy(%)'],
  GPUPrePresent: ['GPUPrePresent', 'gpuprepsent', 'GPUPrePresent(ms)'],
  GPUPostPresent: ['GPUPostPresent', 'gpupostpresent', 'GPUPostPresent(ms)'],
  CPUFrameTime: ['CPUFrameTime', 'cpuframetime', 'CPUFrameTime(ms)'],
  CPUBusy: ['CPUBusy', 'cpubusy', 'CPU Busy', 'CpuBusy', 'CPU_Busy', 'CPUBusy(%)'],
  CPUWait: ['CPUWait', 'cpuwait', 'CPU Wait', 'CpuWait', 'CPU_Wait', 'CPUWait(ms)'],
  Dropped: ['Dropped', 'dropped', 'DroppedFrames', 'droppedframes', 'FrameDropped'],
  PresentMode: ['PresentMode', 'presentmode', 'SyncMode'],
  Runtime: ['Runtime', 'runtime', 'API'],
  SyncInterval: ['SyncInterval', 'syncinterval'],
  AllowsTearing: ['AllowsTearing', 'allowstearing'],
  FrameType: ['FrameType', 'frametype'],
  DXGIAdapter: ['DXGIAdapter', 'dxgiadapter'],
  RandR: ['RandR', 'randr'],
  CPURenderThread: ['CPURenderThread', 'cpurenderthread'],
  GPUDuration: ['GPUDuration', 'gpuduration'],
  PresentFlags: ['PresentFlags', 'presentflags'],
  SwapChainAddress: ['SwapChainAddress', 'swapchainaddress'],
}

// Canonical columns we care about for analysis
const KEY_COLUMNS = [
  'TimeInSeconds',
  'msBetweenPresents',
  'Dropped',
  'GPUBusy',
  'msUntilDisplayed',
  'CPUBusy',
  'CPUWait',
  'WaitForPresent',
  'WaitForVSync',
  'CPUFrameTime',
  'GPUDuration',
] as const

// ─── Internal Types ──────────────────────────────────────────────────
interface ParsedRow {
  [key: string]: string
}

interface ColumnMap {
  [canonical: string]: number // index in header array
}

interface ParseOptions {
  maxChartPoints?: number
  spikeMultiplier?: number
}

const DEFAULT_OPTIONS: Required<ParseOptions> = {
  maxChartPoints: 500,
  spikeMultiplier: 2.0,
}

// ─── Utility Functions ───────────────────────────────────────────────

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0
  if (sorted.length === 1) return sorted[0]
  const index = (p / 100) * (sorted.length - 1)
  const lower = Math.floor(index)
  const upper = Math.ceil(index)
  if (lower === upper) return sorted[lower]
  const weight = index - lower
  return sorted[lower] * (1 - weight) + sorted[upper] * weight
}

function mean(values: number[]): number {
  if (values.length === 0) return 0
  return values.reduce((a, b) => a + b, 0) / values.length
}

function standardDeviation(values: number[], avg: number): number {
  if (values.length <= 1) return 0
  const sumSq = values.reduce((s, v) => s + (v - avg) ** 2, 0)
  return Math.sqrt(sumSq / (values.length - 1))
}

// ─── Header Detection ────────────────────────────────────────────────

function normalizeHeader(header: string): string {
  return header.trim().replace(/\s+/g, '').replace(/[\[\]()]/g, '')
}

function buildColumnMap(headers: string[]): ColumnMap {
  const normalized = headers.map(h => normalizeHeader(h))
  const map: ColumnMap = {}

  for (const [canonical, aliases] of Object.entries(COLUMN_ALIASES)) {
    for (const alias of aliases) {
      const normAlias = normalizeHeader(alias)
      const idx = normalized.indexOf(normAlias)
      if (idx !== -1) {
        map[canonical] = idx
        break
      }
    }
  }

  return map
}

function findHeaderRow(lines: string[]): { row: number; headers: string[] } {
  // PresentMon CSV headers typically contain known column names.
  // We scan the first 20 lines looking for one that matches multiple known columns.
  const knownIndicators = ['TimeInSeconds', 'msBetweenPresents', 'Application', 'Dropped', 'GPUBusy', 'CPUBusy']

  let bestRow = -1
  let bestMatchCount = 0

  const scanLimit = Math.min(lines.length, 20)

  for (let i = 0; i < scanLimit; i++) {
    const line = lines[i].trim()
    if (!line) continue

    // Skip lines that look like data (start with a number or contain mostly numeric values)
    const cols = splitCsvLine(line)
    let matchCount = 0
    for (const col of cols) {
      const norm = normalizeHeader(col)
      for (const indicator of knownIndicators) {
        if (norm === normalizeHeader(indicator)) {
          matchCount++
          break
        }
      }
    }

    // Also check for known indicator substrings for fuzzy match
    const lineLower = line.toLowerCase()
    if (lineLower.includes('timeinseconds') || lineLower.includes('timeinsecond')) matchCount++
    if (lineLower.includes('msbetweenpresents')) matchCount++

    if (matchCount > bestMatchCount) {
      bestMatchCount = matchCount
      bestRow = i
    }
  }

  if (bestRow === -1) {
    throw new ParseError('Could not auto-detect header row in CSV file. Ensure the file is a valid PresentMon CSV export.')
  }

  if (bestMatchCount < 2) {
    throw new ParseError(`Header detected at row ${bestRow + 1} but only matched ${bestMatchCount} known columns. File may not be a PresentMon CSV.`)
  }

  return {
    row: bestRow,
    headers: splitCsvLine(lines[bestRow]),
  }
}

// ─── CSV Line Splitter ───────────────────────────────────────────────
// Handles quoted fields properly (fields containing commas, newlines, quotes)

function splitCsvLine(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false
  let i = 0

  while (i < line.length) {
    const ch = line[i]

    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"'
          i += 2
          continue
        }
        inQuotes = false
      } else {
        current += ch
      }
    } else {
      if (ch === '"') {
        inQuotes = true
      } else if (ch === ',') {
        result.push(current.trim())
        current = ''
      } else {
        current += ch
      }
    }
    i++
  }

  result.push(current.trim())
  return result
}

// ─── Parse Error ─────────────────────────────────────────────────────

export class ParseError extends Error {
  constructor(
    message: string,
    public readonly row?: number,
  ) {
    super(message)
    this.name = 'PresentMonParseError'
  }
}

// ─── Frame Pacing Analysis ───────────────────────────────────────────

function analyzeFramePacing(
  frameTimes: number[],
  fpsValues: number[],
  options: Required<ParseOptions>,
): RootCauseFinding[] {
  const findings: RootCauseFinding[] = []

  if (frameTimes.length < 10) return findings

  const avgFt = mean(frameTimes)
  const stdFt = standardDeviation(frameTimes, avgFt)
  const cv = avgFt > 0 ? stdFt / avgFt : 0 // coefficient of variation

  // 1. High frame time variance
  if (cv > 0.15) {
    const maxSpike = Math.max(...frameTimes)
    const spikeCount = frameTimes.filter(ft => ft > avgFt * options.spikeMultiplier).length
    const spikePct = (spikeCount / frameTimes.length) * 100

    findings.push({
      id: 'pm-frame-pacing-variance',
      title: 'High Frame Time Variance',
      domain: 'frame_pacing',
      severity: cv > 0.3 ? 'high' : cv > 0.2 ? 'warning' : 'info',
      level: 'confirmed',
      confidence: 0.95,
      dataSource: 'imported',
      observed: {
        avgFrameTime: avgFt.toFixed(2) + ' ms',
        stdDeviation: stdFt.toFixed(2) + ' ms',
        coefficientOfVariation: (cv * 100).toFixed(1) + '%',
        maxSpike: maxSpike.toFixed(2) + ' ms',
        spikeCount: spikeCount.toString(),
        spikePercentage: spikePct.toFixed(1) + '%',
      },
      sources: ['PresentMon CSV'],
      recommendation:
        cv > 0.3
          ? 'Severe frame pacing inconsistency detected. Check for background processes, thermal throttling, or driver issues. Consider capping FPS to a sustainable target.'
          : 'Moderate frame pacing variance. Some frame spikes present. Consider FPS capping and investigating the specific spike patterns.',
      risk: cv > 0.3 ? 'high' : cv > 0.2 ? 'medium' : 'low',
      timestamp: Date.now(),
    })
  }

  // 2. Identify specific spike events (frames > 2x average)
  const spikeThreshold = avgFt * options.spikeMultiplier
  const spikes = frameTimes
    .map((ft, i) => ({ index: i, frameTime: ft }))
    .filter(s => s.frameTime > spikeThreshold)
    .sort((a, b) => b.frameTime - a.frameTime)

  if (spikes.length > 0) {
    const top5 = spikes.slice(0, 5)
    const top5Avg = mean(top5.map(s => s.frameTime))
    const worstSpike = spikes[0]

    if (spikes.length >= 5) {
      findings.push({
        id: 'pm-frame-spikes',
        title: `Frame Spikes Detected (${spikes.length} total)`,
        domain: 'frame_pacing',
        severity: worstSpike.frameTime > avgFt * 3 ? 'critical' : worstSpike.frameTime > avgFt * 2.5 ? 'high' : 'warning',
        level: 'confirmed',
        confidence: 0.95,
        dataSource: 'imported',
        observed: {
          totalSpikes: spikes.length.toString(),
          worstSpike: worstSpike.frameTime.toFixed(2) + ' ms',
          worstSpikeMultiplier: (worstSpike.frameTime / avgFt).toFixed(1) + 'x',
          top5Average: top5Avg.toFixed(2) + ' ms',
          spikeThreshold: spikeThreshold.toFixed(2) + ' ms',
        },
        correlation: {
          metricA: 'msBetweenPresents',
          metricB: 'Frame spike pattern',
          timeDeltaMs: 0,
          description: `Worst spike is ${(worstSpike.frameTime / avgFt).toFixed(1)}x the average frame time`,
        },
        sources: ['PresentMon CSV'],
        recommendation:
          worstSpike.frameTime > avgFt * 3
            ? 'Critical frame spikes detected — likely causing visible stutters. Investigate: shader compilation stalls, GPU driver TDR, background disk I/O, or page faults during gameplay.'
            : 'Recurring frame spikes detected. Common causes: shader compilation, driver overhead, OS scheduling interruptions, or V-Sync mismatches.',
        risk: worstSpike.frameTime > avgFt * 3 ? 'high' : 'medium',
        timestamp: Date.now(),
      })
    }
  }

  // 3. 1% low analysis — if 1% low is significantly below average
  if (fpsValues.length >= 100) {
    const onePct = percentile(fpsValues, 1)
    const avgFps = mean(fpsValues)
    const onePctRatio = avgFps > 0 ? onePct / avgFps : 1

    if (onePctRatio < 0.5) {
      findings.push({
        id: 'pm-low-one-percent',
        title: '1% Low FPS Significantly Below Average',
        domain: 'frame_pacing',
        severity: onePctRatio < 0.3 ? 'high' : 'warning',
        level: 'confirmed',
        confidence: 0.95,
        dataSource: 'imported',
        observed: {
          onePercentLow: onePct.toFixed(1) + ' FPS',
          averageFps: avgFps.toFixed(1) + ' FPS',
          ratio: (onePctRatio * 100).toFixed(0) + '%',
          deficit: (avgFps - onePct).toFixed(1) + ' FPS',
        },
        sources: ['PresentMon CSV'],
        recommendation:
          'The 1% low FPS is well below average, indicating frequent frame drops. This causes noticeable stuttering in competitive gameplay. Check for CPU/GPU bottlenecks, thermal throttling, and background process interference.',
        risk: onePctRatio < 0.3 ? 'high' : 'medium',
        timestamp: Date.now(),
      })
    }
  }

  // 4. 0.1% low analysis
  if (fpsValues.length >= 1000) {
    const pointOnePct = percentile(fpsValues, 0.1)
    const avgFps = mean(fpsValues)
    const ratio = avgFps > 0 ? pointOnePct / avgFps : 1

    if (ratio < 0.3) {
      findings.push({
        id: 'pm-low-point-one-percent',
        title: '0.1% Low FPS — Extreme Dips Detected',
        domain: 'frame_pacing',
        severity: 'high',
        level: 'confirmed',
        confidence: 0.95,
        dataSource: 'imported',
        observed: {
          pointOnePercentLow: pointOnePct.toFixed(1) + ' FPS',
          averageFps: avgFps.toFixed(1) + ' FPS',
          ratio: (ratio * 100).toFixed(0) + '%',
        },
        sources: ['PresentMon CSV'],
        recommendation:
          'Extreme frame dips detected in the worst 0.1% of frames. These cause micro-stutters that are perceptible in competitive play. Investigate shader compilation, storage speed, and OS power management.',
        risk: 'high',
        timestamp: Date.now(),
      })
    }
  }

  // 5. Frame pacing consistency — check for rhythmic patterns (V-Sync issues)
  if (frameTimes.length >= 60) {
    // Check if frame times cluster around specific values (indicates V-Sync / refresh rate alignment)
    const rounded = frameTimes.map(ft => Math.round(ft * 10) / 10) // round to 0.1ms
    const freq: Record<number, number> = {}
    for (const r of rounded) {
      freq[r] = (freq[r] || 0) + 1
    }

    const entries = Object.entries(freq).sort((a, b) => b[1] - a[1])
    if (entries.length > 0) {
      const topFreq = entries[0]
      const topPct = (Number(topFreq[1]) / frameTimes.length) * 100

      // If >40% of frames cluster at one value and that value suggests V-Sync
      const clusterMs = Number(topFreq[0])
      if (topPct > 40 && (clusterMs >= 15.5 && clusterMs <= 17.5)) {
        findings.push({
          id: 'pm-vsync-60hz',
          title: 'Frame Times Cluster at ~60Hz (16.67ms)',
          domain: 'display',
          severity: 'info',
          level: 'possible',
          confidence: 0.8,
          dataSource: 'imported',
          observed: {
            dominantFrameTime: clusterMs.toFixed(1) + ' ms',
            percentage: topPct.toFixed(1) + '%',
            totalDistinctValues: entries.length.toString(),
          },
          sources: ['PresentMon CSV'],
          recommendation:
            'Frame times appear to cluster at 60Hz intervals. If your display supports higher refresh rates, ensure V-Sync is off or set to match your monitor refresh rate.',
          risk: 'low',
          timestamp: Date.now(),
        })
      } else if (topPct > 40 && (clusterMs >= 6.4 && clusterMs <= 7.5)) {
        findings.push({
          id: 'pm-vsync-144hz',
          title: 'Frame Times Cluster at ~144Hz (6.94ms)',
          domain: 'display',
          severity: 'info',
          level: 'possible',
          confidence: 0.8,
          dataSource: 'imported',
          observed: {
            dominantFrameTime: clusterMs.toFixed(1) + ' ms',
            percentage: topPct.toFixed(1) + '%',
            totalDistinctValues: entries.length.toString(),
          },
          sources: ['PresentMon CSV'],
          recommendation:
            'Frame times are well-aligned to 144Hz refresh rate. This is good for frame pacing consistency.',
          risk: 'none',
          timestamp: Date.now(),
        })
      }
    }
  }

  return findings
}

// ─── Sample Frame Time Data for Charting ─────────────────────────────

function sampleFrameTimeData(
  times: string[],
  frameTimes: number[],
  maxPoints: number,
): Array<{ time: string; frameTime: number }> {
  if (times.length === 0) return []

  if (times.length <= maxPoints) {
    return times.map((t, i) => ({ time: t, frameTime: frameTimes[i] }))
  }

  // Uniform sampling
  const step = times.length / maxPoints
  const result: Array<{ time: string; frameTime: number }> = []
  for (let i = 0; i < maxPoints; i++) {
    const idx = Math.min(Math.floor(i * step), times.length - 1)
    result.push({ time: times[idx], frameTime: frameTimes[idx] })
  }

  // Always include the last point
  const lastIdx = times.length - 1
  if (result[result.length - 1].time !== times[lastIdx]) {
    result[result.length - 1] = { time: times[lastIdx], frameTime: frameTimes[lastIdx] }
  }

  return result
}

// ─── Main Parser ─────────────────────────────────────────────────────

export function parsePresentMonCsv(csvContent: string, options?: ParseOptions): PresentMonData {
  const opts = { ...DEFAULT_OPTIONS, ...options }

  // Split into lines, handling CRLF and LF
  const lines = csvContent.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')

  if (lines.length < 2) {
    throw new ParseError('CSV file is empty or contains only a header row.')
  }

  // Auto-detect header row
  const { row: headerRow, headers } = findHeaderRow(lines)
  const colMap = buildColumnMap(headers)

  // Verify we have the essential column
  if (colMap['msBetweenPresents'] === undefined) {
    throw new ParseError(
      'Required column "msBetweenPresents" not found in CSV header. Ensure this is a valid PresentMon CSV export.',
      headerRow + 1,
    )
  }

  // Parse data rows efficiently
  const frameTimes: number[] = []
  const fpsValues: number[] = []
  const timeValues: string[] = []
  const droppedValues: number[] = []
  const gpuBusyValues: number[] = []
  const displayLatencyValues: number[] = []
  const cpuBusyValues: number[] = []
  const cpuWaitValues: number[] = []
  const waitForPresentValues: number[] = []
  const waitForVSyncValues: number[] = []

  const hasTime = colMap['TimeInSeconds'] !== undefined
  const hasDropped = colMap['Dropped'] !== undefined
  const hasGpuBusy = colMap['GPUBusy'] !== undefined
  const hasDisplayLatency = colMap['msUntilDisplayed'] !== undefined
  const hasCpuBusy = colMap['CPUBusy'] !== undefined
  const hasCpuWait = colMap['CPUWait'] !== undefined
  const hasWaitForPresent = colMap['WaitForPresent'] !== undefined
  const hasWaitForVSync = colMap['WaitForVSync'] !== undefined

  const msBetweenCol = colMap['msBetweenPresents']
  const timeCol = hasTime ? colMap['TimeInSeconds']! : -1
  const droppedCol = hasDropped ? colMap['Dropped']! : -1
  const gpuBusyCol = hasGpuBusy ? colMap['GPUBusy']! : -1
  const displayLatCol = hasDisplayLatency ? colMap['msUntilDisplayed']! : -1
  const cpuBusyCol = hasCpuBusy ? colMap['CPUBusy']! : -1
  const cpuWaitCol = hasCpuWait ? colMap['CPUWait']! : -1
  const waitPresentCol = hasWaitForPresent ? colMap['WaitForPresent']! : -1
  const waitVSyncCol = hasWaitForVSync ? colMap['WaitForVSync']! : -1

  let parseErrorRow: number | undefined

  for (let i = headerRow + 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue

    const cols = splitCsvLine(line)

    // Parse msBetweenPresents (required)
    const msRaw = cols[msBetweenCol]
    if (!msRaw) continue

    const ms = parseFloat(msRaw)
    if (isNaN(ms) || ms < 0) {
      if (!parseErrorRow) parseErrorRow = i + 1
      continue
    }

    frameTimes.push(ms)

    // Derive FPS
    if (ms > 0) {
      fpsValues.push(1000 / ms)
    }

    // Time
    if (hasTime && cols[timeCol]) {
      timeValues.push(cols[timeCol])
    }

    // Optional columns
    if (hasDropped && cols[droppedCol] !== undefined && cols[droppedCol] !== '') {
      const d = parseFloat(cols[droppedCol])
      if (!isNaN(d)) droppedValues.push(d)
    }

    if (hasGpuBusy && cols[gpuBusyCol] !== undefined && cols[gpuBusyCol] !== '') {
      const g = parseFloat(cols[gpuBusyCol])
      if (!isNaN(g)) gpuBusyValues.push(g)
    }

    if (hasDisplayLatency && cols[displayLatCol] !== undefined && cols[displayLatCol] !== '') {
      const dl = parseFloat(cols[displayLatCol])
      if (!isNaN(dl) && dl >= 0) displayLatencyValues.push(dl)
    }

    if (hasCpuBusy && cols[cpuBusyCol] !== undefined && cols[cpuBusyCol] !== '') {
      const cb = parseFloat(cols[cpuBusyCol])
      if (!isNaN(cb)) cpuBusyValues.push(cb)
    }

    if (hasCpuWait && cols[cpuWaitCol] !== undefined && cols[cpuWaitCol] !== '') {
      const cw = parseFloat(cols[cpuWaitCol])
      if (!isNaN(cw) && cw >= 0) cpuWaitValues.push(cw)
    }

    if (hasWaitForPresent && cols[waitPresentCol] !== undefined && cols[waitPresentCol] !== '') {
      const wp = parseFloat(cols[waitPresentCol])
      if (!isNaN(wp) && wp >= 0) waitForPresentValues.push(wp)
    }

    if (hasWaitForVSync && cols[waitVSyncCol] !== undefined && cols[waitVSyncCol] !== '') {
      const wv = parseFloat(cols[waitVSyncCol])
      if (!isNaN(wv) && wv >= 0) waitForVSyncValues.push(wv)
    }
  }

  if (frameTimes.length === 0) {
    throw new ParseError(
      'No valid frame data found after the header. Ensure the CSV contains numeric "msBetweenPresents" values.',
      parseErrorRow,
    )
  }

  // ─── Calculate Metrics ───────────────────────────────────────────

  const sortedFrameTimes = [...frameTimes].sort((a, b) => a - b)
  const sortedFps = [...fpsValues].sort((a, b) => a - b)

  const totalFrames = frameTimes.length
  const avgFrameTime = mean(frameTimes)
  const avgFps = avgFrameTime > 0 ? 1000 / avgFrameTime : 0
  const frameTimeP95 = percentile(sortedFrameTimes, 95)
  const frameTimeP99 = percentile(sortedFrameTimes, 99)
  const onePercentLow = percentile(sortedFps, 1)
  const pointOnePercentLow = percentile(sortedFps, 0.1)

  // Dropped frames (sum or count depending on column format)
  let droppedFrames: number | null = null
  if (droppedValues.length > 0) {
    // PresentMon "Dropped" column is typically 0 or 1 per row
    const maxDropped = Math.max(...droppedValues)
    if (maxDropped <= 1) {
      // Per-row dropped flag — sum the 1s
      droppedFrames = droppedValues.reduce((a, b) => a + b, 0)
    } else {
      // Cumulative count — take the last value
      droppedFrames = droppedValues[droppedValues.length - 1]
    }
  }

  const gpuBusy = gpuBusyValues.length > 0 ? mean(gpuBusyValues) : null
  const displayLatency = displayLatencyValues.length > 0 ? mean(displayLatencyValues) : null
  const cpuBusy = cpuBusyValues.length > 0 ? mean(cpuBusyValues) : null
  const cpuWait = cpuWaitValues.length > 0 ? mean(cpuWaitValues) : null

  // GPU Busy/Wait = average of WaitForPresent + WaitForVSync
  let gpuBusyWait: number | null = null
  const gpuWaitValues: number[] = [...waitForPresentValues, ...waitForVSyncValues]
  if (gpuWaitValues.length > 0) {
    gpuBusyWait = mean(gpuWaitValues)
  }

  // Frame time data for charting
  const frameTimeData = sampleFrameTimeData(timeValues, frameTimes, opts.maxChartPoints)

  // Frame pacing analysis
  const findings = analyzeFramePacing(frameTimes, fpsValues, opts)

  // ─── Construct Result ────────────────────────────────────────────

  return {
    source: 'presentmon_csv',
    totalFrames,
    avgFps: Math.round(avgFps * 100) / 100,
    avgFrameTime: Math.round(avgFrameTime * 100) / 100,
    frameTimeP95: Math.round(frameTimeP95 * 100) / 100,
    frameTimeP99: Math.round(frameTimeP99 * 100) / 100,
    onePercentLow: Math.round(onePercentLow * 100) / 100,
    pointOnePercentLow: Math.round(pointOnePercentLow * 100) / 100,
    droppedFrames,
    gpuBusy: gpuBusy !== null ? Math.round(gpuBusy * 100) / 100 : null,
    displayLatency: displayLatency !== null ? Math.round(displayLatency * 100) / 100 : null,
    cpuBusy: cpuBusy !== null ? Math.round(cpuBusy * 100) / 100 : null,
    cpuWait: cpuWait !== null ? Math.round(cpuWait * 100) / 100 : null,
    gpuBusyWait: gpuBusyWait !== null ? Math.round(gpuBusyWait * 100) / 100 : null,
    frameTimeData,
    findings,
  }
}