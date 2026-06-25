'use client'

import { useState, useRef, useEffect, useMemo } from 'react'
import { GitCompare, ArrowLeftRight, ChevronDown, ArrowUp, ArrowDown, Minus, Info } from 'lucide-react'

interface SessionComparisonProps {
  savedSessions: Array<Record<string, unknown>>
}

interface MetricDef {
  key: string
  label: string
  unit: string
  decimals: number
  /** true = higher is better (e.g. score, FPS), false = lower is better (e.g. DPC, ping) */
  higherIsBetter: boolean
}

const METRICS: MetricDef[] = [
  { key: 'score', label: 'Score', unit: '', decimals: 0, higherIsBetter: true },
  { key: 'avgDpc', label: 'Avg DPC', unit: 'µs', decimals: 1, higherIsBetter: false },
  { key: 'maxDpc', label: 'Max DPC', unit: 'µs', decimals: 1, higherIsBetter: false },
  { key: 'avgIsr', label: 'Avg ISR', unit: 'µs', decimals: 1, higherIsBetter: false },
  { key: 'avgFrametime', label: 'Avg Frame Time', unit: 'ms', decimals: 2, higherIsBetter: false },
  { key: 'minFps1pct', label: '1% Low FPS', unit: 'fps', decimals: 0, higherIsBetter: true },
  { key: 'avgPing', label: 'Avg Ping', unit: 'ms', decimals: 1, higherIsBetter: false },
  { key: 'packetLoss', label: 'Packet Loss', unit: '%', decimals: 2, higherIsBetter: false },
  { key: 'duration', label: 'Duration', unit: 's', decimals: 0, higherIsBetter: false },
  { key: 'samples', label: 'Samples', unit: '', decimals: 0, higherIsBetter: false },
]

function ScoreBadge({ score }: { score: number }) {
  const color = score >= 85 ? '#00ff88' : score >= 65 ? '#ffaa00' : '#ff3366'
  const bg = score >= 85 ? 'bg-[#00ff88]/10' : score >= 65 ? 'bg-[#ffaa00]/10' : 'bg-[#ff3366]/10'
  return (
    <span
      className={`inline-flex items-center justify-center min-w-[2rem] px-2 py-0.5 rounded-md text-xs font-mono font-bold border border-current/20 ${bg}`}
      style={{ color }}
    >
      {score}
    </span>
  )
}

function formatValue(value: unknown, decimals: number): string {
  if (typeof value !== 'number' || isNaN(value)) return '—'
  return value.toFixed(decimals)
}

