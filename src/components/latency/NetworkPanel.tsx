'use client'

import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'
import { Wifi, ArrowDown, ArrowUp, AlertTriangle } from 'lucide-react'
import MetricCard from './MetricCard'
import DataSourceBadge from './DataSourceBadge'
import type { MetricsData, PingPoint } from './types'
import type { NetworkScanData } from '@/lib/types'

interface NetworkPanelProps {
  metrics: MetricsData | null
  pingData: PingPoint[]
  networkScanData?: NetworkScanData | null
}

function PingTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number }>; label?: string }) {
  if (!active || !payload?.[0]) return null
  return (
    <div className="bg-[#12121a] border border-[#2a2a3e] rounded-lg px-3 py-2 shadow-xl">
      <p className="text-[10px] text-gray-500 mb-1">{label}</p>
      <p className="text-xs font-mono text-white">{payload[0].value.toFixed(1)}ms</p>
    </div>
  )
}

function pingStatus(ping: number): 'good' | 'warning' | 'critical' {
  if (ping < 30) return 'good'
  if (ping < 80) return 'warning'
  return 'critical'
}

function isRealNetwork(data: NetworkScanData | null | undefined): boolean {
  if (!data) return false
  return data.source.source === 'measured' || data.source.source === 'imported'
}

export default function NetworkPanel({ metrics, pingData, networkScanData }: NetworkPanelProps) {
  if (!metrics) return null
  const n = metrics.network
  const hasReal = isRealNetwork(networkScanData)
  const nd = hasReal ? networkScanData! : null

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <MetricCard title="Ping" value={nd?.avgPing?.toFixed(1) ?? n.ping.toFixed(1)} unit="ms" status={pingStatus(nd?.avgPing ?? n.ping)}
          icon={<Wifi className="w-4 h-4" />} trend={n.ping > 40 ? 'up' : n.ping < 20 ? 'stable' : 'down'} />
        <MetricCard title="Jitter" value={nd?.jitter?.toFixed(2) ?? n.jitter.toFixed(2)} unit="ms" status={(nd?.jitter ?? n.jitter) < 3 ? 'good' : (nd?.jitter ?? n.jitter) < 10 ? 'warning' : 'critical'}
          icon={<AlertTriangle className="w-4 h-4" />} trend={n.jitter > 5 ? 'up' : 'stable'} />
        <MetricCard title="Packet Loss" value={nd?.packetLoss?.toFixed(3) ?? n.packetLoss.toFixed(3)} unit="%" status={(nd?.packetLoss ?? n.packetLoss) < 0.5 ? 'good' : (nd?.packetLoss ?? n.packetLoss) < 2 ? 'warning' : 'critical'}
          icon={<AlertTriangle className="w-4 h-4" />} />
        <MetricCard title="Download" value={n.download.toFixed(1)} unit="Mbps" status="good"
          icon={<ArrowDown className="w-4 h-4" />} subtitle={hasReal ? 'SIMULATED' : undefined} />
        <MetricCard title="Upload" value={n.upload.toFixed(1)} unit="Mbps" status="good"
          icon={<ArrowUp className="w-4 h-4" />} subtitle={hasReal ? 'SIMULATED' : undefined} />
      </div>

      {/* NO AGENT state — when no real network data at all */}
      {!hasReal && !networkScanData && (
        <div className="text-[9px] leading-relaxed px-3 py-2 rounded border bg-[#ffaa00]/5 border-[#ffaa00]/15 text-[#ffaa00]/70 flex items-center gap-2">
          <Wifi className="w-3.5 h-3.5 shrink-0" />
          <span>No real network data. Connect the <strong>Windows Agent</strong> for measured ping, jitter, and packet loss metrics.</span>
        </div>
      )}

      {/* Real network scan data section */}
      {nd && (
        <div className="bg-[#0d0d14] rounded-lg border border-[#1a1a2e] p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Wifi className="w-3.5 h-3.5 text-[#00f0ff]" />
              <h3 className="text-sm font-semibold text-white">Network Scan Results</h3>
            </div>
            <DataSourceBadge source={nd.source} size="sm" showCollector />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-2 text-[10px]">
            {nd.adapterName && (
              <div className="flex justify-between">
                <span className="text-gray-500">Adapter</span>
                <div className="flex items-center gap-1.5">
                  <span className="text-gray-300 font-mono truncate max-w-[180px]">{nd.adapterName}</span>
                  {nd.adapterType && (
                    <span className={`text-[8px] font-mono font-bold px-1 py-0.5 rounded ${
                      nd.adapterType === 'ethernet' ? 'bg-[#00ff88]/10 text-[#00ff88]' : 'bg-[#ffaa00]/10 text-[#ffaa00]'
                    }`}>
                      {nd.adapterType.toUpperCase()}
                    </span>
                  )}
                </div>
              </div>
            )}
            {nd.linkSpeed != null && (
              <div className="flex justify-between">
                <span className="text-gray-500">Link Speed</span>
                <span className="text-gray-300 font-mono">{nd.linkSpeed} Mbps</span>
              </div>
            )}
            {nd.pingGateway != null && (
              <div className="flex justify-between">
                <span className="text-gray-500">Ping Gateway</span>
                <span className={`font-mono ${nd.pingGateway < 5 ? 'text-[#00ff88]' : nd.pingGateway < 15 ? 'text-[#ffaa00]' : 'text-[#ff3366]'}`}>{nd.pingGateway.toFixed(1)} ms</span>
              </div>
            )}
            {nd.ping1_1_1_1 != null && (
              <div className="flex justify-between">
                <span className="text-gray-500">Ping 1.1.1.1</span>
                <span className={`font-mono ${nd.ping1_1_1_1 < 20 ? 'text-[#00ff88]' : nd.ping1_1_1_1 < 50 ? 'text-[#ffaa00]' : 'text-[#ff3366]'}`}>{nd.ping1_1_1_1.toFixed(1)} ms</span>
              </div>
            )}
            {nd.ping8_8_8_8 != null && (
              <div className="flex justify-between">
                <span className="text-gray-500">Ping 8.8.8.8</span>
                <span className={`font-mono ${nd.ping8_8_8_8 < 20 ? 'text-[#00ff88]' : nd.ping8_8_8_8 < 50 ? 'text-[#ffaa00]' : 'text-[#ff3366]'}`}>{nd.ping8_8_8_8.toFixed(1)} ms</span>
              </div>
            )}
            {nd.avgPing != null && (
              <div className="flex justify-between">
                <span className="text-gray-500">Avg Ping</span>
                <span className={`font-mono ${nd.avgPing < 20 ? 'text-[#00ff88]' : nd.avgPing < 50 ? 'text-[#ffaa00]' : 'text-[#ff3366]'}`}>{nd.avgPing.toFixed(1)} ms</span>
              </div>
            )}
            {nd.jitter != null && (
              <div className="flex justify-between">
                <span className="text-gray-500">Jitter</span>
                <span className={`font-mono ${nd.jitter < 3 ? 'text-[#00ff88]' : nd.jitter < 10 ? 'text-[#ffaa00]' : 'text-[#ff3366]'}`}>{nd.jitter.toFixed(2)} ms</span>
              </div>
            )}
            {nd.packetLoss != null && (
              <div className="flex justify-between">
                <span className="text-gray-500">Packet Loss</span>
                <span className={`font-mono ${nd.packetLoss < 0.5 ? 'text-[#00ff88]' : nd.packetLoss < 2 ? 'text-[#ffaa00]' : 'text-[#ff3366]'}`}>{nd.packetLoss.toFixed(3)}%</span>
              </div>
            )}
            {nd.dnsTiming != null && (
              <div className="flex justify-between">
                <span className="text-gray-500">DNS Timing</span>
                <span className={`font-mono ${nd.dnsTiming < 10 ? 'text-[#00ff88]' : nd.dnsTiming < 30 ? 'text-[#ffaa00]' : 'text-[#ff3366]'}`}>{nd.dnsTiming.toFixed(1)} ms</span>
              </div>
            )}
          </div>

          {/* Adapter type warning */}
          {nd.adapterType === 'wifi' && (
            <div className="text-[9px] leading-relaxed px-2 py-1.5 rounded border bg-[#ffaa00]/5 border-[#ffaa00]/15 text-[#ffaa00]/70">
              Wi-Fi adapter detected. For competitive play, wired Ethernet provides lower and more consistent latency. Wi-Fi adds 1-5ms average with higher jitter.
            </div>
          )}
          {nd.packetLoss != null && nd.packetLoss > 0.5 && (
            <div className="text-[9px] leading-relaxed px-2 py-1.5 rounded border bg-[#ff3366]/10 border-[#ff3366]/30 text-[#ff3366]">
              Packet loss detected ({nd.packetLoss.toFixed(3)}%). Check for faulty cables, network congestion, or ISP issues. Even 0.1% loss causes visible hit registration issues.
            </div>
          )}
        </div>
      )}

      {/* Connection Quality Bar — show real data source badge when available */}
      {nd && (
        <div className="flex items-center gap-2 mb-1">
          <DataSourceBadge source={nd.source} size="sm" showCollector />
          <span className="text-[8px] text-[#00ff88] font-mono">● LIVE DATA</span>
        </div>
      )}

      {/* Connection Quality Bar */}
      <div className="bg-[#0d0d14] rounded-lg border border-[#1a1a2e] p-3">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-gray-500 uppercase tracking-wider font-medium">Connection Quality</span>
            {nd && <DataSourceBadge source={nd.source} size="xs" />}
          </div>
          <span className={`text-[10px] font-mono font-bold ${(nd?.avgPing ?? n.ping) < 20 ? 'text-[#00ff88]' : (nd?.avgPing ?? n.ping) < 50 ? 'text-[#ffaa00]' : 'text-[#ff3366]'}`}>
            {(nd?.avgPing ?? n.ping) < 20 ? 'EXCELLENT' : (nd?.avgPing ?? n.ping) < 50 ? 'GOOD' : 'POOR'}
          </span>
        </div>
        <div className="flex gap-1 h-2">
          {[
            { label: 'Ping', pct: Math.min((nd?.avgPing ?? n.ping) / 150 * 100, 100), color: (nd?.avgPing ?? n.ping) < 30 ? '#00ff88' : (nd?.avgPing ?? n.ping) < 80 ? '#ffaa00' : '#ff3366' },
            { label: 'Jitter', pct: Math.min((nd?.jitter ?? n.jitter) / 20 * 100, 100), color: (nd?.jitter ?? n.jitter) < 3 ? '#00f0ff' : (nd?.jitter ?? n.jitter) < 10 ? '#ffaa00' : '#ff3366' },
            { label: 'Loss', pct: Math.min((nd?.packetLoss ?? n.packetLoss) / 5 * 100, 100), color: (nd?.packetLoss ?? n.packetLoss) < 0.5 ? '#a855f7' : (nd?.packetLoss ?? n.packetLoss) < 2 ? '#ffaa00' : '#ff3366' },
          ].map(seg => (
            <div key={seg.label} className="flex-1 bg-[#1a1a2e] rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all duration-500" style={{ width: `${Math.max(seg.pct, 3)}%`, backgroundColor: seg.color, opacity: seg.pct > 70 ? 1 : 0.6 }} />
            </div>
          ))}
        </div>
        <div className="flex justify-between mt-1.5 text-[8px] text-gray-600">
          <span>Ping</span><span>Jitter</span><span>Loss</span>
        </div>
      </div>

      <div className="bg-[#0d0d14] rounded-lg border border-[#1a1a2e] p-4">
        <h3 className="text-sm font-semibold text-white mb-3">Ping History</h3>
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={pingData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
              <defs>
                <linearGradient id="pingGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#00f0ff" stopOpacity={0.25} />
                  <stop offset="100%" stopColor="#00f0ff" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1a1a2e" vertical={false} />
              <XAxis dataKey="time" tick={{ fill: '#4b5563', fontSize: 10 }} axisLine={{ stroke: '#1a1a2e' }} tickLine={false} dy={5} />
              <YAxis tick={{ fill: '#4b5563', fontSize: 10 }} axisLine={{ stroke: '#1a1a2e' }} tickLine={false} tickFormatter={(v: number) => `${v}ms`} width={48} dx={-2} />
              <Tooltip content={<PingTooltip />} />
              <ReferenceLine y={30} stroke="#00ff88" strokeDasharray="3 3" strokeWidth={0.5} label={{ value: '30ms', fill: '#00ff88', fontSize: 8, position: 'insideTopLeft' }} />
              <ReferenceLine y={80} stroke="#ffaa00" strokeDasharray="3 3" strokeWidth={0.5} label={{ value: '80ms', fill: '#ffaa00', fontSize: 8, position: 'insideTopLeft' }} />
              <ReferenceLine y={150} stroke="#ff3366" strokeDasharray="3 3" strokeWidth={0.5} label={{ value: '150ms', fill: '#ff3366', fontSize: 8, position: 'insideTopLeft' }} />
              <Area type="monotone" dataKey="ping" stroke="#00f0ff" strokeWidth={2.5} fill="url(#pingGrad)" isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}