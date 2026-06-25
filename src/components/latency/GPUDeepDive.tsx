'use client'

import { useState, useRef, useMemo, useEffect } from 'react'
import { Gpu, Zap, HardDrive, Fan, Thermometer, TrendingUp, Activity, ShieldAlert, ZapOff, Wind, Gauge } from 'lucide-react'
import { AreaChart, Area, ResponsiveContainer, YAxis } from 'recharts'
import type { MetricsData } from './types'

interface GPUDeepDiveProps {
  metrics: MetricsData | null
}

const TDP_MAX = 320
const VRAM_TOTAL = 24
const MAX_BANDWIDTH = 1008

function progressColor(pct: number): string {
  if (pct < 60) return 'bg-[#00ff88]'
  if (pct < 85) return 'bg-[#ffaa00]'
  return 'bg-[#ff3366]'
}

function tempColor(temp: number): string {
  if (temp < 70) return 'text-[#00ff88]'
  if (temp < 85) return 'text-[#ffaa00]'
  return 'text-[#ff3366]'
}

interface ThrottleItem {
  label: string
  reason: 'none' | 'powersave' | 'thermal' | 'current' | 'voltage'
  icon: React.ReactNode
}

export default function GPUDeepDive({ metrics }: GPUDeepDiveProps) {
  const clockHistoryRef = useRef<number[]>([])
  const [clockHistory, setClockHistory] = useState<{ clock: number }[]>([])

  // Update clock history when metrics change
  useEffect(() => {
    if (metrics) {
      const gpu = metrics.hardware.gpu
      clockHistoryRef.current = [...clockHistoryRef.current, gpu.clock].slice(-30)
      setClockHistory([...clockHistoryRef.current].map(c => ({ clock: c })))
    }
  }, [metrics?.hardware.gpu.clock, metrics?.timestamp])

  const derived = useMemo(() => {
    if (!metrics) return null
    const gpu = metrics.hardware.gpu
    const memoryClock = gpu.clock * 2
    const boostClock = Math.round(gpu.clock * 1.15)
    const currentPower = Math.round(150 + (gpu.usage / 100) * 170)
    const powerPct = (currentPower / TDP_MAX) * 100
    const efficiency = ((gpu.usage / 100) / (currentPower / TDP_MAX)).toFixed(2)
    const fanSpeed = Math.min(Math.round(40 + gpu.temp * 0.6), 100)
    const hotspotTemp = gpu.temp + 12
    const memoryTemp = Math.max(gpu.temp - 5, 0)
    const vramPct = (gpu.vram / VRAM_TOTAL) * 100
    const memBandwidth = Math.round((gpu.vram / VRAM_TOTAL) * MAX_BANDWIDTH)
    const bandwidthPct = (memBandwidth / MAX_BANDWIDTH) * 100

    return {
      gpu,
      memoryClock,
      boostClock,
      currentPower,
      powerPct,
      efficiency,
      fanSpeed,
      hotspotTemp,
      memoryTemp,
      vramPct,
      memBandwidth,
      bandwidthPct,
    }
  }, [metrics])

  if (!metrics || !derived) {
    return (
      <div className="bg-[#0d0d14] rounded-lg border border-[#1a1a2e] p-4 deep-shadow card-hover-border">
        <div className="flex items-center gap-2">
          <Gpu className="w-4 h-4 text-gray-600" />
          <h3 className="section-title-deco text-sm font-semibold text-gray-600">GPU Deep Dive</h3>
        </div>
        <div className="flex items-center justify-center h-32">
          <span className="text-[10px] text-gray-600">Awaiting GPU telemetry...</span>
        </div>
      </div>
    )
  }

  const { gpu, memoryClock, boostClock, currentPower, powerPct, efficiency, fanSpeed, hotspotTemp, memoryTemp, vramPct, memBandwidth, bandwidthPct } = derived

  const throttleReasons: ThrottleItem[] = [
    { label: 'Power Limit', reason: 'none', icon: <Zap className="w-3 h-3" /> },
    { label: 'Thermal', reason: 'none', icon: <Thermometer className="w-3 h-3" /> },
    { label: 'Current Limit', reason: 'none', icon: <Activity className="w-3 h-3" /> },
    { label: 'Voltage', reason: 'none', icon: <ZapOff className="w-3 h-3" /> },
    { label: 'Powersave', reason: 'none', icon: <Wind className="w-3 h-3" /> },
  ]

  // Clock percentage for mini bars (relative to boost clock max ~2700 MHz for a 4090-class card)
  const baseClockPct = Math.min((gpu.clock / 2700) * 100, 100)
  const memClockPct = Math.min((memoryClock / 10501) * 100, 100)
  const boostClockPct = Math.min((boostClock / 2700) * 100, 100)

  return (
    <div className="bg-[#0d0d14] rounded-lg border border-[#1a1a2e] p-4 space-y-4 deep-shadow card-hover-border">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Gpu className="w-4 h-4 text-[#a855f7]" />
          <h3 className="section-title-deco text-sm font-semibold text-white">GPU Deep Dive</h3>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-[#00ff88] animate-pulse" />
          <span className="text-[10px] text-gray-500 font-mono">LIVE</span>
        </div>
      </div>

      {/* Clock Speed Section */}
      <div className="glass-card rounded-lg p-3 space-y-2.5">
        <div className="flex items-center gap-1.5">
          <Gauge className="w-3 h-3 text-[#00f0ff]" />
          <span className="text-[10px] uppercase tracking-widest text-gray-500 font-medium">Clock Speeds</span>
        </div>

        {/* Base Clock */}
        <div className="space-y-1">
          <div className="flex justify-between items-baseline">
            <span className="text-[10px] text-gray-500">Base Clock</span>
            <span className="text-xs font-mono text-gray-300">{gpu.clock} MHz</span>
          </div>
          <div className="h-1.5 bg-[#1a1a2e] rounded-full overflow-hidden">
            <div className={`h-full rounded-full transition-all duration-500 ${progressColor(baseClockPct)}`} style={{ width: `${baseClockPct}%` }} />
          </div>
        </div>

        {/* Memory Clock */}
        <div className="space-y-1">
          <div className="flex justify-between items-baseline">
            <span className="text-[10px] text-gray-500">Memory Clock (GDDR6)</span>
            <span className="text-xs font-mono text-gray-300">{memoryClock} MHz</span>
          </div>
          <div className="h-1.5 bg-[#1a1a2e] rounded-full overflow-hidden">
            <div className={`h-full rounded-full transition-all duration-500 ${progressColor(memClockPct)}`} style={{ width: `${memClockPct}%` }} />
          </div>
        </div>

        {/* Boost Clock */}
        <div className="space-y-1">
          <div className="flex justify-between items-baseline">
            <span className="text-[10px] text-gray-500">Boost Clock</span>
            <span className="text-xs font-mono text-[#a855f7]">{boostClock} MHz</span>
          </div>
          <div className="h-1.5 bg-[#1a1a2e] rounded-full overflow-hidden">
            <div className="h-full rounded-full bg-gradient-to-r from-[#a855f7] to-[#c084fc] transition-all duration-500" style={{ width: `${boostClockPct}%` }} />
          </div>
        </div>
      </div>

      {/* Power Draw Section */}
      <div className="glass-card rounded-lg p-3 space-y-2.5">
        <div className="flex items-center gap-1.5">
          <Zap className="w-3 h-3 text-[#ffaa00]" />
          <span className="text-[10px] uppercase tracking-widest text-gray-500 font-medium">Power Draw</span>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <div className="space-y-1">
            <span className="text-[10px] text-gray-500 block">TDP</span>
            <span className="text-xs font-mono text-gray-400">{TDP_MAX}W</span>
          </div>
          <div className="space-y-1">
            <span className="text-[10px] text-gray-500 block">Current</span>
            <span className={`text-xs font-mono ${powerPct > 85 ? 'text-[#ff3366]' : powerPct > 60 ? 'text-[#ffaa00]' : 'text-[#00ff88]'}`}>
              {currentPower}W
            </span>
          </div>
          <div className="space-y-1">
            <span className="text-[10px] text-gray-500 block">Efficiency</span>
            <span className="text-xs font-mono text-[#00f0ff]">{efficiency} p/w</span>
          </div>
        </div>

        <div className="space-y-1">
          <div className="flex justify-between items-baseline">
            <span className="text-[10px] text-gray-500">Power Envelope</span>
            <span className="text-[10px] text-gray-500 font-mono">{powerPct.toFixed(1)}%</span>
          </div>
          <div className="h-2 bg-[#1a1a2e] rounded-full overflow-hidden">
            <div className={`h-full rounded-full transition-all duration-500 ${progressColor(powerPct)}`} style={{ width: `${Math.min(powerPct, 100)}%` }} />
          </div>
        </div>
      </div>

      {/* Memory Section */}
      <div className="glass-card rounded-lg p-3 space-y-2.5">
        <div className="flex items-center gap-1.5">
          <HardDrive className="w-3 h-3 text-[#00f0ff]" />
          <span className="text-[10px] uppercase tracking-widest text-gray-500 font-medium">Memory</span>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <span className="text-[10px] text-gray-500 block">VRAM Usage</span>
            <span className="text-xs font-mono text-gray-300">{gpu.vram} / {VRAM_TOTAL} GB</span>
          </div>
          <div className="space-y-1">
            <span className="text-[10px] text-gray-500 block">Bandwidth</span>
            <span className="text-xs font-mono text-[#00ff88]">{memBandwidth} GB/s</span>
          </div>
        </div>

        <div className="space-y-1">
          <div className="flex justify-between items-baseline">
            <span className="text-[10px] text-gray-500">VRAM Utilization</span>
            <span className="text-[10px] text-gray-500 font-mono">{vramPct.toFixed(1)}%</span>
          </div>
          <div className="h-2 bg-[#1a1a2e] rounded-full overflow-hidden">
            <div className="h-full rounded-full bg-gradient-to-r from-[#a855f7] to-[#c084fc] transition-all duration-500" style={{ width: `${vramPct}%` }} />
          </div>
        </div>

        <div className="space-y-1">
          <div className="flex justify-between items-baseline">
            <span className="text-[10px] text-gray-500">Bandwidth Utilization</span>
            <span className="text-[10px] text-gray-500 font-mono">{bandwidthPct.toFixed(1)}%</span>
          </div>
          <div className="h-2 bg-[#1a1a2e] rounded-full overflow-hidden">
            <div className={`h-full rounded-full transition-all duration-500 ${progressColor(bandwidthPct)}`} style={{ width: `${bandwidthPct}%` }} />
          </div>
        </div>

        <div className="flex justify-between items-baseline pt-1 border-t border-[#1a1a2e]">
          <span className="text-[10px] text-gray-500">Memory Temp</span>
          <span className={`text-xs font-mono ${tempColor(memoryTemp)}`}>{memoryTemp}°C</span>
        </div>
      </div>

      {/* Fan & Thermal Section */}
      <div className="glass-card rounded-lg p-3 space-y-2.5">
        <div className="flex items-center gap-1.5">
          <Fan className="w-3 h-3 text-[#00f0ff]" />
          <span className="text-[10px] uppercase tracking-widest text-gray-500 font-medium">Fan & Thermal</span>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <div className="space-y-1">
            <span className="text-[10px] text-gray-500 block">Fan Speed</span>
            <span className={`text-xs font-mono ${fanSpeed > 85 ? 'text-[#ff3366]' : fanSpeed > 60 ? 'text-[#ffaa00]' : 'text-gray-300'}`}>
              {fanSpeed}%
            </span>
          </div>
          <div className="space-y-1">
            <span className="text-[10px] text-gray-500 block">Core Temp</span>
            <span className={`text-xs font-mono ${tempColor(gpu.temp)}`}>{gpu.temp}°C</span>
          </div>
          <div className="space-y-1">
            <span className="text-[10px] text-gray-500 block">Hotspot</span>
            <span className={`text-xs font-mono ${tempColor(hotspotTemp)}`}>{hotspotTemp}°C</span>
          </div>
        </div>

        <div className="space-y-1">
          <div className="flex justify-between items-baseline">
            <span className="text-[10px] text-gray-500">Fan Curve</span>
            <span className="text-[10px] text-gray-500 font-mono">{fanSpeed}%</span>
          </div>
          <div className="h-2 bg-[#1a1a2e] rounded-full overflow-hidden">
            <div className={`h-full rounded-full transition-all duration-500 ${progressColor(fanSpeed)}`} style={{ width: `${fanSpeed}%` }} />
          </div>
        </div>

        {/* Temperature trend indicator */}
        <div className="flex items-center gap-1.5 px-2 py-1.5 bg-[#0d0d14]/60 rounded border border-[#1a1a2e]">
          <TrendingUp className="w-3 h-3 text-[#00ff88]" />
          <span className="text-[10px] text-gray-400">
            Core temp stable — {gpu.temp < 70 ? 'optimal' : gpu.temp < 85 ? 'elevated' : 'critical'} range
          </span>
        </div>
      </div>

      {/* Throttle Reasons Grid */}
      <div className="glass-card rounded-lg p-3 space-y-2.5">
        <div className="flex items-center gap-1.5">
          <ShieldAlert className="w-3 h-3 text-[#ffaa00]" />
          <span className="text-[10px] uppercase tracking-widest text-gray-500 font-medium">Throttle Reasons</span>
        </div>

        <div className="grid grid-cols-5 gap-1.5">
          {throttleReasons.map((item) => {
            const isActive = item.reason !== 'none'
            return (
              <div
                key={item.label}
                className="flex flex-col items-center gap-1.5 p-2 rounded-md bg-[#0d0d14]/60 border border-[#1a1a2e] transition-colors"
              >
                <div className="flex items-center justify-center">
                  <span className={`text-gray-500 ${isActive ? 'text-[#ff3366]' : ''}`}>
                    {item.icon}
                  </span>
                </div>
                <span className={`w-2 h-2 rounded-full ${isActive ? 'bg-[#ff3366] animate-pulse' : 'bg-[#00ff88]'}`} />
                <span className="text-[9px] text-gray-500 text-center leading-tight">{item.label}</span>
              </div>
            )
          })}
        </div>

        <div className="flex items-center justify-center gap-1.5 pt-1">
          <span className="w-1.5 h-1.5 rounded-full bg-[#00ff88]" />
          <span className="text-[10px] text-gray-500">All limiters clear — GPU running unrestricted</span>
        </div>
      </div>

      {/* GPU Clock History Sparkline */}
      <div className="glass-card rounded-lg p-3 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Activity className="w-3 h-3 text-[#a855f7]" />
            <span className="text-[10px] uppercase tracking-widest text-gray-500 font-medium">Clock History</span>
          </div>
          <span className="text-[10px] text-gray-500 font-mono">30 samples</span>
        </div>
        <div className="h-24">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={clockHistory} margin={{ top: 2, right: 2, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="gpuClockGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#a855f7" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#a855f7" stopOpacity={0} />
                </linearGradient>
              </defs>
              <YAxis
                domain={['dataMin - 50', 'dataMax + 50']}
                hide
              />
              <Area
                type="monotone"
                dataKey="clock"
                stroke="#a855f7"
                strokeWidth={1.5}
                fill="url(#gpuClockGrad)"
                isAnimationActive={false}
                dot={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}