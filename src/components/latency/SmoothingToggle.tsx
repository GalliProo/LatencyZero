'use client'
import { Waves } from 'lucide-react'

interface SmoothingToggleProps {
  enabled: boolean
  onToggle: () => void
}

export default function SmoothingToggle({ enabled, onToggle }: SmoothingToggleProps) {
  return (
    <button
      onClick={onToggle}
      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-medium transition-all ${
        enabled
          ? 'bg-[#a855f7]/10 text-[#a855f7] border border-[#a855f7]/30 hover:bg-[#a855f7]/15'
          : 'text-gray-600 hover:text-gray-400 hover:bg-[#1a1a2e] border border-transparent'
      }`}
      title={enabled ? 'EMA Smoothing: ON' : 'EMA Smoothing: OFF'}
    >
      <Waves className="w-3 h-3" />
      <span className="hidden sm:inline">EMA</span>
      {enabled && <span className="w-1.5 h-1.5 rounded-full bg-[#a855f7]" />}
    </button>
  )
}