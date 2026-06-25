'use client'

import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { Activity, CheckCircle, AlertTriangle } from 'lucide-react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  ReferenceArea,
} from 'recharts'

interface FramePacingAnalyzerProps {
  frameTimeData: Array<{ time: string; frameTime: number }>
  targetFps?: number // default 144
}

interface GradeInfo {
  grade: string
  label: string
  color: string
  colorRgb: string
}

function getGrade(cv: number): GradeInfo {
  if (cv < 0.03) return { grade: 'S+', label: 'Exceptionally Smooth', color: '#00ff88', colorRgb: '0, 255, 136' }
  if (cv < 0.05) return { grade: 'S', label: 'Competitive Ready', color: '#00ff88', colorRgb: '0, 255, 136' }
  if (cv < 0.08) return { grade: 'A', label: 'Good', color: '#00f0ff', colorRgb: '0, 240, 255' }
  if (cv < 0.12) return { grade: 'B', label: 'Acceptable', color: '#ffaa00', colorRgb: '255, 170, 0' }
  if (cv < 0.20) return { grade: 'C', label: 'Inconsistent', color: '#ff8800', colorRgb: '255, 136, 0' }
  return { grade: 'D', label: 'Problematic', color: '#ff3366', colorRgb: '255, 51, 102' }
}

function StatCard({
  label,
  value,
  unit,
  color,
}: {
  label: string
  value: string
  unit: string
  color: string
}) {
  return (
    <div className="bg-[#12121a] rounded-lg border border-[#1a1a2e] p-3">
      <p className="text-[10px] text-gray-500 mb-1.5">{label}</p>
      <p className="text-lg font-bold font-mono" style={{ color }}>
        {value}
        <span className="text-[10px] text-gray-500 ml-1 font-normal">{unit}</span>
      </p>
    </div>
  )
}

function FrameTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: Array<{ value: number }>
  label?: string
}) {
  if (!active || !payload?.[0]) return null
  const ft = payload[0].value
  return (
    <div className="bg-[#12121a] border border-[#2a2a3e] rounded-lg px-3 py-2 shadow-xl shadow-[0_0_20px_rgba(0,0,0,0.5)]">
      <p className="text-[10px] text-gray-500 mb-1">Frame #{label}</p>
      <p className="text-[13px] font-semibold font-mono text-white">
        {ft.toFixed(2)}
        <span className="text-gray-400"> ms</span>
      </p>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="bg-[#0d0d14] rounded-lg border border-[#1a1a2e] p-8 deep-shadow">
      <div className="section-title-deco mb-6">
        <Activity className="w-4 h-4 text-[#00f0ff]" />
        <h2 className="text-sm font-semibold text-white">Frame Pacing Analysis</h2>
      </div>
      <div className="flex flex-col items-center justify-center py-12">
        <div className="w-16 h-16 rounded-full bg-[#1a1a2e] flex items-center justify-center mb-4">
          <Activity className="w-7 h-7 text-gray-600" />
        </div>
        <p className="text-sm text-gray-400 mb-1">Insufficient Data</p>
        <p className="text-xs text-gray-500">Collect at least 10 frame samples for pacing analysis</p>
      </div>
    </div>
  )
}

