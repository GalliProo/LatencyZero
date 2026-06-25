'use client'

import { useEffect, useRef, useState, useMemo, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ScrollText, Zap, TrendingDown, AlertTriangle, CheckCircle,
  Thermometer, Wifi, Activity, Clock, Trash2, X
} from 'lucide-react'
import type { MetricsData, AlertItem } from './types'

interface TimelineEvent {
  id: string
  timestamp: number
  type: 'spike' | 'drop' | 'threshold' | 'recovery' | 'info'
  severity: 'critical' | 'warning' | 'info'
  metric: string
  value: number
  previousValue?: number
  message: string
}

interface EventTimelineProps {
  metrics: MetricsData | null
  alerts: AlertItem[]
}

type SeverityFilter = 'all' | 'critical' | 'warning' | 'info'

const MAX_EVENTS = 50

const severityColors: Record<string, { dot: string; border: string; text: string; bg: string; iconGlow: string }> = {
  critical: {
    dot: 'bg-[#ff3366]',
    border: 'border-l-[#ff3366]',
    text: 'text-[#ff3366]',
    bg: 'bg-[#ff3366]/8',
    iconGlow: 'shadow-[0_0_8px_rgba(255,51,102,0.5)]',
  },
  warning: {
    dot: 'bg-[#ffaa00]',
    border: 'border-l-[#ffaa00]',
    text: 'text-[#ffaa00]',
    bg: 'bg-[#ffaa00]/8',
    iconGlow: 'shadow-[0_0_8px_rgba(255,170,0,0.4)]',
  },
  info: {
    dot: 'bg-[#00f0ff]',
    border: 'border-l-[#00f0ff]',
    text: 'text-[#00f0ff]',
    bg: 'bg-[#00f0ff]/8',
    iconGlow: 'shadow-[0_0_8px_rgba(0,240,255,0.4)]',
  },
  recovery: {
    dot: 'bg-[#00ff88]',
    border: 'border-l-[#00ff88]',
    text: 'text-[#00ff88]',
    bg: 'bg-[#00ff88]/8',
    iconGlow: 'shadow-[0_0_8px_rgba(0,255,136,0.4)]',
  },
}

const typeIcons: Record<string, { icon: React.ReactNode; colorClass: string }> = {
  spike: { icon: <Zap className="w-3 h-3" />, colorClass: '' },
  drop: { icon: <TrendingDown className="w-3 h-3" />, colorClass: '' },
  threshold: { icon: <AlertTriangle className="w-3 h-3" />, colorClass: '' },
  recovery: { icon: <CheckCircle className="w-3 h-3" />, colorClass: '' },
  info: { icon: <Activity className="w-3 h-3" />, colorClass: '' },
}

