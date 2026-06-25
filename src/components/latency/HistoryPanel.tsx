'use client'

import { useMemo } from 'react'
import { AreaChart, Area, BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'
import { Clock, TrendingDown, TrendingUp, Activity, Wifi, Zap, BarChart3, Save, Database, ArrowUp, ArrowDown, Minus } from 'lucide-react'
import type { MetricsData, LatencyPoint, FrameTimePoint, PingPoint } from './types'

interface HistoryPanelProps {
  latencyData: LatencyPoint[]
  frameTimeData: FrameTimePoint[]
  pingData: PingPoint[]
  metrics: MetricsData | null
  sessionStart: number
  savedSessions?: Array<Record<string, unknown>>
}

function StatBox({ label, value, unit, color, icon, sub, trendIcon }: {
  label: string; value: string; unit: string; color: string; icon: React.ReactNode; sub?: string; trendIcon?: React.ReactNode
}) {
  return (
    <div className="bg-[#12121a] rounded-lg border border-[#1a1a2e] p-4 deep-shadow card-hover-border">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[9px] text-gray-500 uppercase tracking-wider">{label}</span>
        <span style={{ color }}>{icon}</span>
      </div>
      <div className="flex items-baseline gap-1">
        {trendIcon && <span className="mr-0.5">{trendIcon}</span>}
        <span className="text-xl font-mono font-bold text-white">{value}</span>
        <span className="text-[10px] text-gray-500">{unit}</span>
      </div>
      {sub && <p className="text-[10px] text-gray-500 mt-0.5">{sub}</p>}
    </div>
  )
}

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number; dataKey: string; color: string }>; label?: string }) {
  if (!active || !payload?.[0]) return null
  return (
    <div className="bg-[#12121a] border border-[#2a2a3e] rounded-lg px-3 py-2 shadow-xl">
      <p className="text-[10px] text-gray-500 mb-1">{label}</p>
      {payload.map((p, i) => (
        <p key={i} className="text-xs font-mono" style={{ color: p.color }}>
          {p.dataKey}: {typeof p.value === 'number' ? p.value.toFixed(2) : p.value}
        </p>
      ))}
    </div>
  )
}