export default function FramePacingAnalyzer({
  frameTimeData,
  targetFps = 144,
}: FramePacingAnalyzerProps) {
  const targetMs = 1000 / targetFps

  const metrics = useMemo(() => {
    if (frameTimeData.length < 10) return null

    const frameTimes = frameTimeData.map((d) => d.frameTime)
    const n = frameTimes.length

    // Mean
    const mean = frameTimes.reduce((a, b) => a + b, 0) / n

    // Standard deviation
    const variance = frameTimes.reduce((acc, ft) => acc + (ft - mean) ** 2, 0) / n
    const stddev = Math.sqrt(variance)

    // Coefficient of variation
    const cv = mean > 0 ? stddev / mean : 0

    // 1% Low — sort and take the 1st percentile value
    const sorted = [...frameTimes].sort((a, b) => a - b)
    const p1Index = Math.max(0, Math.floor(n * 0.01))
    const onePercentLow = sorted[p1Index]

    // Worst frame
    const worst = sorted[sorted.length - 1]

    // Frames below target %
    const belowTarget = frameTimes.filter((ft) => ft <= targetMs).length
    const belowTargetPct = (belowTarget / n) * 100

    // Jitter: average absolute difference between consecutive frames
    let jitterSum = 0
    for (let i = 1; i < n; i++) {
      jitterSum += Math.abs(frameTimes[i] - frameTimes[i - 1])
    }
    const jitter = n > 1 ? jitterSum / (n - 1) : 0

    // Grade
    const grade = getGrade(cv)

    // Outliers: frames > 2x the mean frametime
    const outliers: Array<{ index: number; frameTime: number }> = []
    for (let i = 0; i < n; i++) {
      if (frameTimes[i] > 2 * mean) {
        outliers.push({ index: i, frameTime: frameTimes[i] })
      }
    }
    outliers.sort((a, b) => b.frameTime - a.frameTime)
    const topOutliers = outliers.slice(0, 5)

    return {
      mean,
      stddev,
      cv,
      onePercentLow,
      worst,
      belowTargetPct,
      jitter,
      grade,
      topOutliers,
    }
  }, [frameTimeData, targetMs])

  const chartData = useMemo(() => {
    return frameTimeData.map((d, i) => ({
      index: i,
      frameTime: d.frameTime,
    }))
  }, [frameTimeData])

  // Color coding helpers
  const stddevColor = useMemo(() => {
    if (!metrics) return '#6b7280'
    const { stddev, mean } = metrics
    const cv = mean > 0 ? stddev / mean : 0
    if (cv < 0.05) return '#00ff88'
    if (cv < 0.08) return '#00f0ff'
    if (cv < 0.12) return '#ffaa00'
    return '#ff3366'
  }, [metrics])

  const cvColor = useMemo(() => {
    if (!metrics) return '#6b7280'
    return metrics.grade.color
  }, [metrics])

  const lowColor = useMemo(() => {
    if (!metrics) return '#6b7280'
    const { onePercentLow } = metrics
    if (onePercentLow <= targetMs * 1.1) return '#00ff88'
    if (onePercentLow <= targetMs * 1.5) return '#ffaa00'
    return '#ff3366'
  }, [metrics, targetMs])

  const worstColor = useMemo(() => {
    if (!metrics) return '#6b7280'
    const { worst } = metrics
    if (worst <= targetMs * 2) return '#00ff88'
    if (worst <= targetMs * 4) return '#ffaa00'
    return '#ff3366'
  }, [metrics, targetMs])

  const belowTargetColor = useMemo(() => {
    if (!metrics) return '#6b7280'
    const { belowTargetPct } = metrics
    if (belowTargetPct >= 98) return '#00ff88'
    if (belowTargetPct >= 90) return '#00f0ff'
    if (belowTargetPct >= 75) return '#ffaa00'
    return '#ff3366'
  }, [metrics])

  const jitterColor = useMemo(() => {
    if (!metrics) return '#6b7280'
    const { jitter } = metrics
    if (jitter <= 0.3) return '#00ff88'
    if (jitter <= 1.0) return '#ffaa00'
    return '#ff3366'
  }, [metrics])

  if (!metrics) return <EmptyState />

  const { stddev, cv, onePercentLow, worst, belowTargetPct, jitter, grade, topOutliers } = metrics

  return (
    <div className="bg-[#0d0d14] rounded-lg border border-[#1a1a2e] p-4 deep-shadow card-hover-border">
      {/* Header */}
      <div className="section-title-deco mb-5">
        <Activity className="w-4 h-4 text-[#00f0ff]" />
        <h2 className="text-sm font-semibold text-white">Frame Pacing Analysis</h2>
      </div>

      {/* Pacing Grade Card */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="flex flex-col items-center justify-center py-6 mb-5 rounded-lg border p-4"
        style={{
          backgroundColor: `${grade.color}05`,
          borderColor: `${grade.color}25`,
          boxShadow: `0 0 30px rgba(${grade.colorRgb}, 0.08), inset 0 0 30px rgba(${grade.colorRgb}, 0.03)`,
        }}
      >
        <motion.p
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 200, damping: 15, delay: 0.15 }}
          className="text-5xl font-black font-mono mb-1"
          style={{ color: grade.color, textShadow: `0 0 30px rgba(${grade.colorRgb}, 0.5)` }}
        >
          {grade.grade}
        </motion.p>
        <p className="text-xs font-medium mb-1" style={{ color: grade.color }}>
          {grade.label}
        </p>
        <p className="text-[10px] text-gray-500 font-mono">
          CV: {(cv * 100).toFixed(2)}%
        </p>
      </motion.div>

      {/* Frametime Variance Chart */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.1 }}
        className="mb-5"
      >
        <div className="flex items-center justify-between mb-2">
          <p className="text-[10px] text-gray-500 uppercase tracking-wider">Frametime Variance</p>
          <div className="flex items-center gap-3 text-[10px] text-gray-500">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-0.5 rounded bg-[#00f0ff]" />
              Actual
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-0.5 rounded bg-[#ffaa00] border-dashed" style={{ borderTop: '1px dashed #ffaa00', height: 0 }} />
              Target
            </span>
          </div>
        </div>
        <div className="h-40">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1a1a2e" vertical={false} />
              <XAxis
                dataKey="index"
                tick={{ fill: '#4b5563', fontSize: 9 }}
                axisLine={{ stroke: '#1a1a2e' }}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: '#4b5563', fontSize: 9 }}
                axisLine={{ stroke: '#1a1a2e' }}
                tickLine={false}
                tickFormatter={(v: number) => `${v.toFixed(1)}`}
                width={40}
                domain={[0, 'auto']}
              />
              <Tooltip content={<FrameTooltip />} />
              <ReferenceArea y1={0} y2={targetMs} fill="rgba(0, 255, 136, 0.03)" fillOpacity={1} />
              <ReferenceArea y1={targetMs} y2={targetMs * 3} fill="rgba(255, 51, 102, 0.03)" fillOpacity={1} />
              <ReferenceLine
                y={targetMs}
                stroke="#ffaa00"
                strokeDasharray="6 3"
                strokeWidth={1}
                label={{
                  value: `${targetMs.toFixed(1)}ms`,
                  fill: '#ffaa00',
                  fontSize: 9,
                  position: 'right',
                }}
              />
              <Line
                type="monotone"
                dataKey="frameTime"
                stroke="#00f0ff"
                strokeWidth={1.5}
                dot={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </motion.div>

      {/* Consistency Metrics Grid */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.2 }}
        className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-5"
      >
        <StatCard
          label="Frame Time Std Dev"
          value={stddev.toFixed(2)}
          unit="ms"
          color={stddevColor}
        />
        <StatCard
          label="Coeff. of Variation"
          value={(cv * 100).toFixed(2)}
          unit="%"
          color={cvColor}
        />
        <StatCard
          label="1% Low Frame Time"
          value={onePercentLow.toFixed(2)}
          unit="ms"
          color={lowColor}
        />
        <StatCard
          label="Worst Frame"
          value={worst.toFixed(2)}
          unit="ms"
          color={worstColor}
        />
        <StatCard
          label="Frames Below Target"
          value={belowTargetPct.toFixed(1)}
          unit="%"
          color={belowTargetColor}
        />
        <StatCard
          label="Frame Time Jitter"
          value={jitter.toFixed(2)}
          unit="ms"
          color={jitterColor}
        />
      </motion.div>

      {/* Frame Time Outlier Detection */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.3 }}
        className="bg-[#12121a] rounded-lg border border-[#1a1a2e] p-3"
      >
        <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-2">
          Outlier Detection
          <span className="text-gray-600 ml-1.5 normal-case">(frames &gt; 2× mean)</span>
        </p>
        {topOutliers.length === 0 ? (
          <div className="flex items-center gap-2 py-2">
            <CheckCircle className="w-3.5 h-3.5 text-[#00ff88] shrink-0" />
            <p className="text-xs text-gray-400">No significant outliers detected</p>
          </div>
        ) : (
          <div className="space-y-1.5 max-h-36 overflow-y-auto custom-scrollbar">
            {topOutliers.map((outlier) => (
              <div
                key={outlier.index}
                className="flex items-center justify-between py-1.5 px-2 rounded bg-[#ff3366]/5 border border-[#ff3366]/10"
              >
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-3 h-3 text-[#ff3366] shrink-0" />
                  <span className="text-xs text-gray-400 font-mono">Frame #{outlier.index}</span>
                </div>
                <span className="text-xs font-mono font-semibold text-[#ff3366]">
                  {outlier.frameTime.toFixed(2)} ms
                </span>
              </div>
            ))}
          </div>
        )}
      </motion.div>
    </div>
  )
}