'use client'

import { useState } from 'react'
import { Sliders, RotateCcw, Save } from 'lucide-react'

interface ThresholdConfig {
  dpcWarning: number
  dpcCritical: number
  isrWarning: number
  isrCritical: number
  frameTimeWarning: number
  frameTimeCritical: number
  pingWarning: number
  pingCritical: number
  gpuTempWarning: number
  gpuTempCritical: number
}

const defaultThresholds: ThresholdConfig = {
  dpcWarning: 100,
  dpcCritical: 500,
  isrWarning: 25,
  isrCritical: 100,
  frameTimeWarning: 12,
  frameTimeCritical: 20,
  pingWarning: 30,
  pingCritical: 80,
  gpuTempWarning: 75,
  gpuTempCritical: 85,
}

const gamePresets: Record<string, Partial<ThresholdConfig>> = {
  call_of_duty: { pingWarning: 20, pingCritical: 50, frameTimeWarning: 8.33, frameTimeCritical: 12 },
  warzone: { pingWarning: 30, pingCritical: 60, frameTimeWarning: 8.33, frameTimeCritical: 14 },
  valorant: { pingWarning: 25, pingCritical: 60, frameTimeWarning: 8.33, frameTimeCritical: 14 },
  cs2: { pingWarning: 20, pingCritical: 40, frameTimeWarning: 6.94, frameTimeCritical: 10 },
  apex: { pingWarning: 30, pingCritical: 80, frameTimeWarning: 8.33, frameTimeCritical: 14 },
  sim_racing: { pingWarning: 50, pingCritical: 100, frameTimeWarning: 11.11, frameTimeCritical: 16.67 },
}

interface ThresholdSettingsProps {
  gameProfile: string
}

