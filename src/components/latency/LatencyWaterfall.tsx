'use client'

import { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { GitBranch, Target, Clock, ArrowRight, Monitor, AlertTriangle } from 'lucide-react'
import type { MetricsData } from './types'

interface LatencyWaterfallProps {
  metrics: MetricsData | null
}

interface WaterfallStage {
  name: string
  ms: number
  color: string
  colorDark: string
  category: 'cpu' | 'gpu' | 'display' | 'network'
  shortLabel: string
}

function deriveStages(metrics: MetricsData): WaterfallStage[] {
  const ft = metrics.frameTime.current

  // Render pipeline stages (1-7): distribute frameTime across spec ratios
  const renderSpecTotal = 5.2 // 0.2+1.5+0.3+0.1+2.8+0.3
  const renderScale = ft / renderSpecTotal

  // Display scanout varies — use timestamp to simulate position in refresh cycle
  const refreshRate = metrics.fps.avg || 60
  const frameBudget = 1000 / refreshRate
  const cyclePos = (metrics.timestamp % frameBudget) / frameBudget
  const scanoutMs = cyclePos * frameBudget * 0.85

  // Network stages (8-10): distribute ping across spec ratios
  const ping = metrics.network.ping
  const netSpecTotal = 2.0 // 0.5+1.0+0.5
  const netScale = ping / netSpecTotal

  return [
    {
      name: 'Input Processing',
      ms: Math.max(0.05, 0.2 * renderScale),
      color: '#00f0ff',
      colorDark: '#00b8c5',
      category: 'cpu',
      shortLabel: 'Input',
    },
    {
      name: 'Game Engine Sim',
      ms: Math.max(0.1, 1.5 * renderScale),
      color: '#00d4e6',
      colorDark: '#009ba8',
      category: 'cpu',
      shortLabel: 'Engine',
    },
    {
      name: 'Render Submit',
      ms: Math.max(0.05, 0.3 * renderScale),
      color: '#a855f7',
      colorDark: '#8b3fd4',
      category: 'gpu',
      shortLabel: 'Submit',
    },
    {
      name: 'CPU→GPU Transfer',
      ms: Math.max(0.02, 0.1 * renderScale),
      color: '#9333ea',
      colorDark: '#7a25c0',
      category: 'gpu',
      shortLabel: 'Xfer',
    },
    {
      name: 'GPU Render',
      ms: Math.max(0.1, 2.8 * renderScale),
      color: '#7c3aed',
      colorDark: '#6025c0',
      category: 'gpu',
      shortLabel: 'GPU',
    },
    {
      name: 'GPU→Display',
      ms: Math.max(0.05, 0.3 * renderScale),
      color: '#ffaa00',
      colorDark: '#cc8800',
      category: 'display',
      shortLabel: 'Disp',
    },
    {
      name: 'Display Scanout',
      ms: Math.max(0.05, scanoutMs),
      color: '#e6930a',
      colorDark: '#b87508',
      category: 'display',
      shortLabel: 'Scan',
    },
    {
      name: 'Network Server',
      ms: Math.max(0.05, 0.5 * netScale),
      color: '#00ff88',
      colorDark: '#00cc6a',
      category: 'network',
      shortLabel: 'Net↑',
    },
    {
      name: 'Server Processing',
      ms: Math.max(0.1, 1.0 * netScale),
      color: '#00e67a',
      colorDark: '#00b862',
      category: 'network',
      shortLabel: 'Srv',
    },
    {
      name: 'Network Return',
      ms: Math.max(0.05, 0.5 * netScale),
      color: '#00cc6a',
      colorDark: '#009952',
      category: 'network',
      shortLabel: 'Net↓',
    },
  ]
}

export default function LatencyWaterfall({ metrics }: LatencyWaterfallProps) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null)

  const {
    stages,
    timeScale,
    totalRenderMs,
    totalRoundTripMs,
    targetMs,
    targetPct,
    renderPct,
    framesBehind,
    isOverTarget,
  } = useMemo(() => {
    if (!metrics) {
      return {
        stages: [] as WaterfallStage[],
        timeScale: 20,
        totalRenderMs: 0,
        totalRoundTripMs: 0,
        targetMs: 16.67,
        targetPct: 0,
        renderPct: 0,
        framesBehind: 0,
        isOverTarget: false,
      }
    }

    const s = deriveStages(metrics)
    const renderMs = s.slice(0, 7).reduce((sum, st) => sum + st.ms, 0)
    const roundTripMs = s.reduce((sum, st) => sum + st.ms, 0)
    const refreshRate = metrics.fps.avg || 60
    const target = 1000 / refreshRate
    const scale = Math.max(roundTripMs * 1.08, target * 1.3, 12)
    const overTarget = roundTripMs > target

    return {
      stages: s,
      timeScale: scale,
      totalRenderMs: renderMs,
      totalRoundTripMs: roundTripMs,
      targetMs: target,
      targetPct: (target / scale) * 100,
      renderPct: (renderMs / scale) * 100,
      framesBehind: roundTripMs / target,
      isOverTarget: overTarget,
    }
  }, [metrics])

  const gapPx = 1
  const totalGaps = (stages.length - 1) * gapPx
  const usableWidthPct = 100 - (totalGaps / 400)

  const barPositions = useMemo(() => {
    return stages.reduce<Array<WaterfallStage & { leftMs: number; widthPct: number }>>((acc, stage) => {
      const leftMs = acc.length > 0 ? acc[acc.length - 1].leftMs + stages[acc.length - 1].ms : 0
      const widthPct = (stage.ms / timeScale) * usableWidthPct
      return [...acc, { ...stage, leftMs, widthPct }]
    }, [])
  }, [stages, timeScale, usableWidthPct])

  const timeMarkers = useMemo(() => {
    const markers: number[] = []
    const step = timeScale <= 15 ? 2 : timeScale <= 30 ? 5 : 10
    for (let t = 0; t <= timeScale; t += step) {
      markers.push(t)
    }
    return markers
  }, [timeScale])

  if (!metrics) {
    return (
      <div className="bg-[#0d0d14] rounded-xl border border-[#1a1a2e] p-4 deep-shadow card-hover-border">
        <div className="flex items-center gap-2 mb-3">
          <GitBranch className="w-4 h-4 text-[#00f0ff]" />
          <h3 className="text-sm font-semibold text-white section-title-deco">End-to-End Latency Waterfall</h3>
        </div>
        <div className="h-16 bg-[#0a0a0f] rounded-lg border border-[#1a1a2e] flex items-center justify-center">
          <span className="text-xs text-gray-500">Awaiting metrics data...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-[#0d0d14] rounded-xl border border-[#1a1a2e] p-4 deep-shadow card-hover-border">
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <GitBranch className="w-4 h-4 text-[#00f0ff]" />
        <h3 className="text-sm font-semibold text-white section-title-deco">
          End-to-End Latency Waterfall
        </h3>
      </div>

      {/* Category labels row */}
      <div className="flex items-center gap-4 mb-2 text-[9px] uppercase tracking-wider">
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-sm" style={{ backgroundColor: '#00f0ff' }} />
          <span className="text-gray-400">CPU</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-sm" style={{ backgroundColor: '#a855f7' }} />
          <span className="text-gray-400">GPU</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-sm" style={{ backgroundColor: '#ffaa00' }} />
          <span className="text-gray-400">Display</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-sm" style={{ backgroundColor: '#00ff88' }} />
          <span className="text-gray-400">Network</span>
        </span>
        {isOverTarget && (
          <span className="flex items-center gap-1 ml-auto text-[#ff3366]">
            <AlertTriangle className="w-3 h-3" />
            <span className="font-medium">Exceeds frame budget</span>
          </span>
        )}
      </div>

      {/* Waterfall Chart */}
      <div
        className="relative h-16 bg-[#0a0a0f] rounded-lg border border-[#1a1a2e] overflow-hidden"
        onMouseLeave={() => setHoveredIdx(null)}
      >
        {/* Render pipeline background tint */}
        <motion.div
          className="absolute top-0 left-0 h-full bg-[#00f0ff]/[0.02] rounded-l-lg"
          initial={{ width: 0 }}
          animate={{ width: `${renderPct}%` }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
        />

        {/* Target line */}
        <motion.div
          className="absolute top-0 h-full z-10"
          style={{ left: `${targetPct}%` }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.2, duration: 0.3 }}
        >
          <div
            className="h-full border-l-2 border-dashed"
            style={{
              borderColor: isOverTarget ? '#ff3366' : '#00ff88',
              borderLeftWidth: '2px',
            }}
          />
        </motion.div>

        {/* Target label */}
        <motion.div
          className="absolute -top-0.5 z-20 flex flex-col items-center"
          style={{ left: `${targetPct}%`, transform: 'translateX(-50%)' }}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.4, duration: 0.3 }}
        >
          <div
            className="text-[8px] font-mono font-bold px-1.5 py-0.5 rounded-sm whitespace-nowrap"
            style={{
              color: isOverTarget ? '#ff3366' : '#00ff88',
              backgroundColor: isOverTarget ? 'rgba(255,51,102,0.1)' : 'rgba(0,255,136,0.1)',
              border: `1px solid ${isOverTarget ? 'rgba(255,51,102,0.3)' : 'rgba(0,255,136,0.3)'}`,
            }}
          >
            {targetMs.toFixed(1)}ms
          </div>
        </motion.div>

        {/* Waterfall Bars */}
        {barPositions.map((bar, i) => {
          const leftPct = (bar.leftMs / timeScale) * 100
          const barStartMs = bar.leftMs
          const barEndMs = bar.leftMs + bar.ms

          // Check if this bar crosses the target line
          const crossesTarget = barStartMs < targetMs && barEndMs > targetMs
          const overflowStartPct = crossesTarget
            ? ((targetMs - barStartMs) / bar.ms) * 100
            : -1
          const isFullyOverTarget = barStartMs >= targetMs

          return (
            <motion.div
              key={bar.name}
              className="absolute top-0 h-full rounded-sm cursor-pointer"
              style={{
                left: `${leftPct}%`,
                zIndex: hoveredIdx === i ? 20 : 5,
              }}
              initial={{ width: 0 }}
              animate={{ width: `${bar.widthPct}%` }}
              transition={{
                duration: 0.5,
                delay: i * 0.08,
                ease: [0.25, 0.46, 0.45, 0.94],
              }}
              onMouseEnter={() => setHoveredIdx(i)}
              whileHover={{
                filter: 'brightness(1.3)',
                transition: { duration: 0.1 },
              }}
            >
              {/* Base bar color */}
              <div
                className="absolute inset-0 rounded-sm"
                style={{
                  background: `linear-gradient(180deg, ${bar.color}dd 0%, ${bar.colorDark}cc 100%)`,
                  boxShadow: `0 0 8px ${bar.color}25, inset 0 1px 0 ${bar.color}40`,
                }}
              />

              {/* Red tint overlay for overflow past target */}
              {crossesTarget && (
                <motion.div
                  className="absolute top-0 bottom-0 right-0 rounded-r-sm"
                  style={{
                    left: `${overflowStartPct}%`,
                    background: 'linear-gradient(180deg, rgba(255,51,102,0.5) 0%, rgba(255,51,102,0.35) 100%)',
                  }}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: i * 0.08 + 0.5, duration: 0.3 }}
                />
              )}

              {/* Fully past target — full red tint */}
              {isFullyOverTarget && (
                <motion.div
                  className="absolute inset-0 rounded-sm"
                  style={{
                    background: 'linear-gradient(180deg, rgba(255,51,102,0.4) 0%, rgba(255,51,102,0.25) 100%)',
                  }}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: i * 0.08 + 0.5, duration: 0.3 }}
                />
              )}

              {/* Label inside bar (only for wide enough bars) */}
              {bar.widthPct > 7 && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-[8px] font-mono font-bold text-white/80 mix-blend-difference truncate px-1">
                    {bar.shortLabel}
                  </span>
                </div>
              )}
            </motion.div>
          )
        })}

        {/* Hover Tooltip */}
        <AnimatePresence>
          {hoveredIdx !== null && barPositions[hoveredIdx] && (
            <motion.div
              className="absolute z-30 pointer-events-none"
              style={{
                left: `${(barPositions[hoveredIdx].leftMs / timeScale) * 100 + barPositions[hoveredIdx].widthPct / 2}%`,
                bottom: '100%',
                transform: 'translateX(-50%)',
              }}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: -6 }}
              exit={{ opacity: 0, y: 4 }}
              transition={{ duration: 0.15 }}
            >
              <div className="bg-[#12121a] border border-[#2a2a3e] rounded-lg px-3 py-2 shadow-[0_0_20px_rgba(0,0,0,0.6)] whitespace-nowrap">
                <div className="flex items-center gap-2 mb-1">
                  <span
                    className="w-2 h-2 rounded-sm"
                    style={{ backgroundColor: barPositions[hoveredIdx].color, boxShadow: `0 0 6px ${barPositions[hoveredIdx].color}60` }}
                  />
                  <span className="text-[10px] font-medium" style={{ color: barPositions[hoveredIdx].color }}>
                    {barPositions[hoveredIdx].name}
                  </span>
                </div>
                <div className="text-xs font-mono text-white font-bold">
                  {barPositions[hoveredIdx].ms.toFixed(3)}ms
                </div>
                <div className="text-[9px] text-gray-500 font-mono mt-0.5">
                  {((barPositions[hoveredIdx].ms / timeScale) * 100).toFixed(1)}% of scale
                </div>
              </div>
              {/* Tooltip arrow */}
              <div className="mx-auto w-2 h-2 rotate-45 bg-[#12121a] border-r border-b border-[#2a2a3e] -mt-1" />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Time axis markers */}
      <div className="relative h-5 mt-1 ml-1">
        {timeMarkers.map((t) => {
          const pct = (t / timeScale) * 100
          return (
            <div
              key={t}
              className="absolute flex flex-col items-center"
              style={{ left: `${pct}%`, transform: 'translateX(-50%)' }}
            >
              <div className="w-px h-2 bg-[#1a1a2e]" />
              <span className="text-[9px] text-gray-500 font-mono">{t}ms</span>
            </div>
          )
        })}
      </div>

      {/* Stage labels row */}
      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-3 mb-4">
        {stages.map((stage, i) => (
          <motion.div
            key={stage.name}
            className="flex items-center gap-1.5 cursor-pointer group/label"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: i * 0.05 + 0.3 }}
            onMouseEnter={() => setHoveredIdx(i)}
            onMouseLeave={() => setHoveredIdx(null)}
          >
            <span
              className="w-2.5 h-2.5 rounded-sm flex-shrink-0 transition-all duration-150"
              style={{
                backgroundColor: stage.color,
                boxShadow: hoveredIdx === i ? `0 0 8px ${stage.color}80` : `0 0 4px ${stage.color}30`,
              }}
            />
            <span className="text-[10px] text-gray-400 group-hover/label:text-gray-200 transition-colors duration-150">
              {stage.name}
            </span>
            <span className="text-[10px] font-mono text-gray-500 group-hover/label:text-gray-300 transition-colors duration-150">
              {stage.ms.toFixed(2)}ms
            </span>
          </motion.div>
        ))}
      </div>

      {/* Pipeline visual arrows */}
      <div className="flex items-center gap-1 mb-4 text-[9px] text-gray-600">
        <span className="text-gray-400">Input</span>
        <ArrowRight className="w-3 h-3" />
        <span style={{ color: '#00f0ff' }}>CPU</span>
        <ArrowRight className="w-3 h-3" />
        <span style={{ color: '#a855f7' }}>GPU</span>
        <ArrowRight className="w-3 h-3" />
        <span style={{ color: '#ffaa00' }}>Display</span>
        <ArrowRight className="w-3 h-3" />
        <span style={{ color: '#00ff88' }}>Network</span>
        <ArrowRight className="w-3 h-3" />
        <span className="text-gray-400">Server</span>
        <ArrowRight className="w-3 h-3" />
        <span style={{ color: '#00ff88' }}>Network</span>
        <ArrowRight className="w-3 h-3" />
        <span className="text-gray-400">Return</span>
      </div>

      {/* Divider */}
      <div className="h-px bg-gradient-to-r from-transparent via-[#1a1a2e] to-transparent mb-4" />

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {/* Total Render Latency */}
        <motion.div
          className="bg-[#12121a] rounded-lg border border-[#1a1a2e] p-3"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
        >
          <div className="flex items-center gap-1.5 mb-2">
            <Monitor className="w-3.5 h-3.5 text-[#a855f7]" />
            <span className="text-[9px] text-gray-500 uppercase tracking-wider font-medium">
              Total Render Latency
            </span>
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-xl font-mono font-extrabold text-white">
              {totalRenderMs.toFixed(2)}
            </span>
            <span className="text-xs text-gray-500">ms</span>
          </div>
          <div className="text-[9px] text-gray-500 mt-1">
            Stages 1–7: Input → Display Scanout
          </div>
          <div className="mt-2 h-1.5 bg-[#0a0a0f] rounded-full overflow-hidden">
            <motion.div
              className="h-full rounded-full"
              style={{
                background: totalRenderMs > targetMs
                  ? 'linear-gradient(90deg, #a855f7, #ff3366)'
                  : 'linear-gradient(90deg, #a855f7, #00f0ff)',
                boxShadow: `0 0 8px ${totalRenderMs > targetMs ? '#ff336640' : '#a855f740'}`,
              }}
              initial={{ width: 0 }}
              animate={{ width: `${Math.min((totalRenderMs / targetMs) * 100, 100)}%` }}
              transition={{ duration: 0.6, delay: 0.7 }}
            />
          </div>
          <div className="flex justify-between mt-1 text-[8px] font-mono text-gray-600">
            <span>0ms</span>
            <span>{targetMs.toFixed(1)}ms</span>
          </div>
        </motion.div>

        {/* Total Round-Trip */}
        <motion.div
          className="bg-[#12121a] rounded-lg border border-[#1a1a2e] p-3"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
        >
          <div className="flex items-center gap-1.5 mb-2">
            <Target className="w-3.5 h-3.5 text-[#00ff88]" />
            <span className="text-[9px] text-gray-500 uppercase tracking-wider font-medium">
              Total Round-Trip
            </span>
          </div>
          <div className="flex items-baseline gap-1">
            <span
              className={`text-xl font-mono font-extrabold ${
                isOverTarget ? 'text-[#ff3366]' : 'text-white'
              }`}
              style={isOverTarget ? { textShadow: '0 0 12px rgba(255,51,102,0.4)' } : undefined}
            >
              {totalRoundTripMs.toFixed(2)}
            </span>
            <span className="text-xs text-gray-500">ms</span>
          </div>
          <div className="text-[9px] text-gray-500 mt-1">
            All stages: Input → Server → Return
          </div>
          <div className="mt-2 h-1.5 bg-[#0a0a0f] rounded-full overflow-hidden">
            <motion.div
              className="h-full rounded-full"
              style={{
                background: isOverTarget
                  ? 'linear-gradient(90deg, #00ff88, #ffaa00, #ff3366)'
                  : 'linear-gradient(90deg, #00ff88, #00f0ff)',
                boxShadow: `0 0 8px ${isOverTarget ? '#ff336640' : '#00ff8840'}`,
              }}
              initial={{ width: 0 }}
              animate={{ width: `${Math.min((totalRoundTripMs / timeScale) * 100, 100)}%` }}
              transition={{ duration: 0.6, delay: 0.8 }}
            />
          </div>
          <div className="flex justify-between mt-1 text-[8px] font-mono text-gray-600">
            <span>0ms</span>
            <span>{timeScale.toFixed(0)}ms</span>
          </div>
        </motion.div>

        {/* Frames Behind */}
        <motion.div
          className="bg-[#12121a] rounded-lg border border-[#1a1a2e] p-3"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7 }}
        >
          <div className="flex items-center gap-1.5 mb-2">
            <Clock className="w-3.5 h-3.5 text-[#ffaa00]" />
            <span className="text-[9px] text-gray-500 uppercase tracking-wider font-medium">
              Frames Behind
            </span>
          </div>
          <div className="flex items-baseline gap-1">
            <span
              className={`text-xl font-mono font-extrabold ${
                framesBehind > 2 ? 'text-[#ff3366]' : framesBehind > 1 ? 'text-[#ffaa00]' : 'text-white'
              }`}
              style={
                framesBehind > 2
                  ? { textShadow: '0 0 12px rgba(255,51,102,0.4)' }
                  : framesBehind > 1
                    ? { textShadow: '0 0 12px rgba(255,170,0,0.4)' }
                    : undefined
              }
            >
              {framesBehind.toFixed(1)}
            </span>
            <span className="text-xs text-gray-500">
              frames @ {metrics.fps.avg?.toFixed(0) || '60'}Hz
            </span>
          </div>
          <div className="text-[9px] text-gray-500 mt-1">
            {totalRoundTripMs.toFixed(1)}ms ÷ {targetMs.toFixed(1)}ms per frame
          </div>
          <div className="mt-2 flex items-center gap-1.5">
            {[1, 2, 3, 4, 5].map((f) => (
              <div
                key={f}
                className="h-4 flex-1 rounded-sm transition-all duration-300"
                style={{
                  backgroundColor:
                    framesBehind >= f
                      ? f <= 1
                        ? '#00ff8830'
                        : f <= 2
                          ? '#ffaa0030'
                          : '#ff336630'
                      : '#0a0a0f',
                  border: `1px solid ${
                    framesBehind >= f
                      ? f <= 1
                        ? '#00ff8850'
                        : f <= 2
                          ? '#ffaa0050'
                          : '#ff336650'
                      : '#1a1a2e'
                  }`,
                }}
              />
            ))}
            <span className="text-[8px] text-gray-600 ml-1">5f</span>
          </div>
        </motion.div>
      </div>
    </div>
  )
}