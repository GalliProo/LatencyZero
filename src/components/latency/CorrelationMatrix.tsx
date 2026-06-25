'use client'

import { useState, useMemo, useCallback } from 'react'
import { motion } from 'framer-motion'
import { GitBranch, Check, Filter } from 'lucide-react'
import type { MetricsData } from './types'

interface CorrelationMatrixProps {
  latencyData: Array<{ time: string; dpc: number; isr: number }>
  frameTimeData: Array<{ time: string; frameTime: number }>
  pingData: Array<{ time: string; ping: number }>
  metrics: MetricsData | null
}

const METRIC_LABELS = [
  'DPC',
  'ISR',
  'Frame',
  'Ping',
  'GPU°',
  'CPU%',
] as const

const METRIC_FULL_NAMES = [
  'DPC Latency',
  'ISR Latency',
  'Frame Time',
  'Ping',
  'GPU Temp',
  'CPU Usage',
] as const

function pearsonCorrelation(x: number[], y: number[]): number {
  const n = Math.min(x.length, y.length)
  if (n < 3) return 0

  const sx = x.slice(0, n)
  const sy = y.slice(0, n)

  const meanX = sx.reduce((a, b) => a + b, 0) / n
  const meanY = sy.reduce((a, b) => a + b, 0) / n

  let num = 0
  let denX = 0
  let denY = 0

  for (let i = 0; i < n; i++) {
    const dx = sx[i] - meanX
    const dy = sy[i] - meanY
    num += dx * dy
    denX += dx * dx
    denY += dy * dy
  }

  const den = Math.sqrt(denX * denY)
  if (den === 0) return 0
  return num / den
}

function getCellColor(r: number): { bg: string; border: string } {
  const abs = Math.abs(r)
  if (r > 0.5) {
    return {
      bg: `rgba(0, 255, 136, ${0.08 + abs * 0.22})`,
      border: `rgba(0, 255, 136, ${0.1 + abs * 0.3})`,
    }
  }
  if (r > 0.1) {
    return {
      bg: `rgba(0, 255, 136, ${abs * 0.12})`,
      border: `rgba(0, 255, 136, ${abs * 0.15})`,
    }
  }
  if (r >= -0.1) {
    return {
      bg: 'rgba(255, 255, 255, 0.03)',
      border: 'rgba(255, 255, 255, 0.06)',
    }
  }
  if (r > -0.5) {
    return {
      bg: `rgba(255, 51, 102, ${abs * 0.12})`,
      border: `rgba(255, 51, 102, ${abs * 0.15})`,
    }
  }
  return {
    bg: `rgba(255, 51, 102, ${0.08 + abs * 0.22})`,
    border: `rgba(255, 51, 102, ${0.1 + abs * 0.3})`,
  }
}

function getTextColor(r: number): string {
  if (r > 0.5) return '#00ff88'
  if (r > 0.1) return 'rgba(0, 255, 136, 0.85)'
  if (r >= -0.1) return '#9ca3af' // gray-400 for better contrast
  if (r > -0.5) return 'rgba(255, 51, 102, 0.85)'
  return '#ff3366'
}

function interpretCorrelation(r: number): string {
  const abs = Math.abs(r)
  if (abs > 0.8) return r > 0 ? 'Very strong positive' : 'Very strong negative'
  if (abs > 0.6) return r > 0 ? 'Strong positive' : 'Strong negative'
  if (abs > 0.4) return r > 0 ? 'Moderate positive' : 'Moderate negative'
  if (abs > 0.2) return r > 0 ? 'Weak positive' : 'Weak negative'
  return 'Negligible'
}

