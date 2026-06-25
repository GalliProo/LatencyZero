'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import {
  FileText, Download, Copy, CheckCircle, AlertTriangle, XCircle,
  ChevronDown, Shield, Clock, BarChart3
} from 'lucide-react'
import type { MetricsData, DriverInfo, AlertItem } from './types'
import type { RootCauseFinding, OverallScore, CategoryScore } from '@/lib/types'
import type { AgentData } from '@/hooks/useAgentData'
import DataSourceBadge from '@/components/latency/DataSourceBadge'

interface ScanReportProps {
  metrics: MetricsData | null
  drivers: DriverInfo[]
  alerts: AlertItem[]
  score: number
  gameProfile: string
  agentRootCauses?: RootCauseFinding[]
  agentData?: AgentData | null
  computedScore?: OverallScore | null
}

interface Finding {
  id: string
  priority: 'high' | 'medium' | 'low'
  domain: string
  title: string
  evidence: string
  correlated?: string[]
  recommendation: string
}

function generateFindings(metrics: MetricsData | null, drivers: DriverInfo[], alerts: AlertItem[], score: number): Finding[] {
  const findings: Finding[] = []

  if (!metrics) return findings

  if (score < 50) {
    findings.push({
      id: 'SYS-001', priority: 'high', domain: 'System',
      title: 'Overall system performance critically degraded',
      evidence: `Performance score: ${score}/100. Multiple subsystems showing issues.`,
      correlated: ['DPC-001', 'NET-001'],
      recommendation: 'Run full diagnostic scan and address high-priority items first.',
    })
  }

  if (metrics.dpc.max > 500) {
    const badDrivers = drivers.filter(d => d.severity !== 'good')
    findings.push({
      id: 'DPC-001', priority: metrics.dpc.max > 1000 ? 'high' : 'medium', domain: 'Kernel',
      title: `DPC latency spikes detected — max: ${metrics.dpc.max.toFixed(1)}µs`,
      evidence: `Microsoft guideline: DPC should not exceed ~100µs. Measured max: ${metrics.dpc.max.toFixed(1)}µs.`,
      correlated: badDrivers.map(d => `DRV-${d.module.slice(0, 8)}`),
      recommendation: badDrivers.length > 0
        ? `Primary contributors: ${badDrivers.map(d => d.name).join(', ')}. Update or rollback these drivers.`
        : 'Update chipset and network drivers to latest stable versions.',
    })
  }

  if (metrics.frameTime.min1pct > 12) {
    findings.push({
      id: 'FRAME-001', priority: metrics.frameTime.min1pct > 20 ? 'high' : 'medium', domain: 'Frame Pacing',
      title: `1% low frametime elevated: ${metrics.frameTime.min1pct.toFixed(2)}ms (${(1000 / metrics.frameTime.min1pct).toFixed(0)} FPS)`,
      evidence: `For competitive play, 1% low should stay above target refresh rate. Current 1% low translates to ${(1000 / metrics.frameTime.min1pct).toFixed(0)} FPS.`,
      recommendation: 'Check for background processes, thermal throttling, or storage issues causing periodic stutter.',
    })
  }

  if (metrics.network.ping > 40) {
    findings.push({
      id: 'NET-001', priority: metrics.network.ping > 80 ? 'high' : 'medium', domain: 'Network',
      title: `Elevated network latency: ${metrics.network.ping.toFixed(1)}ms avg, jitter: ${metrics.network.jitter.toFixed(2)}ms`,
      evidence: `Competitive target: <30ms ping, <3ms jitter. Packet loss: ${metrics.network.packetLoss.toFixed(3)}%.`,
      recommendation: 'Use wired Ethernet. Enable QoS/SQM on router. Test for bufferbloat under load.',
    })
  }

  if (metrics.hardware.gpu.temp > 82) {
    findings.push({
      id: 'THERM-001', priority: 'medium', domain: 'Thermal',
      title: `GPU temperature elevated: ${metrics.hardware.gpu.temp}°C`,
      evidence: `Sustained temps above 80°C may trigger power/thermal throttling on some GPUs, causing clock reduction and frametime instability.`,
      recommendation: 'Improve case airflow, check thermal paste, consider undervolting. Monitor nvidia-smi throttle reasons.',
    })
  }

  if (metrics.hardware.ram.percent > 85) {
    findings.push({
      id: 'RAM-001', priority: 'low', domain: 'System',
      title: `RAM usage high: ${metrics.hardware.ram.percent}%`,
      evidence: `${metrics.hardware.ram.available}GB available of 32GB. High RAM usage can cause hard pagefaults and stutter.`,
      recommendation: 'Close unnecessary background applications before competitive play.',
    })
  }

  // Always generate contextual findings even when healthy
  if (score >= 80) {
    findings.push({
      id: 'SYS-000', priority: 'low', domain: 'System',
      title: 'System performing within competitive thresholds',
      evidence: `Performance score: ${score}/100. All primary subsystems (DPC, frametime, network, thermal) are within acceptable ranges for competitive play.`,
      recommendation: 'Continue monitoring. Save baseline session for future A/B comparison when making system changes.',
    })
  }

  // Frame pacing analysis finding
  if (metrics.frameTime.avg > 8) {
    findings.push({
      id: 'FRAME-002', priority: metrics.frameTime.avg > 14 ? 'medium' : 'low', domain: 'Frame Pacing',
      title: `Average frametime: ${metrics.frameTime.avg.toFixed(2)}ms (${(1000 / metrics.frameTime.avg).toFixed(0)} FPS average)`,
      evidence: `Average frame delivery time is ${metrics.frameTime.avg.toFixed(2)}ms. For 120Hz displays, target is ≤8.33ms. For 240Hz, target is ≤4.17ms.`,
      recommendation: metrics.frameTime.avg > 12 ? 'Consider lowering graphics settings or enabling DLSS/FSR to maintain target refresh rate.' : 'Frametime is acceptable. Monitor 1% low for consistency.',
    })
  }

  // Network consistency finding
  if (metrics.network.jitter > 3) {
    findings.push({
      id: 'NET-002', priority: metrics.network.jitter > 8 ? 'medium' : 'low', domain: 'Network',
      title: `Network jitter elevated: ${metrics.network.jitter.toFixed(2)}ms`,
      evidence: `Jitter above 3ms can cause perceptible inconsistency in hit registration. Current: ${metrics.network.jitter.toFixed(2)}ms. Ping: ${metrics.network.ping.toFixed(1)}ms.`,
      recommendation: 'Enable QoS on router. Use wired connection. Consider ISP upgrade if jitter persists.',
    })
  }

  // GPU usage finding
  if (metrics.hardware.gpu.usage < 70 && metrics.fps.current < 200) {
    findings.push({
      id: 'GPU-001', priority: 'low', domain: 'GPU',
      title: `GPU utilization low: ${metrics.hardware.gpu.usage.toFixed(0)}%`,
      evidence: `GPU is not fully loaded at ${metrics.hardware.gpu.usage.toFixed(0)}% usage. This suggests a CPU bottleneck or frame rate cap.`,
      recommendation: 'Check for CPU bottleneck. If uncapped, GPU may be waiting for CPU work. Consider lowering resolution or enabling GPU-bound settings.',
    })
  }

  // CPU temp finding
  if (metrics.hardware.cpu.temp > 75) {
    findings.push({
      id: 'THERM-002', priority: metrics.hardware.cpu.temp > 85 ? 'high' : 'medium', domain: 'Thermal',
      title: `CPU temperature elevated: ${metrics.hardware.cpu.temp}°C`,
      evidence: `CPU running at ${metrics.hardware.cpu.temp}°C with ${metrics.hardware.cpu.usage.toFixed(0)}% load. Sustained high temps may cause clock throttling.`,
      recommendation: 'Check CPU cooler mounting, thermal paste, and case airflow. Consider PBO/Curve Optimizer settings.',
    })
  }

  // HAGS finding (always present)
  findings.push({
    id: 'CONF-001', priority: 'low', domain: 'Config',
    title: 'HAGS enabled — requires per-title A/B validation',
    evidence: 'HAGS can improve or worsen frametime depending on game/engine/driver combination.',
    recommendation: 'Test with HAGS ON vs OFF for your specific competitive title. Compare 1% low frametimes.',
  })

  return findings.sort((a, b) => {
    const p = { high: 3, medium: 2, low: 1 }
    return p[b.priority] - p[a.priority]
  })
}

