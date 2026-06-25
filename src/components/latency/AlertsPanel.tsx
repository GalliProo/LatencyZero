'use client'

import { useEffect, useRef, useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { AlertTriangle, XCircle, Info, Zap, Thermometer, Wifi, Activity, Clock, X, CheckCircle } from 'lucide-react'
import type { AlertItem } from './types'

interface AlertsPanelProps {
  alerts: AlertItem[]
  onDismiss?: (id: string) => void
}

type SeverityFilter = 'all' | 'critical' | 'warning' | 'info'

const typeConfig: Record<string, { icon: React.ReactNode; color: string; bg: string }> = {
  dpc_spike: { icon: <Zap className="w-3.5 h-3.5" />, color: 'text-[#00f0ff]', bg: 'bg-[#00f0ff]/10' },
  isr_spike: { icon: <Activity className="w-3.5 h-3.5" />, color: 'text-[#a855f7]', bg: 'bg-[#a855f7]/10' },
  frame_drop: { icon: <Clock className="w-3.5 h-3.5" />, color: 'text-[#00ff88]', bg: 'bg-[#00ff88]/10' },
  ping_spike: { icon: <Wifi className="w-3.5 h-3.5" />, color: 'text-[#ffaa00]', bg: 'bg-[#ffaa00]/10' },
  temp_warning: { icon: <Thermometer className="w-3.5 h-3.5" />, color: 'text-[#ff3366]', bg: 'bg-[#ff3366]/10' },
  packet_loss: { icon: <AlertTriangle className="w-3.5 h-3.5" />, color: 'text-[#ffaa00]', bg: 'bg-[#ffaa00]/10' },
}

const severityBorder: Record<string, string> = {
  info: 'border-l-[#00f0ff]',
  warning: 'border-l-[#ffaa00]',
  critical: 'border-l-[#ff3366]',
}

function timeAgo(ts: number): string {
  const diff = (Date.now() - ts) / 1000
  if (diff < 5) return 'just now'
  if (diff < 60) return `${Math.floor(diff)}s ago`
  return `${Math.floor(diff / 60)}m ago`
}

export default function AlertsPanel({ alerts, onDismiss }: AlertsPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>('all')

  const reversedAlerts = alerts.slice(-30).reverse()

  const severityCounts = useMemo(() => ({
    all: reversedAlerts.length,
    critical: reversedAlerts.filter(a => a.severity === 'critical').length,
    warning: reversedAlerts.filter(a => a.severity === 'warning').length,
    info: reversedAlerts.filter(a => a.severity === 'info').length,
  }), [reversedAlerts])

  const visibleAlerts = severityFilter === 'all'
    ? reversedAlerts
    : reversedAlerts.filter(a => a.severity === severityFilter)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0
    }
  }, [alerts.length, severityFilter])

  const filterButtons: { key: SeverityFilter; label: string; color: string }[] = [
    { key: 'all', label: 'All', color: '' },
    { key: 'critical', label: 'Critical', color: 'text-[#ff3366]' },
    { key: 'warning', label: 'Warning', color: 'text-[#ffaa00]' },
    { key: 'info', label: 'Info', color: 'text-[#00f0ff]' },
  ]

  return (
    <div className="bg-[#0d0d14] rounded-lg border border-[#1a1a2e] p-4 card-inner-light deep-shadow alert-panel-glass">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-[#ffaa00]" />
          <h3 className="text-sm font-semibold text-white">Alerts</h3>
          <span className="text-[10px] font-mono text-gray-500 bg-[#1a1a2e] px-1.5 py-0.5 rounded">{visibleAlerts.length}</span>
        </div>
        <div className="flex items-center gap-2 text-[11px]">
          <button
            onClick={() => setSeverityFilter(severityFilter === 'critical' ? 'all' : 'critical')}
            className={`flex items-center gap-1 transition-colors ${severityFilter === 'critical' ? 'text-[#ff3366] underline underline-offset-2' : 'text-[#ff3366] hover:underline hover:underline-offset-2 cursor-pointer'}`}
          >
            <XCircle className="w-3 h-3" />Critical
          </button>
          <button
            onClick={() => setSeverityFilter(severityFilter === 'warning' ? 'all' : 'warning')}
            className={`flex items-center gap-1 transition-colors ${severityFilter === 'warning' ? 'text-[#ffaa00] underline underline-offset-2' : 'text-[#ffaa00] hover:underline hover:underline-offset-2 cursor-pointer'}`}
          >
            <AlertTriangle className="w-3 h-3" />Warning
          </button>
          <button
            onClick={() => setSeverityFilter(severityFilter === 'info' ? 'all' : 'info')}
            className={`flex items-center gap-1 transition-colors ${severityFilter === 'info' ? 'text-[#00f0ff] underline underline-offset-2' : 'text-[#00f0ff] hover:underline hover:underline-offset-2 cursor-pointer'}`}
          >
            <Info className="w-3 h-3" />Info
          </button>
        </div>
      </div>

      {/* Severity filter bar */}
      <div className="flex gap-1 mb-3">
        {filterButtons.map(fb => (
          <button
            key={fb.key}
            onClick={() => setSeverityFilter(fb.key)}
            className={`px-2 py-1 rounded text-[10px] font-medium transition-all ${
              severityFilter === fb.key
                ? 'bg-[#00f0ff]/15 text-[#00f0ff] border border-[#00f0ff]/30'
                : 'text-gray-500 hover:text-gray-300 border border-transparent'
            }`}
          >
            {fb.label} ({severityCounts[fb.key]})
          </button>
        ))}
      </div>

      <div ref={scrollRef} className="max-h-[340px] overflow-y-auto space-y-1.5 pr-1 custom-scrollbar">
        <AnimatePresence mode="popLayout">
          {visibleAlerts.map((alert) => {
            const tc = typeConfig[alert.type] || typeConfig.dpc_spike
            return (
              <motion.div
                key={alert.id}
                initial={{ opacity: 0, x: -20, height: 0 }}
                animate={{ opacity: 1, x: 0, height: 'auto' }}
                exit={{ opacity: 0, x: 20, height: 0 }}
                transition={{ duration: 0.25 }}
                className={`flex items-start gap-2.5 p-2.5 rounded-md bg-[#12121a] border-l-2 ${severityBorder[alert.severity]} group hover:bg-[#1a1a2e] transition-colors animate-alert-slide`}
              >
                <div className={`mt-0.5 p-1 rounded ${tc.bg} ${tc.color} shrink-0`}>
                  {tc.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] text-gray-200 leading-tight font-medium">{alert.message}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[10px] text-gray-400 font-mono">
                      Value: <span className="text-gray-200">{typeof alert.value === 'number' ? alert.value.toFixed(1) : alert.value}</span>
                      {' / '}Threshold: <span className="text-gray-300">{alert.threshold}</span>
                    </span>
                    <span className="text-[10px] text-gray-600">•</span>
                    <span className="text-[10px] text-gray-400">{timeAgo(alert.timestamp)}</span>
                  </div>
                </div>
                {onDismiss && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onDismiss(alert.id) }}
                    className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 hover:bg-[#2a2a3e] rounded"
                  >
                    <X className="w-3 h-3 text-gray-500" />
                  </button>
                )}
              </motion.div>
            )
          })}
        </AnimatePresence>
        {visibleAlerts.length > 0 && (
          <div className="pointer-events-none bg-gradient-to-t from-[#0d0d14] to-transparent h-6 -mt-6 relative z-10" />
        )}
      </div>
      {visibleAlerts.length === 0 && (
        <div className="text-center py-8">
          <CheckCircle className="w-6 h-6 text-[#00ff88] mx-auto mb-2 opacity-50" />
          <p className="text-xs text-gray-500">
            {severityFilter === 'all'
              ? 'No active alerts — system performing within normal parameters'
              : `No ${severityFilter} alerts`}
          </p>
        </div>
      )}
    </div>
  )
}