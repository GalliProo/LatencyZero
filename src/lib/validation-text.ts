// ─── LatencyZero — Validation Text Generator ─────────────────────────
// Generates human-readable Italian validation text from parsed data.

import type { LatencyMonData } from '@/lib/types'

/**
 * Generate a validation text summary from LatencyMon parsed data.
 * Returns an array of strings, each describing a validation check result.
 */
export function generateLatencyMonValidation(data: LatencyMonData): string[] {
  const lines: string[] = []

  // Overall conclusion
  if (data.conclusion) {
    lines.push(`Conclusione LatencyMon: ${data.conclusion}`)
  }

  // Highest DPC
  if (data.highestDpcExecutionTime > 0) {
    const dpcUs = data.highestDpcExecutionTime * 1000
    lines.push(`DPC massimo: ${data.highestDpcExecutionTime.toFixed(3)}ms (${dpcUs.toFixed(0)}µs) — Driver: ${data.highestDpcDriver || 'N/A'}`)
  }

  // Highest ISR
  if (data.highestIsrExecutionTime > 0) {
    const isrUs = data.highestIsrExecutionTime * 1000
    lines.push(`ISR massimo: ${data.highestIsrExecutionTime.toFixed(3)}ms (${isrUs.toFixed(0)}µs) — Driver: ${data.highestIsrDriver || 'N/A'}`)
  }

  // Pagefaults
  if (data.totalHardPagefaults > 0) {
    lines.push(`Hard pagefault totali: ${data.totalHardPagefaults.toLocaleString()}${data.processWithHighestPagefaults ? ` (peggiore: ${data.processWithHighestPagefaults})` : ''}`)
  }

  // Driver count
  if (data.drivers && data.drivers.length > 0) {
    const critical = data.drivers.filter(d => d.severity === 'critical').length
    const warning = data.drivers.filter(d => d.severity === 'warning').length
    const good = data.drivers.filter(d => d.severity === 'good').length
    lines.push(`Driver analizzati: ${data.drivers.length} (${good} OK, ${warning} warning, ${critical} critici)`)
  }

  return lines
}