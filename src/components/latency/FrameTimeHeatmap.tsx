'use client'

import { useMemo } from 'react'
import { Activity } from 'lucide-react'
import type { FrameTimePoint } from './types'

interface FrameTimeHeatmapProps {
  data: FrameTimePoint[]
}

function getColor(ft: number): string {
  if (ft <= 8.33) return '#00ff88'     // >= 120fps - green
  if (ft <= 11.11) return '#00f0ff'   // 90-120fps - cyan
  if (ft <= 16.67) return '#a855f7'   // 60-90fps - purple
  if (ft <= 22.22) return '#ffaa00'   // 45-60fps - amber
  return '#ff3366'                     // < 45fps - red
}

function getOpacity(ft: number): number {
  if (ft <= 8.33) return 0.6
  if (ft <= 16.67) return 0.7
  if (ft <= 22.22) return 0.8
  return 1
}

export default function FrameTimeHeatmap({ data }: FrameTimeHeatmapProps) {
  const blocks = useMemo(() => {
    if (data.length < 2) return []
    const cols = 40
    const recent = data.slice(-cols * 8)
    return recent.map((p, i) => ({
      id: i,
      ft: p.frameTime,
      color: getColor(p.frameTime),
      opacity: getOpacity(p.frameTime),
      col: i % cols,
      row: Math.floor(i / cols),
    }))
  }, [data])

  const stats = useMemo(() => {
    if (data.length < 2) return null
    const fts = data.map(d => d.frameTime)
    const total = fts.length
    const green = fts.filter(f => f <= 8.33).length
    const cyan = fts.filter(f => f > 8.33 && f <= 11.11).length
    const purple = fts.filter(f => f > 11.11 && f <= 16.67).length
    const amber = fts.filter(f => f > 16.67 && f <= 22.22).length
    const red = fts.filter(f => f > 22.22).length
    return { total, green, cyan, purple, amber, red }
  }, [data])

  return (
    <div className="bg-[#0d0d14] rounded-lg border border-[#1a1a2e] p-4 deep-shadow">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-sm font-semibold text-white">Frame Time Heatmap</h3>
          <p className="text-[10px] text-gray-500 mt-0.5">Frame pacing consistency — each block = one frame</p>
        </div>
        <div className="flex items-center gap-3 text-[9px]">
          {[
            { color: '#00ff88', label: '≥120fps' },
            { color: '#00f0ff', label: '90-120' },
            { color: '#a855f7', label: '60-90' },
            { color: '#ffaa00', label: '45-60' },
            { color: '#ff3366', label: '<45' },
          ].map(l => (
            <span key={l.label} className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-sm" style={{ backgroundColor: l.color }} />
              <span className="text-gray-500">{l.label}</span>
            </span>
          ))}
        </div>
      </div>

      {/* Heatmap Grid */}
      <div className="relative bg-[#0a0a0f] rounded-lg border border-[#1a1a2e] p-1.5 overflow-hidden">
        <div
          className="grid gap-[2px]"
          style={{ gridTemplateColumns: `repeat(40, 1fr)` }}
        >
          {blocks.map(b => (
            <div
              key={b.id}
              className="aspect-square rounded-[2px] transition-opacity duration-100"
              style={{
                backgroundColor: b.color,
                opacity: b.opacity,
              }}
              title={`${b.ft.toFixed(2)}ms (${(1000 / b.ft).toFixed(0)} FPS)`}
            />
          ))}
        </div>
        {blocks.length === 0 && (
          <div className="absolute inset-0 min-h-[120px] flex flex-col items-center justify-center gap-2 empty-dot-grid">
            <Activity className="w-6 h-6 text-gray-600 opacity-30" />
            <span className="text-xs text-gray-600">Collecting frame data...</span>
          </div>
        )}
      </div>

      {/* Distribution bar */}
      {stats && (
        <div className="mt-3">
          <div className="flex h-2 rounded-full overflow-hidden bg-[#0a0a0f]">
            {stats.green > 0 && (
              <div className="h-full bg-[#00ff88]" style={{ width: `${(stats.green / stats.total) * 100}%` }} />
            )}
            {stats.cyan > 0 && (
              <div className="h-full bg-[#00f0ff]" style={{ width: `${(stats.cyan / stats.total) * 100}%` }} />
            )}
            {stats.purple > 0 && (
              <div className="h-full bg-[#a855f7]" style={{ width: `${(stats.purple / stats.total) * 100}%` }} />
            )}
            {stats.amber > 0 && (
              <div className="h-full bg-[#ffaa00]" style={{ width: `${(stats.amber / stats.total) * 100}%` }} />
            )}
            {stats.red > 0 && (
              <div className="h-full bg-[#ff3366]" style={{ width: `${(stats.red / stats.total) * 100}%` }} />
            )}
          </div>
          <div className="flex justify-between mt-1.5 text-[9px] text-gray-500 font-mono">
            <span>{((stats.green + stats.cyan) / stats.total * 100).toFixed(1)}% on-target</span>
            <span>{stats.total} frames</span>
          </div>
        </div>
      )}
    </div>
  )
}