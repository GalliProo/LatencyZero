'use client'

import { useState, useEffect, useRef } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'
import { Gamepad2, Usb, Bluetooth, Radio, Activity, Target, Crosshair } from 'lucide-react'

interface PollingPoint {
  time: string
  interval: number
}

interface ControllerLabProps {
  isConnected: boolean
}

// Simulated controller data
function generatePollingData(count: number): PollingPoint[] {
  const data: PollingPoint[] = []
  const now = Date.now()
  for (let i = 0; i < count; i++) {
    const t = new Date(now - (count - i) * 8)
    const baseInterval = 1.0
    // Simulate occasional jitter
    const jitter = Math.random() < 0.08 ? (Math.random() * 3 + 1) : (Math.random() * 0.3)
    const interval = baseInterval + jitter
    data.push({
      time: `${t.getMinutes().toString().padStart(2, '0')}:${t.getSeconds().toString().padStart(2, '0')}`,
      interval: Math.round(interval * 1000) / 1000,
    })
  }
  return data
}

const stickData = Array.from({ length: 50 }, () => ({
  x: (Math.random() - 0.5) * 0.08,
  y: (Math.random() - 0.5) * 0.08,
}))

function PollingTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number }>; label?: string }) {
  if (!active || !payload?.[0]) return null
  return (
    <div className="bg-[#12121a] border border-[#2a2a3e] rounded-lg px-3 py-2 shadow-xl">
      <p className="text-[10px] text-gray-500">{label}</p>
      <p className="text-xs font-mono text-white">{payload[0].value.toFixed(3)}ms</p>
    </div>
  )
}

