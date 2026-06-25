'use client'

import { useState, useMemo } from 'react'
import { motion } from 'framer-motion'
import { Crosshair, Gauge, Baseline, Infinity, ChevronDown } from 'lucide-react'
import type { FPSTargetMode, FPSTargetConfig, FPSTargetResult } from '@/lib/types'

interface FPSTargetSelectorProps {
  config: FPSTargetConfig
  onChange: (config: FPSTargetConfig) => void
  measuredData?: {
    avgFps?: number
    onePercentLow?: number
    pointOnePercentLow?: number
    frameTimeP99?: number
    frameTimeP95?: number
    frameTimeAvg?: number
  }
  dataSource: 'measured' | 'estimated' | 'simulated'
}

const modes: { id: FPSTargetMode; label: string; icon: React.ReactNode; description: string }[] = [
  { id: 'auto', label: 'Auto', icon: <Gauge className="w-3.5 h-3.5" />, description: 'Detect monitor refresh rate and recommend cap' },
  { id: 'manual', label: 'Manual', icon: <Crosshair className="w-3.5 h-3.5" />, description: 'Set your own FPS target' },
  { id: 'baseline', label: 'Baseline', icon: <Baseline className="w-3.5 h-3.5" />, description: 'Judge stability vs. your PC baseline, no fixed target' },
  { id: 'uncapped', label: 'Uncapped', icon: <Infinity className="w-3.5 h-3.5" />, description: 'No target — judge frametime, GPU saturation, stability' },
]

const manualPresets = [120, 144, 165, 200, 237, 240, 300]

// Auto: refresh rate → recommended FPS cap (typically refresh - 3)
function autoRecommend(refreshHz: number): number {
  return Math.max(60, refreshHz - 3)
}

export function calculateFPSTarget(config: FPSTargetConfig, measuredData?: FPSTargetSelectorProps['measuredData']): FPSTargetResult {
  switch (config.mode) {
    case 'auto': {
      const refresh = config.displayRefreshHz || 144
      const recommended = config.recommendedFpsCap || autoRecommend(refresh)
      const budget = +(1000 / recommended).toFixed(3)
      const measuredAvg = measuredData?.avgFps
      let judgement: string
      if (measuredAvg) {
        if (measuredAvg >= recommended * 0.95) {
          judgement = `Stable at ${Math.round(measuredAvg)} avg FPS, within ${recommended} FPS cap for ${refresh}Hz display.`
        } else {
          judgement = `Measured ${Math.round(measuredAvg)} avg FPS, below recommended ${recommended} cap for ${refresh}Hz display. May indicate GPU/CPU bottleneck.`
        }
      } else {
        judgement = `No measured FPS data yet. Recommended cap: ${recommended} FPS (${budget}ms budget) for ${refresh}Hz display.`
      }
      return {
        config,
        targetFps: recommended,
        frameBudgetMs: budget,
        judgement,
        dataSource: config.displayRefreshHz ? 'measured' : 'estimated',
      }
    }
    case 'manual': {
      const target = config.manualFps || 144
      const budget = +(1000 / target).toFixed(3)
      const measuredAvg = measuredData?.avgFps
      let judgement: string
      if (measuredAvg) {
        if (measuredAvg >= target * 0.95) {
          judgement = `Meeting manual target: ${Math.round(measuredAvg)} avg FPS vs ${target} FPS target.`
        } else {
          judgement = `Below manual target: ${Math.round(measuredAvg)} avg FPS vs ${target} FPS target. Investigate bottleneck.`
        }
      } else {
        judgement = `Manual target: ${target} FPS (${budget}ms budget). No measured data yet.`
      }
      return {
        config,
        targetFps: target,
        frameBudgetMs: budget,
        judgement,
        dataSource: 'measured',
      }
    }
    case 'baseline': {
      const avg = measuredData?.avgFps
      const low1 = measuredData?.onePercentLow
      const p99 = measuredData?.frameTimeP99
      if (avg && low1) {
        const stability = low1 / avg
        let judgement: string
        if (stability > 0.85) {
          judgement = `Baseline: ${Math.round(avg)} FPS avg, ${Math.round(low1)} FPS 1% low. Frame pacing stable relative to baseline.`
        } else if (stability > 0.65) {
          judgement = `Baseline: ${Math.round(avg)} FPS avg, ${Math.round(low1)} FPS 1% low. 1% low is ${Math.round((1 - stability) * 100)}% below average — moderate instability.`
        } else {
          judgement = `Baseline: ${Math.round(avg)} FPS avg, ${Math.round(low1)} FPS 1% low. Frame pacing unstable compared to session baseline.`
        }
        if (p99) judgement += ` Frame time P99: ${p99.toFixed(1)}ms.`
        return { config, targetFps: null, frameBudgetMs: null, judgement, dataSource: 'measured' }
      }
      return {
        config, targetFps: null, frameBudgetMs: null,
        judgement: 'Baseline mode active. Collecting session data to establish baseline...',
        dataSource: 'measured',
      }
    }
    case 'uncapped': {
      const avg = measuredData?.avgFps
      const p99 = measuredData?.frameTimeP99
      let judgement = 'Uncapped mode. No FPS target — evaluating frametime consistency and GPU saturation.'
      if (p99) judgement += ` P99 frametime: ${p99.toFixed(1)}ms.`
      if (avg) judgement += ` Avg FPS: ${Math.round(avg)}.`
      return { config, targetFps: null, frameBudgetMs: null, judgement, dataSource: avg ? 'measured' : 'estimated' }
    }
  }
}

