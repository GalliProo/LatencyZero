// ─── LatencyMon TXT Report Parser ─────────────────────────────────────
// Parses real LatencyMon v7.x TXT report files into structured LatencyMonData.

import {
  type LatencyMonData,
  type RootCauseFinding,
  DPC_THRESHOLDS,
  ISR_THRESHOLDS,
} from '@/lib/types'

// ─── Internal Types ───────────────────────────────────────────────────

interface RawDriver {
  module: string
  dpcCount: number
  dpcTime: number
  isrCount: number
  isrTime: number
}

interface ParseContext {
  lines: string[]
  lineIndex: number
  errors: Array<{ line: number; message: string }>
}

// ─── Helpers ──────────────────────────────────────────────────────────

let findingCounter = 0
function nextFindingId(): string {
  return `lm-parse-${++findingCounter}`
}

function classifyDpcSeverity(timeUs: number): 'good' | 'warning' | 'critical' {
  if (timeUs < DPC_THRESHOLDS.good) return 'good'
  if (timeUs <= DPC_THRESHOLDS.high) return 'warning'
  return 'critical'
}

function classifyDpcSeverityFull(timeUs: number): 'info' | 'warning' | 'high' | 'critical' {
  if (timeUs < DPC_THRESHOLDS.good) return 'info'
  if (timeUs <= DPC_THRESHOLDS.lightWarning) return 'warning'
  if (timeUs <= DPC_THRESHOLDS.warning) return 'warning'
  if (timeUs <= DPC_THRESHOLDS.high) return 'high'
  return 'critical'
}

function classifyIsrSeverityFull(timeUs: number): 'info' | 'warning' | 'high' | 'critical' {
  if (timeUs < ISR_THRESHOLDS.good) return 'info'
  if (timeUs <= ISR_THRESHOLDS.warning) return 'warning'
  if (timeUs <= ISR_THRESHOLDS.high) return 'high'
  return 'critical'
}

function parseMsToUs(ms: number): number {
  return ms * 1000
}

function parseFloatSafe(s: string): number | null {
  const cleaned = s.trim().replace(/,/g, '')
  const n = parseFloat(cleaned)
  return Number.isFinite(n) ? n : null
}

function parseIntSafe(s: string): number | null {
  const cleaned = s.trim().replace(/,/g, '')
  const n = parseInt(cleaned, 10)
  return Number.isFinite(n) ? n : null
}

// ─── Section Parsing ──────────────────────────────────────────────────

function advanceToSection(ctx: ParseContext, sectionHeader: string): boolean {
  const normalized = sectionHeader.toUpperCase()
  for (let i = ctx.lineIndex; i < ctx.lines.length; i++) {
    if (ctx.lines[i].toUpperCase().includes(normalized)) {
      ctx.lineIndex = i + 1
      return true
    }
  }
  return false
}

function readTableRows(ctx: ParseContext): Array<Array<string>> {
  const rows: Array<Array<string>> = []
  // Skip header lines (lines with all-uppercase labels or separator lines)
  while (ctx.lineIndex < ctx.lines.length) {
    const line = ctx.lines[ctx.lineIndex]
    // Stop at next section or empty block
    if (!line.trim()) break
    if (isNextSectionHeader(ctx)) break
    // Skip column header lines (they typically have ALL CAPS or units in parens)
    if (isLikelyHeaderLine(line)) {
      ctx.lineIndex++
      continue
    }
    // Try to parse as data row
    const cells = line.trim().split(/\s{2,}|\t/).map(c => c.trim()).filter(Boolean)
    if (cells.length >= 2) {
      rows.push(cells)
    }
    ctx.lineIndex++
  }
  return rows
}

function isNextSectionHeader(ctx: ParseContext): boolean {
  if (ctx.lineIndex >= ctx.lines.length) return false
  const line = ctx.lines[ctx.lineIndex].trim().toUpperCase()
  const sectionMarkers = [
    'CONCLUSION',
    'HIGHEST EXECUTION',
    'HIGHEST INTERRUPT TO PROCESS',
    'HIGHEST DPC ROUTINE',
    'HIGHEST ISR ROUTINE',
    'DPC COUNT',
    'DPC TIME',
    'ISR COUNT',
    'ISR TIME',
    'HARD PAGEFAULTS',
    'PER-CPU',
    'REPORTED DPCS',
    'REPORTED ISRS',
    'DEFERRED PROCEDURE CALLS',
    'INTERRUPT SERVICE ROUTINES',
    'LATENCYMON',
    '────────',
    '--------------------------------',
  ]
  return sectionMarkers.some(m => line.includes(m))
}

