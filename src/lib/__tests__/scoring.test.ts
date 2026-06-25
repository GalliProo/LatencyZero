'use strict'

import { calculateOverallScore } from '../scoring'

describe('Scoring Engine', () => {
  test('null session returns score 0 with all categories at -1', () => {
    const score = calculateOverallScore({
      liveMetrics: null,
      systemInfo: null,
      gpuInfo: null,
      networkInfo: null,
      processInfo: null,
      displayInfo: null,
      controllerInfo: null,
      latencyMonData: null,
      presentMonData: null,
    })
    expect(score.score).toBe(0)
    expect(score.categories.length).toBe(8)
    const unavailable = score.categories.filter(c => c.score < 0)
    expect(unavailable.length).toBe(8)
  })

  test('always returns exactly 8 categories', () => {
    const score = calculateOverallScore({
      liveMetrics: null,
      systemInfo: null,
      gpuInfo: null,
      networkInfo: null,
      processInfo: null,
      displayInfo: null,
      controllerInfo: null,
      latencyMonData: null,
      presentMonData: null,
    })
    expect(score.categories.length).toBe(8)
    const catNames = score.categories.map(c => c.category)
    expect(catNames).toContain('kernel_latency')
    expect(catNames).toContain('frame_pacing')
    expect(catNames).toContain('gpu_stability')
    expect(catNames).toContain('network_quality')
    expect(catNames).toContain('controller_input')
    expect(catNames).toContain('display_config')
    expect(catNames).toContain('windows_config')
    expect(catNames).toContain('background_processes')
  })

  test('scores are clamped between 0 and 100 (or -1 for unavailable)', () => {
    const score = calculateOverallScore({
      liveMetrics: null,
      systemInfo: null,
      gpuInfo: null,
      networkInfo: null,
      processInfo: null,
      displayInfo: null,
      controllerInfo: null,
      latencyMonData: null,
      presentMonData: null,
    })
    for (const cat of score.categories) {
      if (cat.score >= 0) {
        expect(cat.score).toBeGreaterThanOrEqual(0)
        expect(cat.score).toBeLessThanOrEqual(100)
      } else {
        expect(cat.score).toBe(-1)
      }
    }
    expect(score.score).toBeGreaterThanOrEqual(0)
    expect(score.score).toBeLessThanOrEqual(100)
  })

  test('mode is demo when no real data is available', () => {
    const score = calculateOverallScore({
      liveMetrics: null,
      systemInfo: null,
      gpuInfo: null,
      networkInfo: null,
      processInfo: null,
      displayInfo: null,
      controllerInfo: null,
      latencyMonData: null,
      presentMonData: null,
    })
    expect(score.mode).toBe('demo')
    expect(score.simulatedRatio).toBeGreaterThan(0)
  })

  test('grade is one of S, A, B, C, F', () => {
    const score = calculateOverallScore({
      liveMetrics: null,
      systemInfo: null,
      gpuInfo: null,
      networkInfo: null,
      processInfo: null,
      displayInfo: null,
      controllerInfo: null,
      latencyMonData: null,
      presentMonData: null,
    })
    expect(['S', 'A', 'B', 'C', 'F']).toContain(score.grade)
  })

  test('label is a non-empty string', () => {
    const score = calculateOverallScore({
      liveMetrics: null,
      systemInfo: null,
      gpuInfo: null,
      networkInfo: null,
      processInfo: null,
      displayInfo: null,
      controllerInfo: null,
      latencyMonData: null,
      presentMonData: null,
    })
    expect(score.label).toBeTruthy()
    expect(score.label.length).toBeGreaterThan(0)
  })

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  test('imported LatencyMon data with good values yields high kernel_latency score', () => {
    /* eslint-disable @typescript-eslint/no-require-imports */
    const { parseLatencyMonTxt } = require('../latencymon-parser')
    const { readFileSync } = require('fs')
    const { join } = require('path')
    /* eslint-enable @typescript-eslint/no-require-imports */

    const goodContent = readFileSync(join(__dirname, '..', '..', '..', 'samples', 'latencymon-good.txt'), 'utf-8')
    const lmData = parseLatencyMonTxt(goodContent)

    const score = calculateOverallScore({
      liveMetrics: null,
      systemInfo: null,
      gpuInfo: null,
      networkInfo: null,
      processInfo: null,
      displayInfo: null,
      controllerInfo: null,
      latencyMonData: lmData,
      presentMonData: null,
    })

    const kernelCat = score.categories.find(c => c.category === 'kernel_latency')
    expect(kernelCat).toBeDefined()
    expect(kernelCat!.score).toBeGreaterThanOrEqual(80)
  })

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  test('imported LatencyMon data shifts mode from demo toward real', () => {
    /* eslint-disable @typescript-eslint/no-require-imports */
    const { parseLatencyMonTxt } = require('../latencymon-parser')
    const { readFileSync } = require('fs')
    const { join } = require('path')
    /* eslint-enable @typescript-eslint/no-require-imports */

    const goodContent = readFileSync(join(__dirname, '..', '..', '..', 'samples', 'latencymon-good.txt'), 'utf-8')
    const lmData = parseLatencyMonTxt(goodContent)

    const noData = calculateOverallScore({
      liveMetrics: null, systemInfo: null, gpuInfo: null,
      networkInfo: null, processInfo: null, displayInfo: null,
      controllerInfo: null, latencyMonData: null, presentMonData: null,
    })
    const withLM = calculateOverallScore({
      liveMetrics: null, systemInfo: null, gpuInfo: null,
      networkInfo: null, processInfo: null, displayInfo: null,
      controllerInfo: null, latencyMonData: lmData, presentMonData: null,
    })

    // Having real LatencyMon data should reduce the simulated ratio
    expect(withLM.simulatedRatio).toBeLessThan(noData.simulatedRatio)
  })
})