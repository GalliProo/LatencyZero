'use client'

import { motion } from 'framer-motion'
import { Grid3X3 } from 'lucide-react'
import { useMemo } from 'react'
import type { MetricsData } from './types'

interface MetricsHeatmapProps {
  metrics: MetricsData | null
}

type Status = 'good' | 'warning' | 'critical'

interface MetricCellDef {
  key: string
  label: string
  unit: string
  getValue: (m: MetricsData) => number
  getStatus: (v: number) => Status
  decimals: number
  invertColor?: boolean // true = higher is better (e.g. FPS)
}

const THRESHOLDS: { good: Status; warning: Status; critical: Status } = {
  good: 'good',
  warning: 'warning',
  critical: 'critical',
}

const METRICS: MetricCellDef[] = [
  // Row 1: DPC Current, ISR Current, Frame Time, FPS
  {
    key: 'dpc',
    label: 'DPC Current',
    unit: 'μs',
    getValue: m => m.dpc.current,
    getStatus: v => (v < 100 ? THRESHOLDS.good : v < 500 ? THRESHOLDS.warning : THRESHOLDS.critical),
    decimals: 1,
  },
  {
    key: 'isr',
    label: 'ISR Current',
    unit: 'μs',
    getValue: m => m.isr.current,
    getStatus: v => (v < 50 ? THRESHOLDS.good : v < 200 ? THRESHOLDS.warning : THRESHOLDS.critical),
    decimals: 1,
  },
  {
    key: 'frameTime',
    label: 'Frame Time',
    unit: 'ms',
    getValue: m => m.frameTime.current,
    getStatus: v => (v < 8 ? THRESHOLDS.good : v < 16 ? THRESHOLDS.warning : THRESHOLDS.critical),
    decimals: 2,
  },
  {
    key: 'fps',
    label: 'FPS',
    unit: '',
    getValue: m => m.fps.current,
    getStatus: v => (v > 120 ? THRESHOLDS.good : v > 60 ? THRESHOLDS.warning : THRESHOLDS.critical),
    decimals: 0,
    invertColor: true,
  },
  // Row 2: Ping, Jitter, Packet Loss, GPU Temp
  {
    key: 'ping',
    label: 'Ping',
    unit: 'ms',
    getValue: m => m.network.ping,
    getStatus: v => (v < 30 ? THRESHOLDS.good : v < 80 ? THRESHOLDS.warning : THRESHOLDS.critical),
    decimals: 0,
  },
  {
    key: 'jitter',
    label: 'Jitter',
    unit: 'ms',
    getStatus: v => (v < 3 ? THRESHOLDS.good : v < 10 ? THRESHOLDS.warning : THRESHOLDS.critical),
    getValue: m => m.network.jitter,
    decimals: 1,
  },
  {
    key: 'packetLoss',
    label: 'Packet Loss',
    unit: '%',
    getValue: m => m.network.packetLoss,
    getStatus: v => (v < 0.5 ? THRESHOLDS.good : v < 2 ? THRESHOLDS.warning : THRESHOLDS.critical),
    decimals: 2,
  },
  {
    key: 'gpuTemp',
    label: 'GPU Temp',
    unit: '°C',
    getValue: m => m.hardware.gpu.temp,
    getStatus: v => (v < 75 ? THRESHOLDS.good : v < 85 ? THRESHOLDS.warning : THRESHOLDS.critical),
    decimals: 0,
  },
  // Row 3: CPU Usage, GPU Usage, RAM %, CPU Temp
  {
    key: 'cpuUsage',
    label: 'CPU Usage',
    unit: '%',
    getValue: m => m.hardware.cpu.usage,
    getStatus: v => (v < 70 ? THRESHOLDS.good : v < 90 ? THRESHOLDS.warning : THRESHOLDS.critical),
    decimals: 1,
  },
  {
    key: 'gpuUsage',
    label: 'GPU Usage',
    unit: '%',
    getValue: m => m.hardware.gpu.usage,
    getStatus: v => (v < 80 ? THRESHOLDS.good : v < 95 ? THRESHOLDS.warning : THRESHOLDS.critical),
    decimals: 1,
  },
  {
    key: 'ram',
    label: 'RAM',
    unit: '%',
    getValue: m => m.hardware.ram.percent,
    getStatus: v => (v < 70 ? THRESHOLDS.good : v < 85 ? THRESHOLDS.warning : THRESHOLDS.critical),
    decimals: 1,
  },
  {
    key: 'cpuTemp',
    label: 'CPU Temp',
    unit: '°C',
    getValue: m => m.hardware.cpu.temp,
    getStatus: v => (v < 70 ? THRESHOLDS.good : v < 85 ? THRESHOLDS.warning : THRESHOLDS.critical),
    decimals: 0,
  },
]

const STATUS_CONFIG: Record<Status, {
  color: string
  bg: string
  border: string
  glow: string
  pulseClass: string
}> = {
  good: {
    color: '#00ff88',
    bg: 'rgba(0, 255, 136, 0.05)',
    border: 'rgba(0, 255, 136, 0.2)',
    glow: '0 0 12px rgba(0, 255, 136, 0.08)',
    pulseClass: '',
  },
  warning: {
    color: '#ffaa00',
    bg: 'rgba(255, 170, 0, 0.10)',
    border: 'rgba(255, 170, 0, 0.25)',
    glow: '0 0 12px rgba(255, 170, 0, 0.10)',
    pulseClass: '',
  },
  critical: {
    color: '#ff3366',
    bg: 'rgba(255, 51, 102, 0.15)',
    border: 'rgba(255, 51, 102, 0.35)',
    glow: '0 0 16px rgba(255, 51, 102, 0.15)',
    pulseClass: 'animate-pulse',
  },
}

