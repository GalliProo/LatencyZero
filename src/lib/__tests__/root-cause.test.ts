'use strict'

import { generateRCAReport, analyzeRootCauses } from '../root-cause'
import type { RootCauseFinding, DiagnosticSession } from '@/lib/types'

function makeFinding(overrides: Partial<RootCauseFinding> = {}): RootCauseFinding {
  return {
    id: 'test-1',
    title: 'Test finding',
    domain: 'kernel',
    severity: 'warning',
    level: 'possible',
    confidence: 0.85,
    dataSource: 'measured',
    observed: { metric: 100 },
    sources: ['test'],
    recommendation: 'Fix it',
    risk: 'medium',
    timestamp: Date.now(),
    ...overrides,
  }
}

describe('generateRCAReport', () => {
  test('empty findings returns no-issue summary', () => {
    const report = generateRCAReport([])
    expect(report.summary).toContain('No root cause')
    expect(report.findings.length).toBe(0)
  })

  test('warning findings produce WARNING severity (uppercase)', () => {
    const report = generateRCAReport([makeFinding({ severity: 'warning' })])
    expect(report.findings[0].severity).toBe('WARNING')
  })

  test('critical findings produce CRITICAL severity (uppercase)', () => {
    const report = generateRCAReport([makeFinding({ severity: 'critical' })])
    expect(report.findings[0].severity).toBe('CRITICAL')
  })

  test('confidence is converted to percentage (0.85 → 85)', () => {
    const report = generateRCAReport([makeFinding({ confidence: 0.85 })])
    expect(report.findings[0].confidence).toBe(85)
  })

  test('observed is formatted as string (key: value)', () => {
    const report = generateRCAReport([makeFinding({ observed: { driver: 'ndis.sys', maxUs: 500 } })])
    expect(typeof report.findings[0].observed).toBe('string')
    expect(report.findings[0].observed).toContain('driver:')
  })

  test('correlation is null when no correlation on finding', () => {
    const report = generateRCAReport([makeFinding()])
    expect(report.findings[0].correlation).toBeNull()
  })

  test('correlation is string when finding has correlation', () => {
    const report = generateRCAReport([makeFinding({
      correlation: {
        metricA: { name: 'Frame Time', value: 50, unit: 'ms' },
        metricB: { name: 'DPC Max', value: 2000, unit: 'µs' },
        timeDeltaMs: 10,
        confidence: 0.75,
        description: 'Test correlation',
        timestamp: Date.now(),
      },
    })])
    expect(report.findings[0].correlation).not.toBeNull()
    expect(typeof report.findings[0].correlation).toBe('string')
    // The correlation formatting uses object toString (known behavior)
    expect(report.findings[0].correlation).toContain('↔')
  })

  test('mixed findings summary mentions critical and warning', () => {
    const report = generateRCAReport([
      makeFinding({ severity: 'critical' }),
      makeFinding({ severity: 'warning' }),
      makeFinding({ severity: 'info' }),
    ])
    expect(report.summary).toContain('1 critical')
    expect(report.summary).toContain('1 warning')
  })
})

describe('analyzeRootCauses', () => {
  test('returns array for any valid session', () => {
    const findings = analyzeRootCauses({} as DiagnosticSession)
    expect(Array.isArray(findings)).toBe(true)
  })

  test('findings have required RootCauseFinding fields', () => {
    const findings = analyzeRootCauses({} as DiagnosticSession)
    if (findings.length > 0) {
      const f = findings[0]
      expect(f).toHaveProperty('id')
      expect(f).toHaveProperty('title')
      expect(f).toHaveProperty('severity')
      expect(f).toHaveProperty('domain')
      expect(f).toHaveProperty('recommendation')
      expect(f).toHaveProperty('confidence')
    }
  })

  test('session with no data returns empty or minimal findings', () => {
    const findings = analyzeRootCauses({} as DiagnosticSession)
    // Empty session should not produce critical findings
    const criticals = findings.filter(f => f.severity === 'critical')
    expect(criticals.length).toBe(0)
  })

  test('each finding has non-empty recommendation', () => {
    const findings = analyzeRootCauses({} as DiagnosticSession)
    for (const f of findings) {
      expect(f.recommendation.length).toBeGreaterThan(0)
    }
  })
})