function formatDate(isoStr: string): string {
  try {
    const d = new Date(isoStr)
    return `${d.toLocaleDateString()} ${d.toLocaleTimeString()}`
  } catch {
    return '—'
  }
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}m ${s.toString().padStart(2, '0')}s`
}

/* ── Custom Dropdown ─────────────────────────────────────────── */

function SessionDropdown({
  sessions,
  selectedIndex,
  onSelect,
  label,
}: {
  sessions: Array<Record<string, unknown>>
  selectedIndex: number | null
  onSelect: (idx: number) => void
  label: string
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const selected = selectedIndex !== null ? sessions[selectedIndex] : null
  const score = selected ? (selected.score as number) : null
  const name = selected ? ((selected.name as string) || `Session ${selectedIndex! + 1}`) : ''
  const date = selected ? formatDate(selected.createdAt as string) : ''

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  return (
    <div className="relative flex-1" ref={ref}>
      <span className="block text-[10px] text-gray-500 uppercase tracking-wider mb-1.5 font-medium">{label}</span>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2.5 bg-[#12121a] border border-[#1a1a2e] rounded-lg px-3 py-2.5 hover:border-[#2a2a3e] transition-colors text-left"
      >
        {selected ? (
          <>
            <ScoreBadge score={score!} />
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium text-white truncate">{name}</div>
              <div className="text-[10px] text-gray-500 font-mono truncate">{date}</div>
            </div>
          </>
        ) : (
          <span className="text-xs text-gray-500">Select a session…</span>
        )}
        <ChevronDown className={`w-4 h-4 text-gray-500 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute z-50 mt-1.5 w-full bg-[#12121a] border border-[#2a2a3e] rounded-lg shadow-2xl max-h-56 overflow-y-auto custom-scrollbar">
          {sessions.map((s, i) => {
            const sc = s.score as number
            const n = (s.name as string) || `Session ${i + 1}`
            const d = formatDate(s.createdAt as string)
            const active = i === selectedIndex
            return (
              <button
                key={i}
                type="button"
                onClick={() => {
                  onSelect(i)
                  setOpen(false)
                }}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-left transition-colors ${
                  active ? 'bg-[#00f0ff]/5 border-l-2 border-[#00f0ff]' : 'hover:bg-white/[0.02] border-l-2 border-transparent'
                }`}
              >
                <ScoreBadge score={sc} />
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium text-white truncate">{n}</div>
                  <div className="text-[10px] text-gray-500 font-mono truncate">{d}</div>
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

/* ── Delta Cell ──────────────────────────────────────────────── */

function DeltaIndicator({ delta, higherIsBetter }: { delta: number | null; higherIsBetter: boolean }) {
  if (delta === null || delta === 0) {
    return (
      <span className="inline-flex items-center gap-1 text-gray-500">
        <Minus className="w-3 h-3" />
        <span className="text-[10px] font-mono">0</span>
      </span>
    )
  }

  const isPositive = delta > 0
  // "improved" means the metric got better in session B relative to A
  const improved = higherIsBetter ? isPositive : !isPositive
  const color = improved ? '#00ff88' : '#ff3366'
  const Icon = isPositive ? ArrowUp : ArrowDown
  const sign = isPositive ? '+' : ''

  return (
    <span className="inline-flex items-center gap-1" style={{ color }}>
      <Icon className="w-3 h-3" />
      <span className="text-[11px] font-mono font-bold">
        {sign}{Math.abs(delta).toFixed(1)}
      </span>
    </span>
  )
}

/* ── Main Component ──────────────────────────────────────────── */

export default function SessionComparison({ savedSessions }: SessionComparisonProps) {
  const [rawA, setRawA] = useState<number | null>(0)
  const [rawB, setRawB] = useState<number | null>(savedSessions.length > 1 ? 1 : null)

  // Derive safe indices without triggering re-renders via effects
  const selectedA = useMemo(() => {
    if (savedSessions.length === 0) return null
    if (rawA === null || rawA >= savedSessions.length) return 0
    return rawA
  }, [rawA, savedSessions.length])

  const selectedB = useMemo(() => {
    if (savedSessions.length < 2) return null
    if (rawB === null || rawB >= savedSessions.length) return 0
    return rawB
  }, [rawB, savedSessions.length])

  const sessionA = selectedA !== null ? savedSessions[selectedA] : null
  const sessionB = selectedB !== null ? savedSessions[selectedB] : null
  const canCompare = sessionA && sessionB && selectedA !== selectedB

  // Overall comparison
  const scoreA = sessionA ? (sessionA.score as number) : 0
  const scoreB = sessionB ? (sessionB.score as number) : 0
  const scoreDelta = canCompare ? scoreB - scoreA : 0
  const scorePct = scoreA !== 0 ? Math.round((scoreDelta / scoreA) * 100) : 0

  // Empty state
  if (savedSessions.length < 2) {
    return (
      <div className="bg-[#0d0d14] rounded-xl border border-[#1a1a2e] p-4 deep-shadow">
        <div className="flex items-center gap-2 mb-3">
          <GitCompare className="w-4 h-4 text-[#00f0ff]" />
          <h3 className="text-sm font-semibold text-white">Session Comparison</h3>
        </div>
        <div className="relative overflow-hidden rounded-lg bg-[#12121a] border border-[#1a1a2e]">
          <div className="empty-dot-grid absolute inset-0 opacity-50" />
          <div className="relative flex flex-col items-center justify-center gap-3 py-10">
            <ArrowLeftRight className="w-8 h-8 text-gray-600 opacity-30" />
            <h4 className="text-sm font-medium text-gray-400">Not Enough Sessions</h4>
            <p className="text-[11px] text-gray-500 text-center max-w-xs leading-relaxed">
              Save at least <span className="text-[#00f0ff] font-medium">2 sessions</span> to compare performance metrics side-by-side and identify improvements.
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-[#0d0d14] rounded-xl border border-[#1a1a2e] p-4 deep-shadow">
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <GitCompare className="w-4 h-4 text-[#00f0ff]" />
        <h3 className="text-sm font-semibold text-white">Session Comparison</h3>
      </div>

      {/* Session Selectors */}
      <div className="flex items-start gap-3 mb-4">
        <SessionDropdown
          sessions={savedSessions}
          selectedIndex={selectedA}
          onSelect={setRawA}
          label="Session A (Baseline)"
        />

        <div className="flex items-center justify-center pt-5">
          <span className="bg-[#1a1a2e] rounded-full px-3 py-1.5 text-[#00f0ff] font-bold text-xs shrink-0 select-none">
            VS
          </span>
        </div>

        <SessionDropdown
          sessions={savedSessions}
          selectedIndex={selectedB}
          onSelect={setRawB}
          label="Session B (Compare)"
        />
      </div>

      {/* Same session warning */}
      {selectedA !== null && selectedB !== null && selectedA === selectedB && (
        <div className="flex items-center gap-2 mb-4 p-2.5 rounded-lg bg-[#ffaa00]/5 border border-[#ffaa00]/20">
          <Info className="w-4 h-4 text-[#ffaa00] shrink-0" />
          <span className="text-xs text-[#ffaa00]">Select two different sessions to compare.</span>
        </div>
      )}

      {/* Comparison Grid */}
      {canCompare && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
            {METRICS.map((metric) => {
              const valA = sessionA![metric.key] as number
              const valB = sessionB![metric.key] as number

              const validA = typeof valA === 'number' && !isNaN(valA)
              const validB = typeof valB === 'number' && !isNaN(valB)

              const delta = validA && validB ? valB - valA : null
              // Determine which is better
              const bIsBetter =
                delta !== null && delta !== 0
                  ? metric.higherIsBetter
                    ? delta > 0
                    : delta < 0
                  : null

              const fmtA = validA ? formatValue(valA, metric.decimals) : '—'
              const fmtB = validB ? formatValue(valB, metric.decimals) : '—'

              // Special formatting for duration
              const displayA = metric.key === 'duration' && validA ? formatDuration(valA) : fmtA
              const displayB = metric.key === 'duration' && validB ? formatDuration(valB) : fmtB

              return (
                <div
                  key={metric.key}
                  className="bg-[#12121a] rounded-lg border border-[#1a1a2e] p-3 card-hover-border transition-colors"
                >
                  {/* Metric label */}
                  <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-2.5 font-medium">
                    {metric.label}
                    {metric.unit && <span className="ml-1 text-gray-600 normal-case">({metric.unit})</span>}
                  </div>

                  {/* Values row */}
                  <div className="flex items-center justify-between gap-2">
                    {/* Session A */}
                    <div
                      className={`flex-1 text-center py-1.5 rounded-md transition-colors ${
                        bIsBetter === true ? 'bg-[#ff3366]/5' : ''
                      }`}
                    >
                      <div className="text-[9px] text-gray-600 mb-0.5">A</div>
                      <div className="text-sm font-mono font-bold text-white">{displayA}</div>
                    </div>

                    {/* Delta */}
                    <div className="shrink-0 px-2">
                      <DeltaIndicator delta={delta} higherIsBetter={metric.higherIsBetter} />
                    </div>

                    {/* Session B */}
                    <div
                      className={`flex-1 text-center py-1.5 rounded-md transition-colors ${
                        bIsBetter === true ? 'bg-[#00ff88]/5' : bIsBetter === false ? 'bg-[#ff3366]/5' : ''
                      }`}
                    >
                      <div className="text-[9px] text-gray-600 mb-0.5">B</div>
                      <div className="text-sm font-mono font-bold text-white">{displayB}</div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Summary Bar */}
          <div
            className={`rounded-lg border p-3 flex items-center justify-center gap-2 transition-colors ${
              scoreDelta > 0
                ? 'bg-[#00ff88]/5 border-[#00ff88]/20'
                : scoreDelta < 0
                ? 'bg-[#ff3366]/5 border-[#ff3366]/20'
                : 'bg-[#1a1a2e] border-[#1a1a2e]'
            }`}
          >
            {scoreDelta > 0 ? (
              <ArrowUp className="w-4 h-4 text-[#00ff88]" />
            ) : scoreDelta < 0 ? (
              <ArrowDown className="w-4 h-4 text-[#ff3366]" />
            ) : (
              <Minus className="w-4 h-4 text-gray-500" />
            )}
            <span className="text-xs text-gray-300">
              Session B is{' '}
              <span
                className="font-mono font-bold"
                style={{
                  color: scoreDelta > 0 ? '#00ff88' : scoreDelta < 0 ? '#ff3366' : '#9ca3af',
                }}
              >
                {scoreDelta === 0
                  ? 'the same as'
                  : `${Math.abs(scorePct)}% ${scoreDelta > 0 ? 'better' : 'worse'} than`}
              </span>{' '}
              Session A overall
            </span>
            <span className="text-[10px] text-gray-600 font-mono ml-1">
              ({scoreDelta > 0 ? '+' : ''}{scoreDelta} pts)
            </span>
          </div>
        </>
      )}
    </div>
  )
}