export default function CorrelationMatrix({
  latencyData,
  frameTimeData,
  pingData,
  metrics,
}: CorrelationMatrixProps) {
  const [hoveredRow, setHoveredRow] = useState<number | null>(null)
  const [hoveredCol, setHoveredCol] = useState<number | null>(null)
  const [showStrongOnly, setShowStrongOnly] = useState(false)

  const minLen = Math.min(latencyData.length, frameTimeData.length, pingData.length)

  const matrix = useMemo(() => {
    const dpcArr = latencyData.slice(0, minLen).map(d => d.dpc)
    const isrArr = latencyData.slice(0, minLen).map(d => d.isr)
    const frameArr = frameTimeData.slice(0, minLen).map(d => d.frameTime)
    const pingArr = pingData.slice(0, minLen).map(d => d.ping)

    // GPU Temp and CPU Usage are single current values — create constant arrays
    const gpuTemp = metrics?.hardware?.gpu?.temp ?? 65
    const cpuUsage = metrics?.hardware?.cpu?.usage ?? 30
    const gpuArr = Array(minLen).fill(gpuTemp)
    const cpuArr = Array(minLen).fill(cpuUsage)

    const series = [dpcArr, isrArr, frameArr, pingArr, gpuArr, cpuArr]

    // 6x6 correlation matrix
    const result: number[][] = []
    for (let i = 0; i < 6; i++) {
      result[i] = []
      for (let j = 0; j < 6; j++) {
        if (i === j) {
          result[i][j] = 1
        } else {
          result[i][j] = pearsonCorrelation(series[i], series[j])
        }
      }
    }
    return result
  }, [latencyData, frameTimeData, pingData, metrics, minLen])

  const handleCellHover = useCallback(
    (row: number, col: number) => {
      setHoveredRow(row)
      setHoveredCol(col)
    },
    []
  )

  const handleCellLeave = useCallback(() => {
    setHoveredRow(null)
    setHoveredCol(null)
  }, [])

  const isRelevant = useCallback(
    (row: number, col: number) => {
      if (!showStrongOnly) return true
      if (row === col) return true
      return Math.abs(matrix[row][col]) > 0.3
    },
    [showStrongOnly, matrix]
  )

  const isRowColHighlighted = useCallback(
    (row: number, col: number) => {
      if (hoveredRow === null && hoveredCol === null) return false
      return row === hoveredRow || col === hoveredCol || row === hoveredCol || col === hoveredRow
    },
    [hoveredRow, hoveredCol]
  )

  const hasData = minLen >= 3

  return (
    <div className="glass-card rounded-lg p-4 deep-shadow card-hover-border">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <GitBranch className="w-3.5 h-3.5 text-cyan-400" />
          <h3 className="text-sm font-semibold text-white">METRIC CORRELATION</h3>
        </div>
        <button
          onClick={() => setShowStrongOnly(prev => !prev)}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[9px] font-medium transition-all duration-200 border ${
            showStrongOnly
              ? 'bg-cyan-500/10 border-cyan-500/30 text-cyan-400'
              : 'bg-white/[0.03] border-[#1a1a2e] text-gray-500 hover:border-[#2a2a3e] hover:text-gray-400'
          }`}
        >
          <Filter className="w-2.5 h-2.5" />
          |r| &gt; 0.3
        </button>
      </div>

      {/* Matrix */}
      <div className="relative">
        {!hasData && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-[#0d0d14]/90 rounded-lg">
            <GitBranch className="w-6 h-6 text-gray-600 opacity-30" />
            <span className="text-xs text-gray-600">Collecting correlation data...</span>
          </div>
        )}

        <div className="overflow-x-auto">
          <div className="inline-block min-w-fit">
            {/* Column headers */}
            <div className="flex items-end">
              <div className="w-[52px] shrink-0" /> {/* spacer for row headers */}
              {METRIC_LABELS.map((label, i) => (
                <div
                  key={i}
                  className="w-[48px] text-center text-[9px] font-medium text-gray-500 pb-1.5"
                  style={{
                    opacity:
                      hoveredRow !== null && hoveredCol !== null
                        ? i === hoveredRow || i === hoveredCol
                          ? 1
                          : 0.35
                        : 1,
                  }}
                >
                  {label}
                </div>
              ))}
            </div>

            {/* Matrix rows */}
            {matrix.map((row, i) => (
              <div key={i} className="flex items-center">
                {/* Row header */}
                <div
                  className="w-[52px] shrink-0 text-right pr-2 text-[9px] font-medium text-gray-500"
                  style={{
                    opacity:
                      hoveredRow !== null && hoveredCol !== null
                        ? i === hoveredRow || i === hoveredCol
                          ? 1
                          : 0.35
                        : 1,
                  }}
                >
                  {METRIC_FULL_NAMES[i]}
                </div>

                {/* Cells */}
                {row.map((r, j) => {
                  const isDiag = i === j
                  const relevant = isRelevant(i, j)
                  const highlighted = isRowColHighlighted(i, j)
                  const { bg, border } = getCellColor(r)
                  const textColor = getTextColor(r)
                  const dimmed = showStrongOnly && !relevant

                  return (
                    <motion.div
                      key={`${i}-${j}`}
                      className="w-[48px] h-[48px] shrink-0 relative"
                      onMouseEnter={() => handleCellHover(i, j)}
                      onMouseLeave={handleCellLeave}
                      whileHover={isDiag ? {} : { scale: 1.12, zIndex: 20 }}
                      transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                      style={{
                        opacity: dimmed ? 0.15 : 1,
                        transition: 'opacity 0.3s ease',
                      }}
                    >
                      {/* Tooltip */}
                      {!isDiag && highlighted && !dimmed && (
                        <motion.div
                          className="absolute -top-10 left-1/2 -translate-x-1/2 z-30 px-2 py-1 rounded-md bg-[#1a1a2e] border border-[#2a2a3e] whitespace-nowrap pointer-events-none"
                          initial={{ opacity: 0, y: 4 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.15 }}
                        >
                          <div className="text-[9px] text-gray-400">
                            {METRIC_FULL_NAMES[i]} × {METRIC_FULL_NAMES[j]}
                          </div>
                          <div className="text-[10px] font-mono font-bold" style={{ color: textColor }}>
                            r = {r.toFixed(3)} — {interpretCorrelation(r)}
                          </div>
                        </motion.div>
                      )}

                      {/* Cell background */}
                      <div
                        className="w-full h-full rounded-md flex items-center justify-center border transition-colors duration-200"
                        style={{
                          backgroundColor: isDiag ? 'rgba(0, 240, 255, 0.08)' : bg,
                          borderColor: isDiag
                            ? 'rgba(0, 240, 255, 0.2)'
                            : highlighted && !dimmed
                              ? border
                              : 'transparent',
                          boxShadow:
                            highlighted && !dimmed && !isDiag
                              ? `0 0 12px ${r > 0 ? 'rgba(0,255,136,0.1)' : r < 0 ? 'rgba(255,51,102,0.1)' : 'rgba(255,255,255,0.05)'}`
                              : 'none',
                        }}
                      >
                        {isDiag ? (
                          <Check className="w-4 h-4 text-cyan-400/60" />
                        ) : (
                          <span
                            className="text-[10px] font-mono font-bold leading-none"
                            style={{ color: textColor }}
                          >
                            {r >= 0 ? r.toFixed(2) : r.toFixed(2)}
                          </span>
                        )}
                      </div>
                    </motion.div>
                  )
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="mt-4 flex items-center justify-center gap-2">
        <span className="text-[9px] font-mono text-[#ff3366]">-1</span>
        <div className="flex items-center gap-0">
          {Array.from({ length: 11 }, (_, idx) => {
            const val = -1 + idx * 0.2
            const { bg } = getCellColor(val)
            return (
              <div
                key={idx}
                className="w-4 h-2 first:rounded-l last:rounded-r"
                style={{ backgroundColor: bg.replace(/[\d.]+\)$/, '0.5)') }}
              />
            )
          })}
        </div>
        <span className="text-[9px] font-mono text-[#00ff88]">+1</span>
        <span className="text-[9px] text-gray-600 ml-1">← Correlation Strength →</span>
      </div>

      {showStrongOnly && (
        <motion.div
          className="mt-2 text-center text-[9px] text-cyan-400/60"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          Showing only correlations with |r| &gt; 0.3
        </motion.div>
      )}
    </div>
  )
}