export default function ThresholdSettings({ gameProfile }: ThresholdSettingsProps) {
  const preset = gamePresets[gameProfile] || {}
  const [thresholds, setThresholds] = useState<ThresholdConfig>({ ...defaultThresholds, ...preset })
  const [showSaved, setShowSaved] = useState(false)

  const update = (key: keyof ThresholdConfig, value: number) => {
    setThresholds(prev => ({ ...prev, [key]: value }))
  }

  const reset = () => {
    const p = gamePresets[gameProfile] || {}
    setThresholds({ ...defaultThresholds, ...p })
  }

  const save = () => {
    try {
      localStorage.setItem('lz-thresholds', JSON.stringify(thresholds))
      setShowSaved(true)
      setTimeout(() => setShowSaved(false), 2000)
    } catch {}
  }

  const fields: { group: string; items: { key: keyof ThresholdConfig; label: string; unit: string; step: number; min: number; max: number }[] }[] = [
    {
      group: 'Kernel Latency',
      items: [
        { key: 'dpcWarning', label: 'DPC Warning', unit: 'µs', step: 10, min: 50, max: 1000 },
        { key: 'dpcCritical', label: 'DPC Critical', unit: 'µs', step: 50, min: 100, max: 5000 },
        { key: 'isrWarning', label: 'ISR Warning', unit: 'µs', step: 5, min: 10, max: 200 },
        { key: 'isrCritical', label: 'ISR Critical', unit: 'µs', step: 10, min: 25, max: 1000 },
      ],
    },
    {
      group: 'Frame Timing',
      items: [
        { key: 'frameTimeWarning', label: 'Frame Time Warning', unit: 'ms', step: 0.5, min: 4, max: 33 },
        { key: 'frameTimeCritical', label: 'Frame Time Critical', unit: 'ms', step: 1, min: 8, max: 50 },
      ],
    },
    {
      group: 'Network',
      items: [
        { key: 'pingWarning', label: 'Ping Warning', unit: 'ms', step: 5, min: 10, max: 100 },
        { key: 'pingCritical', label: 'Ping Critical', unit: 'ms', step: 10, min: 30, max: 200 },
      ],
    },
    {
      group: 'Thermal',
      items: [
        { key: 'gpuTempWarning', label: 'GPU Temp Warning', unit: '°C', step: 1, min: 60, max: 90 },
        { key: 'gpuTempCritical', label: 'GPU Temp Critical', unit: '°C', step: 1, min: 75, max: 100 },
      ],
    },
  ]

  return (
    <div className="bg-[#0d0d14] rounded-lg border border-[#1a1a2e] p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sliders className="w-4 h-4 text-[#a855f7]" />
          <h3 className="text-sm font-semibold text-white">Custom Alert Thresholds</h3>
        </div>
        <div className="flex items-center gap-1.5">
          <button onClick={reset} className="flex items-center gap-1 px-2 py-1 rounded text-[10px] text-gray-400 hover:text-white hover:bg-[#1a1a2e] transition-colors" title="Reset to game profile defaults">
            <RotateCcw className="w-3 h-3" /> Reset
          </button>
          <button onClick={save} className={`flex items-center gap-1 px-2.5 py-1 rounded text-[10px] font-medium transition-all ${showSaved ? 'bg-[#00ff88]/10 text-[#00ff88] border border-[#00ff88]/30' : 'text-gray-400 hover:text-white hover:bg-[#1a1a2e]'}`}>
            <Save className="w-3 h-3" /> {showSaved ? 'Saved!' : 'Save'}
          </button>
        </div>
      </div>

      <div className="text-[10px] text-gray-500 mb-2">
        Thresholds are pre-configured for <span className="text-[#00f0ff] font-medium">{gameProfile.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}</span>. Adjust values to match your competitive standards.
      </div>

      <div className="space-y-4">
        {fields.map(group => (
          <div key={group.group}>
            <div className="text-[10px] text-gray-400 uppercase tracking-wider font-medium mb-2">{group.group}</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {group.items.map(item => (
                <div key={item.key} className="flex items-center gap-3 bg-[#12121a] rounded-lg border border-[#1a1a2e] p-2.5">
                  <div className="flex-1 min-w-0">
                    <div className="text-[10px] text-gray-400">{item.label}</div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <input
                      type="range"
                      min={item.min}
                      max={item.max}
                      step={item.step}
                      value={thresholds[item.key]}
                      onChange={e => update(item.key, parseFloat(e.target.value))}
                      className="w-20 h-1 appearance-none bg-[#1a1a2e] rounded-full cursor-pointer accent-[#a855f7]"
                    />
                    <span className="text-[11px] font-mono text-white bg-[#0a0a0f] px-2 py-0.5 rounded min-w-[60px] text-right">
                      {thresholds[item.key]}{item.unit}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Visual threshold preview */}
      <div className="mt-3 pt-3 border-t border-[#1a1a2e]">
        <div className="text-[10px] text-gray-500 uppercase tracking-wider font-medium mb-2">Threshold Map</div>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          {[
            { label: 'DPC', warn: thresholds.dpcWarning, crit: thresholds.dpcCritical, unit: 'µs', color: '#00f0ff' },
            { label: 'ISR', warn: thresholds.isrWarning, crit: thresholds.isrCritical, unit: 'µs', color: '#a855f7' },
            { label: 'Frame', warn: thresholds.frameTimeWarning, crit: thresholds.frameTimeCritical, unit: 'ms', color: '#00ff88' },
            { label: 'Ping', warn: thresholds.pingWarning, crit: thresholds.pingCritical, unit: 'ms', color: '#00f0ff' },
            { label: 'GPU°', warn: thresholds.gpuTempWarning, crit: thresholds.gpuTempCritical, unit: '°C', color: '#ffaa00' },
          ].map(m => (
            <div key={m.label} className="bg-[#0a0a0f] rounded-md p-2 text-center">
              <div className="text-[9px] text-gray-500 mb-1">{m.label}</div>
              <div className="flex flex-col gap-0.5">
                <div className="flex justify-between text-[8px]">
                  <span className="text-[#ffaa00]">WARN</span>
                  <span className="font-mono text-gray-300">{m.warn}{m.unit}</span>
                </div>
                <div className="flex justify-between text-[8px]">
                  <span className="text-[#ff3366]">CRIT</span>
                  <span className="font-mono text-gray-300">{m.crit}{m.unit}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}