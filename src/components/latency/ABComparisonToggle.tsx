'use client'

import { GitCompare } from 'lucide-react'

interface ABComparisonToggleProps {
  enabled: boolean
  onToggle: () => void
}

export default function ABComparisonToggle({ enabled, onToggle }: ABComparisonToggleProps) {
  return (
    <button
      onClick={onToggle}
      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-medium transition-all ${
        enabled
          ? 'bg-[#00f0ff]/10 text-[#00f0ff] border border-[#00f0ff]/30 hover:bg-[#00f0ff]/15 shadow-[0_0_15px_rgba(0,240,255,0.1)]'
          : 'text-gray-600 hover:text-gray-400 hover:bg-[#1a1a2e] border border-transparent'
      }`}
      title="A/B Comparison: Overlay baseline data"
    >
      <GitCompare className="w-3.5 h-3.5" />
      <span className="hidden sm:inline">A/B</span>
      {enabled && <span className="w-1.5 h-1.5 rounded-full bg-[#00f0ff]" />}
    </button>
  )
}