export default function FPSTargetSelector({ config, onChange, measuredData, dataSource }: FPSTargetSelectorProps) {
  const [showModePicker, setShowModePicker] = useState(false)

  const result = useMemo(() => calculateFPSTarget(config, measuredData), [config, measuredData])

  const currentMode = modes.find(m => m.id === config.mode)!

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Gauge className="w-4 h-4 text-gray-400" />
        <span className="text-[10px] text-gray-500 uppercase tracking-widest">FPS Target Mode</span>
      </div>

      {/* Mode selector buttons */}
      <div className="flex gap-1.5">
        {modes.map(m => (
          <button
            key={m.id}
            onClick={() => onChange({ ...config, mode: m.id })}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[10px] font-medium transition-all ${
              config.mode === m.id
                ? 'border-[#00f0ff]/40 bg-[#00f0ff]/10 text-[#00f0ff]'
                : 'border-[#1a1a2e] text-gray-400 hover:border-[#2a2a3e] hover:text-gray-300'
            }`}
            title={m.description}
          >
            {m.icon}
            {m.label}
          </button>
        ))}
      </div>

      {/* Mode-specific controls */}
      <motion.div
        key={config.mode}
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-[#0d0d14] rounded-lg border border-[#1a1a2e] p-3 space-y-2"
      >
        {/* Auto mode */}
        {config.mode === 'auto' && (
          <>
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-gray-400">Monitor Refresh Rate</span>
              <div className="flex items-center gap-1">
                {[60, 144, 165, 240, 360].map(hz => (
                  <button
                    key={hz}
                    onClick={() => {
                      const rec = autoRecommend(hz)
                      onChange({ ...config, displayRefreshHz: hz, recommendedFpsCap: rec })
                    }}
                    className={`px-2 py-0.5 rounded text-[10px] font-mono transition-colors ${
                      config.displayRefreshHz === hz
                        ? 'bg-[#00f0ff]/20 text-[#00f0ff] border border-[#00f0ff]/30'
                        : 'text-gray-500 hover:text-gray-300 border border-transparent'
                    }`}
                  >
                    {hz}
                  </button>
                ))}
                <span className="text-[9px] text-gray-600">Hz</span>
              </div>
            </div>
            {config.displayRefreshHz && (
              <div className="grid grid-cols-2 gap-2 text-[10px]">
                <div className="text-gray-500">Recommended Cap:</div>
                <div className="text-white font-mono font-medium">{config.recommendedFpsCap || autoRecommend(config.displayRefreshHz)} FPS</div>
                <div className="text-gray-500">Frame Budget:</div>
                <div className="text-white font-mono font-medium">{(1000 / (config.recommendedFpsCap || autoRecommend(config.displayRefreshHz))).toFixed(2)}ms</div>
              </div>
            )}
            <div className="text-[9px] text-gray-600">
              Auto-detects from monitor. Cap = refresh - 3 to avoid tearing.
            </div>
          </>
        )}

        {/* Manual mode */}
        {config.mode === 'manual' && (
          <>
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-gray-400">Target FPS</span>
              <div className="flex items-center gap-1">
                {manualPresets.map(fps => (
                  <button
                    key={fps}
                    onClick={() => onChange({ ...config, manualFps: fps })}
                    className={`px-2 py-0.5 rounded text-[10px] font-mono transition-colors ${
                      config.manualFps === fps
                        ? 'bg-[#00f0ff]/20 text-[#00f0ff] border border-[#00f0ff]/30'
                        : 'text-gray-500 hover:text-gray-300 border border-transparent'
                    }`}
                  >
                    {fps}
                  </button>
                ))}
              </div>
            </div>
            {config.manualFps && (
              <div className="grid grid-cols-2 gap-2 text-[10px]">
                <div className="text-gray-500">Target FPS:</div>
                <div className="text-white font-mono font-medium">{config.manualFps} FPS</div>
                <div className="text-gray-500">Frame Budget:</div>
                <div className="text-white font-mono font-medium">{(1000 / config.manualFps).toFixed(2)}ms</div>
              </div>
            )}
          </>
        )}

        {/* Baseline mode */}
        {config.mode === 'baseline' && (
          <div className="text-[10px] text-gray-400 leading-relaxed">
            No fixed FPS target. The system builds a baseline from your session data and judges stability relative to your PC's actual performance.
          </div>
        )}

        {/* Uncapped mode */}
        {config.mode === 'uncapped' && (
          <div className="text-[10px] text-gray-400 leading-relaxed">
            No FPS target. The system evaluates frametime consistency, GPU saturation, and overall stability without comparing against any fixed number.
          </div>
        )}

        {/* Result / Judgement */}
        <div className="pt-2 border-t border-[#1a1a2e]">
          <div className="text-[9px] text-gray-500 uppercase mb-1">Assessment</div>
          <div className="text-[11px] text-gray-300 leading-relaxed">{result.judgement}</div>
          <div className="text-[9px] text-gray-600 mt-1">
            Data source: {result.dataSource} · 
            {result.targetFps ? ` Target: ${result.targetFps} FPS (${result.frameBudgetMs}ms budget)` : ' No fixed target'}
          </div>
        </div>
      </motion.div>
    </div>
  )
}