function isLikelyHeaderLine(line: string): boolean {
  const upper = line.toUpperCase().trim()
  // Lines like "MODULE_NAME   EXECUTION_TIME (ms)" or "MODULE_NAME   COUNT"
  return (
    (upper.includes('MODULE') && (upper.includes('TIME') || upper.includes('COUNT'))) ||
    (upper.includes('PROCESS') && upper.includes('COUNT')) ||
    upper === 'MODULE_NAME' ||
    upper.includes('EXECUTION_TIME') ||
    upper.includes('TOTAL_TIME')
  )
}

// ─── Metadata Extraction ──────────────────────────────────────────────

function extractMetadata(ctx: ParseContext): {
  conclusion: string
  testDuration: string
  osBuild: string
  cpu: string
  biosVersion: string
} {
  let conclusion = ''
  let testDuration = ''
  let osBuild = ''
  let cpu = ''
  let biosVersion = ''

  for (const line of ctx.lines) {
    const trimmed = line.trim()
    const upper = trimmed.toUpperCase()

    // CONCLUSION
    if (upper.startsWith('CONCLUSION:')) {
      conclusion = trimmed.substring('CONCLUSION:'.length).trim()
      continue
    }
    if (upper.startsWith('CONCLUSION ')) {
      conclusion = trimmed.substring('CONCLUSION '.length).trim()
      // Remove leading dash/space
      conclusion = conclusion.replace(/^[-–—]\s*/, '').trim()
      continue
    }

    // Test duration
    if (upper.includes('TEST DURATION') || upper.includes('DURATION')) {
      const match = trimmed.match(/duration\s*:?\s*(\d{2}:\d{2}:\d{2}(?:\.\d+)?)/i)
      if (match) testDuration = match[1]
      continue
    }

    // OS
    if (upper.includes('OS:') || upper.startsWith('OS ')) {
      osBuild = trimmed.replace(/^OS\s*:?\s*/i, '').trim()
      continue
    }

    // CPU
    if (upper.includes('CPU:') || upper.startsWith('CPU ')) {
      cpu = trimmed.replace(/^CPU\s*:?\s*/i, '').trim()
      continue
    }

    // BIOS
    if (upper.includes('BIOS:') || upper.startsWith('BIOS ')) {
      biosVersion = trimmed.replace(/^BIOS\s*:?\s*/i, '').trim()
      continue
    }
  }

  return { conclusion, testDuration, osBuild, cpu, biosVersion }
}

// ─── Highest Execution Section ────────────────────────────────────────

function extractHighestExecution(ctx: ParseContext): {
  highestInterruptToProcessLatency: number
  highestDpcExecutionTime: number
  highestIsrExecutionTime: number
  highestDpcDriver: string
  highestIsrDriver: string
} {
  let highestInterruptToProcessLatency = 0
  let highestDpcExecutionTime = 0
  let highestIsrExecutionTime = 0
  let highestDpcDriver = ''
  let highestIsrDriver = ''

  // "HIGHEST EXECUTION (ms)" contains all three types
  // The table has rows with: module_name   execution_time
  // Then subsections for DPC and ISR

  if (advanceToSection(ctx, 'HIGHEST EXECUTION')) {
    const rows = readTableRows(ctx)
    // The highest overall (interrupt-to-process) is typically the first or has a summary line
    for (const row of rows) {
      if (row.length >= 2) {
        const val = parseFloatSafe(row[1])
        if (val !== null && val > highestInterruptToProcessLatency) {
          highestInterruptToProcessLatency = val
        }
      }
    }
  }

  // "HIGHEST INTERRUPT TO PROCESS LATENCY" - dedicated section (some reports have this separately)
  ctx.lineIndex = 0
  if (advanceToSection(ctx, 'HIGHEST INTERRUPT TO PROCESS')) {
    const rows = readTableRows(ctx)
    for (const row of rows) {
      if (row.length >= 2) {
        const val = parseFloatSafe(row[1])
        if (val !== null && val > highestInterruptToProcessLatency) {
          highestInterruptToProcessLatency = val
        }
      }
    }
  }

  // "HIGHEST DPC ROUTINE EXECUTION TIME"
  ctx.lineIndex = 0
  if (advanceToSection(ctx, 'HIGHEST DPC ROUTINE')) {
    const rows = readTableRows(ctx)
    for (const row of rows) {
      if (row.length >= 2) {
        const val = parseFloatSafe(row[1])
        if (val !== null && val > highestDpcExecutionTime) {
          highestDpcExecutionTime = val
          highestDpcDriver = row[0]
        }
      }
    }
  }

  // "HIGHEST ISR ROUTINE EXECUTION TIME"
  ctx.lineIndex = 0
  if (advanceToSection(ctx, 'HIGHEST ISR ROUTINE')) {
    const rows = readTableRows(ctx)
    for (const row of rows) {
      if (row.length >= 2) {
        const val = parseFloatSafe(row[1])
        if (val !== null && val > highestIsrExecutionTime) {
          highestIsrExecutionTime = val
          highestIsrDriver = row[0]
        }
      }
    }
  }

  return {
    highestInterruptToProcessLatency,
    highestDpcExecutionTime,
    highestIsrExecutionTime,
    highestDpcDriver,
    highestIsrDriver,
  }
}