export default function ControllerLab({ isConnected }: ControllerLabProps) {
  const [pollingData, setPollingData] = useState<PollingPoint[]>(() => generatePollingData(60))
  const [transport, setTransport] = useState<'usb' | 'dongle' | 'bluetooth'>('usb')

  useEffect(() => {
    if (!isConnected) return
    const interval = setInterval(() => {
      setPollingData(prev => {
        const next = generatePollingData(1)[0]
        return [...prev.slice(-59), next]
      })
    }, 800)
    return () => clearInterval(interval)
  }, [isConnected])

  const intervals = pollingData.map(d => d.interval)
  const median = intervals.sort((a, b) => a - b)[Math.floor(intervals.length / 2)]
  const p95 = intervals.sort((a, b) => a - b)[Math.floor(intervals.length * 0.95)]
  const maxInterval = Math.max(...intervals)
  const stdDev = Math.sqrt(intervals.reduce((s, v) => s + (v - median) ** 2, 0) / intervals.length)

  const transportOptions = [
    { key: 'usb' as const, label: 'USB Wired', icon: <Usb className="w-3.5 h-3.5" />, desc: '1ms polling, most consistent' },
    { key: 'dongle' as const, label: '2.4GHz Dongle', icon: <Radio className="w-3.5 h-3.5" />, desc: '~1-4ms, some jitter' },
    { key: 'bluetooth' as const, label: 'Bluetooth', icon: <Bluetooth className="w-3.5 h-3.5" />, desc: '~4-15ms, highest latency' },
  ]

  return (
    <div className="bg-[#0d0d14] rounded-lg border border-[#1a1a2e] p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-white">Controller Lab</h3>
          <p className="text-[10px] text-gray-500 mt-0.5">Input latency, polling analysis & stick diagnostics</p>
        </div>
        <div className={`flex items-center gap-1.5 text-[10px] font-mono ${isConnected ? 'text-[#00ff88]' : 'text-[#ff3366]'}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-[#00ff88]' : 'bg-[#ff3366]'} ${isConnected ? 'animate-pulse' : ''}`} />
          {isConnected ? 'CONNECTED' : 'NO CONTROLLER'}
        </div>
      </div>

      {/* Transport Selection */}
      <div className="grid grid-cols-3 gap-2">
        {transportOptions.map(opt => (
          <button
            key={opt.key}
            onClick={() => setTransport(opt.key)}
            className={`p-2.5 rounded-lg border text-left transition-all ${
              transport === opt.key
                ? 'border-[#00f0ff]/40 bg-[#00f0ff]/5'
                : 'border-[#1a1a2e] hover:border-[#2a2a3e]'
            }`}
          >
            <div className={`flex items-center gap-1.5 mb-1 ${transport === opt.key ? 'text-[#00f0ff]' : 'text-gray-500'}`}>
              {opt.icon}
              <span className="text-[10px] font-medium">{opt.label}</span>
            </div>
            <span className="text-[9px] text-gray-500">{opt.desc}</span>
          </button>
        ))}
      </div>

      {/* Polling Stats */}
      <div className="grid grid-cols-4 gap-2">
        {[
          { label: 'Median', value: `${median.toFixed(3)}ms`, status: median <= 1.2 ? 'good' : median <= 3 ? 'warn' : 'bad' },
          { label: 'P95', value: `${p95.toFixed(3)}ms`, status: p95 <= 2 ? 'good' : p95 <= 5 ? 'warn' : 'bad' },
          { label: 'Max', value: `${maxInterval.toFixed(3)}ms`, status: maxInterval <= 3 ? 'good' : maxInterval <= 8 ? 'warn' : 'bad' },
          { label: 'Std Dev', value: `${stdDev.toFixed(3)}ms`, status: stdDev <= 0.5 ? 'good' : stdDev <= 1.5 ? 'warn' : 'bad' },
        ].map(s => (
          <div key={s.label} className="bg-[#12121a] rounded-md p-2 border border-[#1a1a2e]">
            <div className="text-[9px] text-gray-500 uppercase tracking-wider">{s.label}</div>
            <div className={`text-sm font-mono font-bold mt-0.5 ${
              s.status === 'good' ? 'text-[#00ff88]' : s.status === 'warn' ? 'text-[#ffaa00]' : 'text-[#ff3366]'
            }`}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Polling Interval Chart */}
      <div>
        <h4 className="text-[11px] font-medium text-gray-300 mb-2 flex items-center gap-1.5">
          <Activity className="w-3.5 h-3.5 text-[#00f0ff]" />Polling Interval Timeline
        </h4>
        <div className="h-32">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={pollingData} margin={{ top: 2, right: 5, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1a1a2e" vertical={false} />
              <XAxis dataKey="time" tick={{ fill: '#4b5563', fontSize: 9 }} axisLine={{ stroke: '#1a1a2e' }} tickLine={false} />
              <YAxis tick={{ fill: '#4b5563', fontSize: 9 }} axisLine={{ stroke: '#1a1a2e' }} tickLine={false} domain={[0, 'auto']} width={40} />
              <Tooltip content={<PollingTooltip />} />
              <ReferenceLine y={1.0} stroke="#00ff88" strokeDasharray="3 3" strokeWidth={0.8} />
              <ReferenceLine y={2.0} stroke="#ffaa00" strokeDasharray="3 3" strokeWidth={0.8} />
              <Line type="monotone" dataKey="interval" stroke="#00f0ff" strokeWidth={1.5} dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Stick Noise Visualization */}
      <div>
        <h4 className="text-[11px] font-medium text-gray-300 mb-2 flex items-center gap-1.5">
          <Crosshair className="w-3.5 h-3.5 text-[#a855f7]" />Stick Center Noise (At Rest)
        </h4>
        <div className="relative bg-[#0a0a0f] rounded-lg border border-[#1a1a2e] h-36 flex items-center justify-center">
          {/* Grid */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-24 h-24 border border-[#1a1a2e] rounded-full" />
            <div className="absolute w-8 h-8 border border-[#1a1a2e]/50 rounded-full" />
            <div className="absolute w-full h-px bg-[#1a1a2e]/30" />
            <div className="absolute h-full w-px bg-[#1a1a2e]/30" />
          </div>
          {/* Points */}
          <svg viewBox="-0.15 -0.15 0.3 0.3" className="w-32 h-32 absolute">
            {stickData.map((p, i) => (
              <circle key={i} cx={p.x} cy={p.y} r="0.004" fill="#00f0ff" opacity={0.6} />
            ))}
            {/* Deadzone circle */}
            <circle cx="0" cy="0" r="0.05" fill="none" stroke="#ffaa00" strokeWidth="0.003" strokeDasharray="0.005 0.005" opacity={0.5} />
          </svg>
          {/* Labels */}
          <div className="absolute bottom-1 right-2 text-[8px] text-gray-600">Deadzone (5%)</div>
          <div className="absolute top-1 left-2 text-[8px] text-gray-600">Center noise: {stdDev.toFixed(3)}</div>
        </div>
      </div>

      {/* Deadzone Recommendation */}
      <div className="flex items-start gap-2 p-2.5 bg-[#00f0ff]/5 border border-[#00f0ff]/20 rounded-lg">
        <Target className="w-4 h-4 text-[#00f0ff] mt-0.5 shrink-0" />
        <div>
          <div className="text-[11px] font-medium text-white">Recommended Deadzone: 5%</div>
          <p className="text-[10px] text-gray-400 mt-0.5">Your stick shows minimal center noise. A 5% deadzone provides the best balance between responsiveness and false input prevention.</p>
        </div>
      </div>
    </div>
  )
}