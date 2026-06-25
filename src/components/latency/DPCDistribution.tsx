'use client'

import { useState, useMemo } from 'react'
import { BarChart, Bar, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine } from 'recharts'
import { BarChart3 } from 'lucide-react'

interface DPCDistributionProps {
  latencyData: Array<{ time: string; dpc: number; isr: number }>
}

interface Bucket {
  label: string
  min: number
  max: number
  count: number
  color: string
}

const BUCKETS: Array<{ label: string; min: number; max: number; color: string }> = [
  { label: '0-25µs', min: 0, max: 25, color: '#00ff88' },
  { label: '25-50µs', min: 25, max: 50, color: '#00ff88' },
  { label: '50-100µs', min: 50, max: 100, color: '#00ff88' },
  { label: '100-250µs', min: 100, max: 250, color: '#ffaa00' },
  { label: '250-500µs', min: 250, max: 500, color: '#ffaa00' },
  { label: '500-1000µs', min: 500, max: 1000, color: '#ff3366' },
  { label: '1000+µs', min: 1000, max: Infinity, color: '#ff3366' },
]

function CustomTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: Bucket }> }) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div className="bg-[#12121a] border border-[#2a2a3e] rounded-lg px-3 py-2 shadow-xl shadow-[0_0_20px_rgba(0,0,0,0.5)]">
      <p className="text-[10px] text-gray-500 mb-1">{d.label}</p>
      <p className="text-[13px] font-semibold font-mono" style={{ color: d.color }}>
        {d.count} samples
      </p>
    </div>
  )
}

function computePercentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0
  const idx = Math.ceil((p / 100) * sorted.length) - 1
  return sorted[Math.max(0, idx)]
}

export default function DPCDistribution({ latencyData }: DPCDistributionProps) {
  const [mode, setMode] = useState<'dpc' | 'isr'>('dpc')

  const { buckets, p50, p95, p99, max, isRightSkewed } = useMemo(() => {
    const values = latencyData.map(d => (mode === 'dpc' ? d.dpc : d.isr))
    const sorted = [...values].sort((a, b) => a - b)

    const computedBuckets: Bucket[] = BUCKETS.map(b => ({
      ...b,
      count: values.filter(v => v >= b.min && v < b.max).length,
    }))

    const p50 = computePercentile(sorted, 50)
    const p95 = computePercentile(sorted, 95)
    const p99 = computePercentile(sorted, 99)
    const max = sorted.length > 0 ? sorted[sorted.length - 1] : 0
    const isRightSkewed = p99 > p50 * 3

    return { buckets: computedBuckets, p50, p95, p99, max, isRightSkewed }
  }, [latencyData, mode])

  if (latencyData.length < 5) {
    return (
      <div className="bg-[#0d0d14] rounded-xl border border-[#1a1a2e] p-4 deep-shadow">
        <div className="flex items-center gap-2 mb-4">
          <BarChart3 className="w-4 h-4 text-[#00f0ff]" />
          <h3 className="text-sm font-semibold text-white">DPC Latency Distribution</h3>
        </div>
        <div className="h-48 flex items-center justify-center">
          <p className="text-xs text-gray-500">Collecting samples... (need ≥ 5 data points)</p>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-[#0d0d14] rounded-xl border border-[#1a1a2e] p-4 deep-shadow">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-[#00f0ff]" />
          <h3 className="text-sm font-semibold text-white">DPC Latency Distribution</h3>
        </div>
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => setMode('dpc')}
            className={`px-3 py-1 text-[11px] font-medium rounded-l-md border transition-all ${
              mode === 'dpc'
                ? 'bg-[#00f0ff]/15 text-[#00f0ff] border-[#00f0ff]/40'
                : 'bg-transparent text-gray-500 border-[#1a1a2e] hover:text-gray-300 hover:border-[#2a2a3e]'
            }`}
          >
            DPC
          </button>
          <button
            onClick={() => setMode('isr')}
            className={`px-3 py-1 text-[11px] font-medium rounded-r-md border transition-all ${
              mode === 'isr'
                ? 'bg-[#00f0ff]/15 text-[#00f0ff] border-[#00f0ff]/40'
                : 'bg-transparent text-gray-500 border-[#1a1a2e] hover:text-gray-300 hover:border-[#2a2a3e]'
            }`}
          >
            ISR
          </button>
        </div>
      </div>

      {/* Histogram */}
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={buckets} margin={{ top: 5, right: 5, left: -10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1a1a2e" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fill: '#4b5563', fontSize: 9 }}
              axisLine={{ stroke: '#1a1a2e' }}
              tickLine={false}
            />
            <YAxis
              tick={{ fill: '#4b5563', fontSize: 10 }}
              axisLine={{ stroke: '#1a1a2e' }}
              tickLine={false}
              allowDecimals={false}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
            <ReferenceLine
              x="50-100µs"
              stroke="#00f0ff"
              strokeDasharray="4 2"
              strokeWidth={1}
              label={{ value: '100µs', fill: '#00f0ff', fontSize: 8, position: 'top' }}
            />
            <Bar dataKey="count" radius={[4, 4, 0, 0]} isAnimationActive={false}>
              {buckets.map((entry, index) => (
                <Cell
                  key={index}
                  fill={entry.color}
                  fillOpacity={entry.max === Infinity ? 1 : 0.85}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3">
        <div className="bg-[#12121a] rounded-lg border border-[#1a1a2e] px-3 py-2">
          <div className="text-[9px] text-gray-500 uppercase tracking-wider">P50 (Median)</div>
          <div className="text-sm font-mono font-semibold text-[#00f0ff] mt-0.5">{p50.toFixed(1)}µs</div>
        </div>
        <div className="bg-[#12121a] rounded-lg border border-[#1a1a2e] px-3 py-2">
          <div className="text-[9px] text-gray-500 uppercase tracking-wider">P95</div>
          <div className="text-sm font-mono font-semibold text-[#ffaa00] mt-0.5">{p95.toFixed(1)}µs</div>
        </div>
        <div className="bg-[#12121a] rounded-lg border border-[#1a1a2e] px-3 py-2">
          <div className="text-[9px] text-gray-500 uppercase tracking-wider">P99</div>
          <div className="text-sm font-mono font-semibold text-[#ff3366] mt-0.5">{p99.toFixed(1)}µs</div>
        </div>
        <div className="bg-[#12121a] rounded-lg border border-[#1a1a2e] px-3 py-2">
          <div className="text-[9px] text-gray-500 uppercase tracking-wider">Max</div>
          <div className="text-sm font-mono font-semibold text-[#ff3366] mt-0.5">{max.toFixed(1)}µs</div>
        </div>
      </div>

      {/* Distribution Shape Indicator */}
      <div className="mt-3 flex items-center gap-1.5">
        <span
          className={`w-1.5 h-1.5 rounded-full ${isRightSkewed ? 'bg-[#ffaa00]' : 'bg-[#00ff88]'}`}
        />
        <span className={`text-[10px] ${isRightSkewed ? 'text-[#ffaa00]' : 'text-[#00ff88]'}`}>
          {isRightSkewed ? 'Right-Skewed (tail risk)' : 'Normal Distribution'}
        </span>
      </div>
    </div>
  )
}