// ─── Driver Tables ────────────────────────────────────────────────────

function extractDriverData(ctx: ParseContext): Map<string, RawDriver> {
  const drivers = new Map<string, RawDriver>()

  function ensureDriver(module: string): RawDriver {
    const key = module.toLowerCase()
    if (!drivers.has(key)) {
      drivers.set(key, { module, dpcCount: 0, dpcTime: 0, isrCount: 0, isrTime: 0 })
    }
    return drivers.get(key)!
  }

  // DPC COUNT
  ctx.lineIndex = 0
  if (advanceToSection(ctx, 'DPC COUNT')) {
    const rows = readTableRows(ctx)
    for (const row of rows) {
      // Skip "Total:" lines
      if (row[0].toUpperCase().startsWith('TOTAL')) continue
      if (row.length >= 2) {
        const count = parseIntSafe(row[1])
        if (count !== null) {
          const d = ensureDriver(row[0])
          d.dpcCount = count
        }
      }
    }
  }

  // DPC TIME
  ctx.lineIndex = 0
  if (advanceToSection(ctx, 'DPC TIME')) {
    const rows = readTableRows(ctx)
    for (const row of rows) {
      if (row[0].toUpperCase().startsWith('TOTAL')) continue
      if (row.length >= 2) {
        const time = parseFloatSafe(row[1])
        if (time !== null) {
          const d = ensureDriver(row[0])
          d.dpcTime = time
        }
      }
    }
  }

  // ISR COUNT
  ctx.lineIndex = 0
  if (advanceToSection(ctx, 'ISR COUNT')) {
    const rows = readTableRows(ctx)
    for (const row of rows) {
      if (row[0].toUpperCase().startsWith('TOTAL')) continue
      if (row.length >= 2) {
        const count = parseIntSafe(row[1])
        if (count !== null) {
          const d = ensureDriver(row[0])
          d.isrCount = count
        }
      }
    }
  }

  // ISR TIME
  ctx.lineIndex = 0
  if (advanceToSection(ctx, 'ISR TIME')) {
    const rows = readTableRows(ctx)
    for (const row of rows) {
      if (row[0].toUpperCase().startsWith('TOTAL')) continue
      if (row.length >= 2) {
        const time = parseFloatSafe(row[1])
        if (time !== null) {
          const d = ensureDriver(row[0])
          d.isrTime = time
        }
      }
    }
  }

  return drivers
}

// ─── Hard Pagefaults ──────────────────────────────────────────────────

function extractPagefaults(ctx: ParseContext): {
  totalHardPagefaults: number
  processWithHighestPagefaults: string
} {
  let totalHardPagefaults = 0
  let processWithHighestPagefaults = ''
  let highestPfCount = 0

  ctx.lineIndex = 0
  if (advanceToSection(ctx, 'HARD PAGEFAULTS')) {
    const rows = readTableRows(ctx)
    for (const row of rows) {
      if (row.length >= 2) {
        const count = parseIntSafe(row[1])
        if (count !== null) {
          if (count > highestPfCount) {
            highestPfCount = count
            processWithHighestPagefaults = row[0]
          }
        }
      }
    }
  }

  // Also check for "Total hard pagefaults:" line anywhere in the file
  for (const line of ctx.lines) {
    const match = line.match(/total\s+hard\s+pagefaults?\s*:?\s*([\d,]+)/i)
    if (match) {
      const val = parseIntSafe(match[1])
      if (val !== null && val > totalHardPagefaults) {
        totalHardPagefaults = val
      }
    }
  }

  return { totalHardPagefaults, processWithHighestPagefaults }
}

