'use client'

import { useMemo } from 'react'
import { Route, Server, MapPin, Activity, Gauge } from 'lucide-react'
import type { MetricsData } from './types'

interface NetworkRouteAnalysisProps {
  metrics: MetricsData | null
}

interface HopData {
  hop: number
  name: string
  ip: string
  latency: number
  color: string
  dotColor: string
}

function getHopColor(latency: number): { color: string; dotColor: string } {
  if (latency < 15) return { color: 'text-[#00ff88]', dotColor: 'bg-[#00ff88]' }
  if (latency < 40) return { color: 'text-[#00f0ff]', dotColor: 'bg-[#00f0ff]' }
  if (latency < 80) return { color: 'text-[#ffaa00]', dotColor: 'bg-[#ffaa00]' }
  return { color: 'text-[#ff3366]', dotColor: 'bg-[#ff3366]' }
}

function getBudgetColor(latency: number, isRemaining: boolean): string {
  if (isRemaining) {
    if (latency < 15) return '#00ff88'
    if (latency < 40) return '#00f0ff'
    if (latency < 80) return '#ffaa00'
    return '#ff3366'
  }
  return latency
}

export default function NetworkRouteAnalysis({ metrics }: NetworkRouteAnalysisProps) {
  const hops = useMemo<HopData[]>(() => {
    if (!metrics) return []

    const ping = metrics.network.ping

    return [
      {
        hop: 1,
        name: 'Local Gateway',
        ip: '192.168.1.1',
        latency: 0.5,
        color: 'text-[#00ff88]',
        dotColor: 'bg-[#00ff88]',
      },
      {
        hop: 2,
        name: 'ISP Node',
        ip: '10.0.0.1',
        latency: 2 + Math.random() * 3,
        ...getHopColor(2 + Math.random() * 3),
      },
      {
        hop: 3,
        name: 'Regional Exchange',
        ip: '172.16.0.1',
        latency: 5 + Math.random() * 7,
        ...getHopColor(5 + Math.random() * 7),
      },
      {
        hop: 4,
        name: 'Core Router',
        ip: `154.23.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`,
        latency: 8 + Math.random() * 10,
        ...getHopColor(8 + Math.random() * 10),
      },
      {
        hop: 5,
        name: 'Backbone',
        ip: `129.250.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`,
        latency: 12 + Math.random() * 13,
        ...getHopColor(Math.random() > 0.7 ? 40 + Math.random() * 20 : 12 + Math.random() * 13),
      },
      {
        hop: 6,
        name: 'Game Server Region',
        ip: `203.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`,
        latency: ping * 0.6,
        ...getHopColor(ping * 0.6),
      },
      {
        hop: 7,
        name: 'Game Server Cluster',
        ip: `185.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`,
        latency: ping * 0.85,
        ...getHopColor(ping * 0.85),
      },
      {
        hop: 8,
        name: 'Game Server',
        ip: `185.252.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`,
        latency: ping,
        ...getHopColor(ping),
      },
    ]
  }, [metrics])

  const latencyBudget = useMemo(() => {
    if (!metrics) return []
    const ping = metrics.network.ping
    const yourPc = 1
    const localNetwork = 2
    const isp = 5
    const backbone = 8
    const lastMile = Math.max(ping - yourPc - localNetwork - isp - backbone, 1)

    return [
      { label: 'Your PC', ms: yourPc, color: '#6b7280' },
      { label: 'Local Network', ms: localNetwork, color: '#00f0ff' },
      { label: 'ISP', ms: isp, color: '#00ff88' },
      { label: 'Backbone', ms: backbone, color: '#ffaa00' },
      { label: 'Last Mile', ms: lastMile, color: getBudgetColor(lastMile, true) },
    ]
  }, [metrics])

  const serverInfo = useMemo(() => {
    if (!metrics) return null
    const ping = metrics.network.ping
    const location = ping < 30 ? 'Frankfurt, DE' : 'Virginia, US'
    const oneWayLatency = ping / 2
    const frameTime = 7.8
    const ratio = oneWayLatency / frameTime

    return { location, oneWayLatency, frameTime, ratio, ping }
  }, [metrics])

  if (!metrics) return null

  return (
    <div className="bg-[#0d0d14] rounded-xl border border-[#1a1a2e] p-4 deep-shadow card-hover-border">
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <Route className="w-4 h-4 text-[#00f0ff]" />
        <h3 className="text-sm font-semibold text-white section-title-deco">Network Route Analysis</h3>
      </div>

      {/* Route Visualization */}
      <div className="space-y-0 mb-5">
        {hops.map((h, i) => (
          <div key={h.hop}>
            <div className="flex items-center gap-3 p-2 rounded-lg hover:bg-[#12121a] transition-colors">
              {/* Hop number */}
              <div className="w-6 h-6 rounded-full bg-[#1a1a2e] text-[10px] font-mono text-gray-400 flex items-center justify-center shrink-0">
                {h.hop}
              </div>

              {/* Connecting line + dot */}
              <div className="relative flex flex-col items-center shrink-0 w-2">
                <div className={`w-2 h-2 rounded-full ${h.dotColor} shrink-0`} />
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-300 truncate">{h.name}</span>
                  <span className={`text-[11px] font-mono font-semibold ${h.color} shrink-0 ml-2`}>
                    {h.latency.toFixed(1)}ms
                  </span>
                </div>
                <span className="text-[10px] font-mono text-gray-500">{h.ip}</span>
              </div>
            </div>

            {/* Connecting line between hops */}
            {i < hops.length - 1 && (
              <div className="flex items-center gap-3">
                <div className="w-6 shrink-0" />
                <div className="w-px h-3 bg-gradient-to-b from-gray-700 to-gray-800 shrink-0" />
                <div className="flex-1" />
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Latency Budget Bar */}
      <div className="mb-5">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] text-gray-500 uppercase tracking-wider font-medium">
            Latency Budget
          </span>
          <span className="text-[11px] font-mono text-gray-400">
            {metrics.network.ping.toFixed(1)}ms total
          </span>
        </div>
        <div className="h-3 rounded-full overflow-hidden flex gap-px">
          {latencyBudget.map((seg) => {
            const total = latencyBudget.reduce((s, b) => s + b.ms, 0)
            const pct = (seg.ms / total) * 100
            return (
              <div
                key={seg.label}
                className="h-full rounded-full flex items-center justify-center overflow-hidden"
                style={{ width: `${pct}%`, backgroundColor: seg.color, opacity: 0.85 }}
                title={`${seg.label}: ${seg.ms}ms`}
              >
                {pct > 12 && (
                  <span className="text-[7px] font-mono text-white/90 whitespace-nowrap px-0.5">
                    {seg.label}
                  </span>
                )}
              </div>
            )
          })}
        </div>
        <div className="flex justify-between mt-1.5 text-[8px] text-gray-600">
          {latencyBudget.map((seg) => (
            <span key={seg.label} className="text-center" style={{ width: `${(seg.ms / latencyBudget.reduce((s, b) => s + b.ms, 0)) * 100}%` }}>
              {pctWidth(seg.ms, latencyBudget) > 8 ? seg.label : ''}
            </span>
          ))}
        </div>
      </div>

      {/* Server Info Card */}
      {serverInfo && (
        <div className="glass-card rounded-lg p-3 space-y-2.5">
          <div className="flex items-center gap-2 mb-1">
            <Server className="w-3.5 h-3.5 text-[#a855f7]" />
            <span className="text-[11px] font-semibold text-gray-300">Server Info</span>
          </div>

          <div className="flex items-center gap-2">
            <MapPin className="w-3 h-3 text-gray-500 shrink-0" />
            <span className="text-[11px] text-gray-400">Location:</span>
            <span className="text-[11px] font-medium text-gray-200">{serverInfo.location}</span>
          </div>

          <div className="flex items-center gap-2">
            <Activity className="w-3 h-3 text-gray-500 shrink-0" />
            <span className="text-[11px] text-gray-400">Tick Rate:</span>
            <span className="text-[11px] font-mono font-medium text-[#00ff88]">128 tick</span>
          </div>

          <div className="flex items-center gap-2">
            <Gauge className="w-3 h-3 text-gray-500 shrink-0" />
            <span className="text-[11px] text-gray-400">Frame Time:</span>
            <span className="text-[11px] font-mono font-medium text-gray-200">{serverInfo.frameTime}ms</span>
          </div>

          <div className="mt-2 pt-2 border-t border-[#1a1a2e]">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] text-gray-500">One-way vs Frame Time</span>
              <span className={`text-[10px] font-mono font-bold ${
                serverInfo.ratio < 1 ? 'text-[#00ff88]' : serverInfo.ratio < 2 ? 'text-[#ffaa00]' : 'text-[#ff3366]'
              }`}>
                {serverInfo.oneWayLatency.toFixed(1)}ms / {serverInfo.frameTime}ms
              </span>
            </div>
            <div className="h-1.5 bg-[#1a1a2e] rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  serverInfo.ratio < 1 ? 'bg-[#00ff88]' : serverInfo.ratio < 2 ? 'bg-[#ffaa00]' : 'bg-[#ff3366]'
                }`}
                style={{ width: `${Math.min((serverInfo.oneWayLatency / serverInfo.frameTime) * 50, 100)}%` }}
              />
            </div>
            <div className="flex justify-between mt-1">
              <span className="text-[8px] text-gray-600">One-way latency is {serverInfo.ratio < 1 ? 'below' : serverInfo.ratio < 2 ? 'near' : 'above'} server frame time</span>
              <span className={`text-[8px] font-mono ${serverInfo.ratio < 1 ? 'text-[#00ff88]/60' : serverInfo.ratio < 2 ? 'text-[#ffaa00]/60' : 'text-[#ff3366]/60'}`}>
                {serverInfo.ratio.toFixed(2)}x
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function pctWidth(ms: number, budget: { ms: number }[]): number {
  const total = budget.reduce((s, b) => s + b.ms, 0)
  return (ms / total) * 100
}