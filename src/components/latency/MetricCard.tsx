'use client'

import { motion } from 'framer-motion'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'

interface MetricCardProps {
  title: string
  value: string | number
  unit?: string
  subtitle?: string
  status?: 'good' | 'warning' | 'critical' | 'info'
  icon: React.ReactNode
  trend?: 'up' | 'down' | 'stable'
  sparkline?: number[]
}

const statusColors = {
  good: { dot: 'bg-[#00ff88]', glow: '' },
  warning: { dot: 'bg-[#ffaa00]', glow: 'shadow-[0_0_20px_rgba(255,170,0,0.08)]' },
  critical: { dot: 'bg-[#ff3366]', glow: 'shadow-[0_0_20px_rgba(255,51,102,0.12)] border-[#ff3366]/30' },
  info: { dot: 'bg-[#00f0ff]', glow: '' },
}

const trendIcons = {
  up: <TrendingUp className="w-3 h-3 text-[#00ff88]" />,
  down: <TrendingDown className="w-3 h-3 text-[#ff3366]" />,
  stable: <Minus className="w-3 h-3 text-gray-500" />,
}

export default function MetricCard({ title, value, unit, subtitle, status = 'good', icon, trend, sparkline }: MetricCardProps) {
  const sc = statusColors[status]

  const sparkPath = sparkline && sparkline.length > 1
    ? (() => {
        const w = 100, h = 24, pts = sparkline.slice(-20)
        const min = Math.min(...pts), max = Math.max(...pts)
        const range = max - min || 1
        return pts.map((v, i) => {
          const x = (i / (pts.length - 1)) * w
          const y = h - ((v - min) / range) * h
          return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`
        }).join(' ')
      })()
    : ''

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={`relative bg-gradient-to-br from-[#0d0d14] to-[#0f0f1a] rounded-lg border p-4 transition-all duration-300 card-3d-hover deep-shadow card-hover-border ${sc.glow || 'border-[#1a1a2e]'} ${status === 'critical' ? 'metric-card-red' : status === 'warning' ? 'metric-card-amber' : status === 'good' ? 'metric-card-green' : 'metric-card-cyan'} hover:shadow-[0_0_30px_rgba(0,240,255,0.06)] hover:border-[#2a2a3e]/80 min-w-[160px]`}
    >
      {status === 'critical' && <div className="absolute top-0 left-0 right-0 h-px bg-[#ff3366] rounded-t-lg" />}
      {status !== 'info' && (
        <div className={`absolute top-2 left-0 w-0.5 rounded-r-full h-6 ${
          status === 'good' ? 'bg-[#00ff88]/40' : status === 'warning' ? 'bg-[#ffaa00]/40' : 'bg-[#ff3366]/60'
        }`} />
      )}
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-gray-400">{icon}</span>
          <span className="text-[10px] uppercase tracking-widest text-gray-500 font-medium">{title}</span>
        </div>
        <div className="flex items-center gap-1.5">
          {trend && trendIcons[trend]}
          <span className={`w-1.5 h-1.5 rounded-full ${sc.dot} ${status === 'critical' ? 'animate-pulse status-dot-live' : status === 'good' ? 'animate-[live-pulse_3s_ease-in-out_infinite] status-dot-live' : ''}`} />
        </div>
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className={`text-[1.8rem] font-mono font-extrabold data-value-transition live-value-pulse ${status === 'good' ? 'text-gray-100' : 'text-white'} ${status === 'warning' ? '!text-[#ffaa00]' : status === 'critical' ? '!text-[#ff3366]' : ''} ${status === 'good' ? 'metric-glow-good' : status === 'warning' ? 'metric-glow-warn' : status === 'critical' ? 'metric-glow-crit' : ''}`}>{value}</span>
        {unit && <span className="text-xs text-gray-400">{unit}</span>}
      </div>
      {subtitle && <p className="text-xs text-gray-500 mt-1">{subtitle}</p>}
      {sparkPath && (
        <>
          <svg viewBox="0 0 100 24" className="w-full h-6 mt-2 opacity-60" preserveAspectRatio="none">
            <defs><filter id="glow"><feGaussianBlur stdDeviation="1.5" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
            <path d={sparkPath} fill="none" stroke={status === 'critical' ? '#ff3366' : status === 'warning' ? '#ffaa00' : '#00f0ff'} strokeWidth="1.5" filter="url(#glow)" />
          </svg>
          <div className="h-px premium-divider" />
        </>
      )}
    </motion.div>
  )
}