// ─── Per-CPU DPC/ISR ──────────────────────────────────────────────────

function extractPerCpu(ctx: ParseContext): Record<string, { dpc: number; isr: number }> | undefined {
  const result: Record<string, { dpc: number; isr: number }> = {}

  ctx.lineIndex = 0
  if (!advanceToSection(ctx, 'PER-CPU')) return undefined

  for (let i = ctx.lineIndex; i < ctx.lines.length; i++) {
    const line = ctx.lines[i].trim()
    if (!line) continue
    if (isNextSectionHeader({ ...ctx, lineIndex: i })) break

    // Match patterns like "CPU 0: DPC=123ms ISR=45ms" or "CPU0: DPC=123ms ISR=45ms"
    const match = line.match(/CPU\s*(\d+)\s*:\s*DPC\s*=\s*([\d.]+)\s*ms\s*ISR\s*=\s*([\d.]+)/i)
    if (match) {
      const cpuId = `CPU ${match[1]}`
      result[cpuId] = {
        dpc: parseFloat(match[2]),
        isr: parseFloat(match[3]),
      }
    }
  }

  return Object.keys(result).length > 0 ? result : undefined
}

// ─── Findings Generation ──────────────────────────────────────────────

function generateFindings(data: {
  highestDpcExecutionTime: number
  highestDpcDriver: string
  highestIsrExecutionTime: number
  highestIsrDriver: string
  highestInterruptToProcessLatency: number
  totalHardPagefaults: number
  processWithHighestPagefaults: string
  drivers: Map<string, RawDriver>
}): RootCauseFinding[] {
  const findings: RootCauseFinding[] = []
  const now = Date.now()

  // DPC severity
  const dpcUs = parseMsToUs(data.highestDpcExecutionTime)
  if (dpcUs > 0) {
    const dpcSev = classifyDpcSeverityFull(dpcUs)
    if (dpcSev !== 'info') {
      findings.push({
        id: nextFindingId(),
        title: `High DPC execution: ${data.highestDpcDriver}`,
        domain: 'kernel',
        severity: dpcSev,
        level: dpcSev === 'critical' ? 'confirmed' : dpcSev === 'high' ? 'likely' : 'possible',
        confidence: 0.90,
        dataSource: 'imported',
        observed: {
          driver: data.highestDpcDriver,
          highestDpcMs: data.highestDpcExecutionTime,
          highestDpcUs: dpcUs,
        },
        sources: ['LatencyMon TXT'],
        recommendation:
          dpcSev === 'critical'
            ? `Critical DPC latency from ${data.highestDpcDriver}. Update or rollback this driver. Disable any associated features not in use.`
            : dpcSev === 'high'
              ? `Elevated DPC latency from ${data.highestDpcDriver}. Check for driver updates and disable optional features.`
              : `Minor DPC latency from ${data.highestDpcDriver}. Monitor if this correlates with in-game stuttering.`,
        risk: dpcSev === 'critical' ? 'high' : dpcSev === 'high' ? 'medium' : 'low',
        timestamp: now,
      })
    }
  }

  // ISR severity
  const isrUs = parseMsToUs(data.highestIsrExecutionTime)
  if (isrUs > 0) {
    const isrSev = classifyIsrSeverityFull(isrUs)
    if (isrSev !== 'info') {
      findings.push({
        id: nextFindingId(),
        title: `High ISR execution: ${data.highestIsrDriver}`,
        domain: 'kernel',
        severity: isrSev,
        level: isrSev === 'critical' ? 'confirmed' : isrSev === 'high' ? 'likely' : 'possible',
        confidence: 0.90,
        dataSource: 'imported',
        observed: {
          driver: data.highestIsrDriver,
          highestIsrMs: data.highestIsrExecutionTime,
          highestIsrUs: isrUs,
        },
        sources: ['LatencyMon TXT'],
        recommendation:
          isrSev === 'critical'
            ? `Critical ISR latency from ${data.highestIsrDriver}. This driver is blocking CPU at hardware interrupt level. Update, rollback, or replace this driver immediately.`
            : isrSev === 'high'
              ? `Elevated ISR latency from ${data.highestIsrDriver}. Check for driver updates. Consider disabling the device if not needed.`
              : `Minor ISR latency from ${data.highestIsrDriver}. May cause occasional micro-stutters.`,
        risk: isrSev === 'critical' ? 'high' : isrSev === 'high' ? 'medium' : 'low',
        timestamp: now,
      })
    }
  }

  // Interrupt-to-process latency (overall system health)
  const i2pUs = parseMsToUs(data.highestInterruptToProcessLatency)
  if (i2pUs > DPC_THRESHOLDS.high) {
    findings.push({
      id: nextFindingId(),
      title: `Very high interrupt-to-process latency: ${(data.highestInterruptToProcessLatency).toFixed(2)}ms`,
      domain: 'kernel',
      severity: i2pUs > 2000 ? 'critical' : 'high',
      level: 'confirmed',
      confidence: 0.90,
      dataSource: 'imported',
      observed: {
        highestI2PMs: data.highestInterruptToProcessLatency,
        highestI2PUs: i2pUs,
      },
      sources: ['LatencyMon TXT'],
      recommendation:
        'Interrupt-to-process latency is extremely high. This indicates system-level issues such as driver conflicts, power management problems, or hardware faults. Run DPC latency check with drivers disabled to isolate.',
      risk: 'high',
      timestamp: now,
    })
  }

  // Hard pagefaults
  if (data.totalHardPagefaults > 1000) {
    findings.push({
      id: nextFindingId(),
      title: `Excessive hard pagefaults: ${data.totalHardPagefaults.toLocaleString()}`,
      domain: 'processes',
      severity: data.totalHardPagefaults > 10000 ? 'high' : 'warning',
      level: 'confirmed',
      confidence: 0.90,
      dataSource: 'imported',
      observed: {
        totalHardPagefaults: data.totalHardPagefaults,
        worstProcess: data.processWithHighestPagefaults,
      },
      sources: ['LatencyMon TXT'],
      recommendation: data.processWithHighestPagefaults
        ? `Process "${data.processWithHighestPagefaults}" is causing the most hard pagefaults. Close unnecessary background applications and consider adding more RAM.`
        : 'High hard pagefault count detected. Close background applications and ensure sufficient RAM is available.',
      risk: data.totalHardPagefaults > 10000 ? 'high' : 'medium',
      timestamp: now,
    })
  }

  // Per-driver findings for top offenders
  const driverEntries = Array.from(data.drivers.values())
    .sort((a, b) => {
      const aMax = Math.max(parseMsToUs(a.dpcTime), parseMsToUs(a.isrTime))
      const bMax = Math.max(parseMsToUs(b.dpcTime), parseMsToUs(b.isrTime))
      return bMax - aMax
    })
    .slice(0, 5)

  for (const driver of driverEntries) {
    const dpcUs = parseMsToUs(driver.dpcTime)
    const isrUs = parseMsToUs(driver.isrTime)
    const maxUs = Math.max(dpcUs, isrUs)

    // Skip the already-reported highest drivers
    if (driver.module.toLowerCase() === data.highestDpcDriver.toLowerCase() && dpcUs > 0) continue
    if (driver.module.toLowerCase() === data.highestIsrDriver.toLowerCase() && isrUs > 0) continue

    if (dpcUs > DPC_THRESHOLDS.warning) {
      const sev = classifyDpcSeverityFull(dpcUs)
      findings.push({
        id: nextFindingId(),
        title: `Elevated DPC time from ${driver.module}: ${driver.dpcTime.toFixed(3)}ms total`,
        domain: 'kernel',
        severity: sev,
        level: 'possible',
        confidence: 0.85,
        dataSource: 'imported',
        observed: {
          driver: driver.module,
          totalDpcMs: driver.dpcTime,
          totalDpcUs: dpcUs,
          dpcCount: driver.dpcCount,
        },
        sources: ['LatencyMon TXT'],
        recommendation: `Driver ${driver.module} accumulated significant DPC time. Check for driver updates or disable unused features.`,
        risk: sev === 'critical' || sev === 'high' ? 'medium' : 'low',
        timestamp: now,
      })
    }

    if (isrUs > ISR_THRESHOLDS.warning) {
      const sev = classifyIsrSeverityFull(isrUs)
      findings.push({
        id: nextFindingId(),
        title: `Elevated ISR time from ${driver.module}: ${driver.isrTime.toFixed(3)}ms total`,
        domain: 'kernel',
        severity: sev,
        level: 'possible',
        confidence: 0.85,
        dataSource: 'imported',
        observed: {
          driver: driver.module,
          totalIsrMs: driver.isrTime,
          totalIsrUs: isrUs,
          isrCount: driver.isrCount,
        },
        sources: ['LatencyMon TXT'],
        recommendation: `Driver ${driver.module} accumulated significant ISR time. Consider updating this driver or disabling the associated device.`,
        risk: sev === 'critical' || sev === 'high' ? 'medium' : 'low',
        timestamp: now,
      })
    }
  }

  return findings
}

