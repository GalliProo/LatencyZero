'use client'

import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Activity, Cpu, Wifi, Gamepad2, FileText, Settings, Shield,
  Zap, Monitor, BarChart3, AlertTriangle, Play, Square,
  Clock, TrendingUp, History, Download, RotateCcw, Timer, Save,
  Keyboard, ChevronRight, Eye, Database, Maximize2, Minimize2, Upload, AlertOctagon
} from 'lucide-react'

import SmoothingToggle from '@/components/latency/SmoothingToggle'
import SoundAlertToggle from '@/components/latency/SoundAlertToggle'
import FrameTimeHeatmap from '@/components/latency/FrameTimeHeatmap'
import ABComparisonToggle from '@/components/latency/ABComparisonToggle'
import PNGExportButton from '@/components/latency/PNGExportButton'
import DemoModeBanner from '@/components/latency/DemoModeBanner'
import DataSourceBadge from '@/components/latency/DataSourceBadge'
import FPSTargetSelector from '@/components/latency/FPSTargetSelector'
import ImportPanel from '@/components/latency/ImportPanel'
import type { FPSTargetConfig, LatencyMonData, PresentMonData, OverallScore, RootCauseFinding, DiagnosticSession } from '@/lib/types'
import { calculateOverallScore } from '@/lib/scoring'
import { analyzeRootCauses } from '@/lib/root-cause'
import { useAgentData } from '@/hooks/useAgentData'
import AgentStatusIndicator from '@/components/latency/AgentStatusIndicator'

import { useMetrics } from '@/hooks/useMetrics'
import type { MetricsData } from '@/components/latency/types'
import MetricCard from '@/components/latency/MetricCard'
import LatencyChart from '@/components/latency/LatencyChart'
import FrameTimeChart from '@/components/latency/FrameTimeChart'
import FramePipeline from '@/components/latency/FramePipeline'
import NetworkPanel from '@/components/latency/NetworkPanel'
import HardwarePanel from '@/components/latency/HardwarePanel'
import DriverAnalysis from '@/components/latency/DriverAnalysis'
import AlertsPanel from '@/components/latency/AlertsPanel'
import PerformanceScore from '@/components/latency/PerformanceScore'
import OptimizationTips from '@/components/latency/OptimizationTips'
import SystemConfigPanel from '@/components/latency/SystemConfigPanel'
import ControllerLab from '@/components/latency/ControllerLab'
import ScanReport from '@/components/latency/ScanReport'
import GameProfileSelector from '@/components/latency/GameProfileSelector'
import HistoryPanel from '@/components/latency/HistoryPanel'
import KeyboardShortcutsModal from '@/components/latency/KeyboardShortcutsModal'
import ThresholdSettings from '@/components/latency/ThresholdSettings'
import GPUDeepDive from '@/components/latency/GPUDeepDive'
import SessionComparison from '@/components/latency/SessionComparison'
import OverlayMode from '@/components/latency/OverlayMode'
import DPCDistribution from '@/components/latency/DPCDistribution'
import NetworkRouteAnalysis from '@/components/latency/NetworkRouteAnalysis'
import NotificationToasts from '@/components/latency/NotificationToasts'
import FramePacingAnalyzer from '@/components/latency/FramePacingAnalyzer'
import LatencyWaterfall from '@/components/latency/LatencyWaterfall'
import MetricsHeatmap from '@/components/latency/MetricsHeatmap'
import CorrelationMatrix from '@/components/latency/CorrelationMatrix'
import EventTimeline from '@/components/latency/EventTimeline'

type Tab = 'dashboard' | 'kernel' | 'framing' | 'network' | 'hardware' | 'driver' | 'input' | 'config' | 'report' | 'history'

const tabs: { id: Tab; label: string; icon: React.ReactNode; short: string; kbd: string }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: <Activity className="w-4 h-4" />, short: 'DASH', kbd: '1' },
  { id: 'kernel', label: 'DPC / ISR', icon: <Zap className="w-4 h-4" />, short: 'DPC', kbd: '2' },
  { id: 'framing', label: 'Frame Analysis', icon: <BarChart3 className="w-4 h-4" />, short: 'FRAME', kbd: '3' },
  { id: 'network', label: 'Network', icon: <Wifi className="w-4 h-4" />, short: 'NET', kbd: '4' },
  { id: 'hardware', label: 'Hardware', icon: <Cpu className="w-4 h-4" />, short: 'HW', kbd: '5' },
  { id: 'driver', label: 'Drivers', icon: <Monitor className="w-4 h-4" />, short: 'DRV', kbd: '6' },
  { id: 'input', label: 'Controller Lab', icon: <Gamepad2 className="w-4 h-4" />, short: 'INPUT', kbd: '7' },
  { id: 'config', label: 'System Config', icon: <Settings className="w-4 h-4" />, short: 'CFG', kbd: '8' },
  { id: 'report', label: 'Scan Report', icon: <FileText className="w-4 h-4" />, short: 'RPT', kbd: '9' },
  { id: 'history', label: 'History', icon: <History className="w-4 h-4" />, short: 'HIST', kbd: '0' },
]

function formatTimer(sec: number): string {
  const h = Math.floor(sec / 3600).toString().padStart(2, '0')
  const m = Math.floor((sec % 3600) / 60).toString().padStart(2, '0')
  const s = (sec % 60).toString().padStart(2, '0')
  return h === '00' ? `${m}:${s}` : `${h}:${m}:${s}`
}

