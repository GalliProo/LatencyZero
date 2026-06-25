'use client'
import { Volume2, VolumeX } from 'lucide-react'

interface SoundAlertToggleProps {
  enabled: boolean
  onToggle: () => void
}

export default function SoundAlertToggle({ enabled, onToggle }: SoundAlertToggleProps) {
  return (
    <button
      onClick={onToggle}
      className={`p-1.5 rounded-lg transition-all ${
        enabled
          ? 'text-[#ffaa00] bg-[#ffaa00]/10'
          : 'text-gray-600 hover:text-gray-400 hover:bg-[#1a1a2e]'
      }`}
      title={enabled ? 'Sound Alerts: ON' : 'Sound Alerts: OFF'}
    >
      {enabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
    </button>
  )
}