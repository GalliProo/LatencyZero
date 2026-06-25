'use client'

import { AlertTriangle, Eye } from 'lucide-react'

interface DemoModeBannerProps {
  mode: 'demo' | 'real'
  simulatedRatio: number
}

export default function DemoModeBanner({ mode, simulatedRatio }: DemoModeBannerProps) {
  if (mode === 'real' && simulatedRatio < 0.3) return null

  const isDemo = mode === 'demo'
  const pct = Math.round(simulatedRatio * 100)

  return (
    <div className={`mx-4 mt-3 rounded-lg border px-4 py-2.5 flex items-center gap-3 ${
      isDemo
        ? 'bg-[#ffaa00]/5 border-[#ffaa00]/20'
        : 'bg-[#ff3366]/5 border-[#ff3366]/20'
    }`}>
      <AlertTriangle className={`w-4 h-4 shrink-0 ${isDemo ? 'text-[#ffaa00]' : 'text-[#ff3366]'}`} />
      <div className="flex-1 min-w-0">
        <div className={`text-xs font-semibold ${isDemo ? 'text-[#ffaa00]' : 'text-[#ff3366]'}`}>
          {isDemo ? 'DEMO MODE — Insufficient Real Data' : `Mixed Data — ${pct}% Simulated`}
        </div>
        <div className="text-[10px] text-gray-400 mt-0.5">
          {isDemo
            ? 'Metrics below are simulated for demonstration. Import LatencyMon / PresentMon data or connect a Windows Agent for real diagnostics.'
            : `${pct}% of metrics are simulated. Score and findings may not reflect actual system performance.`
          }
        </div>
      </div>
      <Eye className="w-3.5 h-3.5 text-gray-500 shrink-0" />
    </div>
  )
}