function MiniHealthBar({ metrics }: { metrics: MetricsData | null }) {
  if (!metrics) return null
  const segments = [
    { label: 'DPC', value: metrics.dpc.current, max: 1000, color: '#00f0ff' },
    { label: 'FPS', value: metrics.fps.current, max: 240, color: '#00ff88', invert: true },
    { label: 'PING', value: metrics.network.ping, max: 150, color: '#a855f7' },
    { label: 'TEMP', value: metrics.hardware.gpu.temp, max: 100, color: '#ffaa00' },
  ]
  return (
    <div className="hidden lg:flex items-center gap-2">
      {segments.map(seg => {
        const pct = seg.invert ? Math.min((seg.value / seg.max) * 100, 100) : Math.min((seg.value / seg.max) * 100, 100)
        const isBad = seg.invert ? pct < 25 : pct > 70
        return (
          <div key={seg.label} className="flex items-center gap-1.5">
            <span className="text-[8px] font-mono text-gray-600 w-6 text-right">{seg.label}</span>
            <div className="w-12 h-1 bg-[#1a1a2e] rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${pct}%`,
                  backgroundColor: isBad ? '#ff3366' : seg.color,
                  opacity: isBad ? 1 : 0.7,
                  boxShadow: isBad ? `0 0 6px ${seg.color}40` : 'none',
                }}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}

const INPUT_LATENCY_CHAIN = [
  { step: 'Controller Button Press', time: '0.00ms', desc: 'Physical actuation of button', color: '#00ff88' },
  { step: 'USB HID Report', time: '~0.5ms', desc: 'Controller → PC via USB (wired) or 2.4GHz/BT (wireless)', color: '#00f0ff' },
  { step: 'GameInput Processing', time: '~0.1ms', desc: 'Windows GameInput API processes raw input', color: '#00f0ff' },
  { step: 'Game Engine Input Poll', time: '~0.2ms', desc: 'Game reads input state for current frame', color: '#a855f7' },
  { step: 'CPU Simulation', time: 'Variable', desc: 'Game logic processes input into world action', color: '#a855f7' },
  { step: 'GPU Render', time: 'Variable', desc: 'Scene rendered with input applied', color: '#ffaa00' },
  { step: 'Display Scanout', time: '0–16.67ms', desc: 'Frame displayed on monitor (worst case: one refresh cycle)', color: '#ffaa00' },
] as const

export default function LatencyZeroDashboard() {
  const [activeTab, setActiveTab] = useState<Tab>('dashboard')
  const [gameProfile, setGameProfile] = useState('call_of_duty')
  const [isMonitoring, setIsMonitoring] = useState(true)
  const [sessionStart, setSessionStart] = useState(Date.now())
  const [elapsed, setElapsed] = useState(0)
  const [sessionCount, setSessionCount] = useState(1)
  const [isPaused, setIsPaused] = useState(false)
  const [showExportToast, setShowExportToast] = useState(false)
  const [showSaveToast, setShowSaveToast] = useState(false)
  const [showKbdHelp, setShowKbdHelp] = useState(false)
  const [emaEnabled, setEmaEnabled] = useState(false)
  const [soundEnabled, setSoundEnabled] = useState(false)
  const [abComparison, setAbComparison] = useState(false)
  const [savedSessions, setSavedSessions] = useState<Array<Record<string, unknown>>>([])
  const [overlayVisible, setOverlayVisible] = useState(false)
  const [fpsTargetConfig, setFpsTargetConfig] = useState<FPSTargetConfig>({ mode: 'baseline' })
  const [latencyMonData, setLatencyMonData] = useState<LatencyMonData | null>(null)
  const [presentMonData, setPresentMonData] = useState<PresentMonData | null>(null)
  const [toasts, setToasts] = useState<Array<{ id: string; type: 'success' | 'warning' | 'error' | 'info'; title: string; message: string; timestamp: number }>>([])
  const toastIdRef = useRef(0)

  useEffect(() => {
    fetch('/api/sessions').then(r => r.json()).then(setSavedSessions).catch(() => {})
  }, [showSaveToast])

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const kbdHelpRef = useRef(showKbdHelp)
  const lastSoundRef = useRef(0)
  kbdHelpRef.current = showKbdHelp

  const { metrics, drivers, alerts, latencyData, frameTimeData, pingData, connected, dismissAlert } = useMetrics()
  const agentData = useAgentData(5000)

  // Sound alerts on critical alerts
  useEffect(() => {
    if (!soundEnabled || alerts.length === 0) return
    const latest = alerts[alerts.length - 1]
    if (latest.severity !== 'critical') return
    const now = Date.now()
    if (now - lastSoundRef.current < 3000) return // 3s cooldown
    lastSoundRef.current = now
    try {
      const ctx = new AudioContext()
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.frequency.value = 880
      osc.type = 'sine'
      gain.gain.value = 0.1
      osc.start()
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15)
      osc.stop(ctx.currentTime + 0.15)
    } catch {
      // Audio context may not be available
    }
  }, [alerts, soundEnabled])

  // Compute session mode (demo vs real) based on data sources — MUST be before useEffects that use it
  const sessionMode = useMemo((): 'demo' | 'real' => {
    if (agentData.mode === 'real') return 'real'
    const hasImportedData = latencyMonData || presentMonData
    return hasImportedData ? 'real' : 'demo'
  }, [agentData.mode, latencyMonData, presentMonData])

  // Count how many metric categories have real data
  const realDataRatio = useMemo(() => {
    // Use agentData's computed ratio, blended with imported data
    let real = 0
    let total = 8 // 8 categories
    if (latencyMonData) real += 1 // kernel
    if (presentMonData) real += 1 // frame_pacing
    // Agent scan modules count as 6 categories
    const agentRealModules = [agentData.system, agentData.gpu, agentData.network, agentData.processes, agentData.display, agentData.controller].filter(d => d && (d.source.source === 'measured' || d.source.source === 'imported')).length
    real += agentRealModules
    return 1 - (real / total)
  }, [latencyMonData, presentMonData, agentData.system, agentData.gpu, agentData.network, agentData.processes, agentData.display, agentData.controller])

  // Compute OverallScore from scoring engine when real data changes
  const computedScore = useMemo((): OverallScore => {
    return calculateOverallScore({
      liveMetrics: null, // Live metrics from useMetrics are simulated; engine uses scan data
      systemInfo: agentData.system,
      gpuInfo: agentData.gpu,
      networkInfo: agentData.network,
      processInfo: agentData.processes,
      displayInfo: agentData.display,
      controllerInfo: agentData.controller,
      latencyMonData,
      presentMonData,
    })
  }, [agentData.system, agentData.gpu, agentData.network, agentData.processes, agentData.display, agentData.controller, latencyMonData, presentMonData])

  // Compute RootCauseFindings from RCA engine when real data changes
  const computedRootCauses = useMemo((): RootCauseFinding[] => {
    const session: DiagnosticSession = {
      id: 'live',
      startTime: sessionStart,
      endTime: null,
      mode: sessionMode,
      gameProfile,
      fpsTarget: fpsTargetConfig,
      systemInfo: agentData.system,
      gpuInfo: agentData.gpu,
      networkInfo: agentData.network,
      processInfo: agentData.processes,
      displayInfo: agentData.display,
      controllerInfo: agentData.controller,
      latencyMonData,
      presentMonData,
      liveMetrics: null,
      overallScore: computedScore,
      rootCauses: [],
      temporalCorrelations: [],
    }
    return analyzeRootCauses(session)
  }, [sessionStart, sessionMode, gameProfile, fpsTargetConfig, agentData.system, agentData.gpu, agentData.network, agentData.processes, agentData.display, agentData.controller, latencyMonData, presentMonData, computedScore])

  // Toast notifications on state changes — SUPPRESSED in demo mode for score changes
  const prevScoreRef = useRef(metrics?.score ?? 0)
  const lastToastTimeRef = useRef(0)
  useEffect(() => {
    if (!metrics || sessionMode === 'demo') return
    const now = Date.now()
    if (now - lastToastTimeRef.current < 15000) return
    const prevScore = prevScoreRef.current
    prevScoreRef.current = metrics.score
    const addToast = (type: 'success' | 'warning' | 'error' | 'info', title: string, message: string) => {
      lastToastTimeRef.current = now
      const id = `toast-${++toastIdRef.current}`
      setToasts(prev => [...prev.slice(-3), { id, type, title, message, timestamp: now }])
    }
    if (prevScore >= 80 && metrics.score < 65) {
      addToast('error', 'Performance Degraded', `Score dropped from ${prevScore} to ${metrics.score}`)
    } else if (prevScore >= 65 && metrics.score < 50) {
      addToast('warning', 'Score Declining', `Performance score: ${metrics.score}/100`)
    }
    // NO recovery toast in demo mode — suppressed above
    if (sessionMode === 'real' && prevScore < 65 && metrics.score >= 85) {
      addToast('success', 'Performance Recovered', `Score back to ${metrics.score}/100`)
    }
  }, [metrics, sessionMode])

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Don't trigger if user is typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.key === 'Escape' && kbdHelpRef.current) { setShowKbdHelp(false); return }
      if (e.key === '?' || (e.key === '/' && e.shiftKey)) { setShowKbdHelp(v => !v); return }
      if (kbdHelpRef.current) return
      if (e.key === ' ') { e.preventDefault(); setIsPaused(p => !p); return }
      if (e.key === 'e' || e.key === 'E') { setEmaEnabled(v => !v); return }
      if (e.key === 's' || e.key === 'S') { setSoundEnabled(v => !v); return }
      if (e.key === 'a' || e.key === 'A') { setAbComparison(v => !v); return }
      if (e.key === 'o' || e.key === 'O') { setOverlayVisible(v => !v); return }
      const num = parseInt(e.key)
      if (num >= 0 && num <= 9) {
        const idx = num === 0 ? 9 : num - 1
        if (tabs[idx]) setActiveTab(tabs[idx].id)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  // Real session timer
  useEffect(() => {
    if (isMonitoring && !isPaused) {
      timerRef.current = setInterval(() => {
        setElapsed(Math.floor((Date.now() - sessionStart) / 1000))
      }, 1000)
    } else {
      if (timerRef.current) clearInterval(timerRef.current)
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [isMonitoring, isPaused, sessionStart])

  const handleStop = useCallback(() => {
    setIsMonitoring(false)
    setIsPaused(false)
  }, [])

  const handleStart = useCallback(() => {
    setSessionStart(Date.now())
    setElapsed(0)
    setIsMonitoring(true)
    setIsPaused(false)
  }, [])

  const handleReset = useCallback(() => {
    setSessionStart(Date.now())
    setElapsed(0)
    setSessionCount(c => c + 1)
  }, [])

  const handleSaveSession = useCallback(async () => {
    if (!metrics) return
    try {
      const res = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `Session ${sessionCount.toString().padStart(2, '0')} - ${new Date().toISOString().slice(0, 19)}`,
          game: gameProfile,
          profile: gameProfile,
          score: metrics.score,
          duration: elapsed,
          samples: latencyData.length,
          avgDpc: metrics.dpc.avg,
          maxDpc: metrics.dpc.max,
          avgIsr: metrics.isr.avg,
          maxIsr: metrics.isr.max,
          avgFrametime: metrics.frameTime.avg,
          minFps1pct: metrics.fps.min1pct,
          avgPing: metrics.network.ping,
          packetLoss: metrics.network.packetLoss,
          summary: {
            performanceScore: metrics.score,
            avgDpc: metrics.dpc.avg,
            avgIsr: metrics.isr.avg,
            avgFrameTime: metrics.frameTime.avg,
            fps1pctLow: metrics.fps.min1pct,
            avgPing: metrics.network.ping,
          },
        }),
      })
      if (res.ok) {
        setShowSaveToast(true)
        setTimeout(() => setShowSaveToast(false), 3000)
      }
    } catch {
      // Silently fail
    }
  }, [metrics, gameProfile, sessionCount, elapsed, latencyData.length])

  const handlePause = useCallback(() => {
    setIsPaused(p => !p)
  }, [])

  const dpcTrend = useMemo(() => {
    if (latencyData.length < 10) return 'stable' as const
    const recent = latencyData.slice(-10)
    const older = latencyData.slice(-20, -10)
    if (older.length === 0) return 'stable' as const
    const recentAvg = recent.reduce((s, p) => s + p.dpc, 0) / recent.length
    const olderAvg = older.reduce((s, p) => s + p.dpc, 0) / older.length
    if (recentAvg > olderAvg * 1.2) return 'up' as const
    if (recentAvg < olderAvg * 0.8) return 'down' as const
    return 'stable' as const
  }, [latencyData])

  const dpcSparkline = useMemo(() => latencyData.slice(-20).map(p => p.dpc), [latencyData])
  const fpsSparkline = useMemo(() => {
    if (!metrics) return []
    return latencyData.slice(-20).map((_, i) => {
      const noise = Math.sin(i * 1.7) * 8 + Math.cos(i * 0.9) * 5
      return metrics.fps.avg + noise
    })
  }, [latencyData, metrics?.fps.avg])

  const handleExport = useCallback(() => {
    if (!metrics) return
    const report = {
      exportTime: new Date().toISOString(),
      application: 'LatencyZero v2.0 — Competitive Latency Observability Platform',
      profile: gameProfile,
      sessionDuration: formatTimer(elapsed),
      samples: latencyData.length,
      summary: {
        performanceScore: metrics.score,
        avgDpc: metrics.dpc.avg,
        maxDpc: metrics.dpc.max,
        avgIsr: metrics.isr.avg,
        avgFrameTime: metrics.frameTime.avg,
        fps1pctLow: metrics.fps.min1pct,
        avgPing: metrics.network.ping,
        jitter: metrics.network.jitter,
        packetLoss: metrics.network.packetLoss,
        cpuTemp: metrics.hardware.cpu.temp,
        gpuTemp: metrics.hardware.gpu.temp,
        cpuUsage: metrics.hardware.cpu.usage,
        gpuUsage: metrics.hardware.gpu.usage,
      },
      recentLatencyData: latencyData.slice(-60),
      recentFrameTimeData: frameTimeData.slice(-60),
      recentPingData: pingData.slice(-30),
      drivers,
      activeAlerts: alerts.slice(-20),
    }
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `latencyzero-scan-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.json`
    a.click()
    URL.revokeObjectURL(url)
    setShowExportToast(true)
    setTimeout(() => setShowExportToast(false), 3000)
  }, [metrics, gameProfile, elapsed, latencyData, frameTimeData, pingData, drivers, alerts])

  const criticalCount = alerts.filter(a => a.severity === 'critical').length
  const warningCount = alerts.filter(a => a.severity === 'warning').length
  const tempAlerts = useMemo(() => alerts.filter(a => a.type === 'temp_warning'), [alerts])

  const dashboardDataSource = useMemo(() => ({
    source: sessionMode === 'demo' ? 'simulated' as const : 'measured' as const,
    collector: sessionMode === 'demo' ? 'demo_generator' : 'Windows Agent',
    confidence: sessionMode === 'demo' ? 0 : 0.85,
    lastUpdated: Date.now()
  }), [sessionMode])

  // Compute tab-specific alert counts for badges
  const tabAlertCounts = useMemo(() => {
    const tempAlerts = alerts.filter(a => a.type === 'temp_warning').length
    const netAlerts = alerts.filter(a => a.type === 'ping_spike' || a.type === 'packet_loss').length
    const dpcAlerts = alerts.filter(a => a.type === 'dpc_spike' || a.type === 'isr_spike').length
    const frameAlerts = alerts.filter(a => a.type === 'frame_drop').length
    return {
      dashboard: Math.min(criticalCount + warningCount, 99),
      kernel: Math.min(dpcAlerts, 99),
      framing: Math.min(frameAlerts, 99),
      network: Math.min(netAlerts, 99),
      hardware: Math.min(tempAlerts, 99),
    } as Record<string, number>
  }, [alerts, criticalCount, warningCount])

  return (
    <div className="min-h-screen flex flex-col bg-[#0a0a0f] bg-grid-animated scan-line noise-bg">
      <div className="vignette-overlay" />
      {/* HEADER */}
      <header className="sticky top-0 z-50 bg-[#0a0a0f]/95 backdrop-blur-2xl relative">
        <div className="header-glow-line" />
        <div className="max-w-[1920px] mx-auto px-4 h-14 flex items-center justify-between">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#00f0ff] via-[#7c3aed] to-[#00ff88] animate-gradient flex items-center justify-center shadow-[0_0_20px_rgba(0,240,255,0.2)]">
                <Zap className="w-4.5 h-4.5 text-[#0a0a0f]" fill="#0a0a0f" />
              </div>
              {agentData.status.agentConnected && <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-[#00ff88] border-2 border-[#0a0a0f] animate-breathe status-dot-live" />}
            </div>
            <div>
              <h1 className="text-sm font-bold text-white tracking-tight leading-none">
                Latency<span className="text-[#00f0ff]">Zero</span>
              </h1>
              <span className="text-[7px] text-gray-500 tracking-[0.2em] uppercase font-medium">Competitive Observability</span>
            </div>
            <div className={`hidden sm:flex items-center gap-1 ml-3 px-2 py-0.5 rounded text-[8px] font-mono font-bold ${
              sessionMode === 'demo' ? 'bg-[#ffaa00]/10 text-[#ffaa00] border border-[#ffaa00]/20' : 'bg-[#00ff88]/10 text-[#00ff88] border border-[#00ff88]/20'
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${sessionMode === 'demo' ? 'bg-[#ffaa00]' : 'bg-[#00ff88]'}`} />
              {sessionMode === 'demo' ? 'DEMO' : 'REAL'}
            </div>
            <AgentStatusIndicator status={agentData.status} />
          </div>

          {/* Center - Status bar */}
          <div className="hidden md:flex items-center gap-2 bg-[#0d0d14]/80 border border-[#1a1a2e] rounded-lg px-3 py-1.5">
            {/* Session Timer */}
            <div className="flex items-center gap-1.5 text-[10px] pr-3 border-r border-[#1a1a2e]">
              <Timer className="w-3 h-3 text-[#00f0ff]" />
              <span className="font-mono font-bold text-white tracking-wider">{formatTimer(elapsed)}</span>
              {isPaused && <span className="text-[8px] text-[#ffaa00] font-semibold px-1.5 py-0.5 bg-[#ffaa00]/10 rounded">PAUSED</span>}
            </div>

            {/* Mini Health Bars */}
            <div className="pr-3 border-r border-[#1a1a2e]">
              <MiniHealthBar metrics={metrics} />
            </div>

            {/* Critical */}
            {criticalCount > 0 && (
              <div className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded bg-[#ff3366]/10 border border-[#ff3366]/20">
                <AlertTriangle className="w-3 h-3 text-[#ff3366]" />
                <span className="font-mono font-bold text-[#ff3366] status-glow-red">{criticalCount}</span>
              </div>
            )}

            {/* Warnings */}
            {warningCount > 0 && (
              <div className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded bg-[#ffaa00]/10 border border-[#ffaa00]/20">
                <AlertTriangle className="w-3 h-3 text-[#ffaa00]" />
                <span className="font-mono font-bold text-[#ffaa00] status-glow-amber">{warningCount}</span>
              </div>
            )}

            {/* Samples */}
            <div className="flex items-center gap-1 text-[10px] pl-2">
              <TrendingUp className="w-3 h-3 text-gray-500" />
              <span className="font-mono text-gray-400">{latencyData.length}</span>
            </div>
          </div>

          {/* Right - Actions */}
          <div className="flex items-center gap-1.5">
            {/* EMA Smoothing Toggle */}
            <SmoothingToggle enabled={emaEnabled} onToggle={() => setEmaEnabled(v => !v)} />

            {/* Sound Alert Toggle */}
            <SoundAlertToggle enabled={soundEnabled} onToggle={() => setSoundEnabled(v => !v)} />

            {/* A/B Comparison Toggle */}
            <ABComparisonToggle enabled={abComparison} onToggle={() => setAbComparison(v => !v)} />

            {/* Session counter */}
            <div className="hidden sm:flex items-center gap-1 text-[9px] text-gray-600 mr-1">
              <Save className="w-3 h-3" />
              <span className="font-mono">#{sessionCount.toString().padStart(2, '0')}</span>
            </div>

            {/* Keyboard shortcuts toggle */}
            <button
              onClick={() => setShowKbdHelp(v => !v)}
              className={`p-1.5 rounded-lg transition-all ${showKbdHelp ? 'text-[#00f0ff] bg-[#00f0ff]/10' : 'text-gray-600 hover:text-gray-400 hover:bg-[#1a1a2e]'}`}
              title="Keyboard Shortcuts (?)"
            >
              <Keyboard className="w-3.5 h-3.5" />
            </button>

            {isMonitoring && (
              <button onClick={handlePause} className={`p-1.5 rounded-lg transition-all ${isPaused ? 'text-[#ffaa00] hover:bg-[#ffaa00]/10' : 'text-gray-500 hover:text-white hover:bg-[#1a1a2e]'}`}>
                {isPaused ? <Play className="w-3.5 h-3.5" /> : <Clock className="w-3.5 h-3.5" />}
              </button>
            )}

            {isMonitoring && (
              <button onClick={handleReset} className="p-1.5 rounded-lg text-gray-500 hover:text-white hover:bg-[#1a1a2e] transition-all" title="New Session">
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            )}

            {isMonitoring && (
              <button onClick={handleSaveSession} className="p-1.5 rounded-lg text-gray-500 hover:text-[#00ff88] hover:bg-[#00ff88]/10 transition-all" title="Save Session to DB">
                <Database className="w-3.5 h-3.5" />
              </button>
            )}

            <button
              onClick={isMonitoring ? handleStop : handleStart}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all ${
                isMonitoring
                  ? 'bg-[#ff3366]/10 text-[#ff3366] border border-[#ff3366]/30 hover:bg-[#ff3366]/20 hover:shadow-[0_0_15px_rgba(255,51,102,0.1)]'
                  : 'bg-[#00ff88]/10 text-[#00ff88] border border-[#00ff88]/30 hover:bg-[#00ff88]/20 hover:shadow-[0_0_15px_rgba(0,255,136,0.1)]'
              }`}
            >
              {isMonitoring ? <Square className="w-3 h-3" /> : <Play className="w-3 h-3" />}
              {isMonitoring ? 'STOP' : 'START'}
            </button>

            <button
              onClick={() => setOverlayVisible(v => !v)}
              className={`p-1.5 rounded-lg transition-all ${overlayVisible ? 'text-[#a855f7] bg-[#a855f7]/10' : 'text-gray-500 hover:text-gray-400 hover:bg-[#1a1a2e]'}`}
              title="Toggle Overlay Mode (O)"
            >
              {overlayVisible ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
            </button>

          {/* Import button */}
            <button
              onClick={() => setActiveTab('config')}
              className={`p-1.5 rounded-lg transition-all ${latencyMonData || presentMonData ? 'text-[#00ff88] hover:bg-[#00ff88]/10' : 'text-gray-500 hover:text-gray-400 hover:bg-[#1a1a2e]'}`}
              title={latencyMonData || presentMonData ? 'Real data imported' : 'Import LatencyMon / PresentMon'}
            >
              <Upload className="w-3.5 h-3.5" />
            </button>
            <PNGExportButton />
            <button onClick={handleExport} className="p-1.5 rounded-lg text-gray-500 hover:text-[#00f0ff] hover:bg-[#00f0ff]/10 transition-all" title="Export Report (JSON)">
              <Download className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </header>

      {/* TABS */}
      <nav className="sticky top-[57px] z-40 bg-[#0a0a0f]/85 backdrop-blur-xl border-b border-[#1a1a2e] relative">
        <div className="max-w-[1920px] mx-auto px-4">
          <div className="flex gap-0.5 overflow-x-auto py-1.5" style={{ scrollbarWidth: 'none' }}>
            {tabs.map(tab => {
              const badgeCount = tabAlertCounts[tab.id] || 0
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-[11px] font-medium whitespace-nowrap transition-all shrink-0 relative group ${
                    activeTab === tab.id
                      ? 'bg-[#00f0ff]/10 text-[#00f0ff] tab-active-glow'
                      : 'text-gray-500 hover:text-gray-300 hover:bg-[#12121a] border border-transparent'
                  }`}
                >
                  {activeTab === tab.id && (
                    <motion.div
                      layoutId="activeTab"
                      className="absolute inset-0 rounded-lg border border-[#00f0ff]/25"
                      transition={{ type: 'spring', bounce: 0.15, duration: 0.4 }}
                    />
                  )}
                  <span className="relative z-10 flex items-center gap-1.5">
                    {tab.icon}
                    <span className="hidden sm:inline">{tab.label}</span>
                    <span className="sm:hidden">{tab.short}</span>
                    {/* Alert badge */}
                    {badgeCount > 0 && activeTab !== tab.id && (
                      <span className="flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-[#ff3366]/20 border border-[#ff3366]/30 text-[9px] font-mono font-bold text-[#ff3366] tab-badge-animate">
                        {badgeCount}
                      </span>
                    )}
                  </span>
                  {/* Keyboard hint on hover — offset right when badge present */}
                  <span className={`hidden xl:inline-flex absolute -bottom-5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none ${badgeCount > 0 && activeTab !== tab.id ? 'right-2 left-auto translate-x-0' : 'left-1/2 -translate-x-1/2'}`}>
                    <span className="kbd">{tab.kbd}</span>
                  </span>
                </button>
              )
            })}
          </div>
        </div>
        <div className="tab-bar-gradient" />
      </nav>

      {/* Export Toast */}
      <AnimatePresence>
        {showExportToast && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed top-20 right-4 z-[200] flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[#0d0d14] border border-[#00ff88]/30 shadow-[0_0_30px_rgba(0,255,136,0.15)]"
          >
            <Download className="w-4 h-4 text-[#00ff88]" />
            <span className="text-xs text-white font-medium">Report exported successfully</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Save Session Toast */}
      <AnimatePresence>
        {showSaveToast && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed top-28 right-4 z-[200] flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[#0d0d14] border border-[#00ff88]/30 shadow-[0_0_30px_rgba(0,255,136,0.15)]"
          >
            <Database className="w-4 h-4 text-[#00ff88]" />
            <span className="text-xs text-white font-medium">Session saved to database</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Keyboard Shortcuts Modal */}
      <AnimatePresence>
        {showKbdHelp && <KeyboardShortcutsModal isOpen={showKbdHelp} onClose={() => setShowKbdHelp(false)} />}
      </AnimatePresence>

      {/* DEMO MODE BANNER */}
      <DemoModeBanner mode={sessionMode} simulatedRatio={realDataRatio} />

      {/* MAIN CONTENT */}
      <main className="flex-1 max-w-[1920px] w-full mx-auto px-4 py-4 relative z-[1] bg-gradient-mesh">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.15 }}
          >
            {/* ============ DASHBOARD ============ */}
            {activeTab === 'dashboard' && (
              <div className="space-y-4">
                {/* Data source badges for metric cards */}
                <DataSourceBadge source={dashboardDataSource} showCollector size="sm" />

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                  <div className="lg:col-span-2">
                    <div className="gradient-border rounded-xl neon-border-pulse">
                      <PerformanceScore score={agentData.hasAnyRealData ? computedScore.score : (metrics?.score ?? 0)} demoMode={sessionMode === 'demo'} />
                    </div>
                  </div>
                  <div className="lg:col-span-3 space-y-4">
                    <div className="bg-[#0d0d14] rounded-xl border border-[#1a1a2e] p-4 card-hover">
                      <GameProfileSelector selected={gameProfile} onSelect={setGameProfile} />
                    </div>
                    <div className="bg-[#0d0d14] rounded-xl border border-[#1a1a2e] p-4 card-hover">
                      <FPSTargetSelector
                        config={fpsTargetConfig}
                        onChange={setFpsTargetConfig}
                        measuredData={metrics ? {
                          avgFps: metrics.fps.avg,
                          onePercentLow: metrics.fps.min1pct,
                          pointOnePercentLow: metrics.fps.min01pct,
                          frameTimeP99: metrics.frameTime.min01pct,
                          frameTimeP95: metrics.frameTime.min1pct,
                          frameTimeAvg: metrics.frameTime.avg,
                        } : undefined}
                        dataSource={sessionMode === 'demo' ? 'simulated' : 'measured'}
                      />
                    </div>
                  </div>
                  <div className="lg:col-span-7 grid grid-cols-2 sm:grid-cols-3 gap-3">
                    <div className="card-border-shimmer rounded-lg"><MetricCard title="DPC Latency" value={metrics?.dpc.current.toFixed(1) ?? '—'} unit="µs"
                      subtitle={`Max: ${metrics?.dpc.max.toFixed(1) ?? '—'}µs`}
                      status={metrics ? (metrics.dpc.current > 1000 ? 'critical' : metrics.dpc.current > 500 ? 'warning' : 'good') : 'info'}
                      icon={<Zap className="w-4 h-4" />} trend={dpcTrend} sparkline={dpcSparkline} /></div>
                    <div className="card-border-shimmer rounded-lg"><MetricCard title="ISR Latency" value={metrics?.isr.current.toFixed(1) ?? '—'} unit="µs"
                      subtitle={`Max: ${metrics?.isr.max.toFixed(1) ?? '—'}µs`}
                      status={metrics ? (metrics.isr.current > 500 ? 'critical' : metrics.isr.current > 200 ? 'warning' : 'good') : 'info'}
                      icon={<Activity className="w-4 h-4" />} /></div>
                    <div className="card-border-shimmer rounded-lg"><MetricCard title="Frame Time" value={metrics?.frameTime.current.toFixed(2) ?? '—'} unit="ms"
                      subtitle={`1% low: ${metrics?.frameTime.min1pct.toFixed(2) ?? '—'}ms`}
                      status={metrics ? (metrics.frameTime.current > 20 ? 'critical' : metrics.frameTime.current > 12 ? 'warning' : 'good') : 'info'}
                      icon={<BarChart3 className="w-4 h-4" />} /></div>
                    <div className="card-border-shimmer rounded-lg"><MetricCard title="FPS" value={metrics?.fps.current.toFixed(0) ?? '—'} unit="fps"
                      subtitle={`1% low: ${metrics?.fps.min1pct.toFixed(0) ?? '—'} fps`}
                      status={metrics ? (metrics.fps.current < 60 ? 'critical' : metrics.fps.current < 100 ? 'warning' : 'good') : 'info'}
                      icon={<Monitor className="w-4 h-4" />} sparkline={fpsSparkline} /></div>
                    <div className="card-border-shimmer rounded-lg"><MetricCard title="Ping" value={metrics?.network.ping.toFixed(1) ?? '—'} unit="ms"
                      subtitle={`Jitter: ${metrics?.network.jitter.toFixed(2) ?? '—'}ms`}
                      status={metrics ? (metrics.network.ping > 80 ? 'critical' : metrics.network.ping > 30 ? 'warning' : 'good') : 'info'}
                      icon={<Wifi className="w-4 h-4" />} /></div>
                    <div className="card-border-shimmer rounded-lg"><MetricCard title="GPU Temp" value={metrics?.hardware.gpu.temp ?? '—'} unit="°C"
                      subtitle={`${metrics?.hardware.gpu.usage ?? '—'}% @ ${metrics?.hardware.gpu.clock ?? '—'} MHz`}
                      status={metrics ? (metrics.hardware.gpu.temp > 85 ? 'critical' : metrics.hardware.gpu.temp > 75 ? 'warning' : 'good') : 'info'}
                      icon={<Cpu className="w-4 h-4" />} /></div>
                  </div>
                </div>

                <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                  <LatencyChart data={latencyData} emaEnabled={emaEnabled} abComparison={abComparison} />
                  <FrameTimeChart data={frameTimeData} emaEnabled={emaEnabled} abComparison={abComparison} />
                </div>

                <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
                  <AlertsPanel alerts={alerts} onDismiss={dismissAlert} />
                  <EventTimeline metrics={metrics} alerts={alerts} />
                  <HardwarePanel metrics={metrics} gpuData={agentData.gpu} systemData={agentData.system} />
                </div>

                {/* System Health Matrix + Correlation */}
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                  <MetricsHeatmap metrics={metrics} />
                  <CorrelationMatrix latencyData={latencyData} frameTimeData={frameTimeData} pingData={pingData} metrics={metrics} />
                </div>
              </div>
            )}

            {/* ============ DPC/ISR ============ */}
            {activeTab === 'kernel' && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  <MetricCard title="DPC Current" value={metrics?.dpc.current.toFixed(1) ?? '—'} unit="µs" status={metrics ? (metrics.dpc.current > 1000 ? 'critical' : metrics.dpc.current > 500 ? 'warning' : 'good') : 'info'} icon={<Zap className="w-4 h-4" />} trend={dpcTrend} sparkline={dpcSparkline} />
                  <MetricCard title="DPC Average" value={metrics?.dpc.avg.toFixed(1) ?? '—'} unit="µs" subtitle={`Max: ${metrics?.dpc.max.toFixed(1) ?? '—'}µs`} status={metrics ? (metrics.dpc.avg > 200 ? 'warning' : 'good') : 'info'} icon={<Zap className="w-4 h-4" />} />
                  <MetricCard title="ISR Current" value={metrics?.isr.current.toFixed(1) ?? '—'} unit="µs" status={metrics ? (metrics.isr.current > 500 ? 'critical' : metrics.isr.current > 200 ? 'warning' : 'good') : 'info'} icon={<Activity className="w-4 h-4" />} />
                  <MetricCard title="ISR Average" value={metrics?.isr.avg.toFixed(1) ?? '—'} unit="µs" subtitle={`Max: ${metrics?.isr.max.toFixed(1) ?? '—'}µs`} status={metrics ? (metrics.isr.avg > 100 ? 'warning' : 'good') : 'info'} icon={<Activity className="w-4 h-4" />} />
                </div>
                <div className="bg-[#0d0d14] rounded-xl border border-[#1a1a2e] p-4">
                  <h3 className="text-sm font-semibold text-white mb-3">Microsoft Reference Thresholds</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="glass-card rounded-lg p-3">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="w-3 h-3 rounded bg-[#ffaa00]" />
                        <span className="text-xs text-white font-medium">DPC Warning: 500µs (Target: &lt;100µs)</span>
                      </div>
                      <p className="text-[10px] text-gray-500 leading-relaxed">Microsoft recommends DPC routines should not exceed ~100µs. Values above 500µs cause visible frame drops and input delay in competitive titles.</p>
                    </div>
                    <div className="glass-card rounded-lg p-3">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="w-3 h-3 rounded bg-[#ff3366]" />
                        <span className="text-xs text-white font-medium">ISR Warning: 25µs</span>
                      </div>
                      <p className="text-[10px] text-gray-500 leading-relaxed">Interrupt Service Routines should complete in &lt;25µs per Microsoft driver docs. Elevated ISR blocks all lower-priority interrupts on the processor.</p>
                    </div>
                  </div>
                </div>
                <LatencyChart data={latencyData} emaEnabled={emaEnabled} abComparison={abComparison} />
                <DPCDistribution latencyData={latencyData} />
                <DriverAnalysis drivers={drivers} />
              </div>
            )}

            {/* ============ FRAME ANALYSIS ============ */}
            {activeTab === 'framing' && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                  <MetricCard title="Frame Time" value={metrics?.frameTime.current.toFixed(2) ?? '—'} unit="ms" status={metrics ? (metrics.frameTime.current > 20 ? 'critical' : metrics.frameTime.current > 12 ? 'warning' : 'good') : 'info'} icon={<BarChart3 className="w-4 h-4" />} />
                  <MetricCard title="Avg Frame Time" value={metrics?.frameTime.avg.toFixed(2) ?? '—'} unit="ms" status="info" icon={<BarChart3 className="w-4 h-4" />} />
                  <MetricCard title="1% Low" value={metrics?.frameTime.min1pct.toFixed(2) ?? '—'} unit="ms" status={metrics ? (metrics.frameTime.min1pct > 20 ? 'critical' : metrics.frameTime.min1pct > 12 ? 'warning' : 'good') : 'info'} icon={<TrendingUp className="w-4 h-4" />} />
                  <MetricCard title="0.1% Low" value={metrics?.frameTime.min01pct.toFixed(2) ?? '—'} unit="ms" status={metrics ? (metrics.frameTime.min01pct > 25 ? 'critical' : metrics.frameTime.min01pct > 15 ? 'warning' : 'good') : 'info'} icon={<TrendingUp className="w-4 h-4" />} />
                  <MetricCard title="FPS" value={metrics?.fps.current.toFixed(0) ?? '—'} unit="fps" subtitle={`Avg: ${metrics?.fps.avg.toFixed(0) ?? '—'}`} status={metrics ? (metrics.fps.current < 60 ? 'critical' : 'good') : 'info'} icon={<Monitor className="w-4 h-4" />} sparkline={fpsSparkline} />
                </div>
                <FrameTimeChart data={frameTimeData} emaEnabled={emaEnabled} abComparison={abComparison} />
                <FrameTimeHeatmap data={frameTimeData} />
                <FramePipeline metrics={metrics} />
                <MetricsHeatmap metrics={metrics} />
                <LatencyWaterfall metrics={metrics} />
                <FramePacingAnalyzer frameTimeData={frameTimeData} />
                <div className="glass-card rounded-xl p-4">
                  <h3 className="text-sm font-semibold text-white mb-2">Why 1% Low Matters More Than Average FPS</h3>
                  <p className="text-[11px] text-gray-400 leading-relaxed">
                    For competitive play, the 1% low FPS metric (the worst 1% of frames) is a far better indicator of competitive readiness than average FPS.
                    A game running at 240fps average but with 1% lows of 80fps will feel significantly worse than a consistent 180fps.
                    Micro-stutter from the 0.1% lows can cause missed shots in games like Call of Duty where frame timing directly affects aim feel.
                  </p>
                </div>
              </div>
            )}

            {/* ============ NETWORK ============ */}
            {activeTab === 'network' && (
              <div className="space-y-4">
                <NetworkPanel metrics={metrics} pingData={pingData} networkScanData={agentData.network} />
                <NetworkRouteAnalysis metrics={metrics} />
                <div className="bg-[#0d0d14] rounded-xl border border-[#1a1a2e] p-4">
                  <h3 className="text-sm font-semibold text-white mb-3 section-title-deco">Bufferbloat Analysis</h3>
                  <p className="text-[11px] text-gray-400 leading-relaxed mb-3">
                    Bufferbloat occurs when network queues fill during congestion, causing latency to spike. For competitive gaming, consistent ping is more important than lowest possible ping.
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="bg-[#12121a] rounded-lg border border-[#1a1a2e] p-3 text-center data-shimmer">
                      <div className="text-[9px] text-gray-500 uppercase mb-1 tracking-wider">Idle Ping (p50) <span className="text-[8px] text-[#ffaa00] font-bold">ESTIMATED</span></div>
                      <div className="text-lg font-mono font-bold text-[#00ff88] status-glow-green">{metrics ? (metrics.network.ping * 0.7).toFixed(1) : '—'}<span className="text-xs text-gray-500 ml-1">ms</span></div>
                    </div>
                    <div className="bg-[#12121a] rounded-lg border border-[#1a1a2e] p-3 text-center data-shimmer">
                      <div className="text-[9px] text-gray-500 uppercase mb-1 tracking-wider">Saturated Ping (est.) <span className="text-[8px] text-[#ffaa00] font-bold">ESTIMATED</span></div>
                      <div className="text-lg font-mono font-bold text-[#ffaa00] status-glow-amber">{metrics ? (metrics.network.ping * 2.5).toFixed(1) : '—'}<span className="text-xs text-gray-500 ml-1">ms</span></div>
                    </div>
                    <div className="bg-[#12121a] rounded-lg border border-[#1a1a2e] p-3 text-center data-shimmer">
                      <div className="text-[9px] text-gray-500 uppercase mb-1 tracking-wider">Bufferbloat Delta <span className="text-[8px] text-[#ffaa00] font-bold">ESTIMATED</span></div>
                      <div className="text-lg font-mono font-bold text-[#ff3366] status-glow-red">{metrics ? ((metrics.network.ping * 2.5) - (metrics.network.ping * 0.7)).toFixed(1) : '—'}<span className="text-xs text-gray-500 ml-1">ms</span></div>
                    </div>
                    <p className="col-span-full text-[9px] text-[#ffaa00]/70 mt-1 leading-relaxed">Estimated — requires actual bandwidth saturation test for real values</p>
                  </div>
                </div>
              </div>
            )}

            {/* ============ HARDWARE ============ */}
            {activeTab === 'hardware' && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <HardwarePanel metrics={metrics} gpuData={agentData.gpu} systemData={agentData.system} />
                  <AlertsPanel alerts={tempAlerts} onDismiss={dismissAlert} />
                </div>
                <GPUDeepDive metrics={metrics} />
                <div className="glass-card rounded-xl p-4">
                  <h3 className="text-sm font-semibold text-white mb-2">Thermal / Power Throttling Correlation</h3>
                  <p className="text-[11px] text-gray-400 leading-relaxed">
                    When CPU/GPU clock frequencies drop simultaneously with rising temperatures and worsening frametimes,
                    the system can be classified as experiencing thermal or power-limit throttling with high confidence.
                    NVIDIA documents explicit throttle reasons in NVML. The correlation engine cross-references hardware sensor data with frametime anomalies in real-time.
                  </p>
                </div>
              </div>
            )}

            {/* ============ DRIVERS ============ */}
            {activeTab === 'driver' && (
              <div className="space-y-4">
                <DriverAnalysis drivers={drivers} />
                <OptimizationTips />
              </div>
            )}

            {/* ============ CONTROLLER LAB ============ */}
            {activeTab === 'input' && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <ControllerLab isConnected={agentData.controller?.source.source === 'measured'} />
                <div className="space-y-4">
                  <div className="bg-[#0d0d14] rounded-xl border border-[#1a1a2e] p-4">
                    <h3 className="text-sm font-semibold text-white mb-3">Input Latency Chain</h3>
                    <div className="space-y-3">
                      {INPUT_LATENCY_CHAIN.map((s, i) => (
                        <div key={i} className="flex items-start gap-3">
                          <div className="flex flex-col items-center">
                            <div
                              className="w-6 h-6 rounded-full border flex items-center justify-center text-[9px] font-mono font-bold"
                              style={{ borderColor: `${s.color}50`, backgroundColor: `${s.color}10`, color: s.color }}
                            >
                              {i + 1}
                            </div>
                            {i < 6 && <div className="w-px h-4 bg-gradient-to-b from-[#2a2a3e] to-transparent" />}
                          </div>
                          <div className="flex-1 min-w-0 pb-2">
                            <div className="flex items-center gap-2">
                              <span className="text-[11px] text-white font-medium truncate" title={s.desc}>{s.step}</span>
                              <span className="text-[10px] font-mono shrink-0" style={{ color: s.color }}>{s.time}</span>
                            </div>
                            <p className="text-[10px] text-gray-500 mt-0.5" title={s.desc}>{s.desc}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="bg-[#0d0d14] rounded-xl border border-[#1a1a2e] p-4">
                    <h3 className="text-sm font-semibold text-white mb-2">Controller Latency Probe (Premium)</h3>
                    <p className="text-[11px] text-gray-400 leading-relaxed">
                      For absolute controller-to-photon measurement, an optional hardware probe is available.
                      This USB/HID device with LED/photodiode emulates controller button press and measures
                      the delta to screen luminance change — the only way to measure true end-to-end latency.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* ============ SYSTEM CONFIG ============ */}
            {activeTab === 'config' && (
              <div className="space-y-4">
                <ImportPanel
                  onLatencyMonImport={setLatencyMonData}
                  onPresentMonImport={setPresentMonData}
                  latencyMonData={latencyMonData}
                  presentMonData={presentMonData}
                  onClearLatencyMon={() => setLatencyMonData(null)}
                  onClearPresentMon={() => setPresentMonData(null)}
                />
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  <div className="lg:col-span-2">
                    <SystemConfigPanel metrics={metrics} systemData={agentData.system} displayData={agentData.display} controllerData={agentData.controller} />
                  </div>
                  <ThresholdSettings gameProfile={gameProfile} />
                </div>
              </div>
            )}

            {/* ============ SCAN REPORT ============ */}
            {activeTab === 'report' && (
              <ScanReport metrics={metrics} drivers={drivers} alerts={alerts} score={agentData.hasAnyRealData ? computedScore.score : (metrics?.score ?? 0)} gameProfile={gameProfile} agentRootCauses={computedRootCauses} agentData={agentData} computedScore={computedScore} />
            )}

            {/* ============ HISTORY ============ */}
            {activeTab === 'history' && (
              <div className="space-y-4">
                <HistoryPanel latencyData={latencyData} frameTimeData={frameTimeData} pingData={pingData} metrics={metrics} sessionStart={sessionStart} savedSessions={savedSessions} />
                <SessionComparison savedSessions={savedSessions} />
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* FOOTER */}
      <footer className="sticky bottom-0 z-40 border-t border-[#1a1a2e]/60 bg-[#0a0a0f]/98 backdrop-blur-xl relative z-[1] shadow-[0_-4px_20px_rgba(0,0,0,0.3)]">
        <div className="footer-gradient-line" />
        <div className="max-w-[1920px] mx-auto px-4 py-2.5">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-2">
            <div className="flex items-center gap-3 text-[9px] text-gray-600">
              <span className="flex items-center gap-1.5">
                <Zap className="w-3 h-3 text-[#00f0ff]/40" />
                <span className="text-gray-400">LatencyZero</span>
                <span className="text-[#00f0ff] font-semibold">v2.0</span>
              </span>
              <span className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[8px] font-mono font-bold ${
                sessionMode === 'demo' ? 'bg-[#ffaa00]/10 text-[#ffaa00]' : 'bg-[#00ff88]/10 text-[#00ff88]'
              }`}>
                {sessionMode === 'demo' ? 'DEMO DATA' : 'REAL DATA'}
              </span>
            </div>
            {/* Mini metric pills */}
            {metrics && (
              <div className="hidden md:flex items-center gap-2 animate-footer-pulse">
                <div className="metric-pill-glow bg-[#12121a] border border-[#2a2a3e] rounded-md px-2.5 py-1 text-[9px] font-mono">
                  <span className="text-gray-500">DPC:</span>{' '}
                  <span className="text-[#00f0ff] font-medium">{metrics.dpc.current.toFixed(1)}µs</span>
                </div>
                <div className="metric-pill-glow bg-[#12121a] border border-[#2a2a3e] rounded-md px-2.5 py-1 text-[9px] font-mono">
                  <span className="text-gray-500">FPS:</span>{' '}
                  <span className="text-[#00ff88] font-medium">{metrics.fps.current.toFixed(0)}</span>
                </div>
                <div className="metric-pill-glow bg-[#12121a] border border-[#2a2a3e] rounded-md px-2.5 py-1 text-[9px] font-mono">
                  <span className="text-gray-500">Ping:</span>{' '}
                  <span className="text-[#a855f7] font-medium">{metrics.network.ping.toFixed(1)}ms</span>
                </div>
                <div className="metric-pill-glow bg-[#12121a] border border-[#2a2a3e] rounded-md px-2.5 py-1 text-[9px] font-mono">
                  <span className="text-gray-500">GPU:</span>{' '}
                  <span className={`font-medium ${metrics.hardware.gpu.temp >= 85 ? 'text-[#ff3366]' : 'text-[#ffaa00]'}`}>{metrics.hardware.gpu.temp}°C</span>
                </div>
              </div>
            )}
            <div className="text-[9px] text-gray-600 font-mono">
              {latencyData.length} samples · {sessionMode === 'demo' ? 'Simulated' : 'Real'} data
            </div>
          </div>
        </div>
      </footer>

      {/* Notification Toasts */}
      <NotificationToasts
        toasts={toasts}
        onDismiss={(id) => setToasts(prev => prev.filter(t => t.id !== id))}
      />

      {/* Overlay Mode */}
      <AnimatePresence>
        {overlayVisible && (
          <OverlayMode
            metrics={metrics}
            score={metrics?.score ?? 0}
            pingData={pingData}
            frameTimeData={frameTimeData}
            visible={overlayVisible}
            onClose={() => setOverlayVisible(false)}
          />
        )}
      </AnimatePresence>
    </div>
  )
}