// ─── Main Parser ──────────────────────────────────────────────────────

export class LatencyMonParseError extends Error {
  line?: number
  constructor(message: string, line?: number) {
    super(message)
    this.name = 'LatencyMonParseError'
    this.line = line
  }
}

export function parseLatencyMonTxt(content: string): LatencyMonData {
  findingCounter = 0

  if (!content || typeof content !== 'string') {
    throw new LatencyMonParseError('Empty or invalid input')
  }

  // Normalize line endings
  const normalized = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const lines = normalized.split('\n')

  const ctx: ParseContext = {
    lines,
    lineIndex: 0,
    errors: [],
  }

  // 1. Extract metadata
  const meta = extractMetadata(ctx)

  // 2. Extract highest execution times
  const highest = extractHighestExecution(ctx)

  // 3. Extract driver tables
  const driverMap = extractDriverData(ctx)

  // 4. Extract pagefaults
  const pf = extractPagefaults(ctx)

  // 5. Extract per-CPU data
  const perCpu = extractPerCpu(ctx)

  // 6. Build driver list with severity classification
  const drivers = Array.from(driverMap.values()).map(d => {
    const dpcUs = parseMsToUs(d.dpcTime)
    const isrUs = parseMsToUs(d.isrTime)
    const maxUs = Math.max(dpcUs, isrUs)
    let severity: 'good' | 'warning' | 'critical' = 'good'

    // Use the more severe of DPC or ISR classification
    const dpcSev = classifyDpcSeverity(dpcUs)
    const isrSev: 'good' | 'warning' | 'critical' = isrUs < ISR_THRESHOLDS.good ? 'good' : isrUs <= ISR_THRESHOLDS.high ? 'warning' : 'critical'

    if (dpcSev === 'critical' || isrSev === 'critical') severity = 'critical'
    else if (dpcSev === 'warning' || isrSev === 'warning') severity = 'warning'

    return {
      module: d.module,
      dpcCount: d.dpcCount,
      dpcTime: d.dpcTime,
      isrCount: d.isrCount,
      isrTime: d.isrTime,
      severity,
    }
  })

  // Sort drivers by total impact (DPC time + ISR time), descending
  drivers.sort((a, b) => (b.dpcTime + b.isrTime) - (a.dpcTime + a.isrTime))

  // 7. Generate findings
  const findings = generateFindings({
    highestDpcExecutionTime: highest.highestDpcExecutionTime,
    highestDpcDriver: highest.highestDpcDriver,
    highestIsrExecutionTime: highest.highestIsrExecutionTime,
    highestIsrDriver: highest.highestIsrDriver,
    highestInterruptToProcessLatency: highest.highestInterruptToProcessLatency,
    totalHardPagefaults: pf.totalHardPagefaults,
    processWithHighestPagefaults: pf.processWithHighestPagefaults,
    drivers: driverMap,
  })

  // 8. Assemble final result
  const result: LatencyMonData = {
    source: 'latencymon_txt',
    conclusion: meta.conclusion,
    testDuration: meta.testDuration,
    osBuild: meta.osBuild,
    cpu: meta.cpu,
    biosVersion: meta.biosVersion,
    highestInterruptToProcessLatency: highest.highestInterruptToProcessLatency,
    highestInterruptToDpcLatency: highest.highestDpcExecutionTime,
    highestIsrExecutionTime: highest.highestIsrExecutionTime,
    highestIsrDriver: highest.highestIsrDriver,
    highestDpcExecutionTime: highest.highestDpcExecutionTime,
    highestDpcDriver: highest.highestDpcDriver,
    totalHardPagefaults: pf.totalHardPagefaults,
    processWithHighestPagefaults: pf.processWithHighestPagefaults,
    perCpuDpcIsr: perCpu,
    drivers,
    findings,
  }

  return result
}