export default function HistoryPanel({ latencyData, frameTimeData, pingData, metrics, sessionStart, savedSessions }: HistoryPanelProps) {
  const sessionSec = Math.floor((Date.now() - sessionStart) / 1000)

  const stats = useMemo(() => {
    if (latencyData.length < 2) return null
    const dpcs = latencyData.map(p => p.dpc)
    const isrs = latencyData.map(p => p.isr)
    const fts = frameTimeData.map(p => p.frameTime)
    const pings = pingData.map(p => p.ping)
    const avg = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length
    const pctl = (arr: number[], pct: number) => {
      const s = [...arr].sort((a, b) => a - b)
      return s[Math.floor(s.length * pct)]
    }
    const q = Math.floor(dpcs.length / 4)
    const q4 = q > 0 ? dpcs.slice(q * 3) : dpcs
    const q1 = q > 0 ? dpcs.slice(0, q) : dpcs
    return {
      dpcAvg: avg(dpcs), dpcMax: Math.max(...dpcs), dpcP95: pctl(dpcs, 0.95),
      isrAvg: avg(isrs), isrMax: Math.max(...isrs),
      ftP1: pctl(fts, 0.01), ftP01: pctl(fts, 0.001),
      pingAvg: avg(pings), pingMax: Math.max(...pings), pingP95: pctl(pings, 0.95),
      trend: q4.length > 0 && q1.length > 0 ? (avg(q4) > avg(q1) * 1.1 ? 'worsening' as const : avg(q4) < avg(q1) * 0.9 ? 'improving' as const : 'stable' as const) : 'stable' as const,
    }
  }, [latencyData, frameTimeData, pingData])

  const dpcDistribution = useMemo(() => {
    if (latencyData.length < 5) return []
    const dpcs = latencyData.map(p => p.dpc)
    const maxVal = Math.max(...dpcs, 100)
    const bucketSize = Math.max(10, Math.ceil(maxVal / 10 / 10) * 10)
    const buckets: Record<string, number> = {}
    dpcs.forEach(v => {
      const key = `${Math.floor(v / bucketSize) * bucketSize}`
      buckets[key] = (buckets[key] || 0) + 1
    })
    return Object.entries(buckets).map(([range, count]) => ({
      range: `${range}µs`,
      count,
      fill: Number(range) > 500 ? '#ff3366' : Number(range) > 200 ? '#ffaa00' : '#00f0ff',
    })).sort((a, b) => Number(a.range) - Number(b.range))
  }, [latencyData])

  const fpsDistribution = useMemo(() => {
    if (frameTimeData.length < 5) return []
    const bins: Record<string, number> = { '240+': 0, '180-240': 0, '144-180': 0, '120-144': 0, '90-120': 0, '60-90': 0, '<60': 0 }
    frameTimeData.forEach(ft => {
      const fps = 1000 / ft.frameTime
      if (fps >= 240) bins['240+']++
      else if (fps >= 180) bins['180-240']++
      else if (fps >= 144) bins['144-180']++
      else if (fps >= 120) bins['120-144']++
      else if (fps >= 90) bins['90-120']++
      else if (fps >= 60) bins['60-90']++
      else bins['<60']++
    })
    const total = frameTimeData.length
    return Object.entries(bins).map(([range, count]) => ({
      range,
      pct: total > 0 ? Math.round(count / total * 100) : 0,
      count,
      fill: range === '240+' ? '#00ff88' : range === '<60' ? '#ff3366' : range.startsWith('60') ? '#ffaa00' : '#00f0ff',
    }))
  }, [frameTimeData])

  const getTrendArrow = (trend: string) => {
    if (trend === 'improving') return <ArrowUp className="w-3.5 h-3.5 text-[#00ff88]" />
    if (trend === 'worsening') return <ArrowDown className="w-3.5 h-3.5 text-[#ff3366]" />
    return <Minus className="w-3.5 h-3.5 text-gray-500" />
  }

  return (
    <div className="space-y-4">
      {/* Session Summary */}
      <div className="bg-[#0d0d14] rounded-xl border border-[#1a1a2e] p-4">
        <div className="flex items-center gap-2 mb-4">
          <Clock className="w-4 h-4 text-[#00f0ff]" />
          <h3 className="text-sm font-semibold text-white">Session Summary</h3>
          <span className="text-[10px] font-mono text-gray-500 bg-[#1a1a2e] px-2 py-0.5 rounded">
            {Math.floor(sessionSec / 60)}m {sessionSec % 60}s
          </span>
          <span className="text-[10px] font-mono text-gray-500 bg-[#1a1a2e] px-2 py-0.5 rounded">
            {latencyData.length} samples
          </span>
        </div>

        {stats ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-6 gap-3">
            <StatBox label="DPC Average" value={stats.dpcAvg.toFixed(1)} unit="µs" color="#00f0ff" icon={<Zap className="w-3.5 h-3.5" />} sub={`Max: ${stats.dpcMax.toFixed(1)}µs`} />
            <StatBox label="DPC P95" value={stats.dpcP95.toFixed(1)} unit="µs" color="#ffaa00" icon={<Zap className="w-3.5 h-3.5" />} sub="95th percentile" />
            <StatBox label="1% Low FT" value={stats.ftP1.toFixed(2)} unit="ms" color="#a855f7" icon={<BarChart3 className="w-3.5 h-3.5" />} sub={`${(1000 / stats.ftP1).toFixed(0)} FPS`} />
            <StatBox label="Avg Ping" value={stats.pingAvg.toFixed(1)} unit="ms" color="#00f0ff" icon={<Wifi className="w-3.5 h-3.5" />} sub={`Max: ${stats.pingMax.toFixed(1)}ms`} />
            <StatBox label="ISR Average" value={stats.isrAvg.toFixed(1)} unit="µs" color="#a855f7" icon={<Activity className="w-3.5 h-3.5" />} sub={`Max: ${stats.isrMax.toFixed(1)}µs`} />
            <StatBox
              label="Trend"
              value={stats.trend === 'improving' ? 'IMPROVING' : stats.trend === 'worsening' ? 'WORSENING' : 'STABLE'}
              unit=""
              color={stats.trend === 'improving' ? '#00ff88' : stats.trend === 'worsening' ? '#ff3366' : '#ffaa00'}
              icon={stats.trend === 'improving' ? <TrendingDown className="w-3.5 h-3.5" /> : stats.trend === 'worsening' ? <TrendingUp className="w-3.5 h-3.5" /> : <Activity className="w-3.5 h-3.5" />}
              sub="Q1 vs Q4 comparison"
              trendIcon={getTrendArrow(stats.trend)}
            />
          </div>
        ) : (
          <div className="text-center py-8 text-gray-500 text-sm">Collecting data... Charts will appear once enough samples are gathered.</div>
        )}
      </div>

      {/* Timeline Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-[#0d0d14] rounded-xl border border-[#1a1a2e] p-4">
          <h4 className="text-xs font-medium text-white mb-3 flex items-center gap-2">
            <Zap className="w-3.5 h-3.5 text-[#00f0ff]" />DPC Latency — Full Session
          </h4>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={latencyData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                <defs>
                  <linearGradient id="histGrad1" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#00f0ff" stopOpacity={0.2} />
                    <stop offset="100%" stopColor="#00f0ff" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1a1a2e" vertical={false} />
                <XAxis dataKey="time" tick={{ fill: '#4b5563', fontSize: 9 }} axisLine={{ stroke: '#1a1a2e' }} tickLine={false} interval="preserveStartEnd" dy={3} />
                <YAxis tick={{ fill: '#4b5563', fontSize: 9 }} axisLine={{ stroke: '#1a1a2e' }} tickLine={false} width={52} dx={-3} />
                <Tooltip content={<ChartTooltip />} />
                <ReferenceLine y={500} stroke="#ffaa00" strokeDasharray="3 3" strokeWidth={0.8} />
                <Area type="monotone" dataKey="dpc" stroke="#00f0ff" strokeWidth={1.5} fill="url(#histGrad1)" isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-[#0d0d14] rounded-xl border border-[#1a1a2e] p-4">
          <h4 className="text-xs font-medium text-white mb-3 flex items-center gap-2">
            <Wifi className="w-3.5 h-3.5 text-[#00ff88]" />Ping — Full Session
          </h4>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={pingData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                <defs>
                  <linearGradient id="histGrad2" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#00ff88" stopOpacity={0.2} />
                    <stop offset="100%" stopColor="#00ff88" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1a1a2e" vertical={false} />
                <XAxis dataKey="time" tick={{ fill: '#4b5563', fontSize: 9 }} axisLine={{ stroke: '#1a1a2e' }} tickLine={false} interval="preserveStartEnd" dy={3} />
                <YAxis tick={{ fill: '#4b5563', fontSize: 9 }} axisLine={{ stroke: '#1a1a2e' }} tickLine={false} width={48} dx={-3} />
                <Tooltip content={<ChartTooltip />} />
                <ReferenceLine y={30} stroke="#00ff88" strokeDasharray="3 3" strokeWidth={0.5} />
                <ReferenceLine y={80} stroke="#ffaa00" strokeDasharray="3 3" strokeWidth={0.5} />
                <Area type="monotone" dataKey="ping" stroke="#00ff88" strokeWidth={1.5} fill="url(#histGrad2)" isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Distribution Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-[#0d0d14] rounded-xl border border-[#1a1a2e] p-4">
          <h4 className="text-xs font-medium text-white mb-3">DPC Latency Distribution</h4>
          {dpcDistribution.length > 0 ? (
            <div className="h-40">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dpcDistribution} margin={{ top: 2, right: 5, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1a1a2e" vertical={false} />
                  <XAxis dataKey="range" tick={{ fill: '#4b5563', fontSize: 9 }} axisLine={{ stroke: '#1a1a2e' }} tickLine={false} />
                  <YAxis tick={{ fill: '#4b5563', fontSize: 9 }} axisLine={{ stroke: '#1a1a2e' }} tickLine={false} width={30} />
                  <Tooltip content={<ChartTooltip />} />
                  <Bar dataKey="count" radius={[3, 3, 0, 0]} fillOpacity={0.8}>
                    {dpcDistribution.map((entry, index) => (
                      <Cell key={`dpc-${index}`} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-40 flex items-center justify-center text-gray-500 text-xs">Waiting for data...</div>
          )}
        </div>

        <div className="bg-[#0d0d14] rounded-xl border border-[#1a1a2e] p-4">
          <h4 className="text-xs font-medium text-white mb-3">FPS Distribution</h4>
          {fpsDistribution.length > 0 ? (
            <div className="h-40">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={fpsDistribution} layout="vertical" margin={{ top: 2, right: 5, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1a1a2e" horizontal={false} />
                  <XAxis type="number" tick={{ fill: '#4b5563', fontSize: 9 }} axisLine={{ stroke: '#1a1a2e' }} tickLine={false} />
                  <YAxis type="category" dataKey="range" tick={{ fill: '#4b5563', fontSize: 9 }} axisLine={{ stroke: '#1a1a2e' }} tickLine={false} width={55} />
                  <Tooltip content={<ChartTooltip />} />
                  <Bar dataKey="pct" radius={[0, 3, 3, 0]} fillOpacity={0.8}>
                    {fpsDistribution.map((entry, index) => (
                      <Cell key={`fps-${index}`} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-40 flex items-center justify-center text-gray-500 text-xs">Waiting for data...</div>
          )}
        </div>
      </div>

      {/* Saved Sessions */}
      {savedSessions && savedSessions.length > 0 && (
        <div className="bg-[#0d0d14] rounded-xl border border-[#1a1a2e] p-4">
          <div className="flex items-center gap-2 mb-3">
            <Database className="w-4 h-4 text-[#a855f7]" />
            <h4 className="text-xs font-medium text-white">Saved Sessions</h4>
            <span className="text-[9px] text-gray-500 font-mono bg-[#1a1a2e] px-1.5 py-0.5 rounded">{savedSessions.length}</span>
          </div>
          <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1 custom-scrollbar">
            {savedSessions.map((s: Record<string, unknown>, i: number) => {
              const date = new Date(s.createdAt as string)
              const score = s.score as number
              const dur = s.duration as number
              const mins = Math.floor(dur / 60)
              const secs = dur % 60
              return (
                <div key={i} className="flex items-center gap-3 p-2.5 rounded-lg bg-[#12121a] border border-[#1a1a2e] hover:border-[#2a2a3e] hover:shadow-[0_0_20px_rgba(0,240,255,0.05)] transition-colors deep-shadow">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-mono font-bold border border-current/20 ${
                    score >= 85 ? 'bg-[#00ff88]/10 text-[#00ff88]' : score >= 65 ? 'bg-[#ffaa00]/10 text-[#ffaa00]' : 'bg-[#ff3366]/10 text-[#ff3366]'
                  }`}>
                    {score}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-white font-medium truncate">{(s.name as string) || `Session ${i + 1}`}</span>
                      <span className="text-[9px] text-gray-600 font-mono">{(s.profile as string) || 'unknown'}</span>
                    </div>
                    <div className="flex items-center gap-2 text-[9px] text-gray-500 mt-0.5">
                      <span>{date.toLocaleDateString()}</span>
                      <span>·</span>
                      <span>{date.toLocaleTimeString()}</span>
                      <span>·</span>
                      <span>{mins}m {secs.toString().padStart(2, '0')}s</span>
                      <span>·</span>
                      <span>{s.samples as number} samples</span>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-[10px] font-mono text-gray-400">
                      DPC: {typeof s.avgDpc === 'number' ? (s.avgDpc as number).toFixed(1) : '—'}µs
                    </div>
                    <div className="text-[10px] font-mono text-gray-400">
                      Ping: {typeof s.avgPing === 'number' ? (s.avgPing as number).toFixed(1) : '—'}ms
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Empty Saved Sessions State */}
      {(!savedSessions || savedSessions.length === 0) && (
        <div className="bg-[#0d0d14] rounded-xl border border-[#1a1a2e] p-6 relative overflow-hidden">
          <div className="empty-dot-grid absolute inset-0 opacity-50" />
          <div className="relative flex flex-col items-center justify-center gap-3 py-4">
            <Database className="w-8 h-8 text-gray-600 opacity-30" />
            <h4 className="text-sm font-medium text-gray-400">No Saved Sessions</h4>
            <p className="text-[11px] text-gray-500 text-center max-w-sm leading-relaxed">
              Save monitoring sessions using the database icon in the header to compare performance over time.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}