'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronDown, AlertTriangle, CheckCircle, XCircle, FileWarning } from 'lucide-react'
import type { DriverInfo } from './types'

interface DriverAnalysisProps {
  drivers: DriverInfo[]
}

const severityConfig = {
  good: { icon: <CheckCircle className="w-3.5 h-3.5 text-[#00ff88]" />, label: 'OK', color: 'text-[#00ff88]', bg: 'bg-[#00ff88]/15' },
  warning: { icon: <AlertTriangle className="w-3.5 h-3.5 text-[#ffaa00]" />, label: 'WARN', color: 'text-[#ffaa00]', bg: 'bg-[#ffaa00]/10' },
  critical: { icon: <XCircle className="w-3.5 h-3.5 text-[#ff3366]" />, label: 'CRIT', color: 'text-[#ff3366]', bg: 'bg-[#ff3366]/10' },
}

export default function DriverAnalysis({ drivers }: DriverAnalysisProps) {
  const [expanded, setExpanded] = useState<string | null>(null)
  const [sortField, setSortField] = useState<'dpcTime' | 'isrTime' | 'severity'>('dpcTime')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  const sorted = [...drivers].sort((a, b) => {
    const severityOrder = { critical: 3, warning: 2, good: 1 }
    let cmp = 0
    if (sortField === 'severity') {
      cmp = severityOrder[a.severity] - severityOrder[b.severity]
    } else {
      cmp = a[sortField] - b[sortField]
    }
    return sortDir === 'desc' ? -cmp : cmp
  })

  const toggleSort = (field: typeof sortField) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortField(field); setSortDir('desc') }
  }

  return (
    <div className="bg-[#0d0d14] rounded-lg border border-[#1a1a2e] p-4">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-white">Driver DPC/ISR Analysis</h3>
          <p className="text-[10px] text-gray-500 mt-0.5">Kernel module latency breakdown — DPC threshold: 100µs, ISR threshold: 25µs</p>
        </div>
        <div className="flex items-center gap-2">
          <FileWarning className="w-4 h-4 text-[#ffaa00]" />
          <span className="text-[11px] text-gray-300 font-mono bg-[#1a1a2e] px-2 py-0.5 rounded-md border border-[#2a2a3e]">{drivers.filter(d => d.severity !== 'good').length}/{drivers.length} flagged</span>
        </div>
      </div>

      <div className="overflow-x-auto min-w-0">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-gray-400 text-[11px] border-b border-[#1a1a2e]">
              <th className="text-left py-2.5 pr-2 font-medium">Driver</th>
              <th className="text-left py-2.5 pr-2 font-medium">Module</th>
              <th className="text-right py-2.5 px-2 font-medium cursor-pointer hover:text-gray-300" onClick={() => toggleSort('dpcTime')}>
                DPC Time {sortField === 'dpcTime' && <span className="text-[#00f0ff]">{sortDir === 'desc' ? '↓' : '↑'}</span>}
              </th>
              <th className="text-right py-2.5 px-2 font-medium">DPC Count</th>
              <th className="text-right py-2.5 px-2 font-medium cursor-pointer hover:text-gray-300" onClick={() => toggleSort('isrTime')}>
                ISR Time {sortField === 'isrTime' && <span className="text-[#00f0ff]">{sortDir === 'desc' ? '↓' : '↑'}</span>}
              </th>
              <th className="text-right py-2.5 px-2 font-medium">ISR Count</th>
              <th className="text-center py-2.5 pl-2 font-medium cursor-pointer hover:text-gray-300" onClick={() => toggleSort('severity')}>
                Status {sortField === 'severity' && <span className="text-[#00f0ff]">{sortDir === 'desc' ? '↓' : '↑'}</span>}
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((d) => {
              const sc = severityConfig[d.severity]
              const isExpanded = expanded === d.module
              return (
                <motion.tr
                  key={d.module}
                  className={`border-b border-[#1a1a2e]/50 cursor-pointer transition-all hover:bg-[#12121a] hover:scale-[1.01] hover:border-l-2 hover:border-l-[#00f0ff]/30 ${d.severity === 'critical' ? 'bg-[#ff3366]/5' : d.severity === 'warning' ? 'bg-[#ffaa00]/5' : ''} ${sorted.indexOf(d) % 2 === 0 ? 'bg-[#0d0d14]' : 'bg-[#0a0a12]'}`}
                  onClick={() => setExpanded(isExpanded ? null : d.module)}
                >
                  <td className="py-3 pr-2">
                    <div className="flex items-center gap-1.5">
                      <ChevronDown className={`w-3 h-3 text-gray-600 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                      <span className="text-gray-300 truncate max-w-[220px] sm:max-w-[300px]" title={d.name}>{d.name}</span>
                    </div>
                  </td>
                  <td className="py-3 pr-2 font-mono text-gray-500 text-[10px]">{d.module}</td>
                  <td className={`py-3 px-2 text-right font-mono ${d.dpcTime > 1000 ? 'text-[#ff3366]' : d.dpcTime > 500 ? 'text-[#ffaa00]' : 'text-gray-300'}`}>
                    {d.dpcTime.toFixed(1)}µs
                  </td>
                  <td className="py-3 px-2 text-right font-mono text-gray-400">{d.dpcCount}</td>
                  <td className={`py-3 px-2 text-right font-mono ${d.isrTime > 500 ? 'text-[#ff3366]' : d.isrTime > 200 ? 'text-[#ffaa00]' : 'text-gray-300'}`}>
                    {d.isrTime.toFixed(1)}µs
                  </td>
                  <td className="py-3 px-2 text-right font-mono text-gray-400">{d.isrCount}</td>
                  <td className="py-3 pl-2 text-center">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] ${sc.bg} ${sc.color}`}>
                      {sc.label}
                    </span>
                  </td>
                </motion.tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <AnimatePresence>
        {expanded && (() => {
          const d = drivers.find(dr => dr.module === expanded)
          if (!d) return null
          return (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="mt-3 p-3 bg-[#12121a] rounded-lg border border-[#1a1a2e] space-y-2">
                <div className="text-xs font-medium text-white">{d.name}</div>
                <div className="grid grid-cols-2 gap-2 text-[10px]">
                  <div className="text-gray-500">Module:</div><div className="text-gray-300 font-mono">{d.module}</div>
                  <div className="text-gray-500">DPC Time:</div><div className={`font-mono ${d.dpcTime > 100 ? 'text-[#ff3366]' : 'text-gray-300'}`}>{d.dpcTime.toFixed(2)}µs {d.dpcTime > 100 ? '(EXCEEDS 100µs)' : ''}</div>
                  <div className="text-gray-500">ISR Time:</div><div className={`font-mono ${d.isrTime > 25 ? 'text-[#ff3366]' : 'text-gray-300'}`}>{d.isrTime.toFixed(2)}µs {d.isrTime > 25 ? '(EXCEEDS 25µs)' : ''}</div>
                  <div className="text-gray-500">DPC Executions:</div><div className="text-gray-300 font-mono">{d.dpcCount}</div>
                  <div className="text-gray-500">ISR Executions:</div><div className="text-gray-300 font-mono">{d.isrCount}</div>
                </div>
                {d.severity !== 'good' && (
                  <div className="mt-2 text-[10px] text-[#ffaa00] bg-[#ffaa00]/10 rounded p-2">
                    ⚠ This driver shows elevated latency that may contribute to frame time spikes and input delay.
                    {d.dpcTime > 500 && ' Consider updating or rolling back this driver.'}
                  </div>
                )}
              </div>
            </motion.div>
          )
        })()}
      </AnimatePresence>
    </div>
  )
}