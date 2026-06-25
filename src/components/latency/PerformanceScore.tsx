'use client'

import { motion, useSpring, useTransform } from 'framer-motion'
import { useEffect, useState } from 'react'
import { Shield, ShieldCheck, ShieldAlert, ShieldX } from 'lucide-react'

interface PerformanceScoreProps {
  score: number
  demoMode?: boolean
}

function getScoreColor(s: number): string {
  if (s >= 85) return '#00ff88'
  if (s >= 65) return '#ffaa00'
  if (s >= 40) return '#ff8800'
  return '#ff3366'
}

function getScoreLabel(s: number): string {
  if (s >= 90) return 'EXCELLENT'
  if (s >= 80) return 'COMPETITIVE READY'
  if (s >= 65) return 'GOOD'
  if (s >= 50) return 'NEEDS ATTENTION'
  if (s >= 30) return 'DEGRADED'
  return 'CRITICAL'
}

function getScoreIcon(s: number): React.ReactNode {
  if (s >= 80) return <ShieldCheck className="w-5 h-5" />
  if (s >= 50) return <ShieldAlert className="w-5 h-5" />
  return <ShieldX className="w-5 h-5" />
}

export default function PerformanceScore({ score, demoMode }: PerformanceScoreProps) {
  const color = demoMode ? '#ffaa00' : getScoreColor(score)
  const [displayScore, setDisplayScore] = useState(score)

  const spring = useSpring(0, { stiffness: 80, damping: 25, mass: 1.2 })
  const radius = 58
  const circumference = 2 * Math.PI * radius
  const strokeDashoffset = useTransform(spring, v => circumference - (v / 100) * circumference)

  useEffect(() => {
    spring.set(score)
    const timeout = setTimeout(() => setDisplayScore(score), 50)
    return () => clearTimeout(timeout)
  }, [score, spring])

  return (
    <div className={`glass-card rounded-xl p-5 flex flex-col items-center animate-gentle-float card-inner-light ${score >= 85 ? 'neon-border-pulse' : ''}`}>
      <h3 className="text-xs font-semibold text-white mb-3 tracking-wide uppercase">Performance Score</h3>
      {demoMode && (
        <div className="mb-2 px-2 py-1 rounded bg-[#ffaa00]/10 border border-[#ffaa00]/20 text-center">
          <span className="text-[9px] font-bold text-[#ffaa00]">DEMO / INSUFFICIENT REAL DATA</span>
        </div>
      )}
      <div className="relative w-36 h-36" style={{ filter: `drop-shadow(0 0 15px ${color}20)` }}>
        <svg viewBox="0 0 140 140" className="w-full h-full -rotate-90">
          {/* Background ring */}
          <circle cx="70" cy="70" r={radius} fill="none" stroke="#1a1a2e" strokeWidth="8" />
          {/* Decorative outer ring */}
          <circle cx="70" cy="70" r={radius + 6} fill="none" stroke={color} strokeWidth="0.5" strokeOpacity={0.15} strokeDasharray="4 4" className="animate-[spin_20s_linear_infinite]" />
          {/* Glow ring */}
          <circle cx="70" cy="70" r={radius} fill="none" stroke={color} strokeWidth="8"
            strokeOpacity={0.15} strokeLinecap="round"
            strokeDasharray={circumference} strokeDashoffset={circumference * (1 - displayScore / 100)}
            className="transition-all duration-1000" />
          {/* Animated progress ring */}
          <motion.circle cx="70" cy="70" r={radius} fill="none" stroke={color} strokeWidth="8"
            strokeLinecap="round" strokeDasharray={circumference}
            style={{ strokeDashoffset }}
            className="drop-shadow-[0_0_8px_rgba(0,0,0,0.5)]"
          />
          {/* Tick marks */}
          {Array.from({ length: 40 }).map((_, i) => {
            const angle = (i / 40) * 360
            const rad = (angle * Math.PI) / 180
            const r1 = radius - 12
            const r2 = radius - (i % 5 === 0 ? 8 : 10)
            return (
              <line
                key={i}
                x1={70 + r1 * Math.cos(rad)}
                y1={70 + r1 * Math.sin(rad)}
                x2={70 + r2 * Math.cos(rad)}
                y2={70 + r2 * Math.sin(rad)}
                stroke={color}
                strokeWidth={i % 5 === 0 ? 1 : 0.5}
                strokeOpacity={i % 5 === 0 ? 0.3 : 0.1}
              />
            )
          })}
        </svg>
        {/* Center content */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <motion.span
            className="text-[2.75rem] font-mono font-black metric-underline"
            style={{ color, textShadow: `0 0 30px ${color}40` }}
            key={Math.round(displayScore / 5) * 5}
            initial={{ scale: 1.05, opacity: 0.7 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.3 }}
          >
            {Math.round(displayScore)}
          </motion.span>
          <span className="text-[8px] text-gray-600 mt-0.5">/100</span>
          <span className="text-[7px] text-gray-700 -mt-0.5">PTS</span>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-1.5" style={{ color }}>
        {getScoreIcon(displayScore)}
        <span className="text-[11px] font-bold tracking-wider heading-gradient label-breathe">{getScoreLabel(displayScore)}{demoMode ? '*' : ''}</span>
      </div>
      {demoMode && (
        <div className="text-[8px] text-[#ffaa00] text-center mt-1">* Score based on simulated data. Import real data for accurate assessment.</div>
      )}

      <div className="w-full h-px bg-gradient-to-r from-transparent via-[#1a1a2e] to-transparent my-2" />
      <div className="mt-1 w-full grid grid-cols-4 gap-1 text-center">
        {[
          { label: 'DPC', val: displayScore >= 70 ? 'PASS' : 'WARN', ok: displayScore >= 70 },
          { label: 'Frame', val: displayScore >= 60 ? 'PASS' : 'WARN', ok: displayScore >= 60 },
          { label: 'Net', val: displayScore >= 75 ? 'PASS' : 'WARN', ok: displayScore >= 75 },
          { label: 'Temp', val: displayScore >= 65 ? 'PASS' : 'WARN', ok: displayScore >= 65 },
        ].map(item => (
          <div key={item.label} className="space-y-0.5">
            <div className={`text-[10px] font-mono font-bold ${item.ok ? 'text-[#00ff88]' : 'text-[#ffaa00]'}`}>{item.val}</div>
            <div className="text-[9px] text-gray-600">{item.label}</div>
          </div>
        ))}
      </div>
    </div>
  )
}