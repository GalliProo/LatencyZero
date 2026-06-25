'use client'

import { useMemo } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, ReferenceArea } from 'recharts'
import type { FrameTimePoint } from './types'

interface FrameTimeChartProps {
  data: FrameTimePoint[]
  targetMs?: number
  emaEnabled?: boolean
  abComparison?: boolean
}

const targetLabels: Record<number, string> = {
  16.67: '60 FPS',
  8.33: '120 FPS',
  6.94: '144 FPS',
}

function FrameTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number }>; label?: string }) {
  if (!active || !payload?.[0]) return null
  const ft = payload[0].value
  const fps = (1000 / ft).toFixed(1)
  return (
    <div className="bg-[#12121a] border border-[#2a2a3e] rounded-lg px-3 py-2 shadow-xl shadow-[0_0_20px_rgba(0,0,0,0.5)]">
      <p className="text-[10px] text-gray-500 mb-1">{label}</p>
      <p className="text-[13px] font-semibold font-mono text-white">{ft.toFixed(2)}ms <span className="text-gray-400">({fps} FPS)</span></p>
    </div>
  )
}

export default function FrameTimeChart({ data, targetMs = 16.67, emaEnabled, abComparison }: FrameTimeChartProps) {
  const smoothedData = useMemo(() => {
    if (!emaEnabled || data.length < 2) return data
    const alpha = 0.3
    let ema = data[0].frameTime
    return data.map((p, i) => {
      if (i === 0) return p
      ema = alpha * p.frameTime + (1 - alpha) * ema
      return { ...p, frameTime: ema }
    })
  }, [data, emaEnabled])

  return (
    <div className="bg-[#0d0d14] rounded-lg border border-[#1a1a2e] p-4 deep-shadow card-3d-hover">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-white">Frame Time Analysis</h3>
          <p className="text-[10px] text-gray-500 mt-0.5">Frame pacing consistency — target: {targetLabels[targetMs] || `${(1000/targetMs).toFixed(0)} FPS`}</p>
        </div>
        <div className="flex items-center gap-3 text-[10px] text-gray-400">
          {emaEnabled && (
            <span className="text-[9px] text-[#a855f7] bg-[#a855f7]/10 px-2 py-0.5 rounded border border-[#a855f7]/20">EMA (α=0.3)</span>
          )}
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-0.5 rounded bg-[#00ff88]" />Frame Time</span>
        </div>
      </div>
      <div className="h-[220px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={smoothedData} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1a1a2e" vertical={false} />
            <XAxis dataKey="time" tick={{ fill: '#4b5563', fontSize: 10 }} axisLine={{ stroke: '#1a1a2e' }} tickLine={false} />
            <YAxis tick={{ fill: '#4b5563', fontSize: 10 }} axisLine={{ stroke: '#1a1a2e' }} tickLine={false} tickFormatter={(v: number) => `${v.toFixed(1)}ms`} width={55} domain={[0, 'auto']} />
            <Tooltip content={<FrameTooltip />} />
            <ReferenceArea y1={0} y2={8.33} fill="rgba(0, 240, 255, 0.02)" fillOpacity={1} />
            <ReferenceArea y1={8.33} y2={16.67} fill="rgba(0, 255, 136, 0.03)" fillOpacity={1} />
            <ReferenceArea y1={16.67} y2={33.33} fill="rgba(255, 170, 0, 0.03)" fillOpacity={1} />
            <ReferenceArea y1={33.33} y2={100} fill="rgba(255, 51, 102, 0.03)" fillOpacity={1} />
            <ReferenceLine y={targetMs} stroke="#ffaa00" strokeDasharray="6 3" strokeWidth={1} label={{ value: targetLabels[targetMs] || `${(1000/targetMs).toFixed(0)} FPS`, fill: '#ffaa00', fontSize: 9, position: 'right' }} />
            <ReferenceLine y={33.33} stroke="#ff3366" strokeDasharray="3 3" strokeWidth={0.5} label={{ value: '30 FPS', fill: '#ff3366', fontSize: 8, position: 'right' }} />
            <ReferenceLine y={8.33} stroke="#00f0ff" strokeDasharray="3 3" strokeWidth={0.8} label={{ value: '120 FPS', fill: '#00f0ff', fontSize: 8, position: 'right' }} />
            {abComparison && (
              <Line type="monotone" dataKey="frameTime" stroke="rgba(255,255,255,0.08)" strokeWidth={1} dot={false} isAnimationActive={false} strokeDasharray="4 4" />
            )}
            <Line type="monotone" dataKey="frameTime" stroke="#00ff88" strokeWidth={2.5} dot={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}