/** Generate deterministic mini-sparkline data from a value (for when no history is available) */
function generateSparkPoints(currentValue: number, count: number = 5): number[] {
  const points: number[] = []
  const base = currentValue
  const noise = base * 0.08
  for (let i = 0; i < count - 1; i++) {
    const seed = Math.sin(currentValue * 17.3 + i * 43.7) * 0.5 + 0.5
    points.push(base + (seed - 0.5) * noise * 2)
  }
  points.push(currentValue)
  return points
}

function buildSparklinePath(points: number[]): string {
  if (points.length < 2) return ''
  const w = 80
  const h = 16
  const min = Math.min(...points)
  const max = Math.max(...points)
  const range = max - min || 1

  return points
    .map((v, i) => {
      const x = (i / (points.length - 1)) * w
      const y = h - ((v - min) / range) * (h - 2) - 1
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')
}

function HeatmapCell({
  def,
  value,
  status,
}: {
  def: MetricCellDef
  value: number
  status: Status
}) {
  const cfg = STATUS_CONFIG[status]
  const sparkPoints = useMemo(() => generateSparkPoints(value, 5), [value])
  const sparkPath = useMemo(() => buildSparklinePath(sparkPoints), [sparkPoints])

  return (
    <motion.div
      key={def.key}
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{
        opacity: 1,
        scale: 1,
        backgroundColor: cfg.bg,
        boxShadow: cfg.glow,
      }}
      transition={{
        backgroundColor: { duration: 0.5, ease: 'easeInOut' },
        boxShadow: { duration: 0.5, ease: 'easeInOut' },
        opacity: { duration: 0.3 },
        scale: { duration: 0.3 },
      }}
      className={`
        relative rounded-lg border p-2.5 sm:p-3 overflow-hidden
        transition-colors duration-500
        ${cfg.pulseClass}
      `}
      style={{
        borderColor: cfg.border,
        background: cfg.bg,
      }}
    >
      {/* Top status accent line */}
      <div
        className="absolute top-0 left-0 right-0 h-px opacity-60"
        style={{ backgroundColor: cfg.color }}
      />

      {/* Metric name */}
      <p className="text-[9px] sm:text-[10px] uppercase tracking-wider text-gray-500 font-medium mb-1 truncate">
        {def.label}
      </p>

      {/* Value + unit */}
      <div className="flex items-baseline gap-1 whitespace-nowrap">
        <span
          className="text-lg sm:text-xl font-mono font-extrabold tabular-nums"
          style={{ color: cfg.color }}
        >
          {value.toFixed(def.decimals)}
        </span>
        {def.unit && (
          <span className="text-[10px] text-gray-500 font-medium shrink-0">{def.unit}</span>
        )}
      </div>

      {/* Mini sparkline */}
      {sparkPath && (
        <svg
          viewBox="0 0 80 16"
          className="w-full h-4 mt-2 opacity-50"
          preserveAspectRatio="none"
        >
          <path
            d={sparkPath}
            fill="none"
            stroke={cfg.color}
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </motion.div>
  )
}

export default function MetricsHeatmap({ metrics }: MetricsHeatmapProps) {
  return (
    <div className="deep-shadow glass-card rounded-xl p-4 sm:p-5">
      {/* Header */}
      <div className="flex items-center gap-2.5 mb-4">
        <div className="w-7 h-7 rounded-md bg-[#a855f7]/10 border border-[#a855f7]/20 flex items-center justify-center">
          <Grid3X3 className="w-4 h-4 text-[#a855f7]" />
        </div>
        <div>
          <h3 className="text-xs sm:text-sm font-bold text-white tracking-wide uppercase">
            System Health Matrix
          </h3>
          <p className="text-[9px] text-gray-600 tracking-wider">REAL-TIME METRICS OVERVIEW</p>
        </div>
      </div>

      {/* 12-cell grid: 2 cols mobile, 3 tablet, 4 desktop */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-2 sm:gap-2.5">
        {METRICS.map(def => {
          if (!metrics) {
            return (
              <div
                key={def.key}
                className="rounded-lg border border-[#1a1a2e] bg-[#0d0d14]/50 p-2.5 sm:p-3"
              >
                <p className="text-[9px] sm:text-[10px] uppercase tracking-wider text-gray-600 font-medium mb-1 truncate">
                  {def.label}
                </p>
                <div className="h-6 w-16 bg-[#1a1a2e]/50 rounded animate-pulse" />
                <div className="h-4 mt-2 w-full bg-[#1a1a2e]/30 rounded animate-pulse" />
              </div>
            )
          }

          const value = def.getValue(metrics)
          const status = def.getStatus(value)

          return <HeatmapCell key={def.key} def={def} value={value} status={status} />
        })}
      </div>

      {/* Legend */}
      <div className="flex items-center justify-center gap-4 mt-4 pt-3 border-t border-[#1a1a2e]/60">
        {(
          [
            { status: 'good' as const, label: 'Good' },
            { status: 'warning' as const, label: 'Warning' },
            { status: 'critical' as const, label: 'Critical' },
          ] as const
        ).map(item => (
          <div key={item.status} className="flex items-center gap-1.5">
            <span
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: STATUS_CONFIG[item.status].color }}
            />
            <span className="text-[10px] text-gray-500 font-medium">{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}