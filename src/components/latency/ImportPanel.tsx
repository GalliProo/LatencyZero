'use client'

import { useState, useCallback } from 'react'
import { Upload, FileText, FileSpreadsheet, CheckCircle, XCircle, Loader2, Trash2, ChevronDown } from 'lucide-react'
import type { LatencyMonData, PresentMonData } from '@/lib/types'
import DataSourceBadge from './DataSourceBadge'

interface ImportPanelProps {
  onLatencyMonImport: (data: LatencyMonData) => void
  onPresentMonImport: (data: PresentMonData) => void
  latencyMonData: LatencyMonData | null
  presentMonData: PresentMonData | null
  onClearLatencyMon: () => void
  onClearPresentMon: () => void
}

interface ImportResult {
  type: 'latencymon' | 'presentmon'
  success: boolean
  error?: string
}

export default function ImportPanel({ onLatencyMonImport, onPresentMonImport, latencyMonData, presentMonData, onClearLatencyMon, onClearPresentMon }: ImportPanelProps) {
  const [importing, setImporting] = useState<string | null>(null)
  const [results, setResults] = useState<ImportResult[]>([])

  const importFile = useCallback(async (file: File, type: 'latencymon' | 'presentmon') => {
    setImporting(type)
    const result: ImportResult = { type, success: false }

    try {
      const formData = new FormData()
      formData.append('file', file)

      const endpoint = type === 'latencymon' ? '/api/import/latencymon' : '/api/import/presentmon'
      const res = await fetch(endpoint, { method: 'POST', body: formData })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        result.error = err.error || `Server error ${res.status}`
        setResults(prev => [...prev.slice(-4), result])
        setImporting(null)
        return
      }

      const data = await res.json()

      if (!data.success) {
        result.error = data.error || 'Unknown parse error'
        setResults(prev => [...prev.slice(-4), result])
        setImporting(null)
        return
      }

      result.success = true
      if (type === 'latencymon') onLatencyMonImport(data.data)
      else onPresentMonImport(data.data)
    } catch (e) {
      result.error = e instanceof Error ? e.message : 'Import failed'
    }

    setResults(prev => [...prev.slice(-4), result])
    setImporting(null)
  }, [onLatencyMonImport, onPresentMonImport])

  const hasAnyData = latencyMonData || presentMonData

  return (
    <div className="bg-[#0d0d14] rounded-xl border border-[#1a1a2e] p-4 space-y-4">
      <div className="flex items-center gap-2">
        <Upload className="w-4 h-4 text-[#00f0ff]" />
        <h3 className="text-sm font-semibold text-white">Import Real Data</h3>
      </div>

      <div className="text-[10px] text-gray-400 leading-relaxed">
        Import diagnostic data from real Windows tools. Imported data is marked with source badges and used for serious scoring.
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* LatencyMon Import */}
        <label className={`flex flex-col items-center justify-center gap-2 p-4 rounded-lg border-2 border-dashed cursor-pointer transition-colors ${
          importing === 'latencymon' ? 'border-[#00f0ff]/40 bg-[#00f0ff]/5' :
          latencyMonData ? 'border-[#00ff88]/30 bg-[#00ff88]/5' :
          'border-[#1a1a2e] hover:border-[#2a2a3e] hover:bg-[#12121a]'
        }`}>
          <input
            type="file"
            accept=".txt"
            className="hidden"
            onChange={e => {
              const f = e.target.files?.[0]
              if (f) importFile(f, 'latencymon')
              e.target.value = ''
            }}
            disabled={importing !== null}
          />
          {importing === 'latencymon' ? (
            <Loader2 className="w-5 h-5 text-[#00f0ff] animate-spin" />
          ) : latencyMonData ? (
            <CheckCircle className="w-5 h-5 text-[#00ff88]" />
          ) : (
            <FileText className="w-5 h-5 text-gray-400" />
          )}
          <div className="text-center">
            <div className="text-[11px] font-medium text-white">LatencyMon Report</div>
            <div className="text-[9px] text-gray-500">.txt format</div>
          </div>
          {latencyMonData && (
            <div className="flex items-center gap-2 mt-1">
              <DataSourceBadge source={{ source: 'imported', collector: 'LatencyMon TXT', confidence: 0.90, lastUpdated: Date.now() }} />
              <button onClick={e => { e.preventDefault(); onClearLatencyMon() }} className="text-gray-500 hover:text-[#ff3366]">
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          )}
        </label>

        {/* PresentMon Import */}
        <label className={`flex flex-col items-center justify-center gap-2 p-4 rounded-lg border-2 border-dashed cursor-pointer transition-colors ${
          importing === 'presentmon' ? 'border-[#00f0ff]/40 bg-[#00f0ff]/5' :
          presentMonData ? 'border-[#00ff88]/30 bg-[#00ff88]/5' :
          'border-[#1a1a2e] hover:border-[#2a2a3e] hover:bg-[#12121a]'
        }`}>
          <input
            type="file"
            accept=".csv"
            className="hidden"
            onChange={e => {
              const f = e.target.files?.[0]
              if (f) importFile(f, 'presentmon')
              e.target.value = ''
            }}
            disabled={importing !== null}
          />
          {importing === 'presentmon' ? (
            <Loader2 className="w-5 h-5 text-[#00f0ff] animate-spin" />
          ) : presentMonData ? (
            <CheckCircle className="w-5 h-5 text-[#00ff88]" />
          ) : (
            <FileSpreadsheet className="w-5 h-5 text-gray-400" />
          )}
          <div className="text-center">
            <div className="text-[11px] font-medium text-white">PresentMon Capture</div>
            <div className="text-[9px] text-gray-500">.csv format</div>
          </div>
          {presentMonData && (
            <div className="flex items-center gap-2 mt-1">
              <DataSourceBadge source={{ source: 'imported', collector: 'PresentMon CSV', confidence: 0.95, lastUpdated: Date.now() }} />
              <button onClick={e => { e.preventDefault(); onClearPresentMon() }} className="text-gray-500 hover:text-[#ff3366]">
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          )}
        </label>
      </div>

      {/* Import results log */}
      {results.length > 0 && (
        <div className="space-y-1.5">
          <div className="text-[9px] text-gray-500 uppercase tracking-wider">Import Log</div>
          {results.map((r, i) => (
            <div key={i} className="flex items-start gap-2 text-[10px] p-1.5 rounded bg-[#0a0a0f]">
              {r.success ? <CheckCircle className="w-3 h-3 text-[#00ff88] shrink-0 mt-0.5" /> : <XCircle className="w-3 h-3 text-[#ff3366] shrink-0 mt-0.5" />}
              <span className={r.success ? 'text-[#00ff88]' : 'text-[#ff3366]'}>
                {r.type === 'latencymon' ? 'LatencyMon' : 'PresentMon'}: {r.success ? 'Imported successfully' : r.error}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Imported data summary */}
      {latencyMonData && (
        <div className="p-2.5 rounded-lg bg-[#0a0a0f] border border-[#00f0ff]/10 space-y-1.5">
          <div className="text-[9px] text-[#00f0ff] uppercase tracking-wider font-medium">LatencyMon Data</div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1 text-[10px]">
            <div className="text-gray-500">DPC Max:</div>
            <div className="text-white font-mono">{latencyMonData.highestDpcExecutionTime.toFixed(2)} µs <span className="text-gray-600">({latencyMonData.highestDpcDriver})</span></div>
            <div />
            <div className="text-gray-500">ISR Max:</div>
            <div className="text-white font-mono">{latencyMonData.highestIsrExecutionTime.toFixed(2)} µs <span className="text-gray-600">({latencyMonData.highestIsrDriver})</span></div>
            <div />
            <div className="text-gray-500">Hard Pagefaults:</div>
            <div className="text-white font-mono">{latencyMonData.totalHardPagefaults.toLocaleString()}</div>
            <div />
            <div className="text-gray-500">Findings:</div>
            <div className="text-white font-mono">{latencyMonData.findings.length}</div>
            <div />
          </div>
        </div>
      )}

      {presentMonData && (
        <div className="p-2.5 rounded-lg bg-[#0a0a0f] border border-[#00f0ff]/10 space-y-1.5">
          <div className="text-[9px] text-[#00f0ff] uppercase tracking-wider font-medium">PresentMon Data</div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1 text-[10px]">
            <div className="text-gray-500">Avg FPS:</div>
            <div className="text-white font-mono">{presentMonData.avgFps.toFixed(1)}</div>
            <div />
            <div className="text-gray-500">Frame Time P99:</div>
            <div className="text-white font-mono">{presentMonData.frameTimeP99.toFixed(2)} ms</div>
            <div />
            <div className="text-gray-500">1% Low:</div>
            <div className="text-white font-mono">{presentMonData.onePercentLow.toFixed(1)} FPS</div>
            <div />
            <div className="text-gray-500">0.1% Low:</div>
            <div className="text-white font-mono">{presentMonData.pointOnePercentLow.toFixed(1)} FPS</div>
            <div />
            <div className="text-gray-500">Total Frames:</div>
            <div className="text-white font-mono">{presentMonData.totalFrames.toLocaleString()}</div>
            <div />
          </div>
        </div>
      )}
    </div>
  )
}