const priorityConfig = {
  high: { label: 'HIGH', color: 'text-[#ff3366]', bg: 'bg-[#ff3366]/10', border: 'border-[#ff3366]/30', icon: <XCircle className="w-3.5 h-3.5" /> },
  medium: { label: 'MEDIUM', color: 'text-[#ffaa00]', bg: 'bg-[#ffaa00]/10', border: 'border-[#ffaa00]/30', icon: <AlertTriangle className="w-3.5 h-3.5" /> },
  low: { label: 'LOW', color: 'text-[#00f0ff]', bg: 'bg-[#00f0ff]/10', border: 'border-[#00f0ff]/30', icon: <CheckCircle className="w-3.5 h-3.5" /> },
}

export default function ScanReport({ metrics, drivers, alerts, score, gameProfile, agentRootCauses, agentData, computedScore }: ScanReportProps) {
  const [expanded, setExpanded] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const localFindings = generateFindings(metrics, drivers, alerts, score)

  // Convert agent root cause findings into the local Finding format
  const agentFindings: Finding[] = (agentRootCauses ?? []).map(rca => ({
    id: rca.id,
    priority: (rca.severity === 'critical' ? 'high' : rca.severity === 'high' ? 'high' : rca.severity === 'warning' ? 'medium' : 'low') as Finding['priority'],
    domain: rca.domain,
    title: rca.title,
    evidence: Object.entries(rca.observed)
      .map(([k, v]) => `${k}: ${v}`)
      .join(', '),
    correlated: rca.sources,
    recommendation: rca.recommendation,
  }))

  // Merge: agent findings first (they're from real data), then local simulated ones
  const agentFindingIds = new Set(agentFindings.map(f => f.id))
  const dedupedLocal = localFindings.filter(f => !agentFindingIds.has(f.id))
  const findings = [...agentFindings, ...dedupedLocal]

  const hasRealData = agentData?.hasAnyRealData ?? false

  // Empty state: no findings at all — no data source available
  if (findings.length === 0) {
    return (
      <div className="bg-[#0d0d14] rounded-xl border border-[#1a1a2e] p-6 text-center space-y-3">
        <FileText className="w-8 h-8 text-gray-600 mx-auto" />
        <p className="text-sm text-gray-400">No diagnostic data available.</p>
        <p className="text-[11px] text-gray-500 leading-relaxed max-w-md mx-auto">
          Connect the <strong className="text-gray-400">Windows Agent</strong> or import{' '}
          <strong className="text-gray-400">LatencyMon</strong> / <strong className="text-gray-400">PresentMon</strong> files to generate a diagnostic report.
        </p>
      </div>
    )
  }

  const highCount = findings.filter(f => f.priority === 'high').length
  const medCount = findings.filter(f => f.priority === 'medium').length

  const overallStatus = highCount > 0 ? 'ATTENZIONE' : medCount > 2 ? 'NEEDS IMPROVEMENT' : 'COMPETITIVE READY'
  const statusColor = highCount > 0 ? 'text-[#ff3366]' : medCount > 2 ? 'text-[#ffaa00]' : 'text-[#00ff88]'

  const handleCopy = () => {
    const text = findings.map(f => `[${f.priority.toUpperCase()}] ${f.title}\n  Evidence: ${f.evidence}\n  Fix: ${f.recommendation}`).join('\n\n')
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="bg-[#0d0d14] rounded-xl border border-[#1a1a2e] p-4 space-y-4 deep-shadow card-hover-border">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-[#00f0ff]" />
          <h3 className="text-sm font-semibold text-white">Diagnostic Report</h3>
          {hasRealData && agentData && <DataSourceBadge source={{ source: 'measured', collector: 'Windows Agent', confidence: 0.85, lastUpdated: agentData.lastFetched ?? Date.now() }} size="sm" showCollector />}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleCopy} className="flex items-center gap-1 px-2 py-1 rounded text-[10px] text-gray-400 hover:text-white hover:bg-[#1a1a2e] transition-colors">
            {copied ? <CheckCircle className="w-3 h-3 text-[#00ff88]" /> : <Copy className="w-3 h-3" />}
            {copied ? 'Copied' : 'Copy'}
          </button>
          <button onClick={() => {
              const w = window.open('', '_blank')
              if (w) {
                fetch('/api/report', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ metrics, drivers, alerts, score, gameProfile, duration: 0, samples: 0 }) })
                  .then(r => r.text()).then(html => { w.document.write(html); w.document.close() })
              }
            }} className="flex items-center gap-1 px-2 py-1 rounded text-[10px] text-gray-400 hover:text-[#00f0ff] hover:bg-[#00f0ff]/10 transition-colors">
            <Download className="w-3 h-3" />HTML Report
          </button>
        </div>
      </div>

      {/* Header */}
      <div className="bg-[#0a0a0f] rounded-lg border border-[#1a1a2e] p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-[#00f0ff]" />
            <span className="text-[11px] font-medium text-white">SCAN COMPLETE</span>
          </div>
          <div className="flex items-center gap-2">
            <Clock className="w-3 h-3 text-gray-500" />
            <span className="text-[10px] text-gray-500 font-mono">{new Date().toISOString().slice(0, 19).replace('T', ' ')}</span>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div>
            <div className="text-[9px] text-gray-500 uppercase">Profile</div>
            <div className="text-[11px] text-white font-medium">{gameProfile.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())} Competitive</div>
          </div>
          <div>
            <div className="text-[9px] text-gray-500 uppercase">Score</div>
            <div className="text-[11px] text-white font-mono font-bold">{score}/100</div>
          </div>
          <div>
            <div className="text-[9px] text-gray-500 uppercase">Status</div>
            <div className={`text-[11px] font-bold ${statusColor}`}>{overallStatus}</div>
          </div>
          <div>
            <div className="text-[9px] text-gray-500 uppercase">Findings</div>
            <div className="text-[11px] text-white font-mono">{findings.length} ({highCount} high, {medCount} med)</div>
          </div>
        </div>
      </div>

      {/* Category Scores Grid — when agent data has score breakdown */}
      {hasRealData && computedScore?.categories && computedScore.categories.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-3.5 h-3.5 text-gray-400" />
            <span className="text-[11px] font-medium text-gray-300">Category Scores</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
            {computedScore.categories.map((cat: CategoryScore) => {
              const noData = cat.score === -1
              const scoreColor = noData ? 'text-gray-600' : cat.score >= 80 ? 'text-[#00ff88]' : cat.score >= 50 ? 'text-[#ffaa00]' : 'text-[#ff3366]'
              const borderColor = noData ? 'border-gray-600/10' : cat.score >= 80 ? 'border-[#00ff88]/20' : cat.score >= 50 ? 'border-[#ffaa00]/20' : 'border-[#ff3366]/20'
              return (
                <div key={cat.category} className={`bg-[#12121a] rounded-lg border ${borderColor} p-2.5`}>
                  <div className="text-[9px] text-gray-500 uppercase tracking-wider truncate">{cat.label}</div>
                  <div className={`text-sm font-mono font-bold mt-0.5 ${scoreColor}`}>
                    {noData ? 'N/A' : `${cat.score}`}
                    {!noData && <span className="text-[9px] text-gray-500 font-normal">/100</span>}
                  </div>
                  {cat.finding && !noData && (
                    <div className="text-[8px] text-gray-500 mt-1 leading-relaxed line-clamp-2">{cat.finding}</div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Findings */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-3.5 h-3.5 text-gray-400" />
          <span className="text-[11px] font-medium text-gray-300">Findings by Priority</span>
        </div>

        {findings.map((f, i) => {
          const pc = priorityConfig[f.priority]
          const isOpen = expanded === f.id
          return (
            <motion.div
              key={f.id}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className={`rounded-lg border transition-colors ${isOpen ? pc.border + ' bg-[#12121a]' : 'border-[#1a1a2e] hover:border-[#2a2a3e]'}`}
            >
              <button
                onClick={() => setExpanded(isOpen ? null : f.id)}
                className="w-full flex items-start gap-3 p-3 text-left"
              >
                <div className={`${pc.bg} ${pc.color} p-1 rounded mt-0.5 shrink-0`}>{pc.icon}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${pc.bg} ${pc.color}`}>{pc.label}</span>
                    <span className="text-[9px] text-gray-600 font-mono">{f.id}</span>
                    <span className="text-[9px] text-gray-600">•</span>
                    <span className="text-[9px] text-gray-500">{f.domain}</span>
                  </div>
                  <h4 className="text-[11px] text-white font-medium mt-1 leading-snug break-words">{f.title}</h4>
                </div>
                <ChevronDown className={`w-4 h-4 text-gray-600 shrink-0 transition-transform mt-1 ${isOpen ? 'rotate-180' : ''}`} />
              </button>

              {isOpen && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  className="overflow-hidden"
                >
                  <div className="px-3 pb-3 pl-14 space-y-2">
                    <div>
                      <div className="text-[9px] text-gray-500 uppercase tracking-wider mb-0.5">Evidence</div>
                      <p className="text-[10px] text-gray-400 leading-relaxed">{f.evidence}</p>
                    </div>
                    {f.correlated && f.correlated.length > 0 && (
                      <div>
                        <div className="text-[9px] text-gray-500 uppercase tracking-wider mb-0.5">Correlated Events</div>
                        <div className="flex flex-wrap gap-1">
                          {f.correlated.map(c => (
                            <span key={c} className="text-[9px] font-mono text-[#ffaa00] bg-[#ffaa00]/10 px-1.5 py-0.5 rounded">{c}</span>
                          ))}
                        </div>
                      </div>
                    )}
                    <div>
                      <div className="text-[9px] text-gray-500 uppercase tracking-wider mb-0.5">Recommendation</div>
                      <p className="text-[10px] text-[#00f0ff] leading-relaxed">{f.recommendation}</p>
                    </div>
                  </div>
                </motion.div>
              )}
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}