'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { X, AlertTriangle } from 'lucide-react'
import { LineChart, Line, ResponsiveContainer } from 'recharts'
import type { MetricsData, PingPoint, FrameTimePoint } from './types'

interface OverlayModeProps {
  metrics: MetricsData | null
  score: number
  pingData: PingPoint[]
  frameTimeData: FrameTimePoint[]
  visible: boolean
  onClose: () => void
}

function getColorDPC(val: number): string {
  if (val < 100) return '#00ff88'
  if (val < 500) return '#ffaa00'
  return '#ff3366'
}

function getColorFPS(val: number): string {
  if (val > 120) return '#00ff88'
  if (val > 60) return '#ffaa00'
  return '#ff3366'
}

function getColorPing(val: number): string {
  if (val < 30) return '#00ff88'
  if (val < 80) return '#ffaa00'
  return '#ff3366'
}

function getColorFrameTime(val: number): string {
  if (val < 8.33) return '#00ff88'
  if (val < 16.67) return '#ffaa00'
  return '#ff3366'
}

function getScoreColor(score: number): string {
  if (score >= 85) return '#00ff88'
  if (score >= 60) return '#ffaa00'
  return '#ff3366'
}

function deriveAlerts(metrics: MetricsData | null): string[] {
  if (!metrics) return []
  const alerts: string[] = []

  if (metrics.dpc.current > 500) alerts.push(`DPC spike: ${metrics.dpc.current.toFixed(0)}µs`)
  if (metrics.fps.current < 60) alerts.push(`Low FPS: ${metrics.fps.current.toFixed(0)}`)
  if (metrics.network.ping > 80) alerts.push(`High ping: ${metrics.network.ping.toFixed(0)}ms`)
  if (metrics.frameTime.current > 16.67) alerts.push(`Frame time: ${metrics.frameTime.current.toFixed(1)}ms`)
  if (metrics.network.packetLoss > 0) alerts.push(`Packet loss: ${(metrics.network.packetLoss * 100).toFixed(1)}%`)
  if (metrics.hardware.gpu.temp > 85) alerts.push(`GPU ${metrics.hardware.gpu.temp.toFixed(0)}°C`)
  if (metrics.hardware.cpu.temp > 85) alerts.push(`CPU ${metrics.hardware.cpu.temp.toFixed(0)}°C`)

  return alerts
}

export default function OverlayMode({
  metrics,
  score,
  pingData,
  frameTimeData,
  visible,
  onClose,
}: OverlayModeProps) {
  if (!visible) return null

  const alerts = deriveAlerts(metrics)
  const last20Ping = pingData.slice(-20)

  const dpcVal = metrics?.dpc.current ?? 0
  const fpsVal = metrics?.fps.current ?? 0
  const pingVal = metrics?.network.ping ?? 0
  const ftVal = metrics?.frameTime.current ?? 0

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 24, scale: 0.96 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
        className="fixed bottom-20 right-4 z-[300] w-72 bg-black/85 backdrop-blur-xl rounded-xl border border-[#00f0ff]/20 shadow-[0_0_40px_rgba(0,240,255,0.08)]"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-2 border-b border-white/5">
          <div className="flex items-center gap-2">
            <span className="text-[#00f0ff] font-bold text-xs tracking-tight">LZ</span>
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-mono font-bold"
              style={{
                color: getScoreColor(score),
                backgroundColor: `${getScoreColor(score)}18`,
                border: `1px solid ${getScoreColor(score)}40`,
              }}
            >
              {score}
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-600 hover:text-white transition-colors p-0.5 rounded"
            aria-label="Close overlay"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Core Metrics Grid */}
        <div className="grid grid-cols-2 gap-px bg-white/5 p-px">
          <div className="bg-black/85 p-2.5">
            <div className="text-[8px] text-gray-500 uppercase tracking-wider mb-0.5">DPC Latency</div>
            <div className="text-lg font-mono font-extrabold" style={{ color: getColorDPC(dpcVal) }}>
              {dpcVal.toFixed(0)}
              <span className="text-[10px] text-gray-500 font-normal ml-0.5">µs</span>
            </div>
          </div>
          <div className="bg-black/85 p-2.5">
            <div className="text-[8px] text-gray-500 uppercase tracking-wider mb-0.5">FPS</div>
            <div className="text-lg font-mono font-extrabold" style={{ color: getColorFPS(fpsVal) }}>
              {fpsVal.toFixed(0)}
            </div>
          </div>
          <div className="bg-black/85 p-2.5">
            <div className="text-[8px] text-gray-500 uppercase tracking-wider mb-0.5">Ping</div>
            <div className="text-lg font-mono font-extrabold" style={{ color: getColorPing(pingVal) }}>
              {pingVal.toFixed(0)}
              <span className="text-[10px] text-gray-500 font-normal ml-0.5">ms</span>
            </div>
          </div>
          <div className="bg-black/85 p-2.5">
            <div className="text-[8px] text-gray-500 uppercase tracking-wider mb-0.5">Frame Time</div>
            <div className="text-lg font-mono font-extrabold" style={{ color: getColorFrameTime(ftVal) }}>
              {ftVal.toFixed(1)}
              <span className="text-[10px] text-gray-500 font-normal ml-0.5">ms</span>
            </div>
          </div>
        </div>

        {/* Mini Ping Sparkline */}
        {last20Ping.length > 1 && (
          <div className="h-12 px-2 pt-1">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={last20Ping}>
                <Line
                  type="monotone"
                  dataKey="ping"
                  stroke="#00f0ff"
                  strokeWidth={1.5}
                  dot={false}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Alert Ticker */}
        {alerts.length > 0 && (
          <div className="border-t border-white/5 px-2 py-1 overflow-hidden">
            <div className="flex items-center gap-1.5 text-[10px] text-[#ff3366] truncate">
              <AlertTriangle className="w-3 h-3 shrink-0" />
              <span className="truncate">
                {alerts[0]}
              </span>
            </div>
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  )
}