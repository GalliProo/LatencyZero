'use client'

import { measuredSource, simulatedSource, unavailableSource, type DataSource, type DataSourceInfo } from '@/lib/types'

const config: Record<DataSource, { label: string; color: string; bg: string; border: string; description: string }> = {
  measured: { label: 'REAL DATA', color: 'text-[#00ff88]', bg: 'bg-[#00ff88]/10', border: 'border-[#00ff88]/30', description: 'Measured from your system' },
  imported: { label: 'IMPORTED', color: 'text-[#00f0ff]', bg: 'bg-[#00f0ff]/10', border: 'border-[#00f0ff]/30', description: 'Imported from external file' },
  estimated: { label: 'ESTIMATED', color: 'text-[#ffaa00]', bg: 'bg-[#ffaa00]/10', border: 'border-[#ffaa00]/30', description: 'Software estimate' },
  simulated: { label: 'SIMULATED', color: 'text-gray-500', bg: 'bg-gray-500/10', border: 'border-gray-500/20', description: 'Demo data — not real' },
  unavailable: { label: 'NOT AVAILABLE', color: 'text-gray-600', bg: 'bg-gray-600/5', border: 'border-gray-600/10', description: 'Data not available' },
}

interface DataSourceBadgeProps {
  source: DataSourceInfo
  size?: 'xs' | 'sm'
  showConfidence?: boolean
  showCollector?: boolean
}

export default function DataSourceBadge({ source, size = 'xs', showConfidence = false, showCollector = false }: DataSourceBadgeProps) {
  const c = config[source.source]
  const textSize = size === 'xs' ? 'text-[8px]' : 'text-[9px]'

  return (
    <span
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border font-mono font-medium ${c.bg} ${c.color} ${c.border} ${textSize}`}
      title={`${c.description}${source.collector ? ` — ${source.collector}` : ''}${source.reason ? ` — ${source.reason}` : ''}`}
    >
      <span className="w-1 h-1 rounded-full shrink-0" style={{ backgroundColor: source.source === 'measured' ? '#00ff88' : source.source === 'imported' ? '#00f0ff' : source.source === 'estimated' ? '#ffaa00' : '#4b5563' }} />
      {c.label}
      {showConfidence && source.confidence > 0 && (
        <span className="opacity-60">{Math.round(source.confidence * 100)}%</span>
      )}
      {showCollector && source.collector && (
        <span className="opacity-50 hidden sm:inline">· {source.collector}</span>
      )}
    </span>
  )
}

// Quick helper to create a badge from just a DataSource enum
export { measuredSource, simulatedSource, unavailableSource }