function formatRelativeTime(ts: number): string {
  const diff = (Date.now() - ts) / 1000
  if (diff < 5) return 'just now'
  if (diff < 60) return `${Math.floor(diff)}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  return `${Math.floor(diff / 3600)}h ago`
}

function formatValue(value: number, metric: string): string {
  if (metric.includes('DPC') || metric.includes('ISR') || metric.includes('Frame Time')) {
    return `${value.toFixed(1)}${metric.includes('DPC') || metric.includes('ISR') ? 'µs' : 'ms'}`
  }
  if (metric.includes('FPS')) return `${value.toFixed(0)}`
  if (metric.includes('Ping')) return `${value.toFixed(1)}ms`
  if (metric.includes('Temp')) return `${value.toFixed(0)}°C`
  if (metric.includes('Score')) return `${value.toFixed(0)}`
  return `${value.toFixed(1)}`
}

let eventIdCounter = 0

export default function EventTimeline({ metrics, alerts }: EventTimelineProps) {
  const [events, setEvents] = useState<TimelineEvent[]>([])
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>('all')
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const prevMetrics = useRef<MetricsData | null>(null)
  const prevState = useRef<Record<string, string | null>>({
    dpcCritical: null,
    dpcWarning: null,
    fpsCritical: null,
    fpsWarning: null,
    pingCritical: null,
    pingWarning: null,
    gpuTempCritical: null,
    gpuTempWarning: null,
    scoreRecovery: null,
    scoreCritical: null,
    frameTimeWarning: null,
    frameTimeCritical: null,
  })

  // Auto-scroll to bottom on new events
  useEffect(() => {
    if (scrollRef.current && events.length > 0) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [events.length])

  // Generate events from metric changes
  useEffect(() => {
    if (!metrics) return
    if (!prevMetrics.current) {
      prevMetrics.current = metrics
      return
    }

    const prev = prevMetrics.current
    const newEvents: TimelineEvent[] = []
    const state = prevState.current

    const addEvent = (
      type: TimelineEvent['type'],
      severity: TimelineEvent['severity'],
      stateKey: string,
      newState: string,
      metric: string,
      value: number,
      prevValue: number,
      message: string
    ) => {
      if (state[stateKey] !== newState) {
        state[stateKey] = newState
        newEvents.push({
          id: `evt-${++eventIdCounter}-${Date.now()}`,
          timestamp: Date.now(),
          type,
          severity,
          metric,
          value,
          previousValue: prevValue,
          message,
        })
      }
    }

    // 1. DPC spikes
    addEvent(
      'spike', 'critical', 'dpcCritical',
      metrics.dpc.current > 500 ? 'active' : 'clear',
      'DPC Latency', metrics.dpc.current, prev.dpc.current,
      `DPC latency spiked to ${metrics.dpc.current.toFixed(1)}µs (threshold: 500µs)`
    )
    addEvent(
      'spike', 'warning', 'dpcWarning',
      metrics.dpc.current > 200 && metrics.dpc.current <= 500 ? 'active' : 'clear',
      'DPC Latency', metrics.dpc.current, prev.dpc.current,
      `DPC latency elevated to ${metrics.dpc.current.toFixed(1)}µs (threshold: 200µs)`
    )

    // 2. FPS drops
    addEvent(
      'drop', 'critical', 'fpsCritical',
      metrics.fps.current < 60 ? 'active' : 'clear',
      'FPS', metrics.fps.current, prev.fps.current,
      `FPS dropped to ${metrics.fps.current.toFixed(0)} (threshold: 60)`
    )
    addEvent(
      'drop', 'warning', 'fpsWarning',
      metrics.fps.current < 100 && metrics.fps.current >= 60 ? 'active' : 'clear',
      'FPS', metrics.fps.current, prev.fps.current,
      `FPS dropped to ${metrics.fps.current.toFixed(0)} (threshold: 100)`
    )

    // 3. Ping spikes
    addEvent(
      'spike', 'critical', 'pingCritical',
      metrics.network.ping > 80 ? 'active' : 'clear',
      'Ping', metrics.network.ping, prev.network.ping,
      `Ping spiked to ${metrics.network.ping.toFixed(1)}ms (threshold: 80ms)`
    )
    addEvent(
      'spike', 'warning', 'pingWarning',
      metrics.network.ping > 40 && metrics.network.ping <= 80 ? 'active' : 'clear',
      'Ping', metrics.network.ping, prev.network.ping,
      `Ping elevated to ${metrics.network.ping.toFixed(1)}ms (threshold: 40ms)`
    )

    // 4. GPU temp
    addEvent(
      'threshold', 'critical', 'gpuTempCritical',
      metrics.hardware.gpu.temp > 85 ? 'active' : 'clear',
      'GPU Temp', metrics.hardware.gpu.temp, prev.hardware.gpu.temp,
      `GPU temperature exceeded 85°C — now at ${metrics.hardware.gpu.temp.toFixed(0)}°C`
    )
    addEvent(
      'threshold', 'warning', 'gpuTempWarning',
      metrics.hardware.gpu.temp > 75 && metrics.hardware.gpu.temp <= 85 ? 'active' : 'clear',
      'GPU Temp', metrics.hardware.gpu.temp, prev.hardware.gpu.temp,
      `GPU temperature warning at ${metrics.hardware.gpu.temp.toFixed(0)}°C (threshold: 75°C)`
    )

    // 5. Score recovery
    addEvent(
      'recovery', 'info', 'scoreRecovery',
      metrics.score > 80 ? 'active' : 'clear',
      'Performance Score', metrics.score, prev.score,
      `Performance score recovered to ${metrics.score.toFixed(0)}`
    )

    // 6. Score critical
    addEvent(
      'drop', 'critical', 'scoreCritical',
      metrics.score < 50 ? 'active' : 'clear',
      'Performance Score', metrics.score, prev.score,
      `Performance score critically low at ${metrics.score.toFixed(0)}`
    )

    // 7. Frame time
    addEvent(
      'spike', 'critical', 'frameTimeCritical',
      metrics.frameTime.current > 33 ? 'active' : 'clear',
      'Frame Time', metrics.frameTime.current, prev.frameTime.current,
      `Frame time critically high at ${metrics.frameTime.current.toFixed(1)}ms (>33ms)`
    )
    addEvent(
      'spike', 'warning', 'frameTimeWarning',
      metrics.frameTime.current > 20 && metrics.frameTime.current <= 33 ? 'active' : 'clear',
      'Frame Time', metrics.frameTime.current, prev.frameTime.current,
      `Frame time elevated to ${metrics.frameTime.current.toFixed(1)}ms (>20ms)`
    )

    if (newEvents.length > 0) {
      setEvents(prev => [...prev, ...newEvents].slice(-MAX_EVENTS))
    }

    prevMetrics.current = metrics
  }, [metrics])

  const handleClear = useCallback(() => {
    setEvents([])
    eventIdCounter = 0
    // Reset state tracking
    Object.keys(prevState.current).forEach(key => {
      prevState.current[key] = null
    })
  }, [])

  // Filtered + newest-last order
  const filteredEvents = useMemo(() => {
    const base = severityFilter === 'all'
      ? events
      : events.filter(e => e.severity === severityFilter)
    return base
  }, [events, severityFilter])

  const severityCounts = useMemo(() => ({
    all: events.length,
    critical: events.filter(e => e.severity === 'critical').length,
    warning: events.filter(e => e.severity === 'warning').length,
    info: events.filter(e => e.severity === 'info').length,
    recovery: events.filter(e => e.severity === 'info').length,
  }), [events])

  const filterButtons: { key: SeverityFilter; label: string; color: string }[] = [
    { key: 'all', label: 'All', color: 'text-gray-400' },
    { key: 'critical', label: 'Critical', color: 'text-[#ff3366]' },
    { key: 'warning', label: 'Warning', color: 'text-[#ffaa00]' },
    { key: 'info', label: 'Info', color: 'text-[#00f0ff]' },
  ]

  return (
    <div className="bg-[#0d0d14] rounded-xl border border-[#1a1a2e] p-4 glass-card deep-shadow card-hover-border">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <ScrollText className="w-4 h-4 text-[#00f0ff]" />
          <h3 className="text-sm font-semibold text-white tracking-wide">EVENT TIMELINE</h3>
          {events.length > 0 && (
            <span className="text-[10px] font-mono text-[#00f0ff] bg-[#00f0ff]/10 px-1.5 py-0.5 rounded-full border border-[#00f0ff]/20">
              {events.length}
            </span>
          )}
        </div>
        {events.length > 0 && (
          <button
            onClick={handleClear}
            className="flex items-center gap-1 text-[10px] text-gray-500 hover:text-[#ff3366] transition-colors cursor-pointer"
          >
            <Trash2 className="w-3 h-3" />
            Clear
          </button>
        )}
      </div>

      {/* Filter pills */}
      {events.length > 0 && (
        <div className="flex gap-1 mb-3">
          {filterButtons.map(fb => (
            <button
              key={fb.key}
              onClick={() => setSeverityFilter(fb.key)}
              className={`px-2 py-0.5 rounded-full text-[10px] font-medium transition-all border cursor-pointer ${
                severityFilter === fb.key
                  ? `${fb.color} bg-white/5 border-current/30`
                  : 'text-gray-600 hover:text-gray-400 border-transparent'
              }`}
            >
              {fb.label}
              {severityCounts[fb.key] > 0 && (
                <span className="ml-1 opacity-60">{severityCounts[fb.key]}</span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Timeline container */}
      <div
        ref={scrollRef}
        className="max-h-[400px] overflow-y-auto pr-1 custom-scrollbar relative"
      >
        {filteredEvents.length === 0 ? (
          <div className="text-center py-12">
            <CheckCircle className="w-8 h-8 text-[#00ff88] mx-auto mb-3 opacity-40" />
            <p className="text-xs text-gray-500 leading-relaxed">
              No significant events detected.
            </p>
            <p className="text-[10px] text-gray-600 mt-1">
              System is stable.
            </p>
          </div>
        ) : (
          <div className="relative">
            {/* Timeline gradient line */}
            <div
              className="absolute left-[3px] top-0 bottom-0 w-[2px] rounded-full"
              style={{
                background: 'linear-gradient(to bottom, #374151 0%, #00f0ff 100%)',
              }}
            />

            {/* Event entries */}
            <AnimatePresence initial={false}>
              {filteredEvents.map((event, idx) => {
                const isRecovery = event.type === 'recovery'
                const colorKey = isRecovery ? 'recovery' : event.severity
                const colors = severityColors[colorKey] || severityColors.info
                const iconConfig = typeIcons[event.type] || typeIcons.info

                return (
                  <motion.div
                    key={event.id}
                    initial={{ opacity: 0, x: 30 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.3, delay: 0.02 }}
                    className="relative flex items-start gap-3 py-1.5 pl-4 group"
                    onMouseEnter={() => setHoveredId(event.id)}
                    onMouseLeave={() => setHoveredId(null)}
                  >
                    {/* Dot on timeline */}
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{
                        type: 'spring',
                        stiffness: 500,
                        damping: 15,
                        delay: 0.05,
                      }}
                      className={`absolute left-0 top-[14px] w-[6px] h-[6px] rounded-full ${colors.dot} z-10`}
                      style={{
                        boxShadow: `0 0 6px ${colorKey === 'critical' ? 'rgba(255,51,102,0.6)' : colorKey === 'warning' ? 'rgba(255,170,0,0.5)' : colorKey === 'recovery' ? 'rgba(0,255,136,0.5)' : 'rgba(0,240,255,0.5)'}`,
                      }}
                    />

                    {/* Event card */}
                    <motion.div
                      layout
                      className={`flex-1 min-w-0 rounded-md border-l-2 ${colors.border} ${colors.bg} pr-2 pl-2.5 py-2 transition-all duration-200`}
                      style={{ minHeight: hoveredId === event.id ? 'auto' : '36px' }}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          {/* Icon */}
                          <span className={`${colors.text} ${colors.iconGlow} shrink-0`}>
                            {iconConfig.icon}
                          </span>

                          {/* Metric name + value */}
                          <div className="min-w-0">
                            <span className="text-[10px] font-bold text-gray-200 uppercase tracking-wider">
                              {event.metric}
                            </span>
                            <span className="text-[11px] font-mono ml-1.5">
                              <span className={colors.text}>
                                {formatValue(event.value, event.metric)}
                              </span>
                              {event.previousValue !== undefined && (
                                <span className="text-gray-600 ml-1">
                                  ← {formatValue(event.previousValue, event.metric)}
                                </span>
                              )}
                            </span>
                          </div>
                        </div>

                        {/* Relative timestamp */}
                        <span className="text-[9px] text-gray-600 font-mono shrink-0 whitespace-nowrap">
                          {formatRelativeTime(event.timestamp)}
                        </span>
                      </div>

                      {/* Expanded message on hover */}
                      <AnimatePresence>
                        {hoveredId === event.id && (
                          <motion.p
                            initial={{ opacity: 0, height: 0, marginTop: 0 }}
                            animate={{ opacity: 1, height: 'auto', marginTop: 4 }}
                            exit={{ opacity: 0, height: 0, marginTop: 0 }}
                            transition={{ duration: 0.15 }}
                            className="text-[10px] text-gray-400 leading-relaxed overflow-hidden"
                          >
                            {event.message}
                          </motion.p>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  </motion.div>
                )
              })}
            </AnimatePresence>

            {/* Fade gradient at bottom */}
            {filteredEvents.length > 5 && (
              <div className="pointer-events-none bg-gradient-to-t from-[#0d0d14] via-transparent to-transparent h-8 -mt-8 relative z-10 sticky bottom-0" />
            )}
          </div>
        )}
      </div>
    </div>
  )
}