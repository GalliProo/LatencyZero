'use client'

import { useMemo } from 'react'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, ReferenceArea } from 'recharts'
import type { LatencyPoint } from './types'

interface LatencyChartProps {
  data: LatencyPoint[]
  emaEnabled?: boolean
  abComparison?: boolean
}

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number; dataKey: string; color: string }>; label?: string }) {
  if (!active || !payload) return null
  return (
    <div className="bg-[#12121a] border border-[#2a2a3e] rounded-lg px-3 py-2 shadow-xl shadow-[0_0_20px_rgba(0,0,0,0.5)]">
      <p className="text-[10px] text-gray-500 mb-1">{label}</p>
      {payload.map((p, i) => (
        <p key={i} className="text-[13px] font-semibold font-mono" style={{ color: p.color }}>
          {p.dataKey.toUpperCase()}: {p.value.toFixed(1)}µs
        </p>
      ))}
    </div>
  )
}

export default function LatencyChart({ data, emaEnabled, abComparison }: LatencyChartProps) {
  const smoothedData = useMemo(() => {
    if (!emaEnabled || data.length < 2) return data
    const alpha = 0.3
    let ema = data[0].dpc
    let emaI = data[0].isr
    return data.map((p, i) => {
      if (i === 0) return p
      ema = alpha * p.dpc + (1 - alpha) * ema
      emaI = alpha * p.isr + (1 - alpha) * emaI
      return { ...p, dpc: ema, isr: emaI }
    })
  }, [data, emaEnabled])

  return (
    <div className="bg-[#0d0d14] rounded-lg border border-[#1a1a2e] p-4 deep-shadow card-3d-hover">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-white">DPC / ISR Latency</h3>
          <p className="text-[10px] text-gray-500 mt-0.5">Real-time deferred procedure call & interrupt service routine monitoring</p>
        </div>
        <div className="flex items-center gap-4 text-[10px]">
          {emaEnabled && (
            <span className="text-[9px] text-[#a855f7] bg-[#a855f7]/10 px-2 py-0.5 rounded border border-[#a855f7]/20">EMA (α=0.3)</span>
          )}
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-0.5 rounded bg-[#00f0ff]" />DPC</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-0.5 rounded bg-[#a855f7]" />ISR</span>
        </div>
      </div>
      <div className="h-[280px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={smoothedData} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="dpcGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#00f0ff" stopOpacity={0.25} />
                <stop offset="100%" stopColor="#00f0ff" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="isrGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#a855f7" stopOpacity={0.2} />
                <stop offset="100%" stopColor="#a855f7" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#1a1a2e" vertical={false} />
            <XAxis dataKey="time" tick={{ fill: '#4b5563', fontSize: 10 }} axisLine={{ stroke: '#1a1a2e' }} tickLine={false} />
            <YAxis tick={{ fill: '#4b5563', fontSize: 10 }} axisLine={{ stroke: '#1a1a2e' }} tickLine={false} tickFormatter={(v: number) => `${v}µs`} width={55} />
            <Tooltip content={<CustomTooltip />} />
            <ReferenceArea y1={0} y2={100} fill="rgba(0, 255, 136, 0.03)" fillOpacity={1} />
            <ReferenceArea y1={100} y2={500} fill="rgba(255, 170, 0, 0.03)" fillOpacity={1} />
            <ReferenceArea y1={500} y2={1000} fill="rgba(255, 51, 102, 0.02)" fillOpacity={1} />
            <ReferenceLine y={500} stroke="#ffaa00" strokeDasharray="6 3" strokeWidth={1} label={{ value: 'WARN', fill: '#ffaa00', fontSize: 8, position: 'insideTopLeft' }} />
            <ReferenceLine y={1000} stroke="#ff3366" strokeDasharray="6 3" strokeWidth={1} label={{ value: 'CRIT', fill: '#ff3366', fontSize: 8, position: 'insideTopLeft' }} />
            {abComparison && (
              <Area type="monotone" dataKey="dpc" stroke="none" fill="rgba(255, 255, 255, 0.03)" isAnimationActive={false} />
            )}
            <Area type="monotone" dataKey="dpc" stroke="#00f0ff" strokeWidth={2.5} fill="url(#dpcGrad)" isAnimationActive={false} />
            <Area type="monotone" dataKey="isr" stroke="#a855f7" strokeWidth={2.5} fill="url(#isrGrad)" isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}