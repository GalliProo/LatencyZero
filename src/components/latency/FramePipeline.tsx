'use client'

import { motion } from 'framer-motion'
import { Cpu, Gpu, Monitor, Zap, ArrowRight } from 'lucide-react'
import type { MetricsData } from './types'

interface FramePipelineProps {
  metrics: MetricsData | null
}

function PipelineBar({ label, value, max, color, icon, unit }: {
  label: string; value: number; max: number; color: string; icon: React.ReactNode; unit: string
}) {
  const pct = Math.min((value / max) * 100, 100)
  const isWarn = pct > 60
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span style={{ color }}>{icon}</span>
          <span className="text-[11px] text-gray-300 font-medium">{label}</span>
        </div>
        <span className={`text-xs font-mono font-bold ${isWarn ? 'text-[#ffaa00]' : 'text-white'}`}>
          {value.toFixed(2)}{unit}
        </span>
      </div>
      <div className="h-3 bg-[#1a1a2e] rounded-full overflow-hidden relative">
        <motion.div
          className="h-full rounded-full"
          style={{ backgroundColor: color, boxShadow: `0 0 10px ${color}40` }}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
        />
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-[8px] font-mono text-white/70 mix-blend-difference">{pct.toFixed(0)}%</span>
        </div>
      </div>
    </div>
  )
}

export default function FramePipeline({ metrics }: FramePipelineProps) {
  if (!metrics) return null

  // Simulate PresentMon-style pipeline breakdown
  const cpuBusy = metrics.frameTime.current * 0.35
  const cpuWait = metrics.frameTime.current * 0.08
  const gpuBusy = metrics.frameTime.current * 0.40
  const gpuLatency = metrics.frameTime.current * 0.10
  const displayLatency = metrics.frameTime.current * 0.07
  const totalPipeline = cpuBusy + cpuWait + gpuBusy + gpuLatency + displayLatency

  return (
    <div className="bg-[#0d0d14] rounded-xl border border-[#1a1a2e] p-4 space-y-4 deep-shadow card-hover-border">
      <div>
        <h3 className="text-sm font-semibold text-white">Frame Pipeline Analysis</h3>
        <p className="text-[10px] text-gray-500 mt-0.5">PresentMon-style CPU→GPU→Display latency breakdown per frame</p>
      </div>

      {/* Visual Pipeline */}
      <div className="flex items-center gap-1">
        {[
          { label: 'CPU Busy', value: cpuBusy, color: '#00f0ff' },
          { label: 'CPU Wait', value: cpuWait, color: '#06b6d4' },
          { label: 'GPU Busy', value: gpuBusy, color: '#a855f7' },
          { label: 'GPU Latency', value: gpuLatency, color: '#7c3aed' },
          { label: 'Display', value: displayLatency, color: '#f59e0b' },
        ].map((seg, i) => (
          <motion.div
            key={seg.label}
            className="h-10 rounded-md relative group cursor-pointer pipeline-segment"
            style={{
              backgroundColor: seg.color,
              opacity: 0.75,
              flex: seg.value,
              minWidth: '4px',
              boxShadow: `0 0 12px ${seg.color}30`,
            }}
            whileHover={{ opacity: 1, scale: 1.02 }}
            transition={{ duration: 0.15 }}
          >
            {/* Segment label inside bar */}
            {(seg.value / totalPipeline) > 0.12 && (
              <span className="absolute inset-0 flex items-center justify-center text-[8px] font-mono font-bold text-white/80 mix-blend-difference">
                {seg.value.toFixed(1)}
              </span>
            )}
            <div className="absolute -top-8 left-1/2 -translate-x-1/2 hidden group-hover:block z-10">
              <div className="bg-[#12121a] border border-[#2a2a3e] rounded-lg px-2.5 py-1.5 text-[10px] whitespace-nowrap shadow-[0_0_20px_rgba(0,0,0,0.5)]">
                <span style={{ color: seg.color }} className="font-medium">{seg.label}</span>
                <span className="text-gray-400 ml-1.5 font-mono">{seg.value.toFixed(2)}ms</span>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-[10px]">
        {[
          { label: 'CPU Busy', color: '#00f0ff' },
          { label: 'CPU Wait', color: '#06b6d4' },
          { label: 'GPU Busy', color: '#a855f7' },
          { label: 'GPU Latency', color: '#7c3aed' },
          { label: 'Display Latency', color: '#f59e0b' },
        ].map(l => (
          <span key={l.label} className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: l.color, boxShadow: `0 0 6px ${l.color}40` }} />
            <span className="text-gray-300 font-medium">{l.label}</span>
          </span>
        ))}
      </div>

      {/* Detail Bars */}
      <div className="space-y-3">
        <PipelineBar label="CPU Busy" value={cpuBusy} max={16.67} color="#00f0ff" icon={<Cpu className="w-3.5 h-3.5" />} unit="ms" />
        <PipelineBar label="CPU Wait (Render Queue)" value={cpuWait} max={16.67} color="#06b6d4" icon={<Cpu className="w-3.5 h-3.5" />} unit="ms" />
        <PipelineBar label="GPU Busy" value={gpuBusy} max={16.67} color="#a855f7" icon={<Gpu className="w-3.5 h-3.5" />} unit="ms" />
        <PipelineBar label="GPU Latency (Raster→Display)" value={gpuLatency} max={16.67} color="#7c3aed" icon={<Gpu className="w-3.5 h-3.5" />} unit="ms" />
        <PipelineBar label="Display Latency (Scanout)" value={displayLatency} max={16.67} color="#f59e0b" icon={<Monitor className="w-3.5 h-3.5" />} unit="ms" />
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-2 pt-3 border-t border-[#1a1a2e]">
        <div className="text-center bg-[#12121a] rounded-lg py-2 px-1">
          <div className="text-[9px] text-gray-500 uppercase tracking-wider">Total Pipeline</div>
          <div className="text-sm font-mono font-bold text-white mt-0.5">{totalPipeline.toFixed(2)}<span className="text-[10px] text-gray-500 ml-0.5">ms</span></div>
        </div>
        <div className="text-center bg-[#12121a] rounded-lg py-2 px-1">
          <div className="text-[9px] text-gray-500 uppercase tracking-wider">Input→Photon</div>
          <div className="text-sm font-mono font-bold text-[#00f0ff] mt-0.5 status-glow-cyan">{(totalPipeline + 2.5).toFixed(1)}<span className="text-[10px] text-gray-500 ml-0.5">ms</span></div>
        </div>
        <div className="text-center bg-[#12121a] rounded-lg py-2 px-1">
          <div className="text-[9px] text-gray-500 uppercase tracking-wider">Bottleneck</div>
          <div className={`text-sm font-mono font-bold mt-0.5 ${gpuBusy > cpuBusy ? 'text-[#a855f7]' : 'text-[#00f0ff]'}`}>
            {gpuBusy > cpuBusy ? 'GPU' : 'CPU'}
            <span className="text-[9px] text-gray-500 ml-1 font-normal">bound</span>
          </div>
        </div>
      </div>
    </div>
  )
}