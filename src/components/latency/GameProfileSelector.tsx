'use client'

import { motion } from 'framer-motion'
import { Crosshair, Swords, Car, Target, Shield, Gamepad2 } from 'lucide-react'

interface GameProfile {
  id: string
  name: string
  icon: React.ReactNode
  color: string
  targetPing: number
  focus: string
}

const profiles: GameProfile[] = [
  { id: 'call_of_duty', name: 'Call of Duty', icon: <Crosshair className="w-4 h-4" />, color: '#00f0ff', targetPing: 20, focus: 'Input latency, frame pacing, network consistency, GPU utilization' },
  { id: 'warzone', name: 'Warzone', icon: <Shield className="w-4 h-4" />, color: '#ff8c00', targetPing: 30, focus: 'Large-scale map performance, memory management, network stability' },
  { id: 'valorant', name: 'Valorant', icon: <Crosshair className="w-4 h-4" />, color: '#ff3366', targetPing: 15, focus: 'Pixel-perfect aim, minimal input lag, high refresh' },
  { id: 'csgo', name: 'CS2', icon: <Target className="w-4 h-4" />, color: '#f59e0b', targetPing: 20, focus: 'Tick-rate alignment, frametime consistency, network' },
  { id: 'apex', name: 'Apex Legends', icon: <Swords className="w-4 h-4" />, color: '#a855f7', targetPing: 30, focus: 'Movement tech, TTK-based latency, engine quirks' },
  { id: 'sim_racing', name: 'Sim Racing', icon: <Car className="w-4 h-4" />, color: '#00ff88', targetPing: 50, focus: 'Wheel input, FFB latency, VRR, frametime' },
]

interface GameProfileSelectorProps {
  selected: string
  onSelect: (id: string) => void
}

export default function GameProfileSelector({ selected, onSelect }: GameProfileSelectorProps) {
  const current = profiles.find(p => p.id === selected) || profiles[0]

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Gamepad2 className="w-4 h-4 text-gray-400" />
        <span className="text-[10px] text-gray-500 uppercase tracking-widest">Game Profile</span>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {profiles.map(p => (
          <button
            key={p.id}
            onClick={() => onSelect(p.id)}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg border whitespace-nowrap transition-all shrink-0 hover-glow-ring ${
              selected === p.id
                ? `border-opacity-40 bg-opacity-5 card-inner-light`
                : 'border-[#1a1a2e] hover:border-[#2a2a3e]'
            }`}
            style={selected === p.id ? { borderColor: p.color + '66', backgroundColor: p.color + '0d' } : {}}
          >
            <span style={{ color: selected === p.id ? p.color : '#6b7280' }}>{p.icon}</span>
            <span className={`text-xs font-medium ${selected === p.id ? 'text-white' : 'text-gray-400'}`}>{p.name}</span>
          </button>
        ))}
      </div>

      <motion.div
        key={current.id}
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-[#0d0d14] rounded-lg border border-[#1a1a2e] p-3"
      >
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span style={{ color: current.color }}>{current.icon}</span>
            <span className="text-xs font-medium text-white">{current.name}</span>
          </div>
        </div>
        <div className="space-y-2.5">
          <div className="grid grid-cols-2 gap-2 text-[10px]">
            <div className="text-gray-500">FPS Target:</div>
            <div className="text-gray-400 font-mono text-[10px]">See Target Mode below</div>
            <div className="text-gray-500">Target Ping:</div>
            <div className="text-white font-mono font-medium">&lt;{current.targetPing}ms</div>
          </div>
          <div className="pt-1.5 border-t border-[#1a1a2e]">
            <div className="text-gray-500 text-[10px] mb-1">Focus:</div>
            <div className="text-[11px] text-gray-300 leading-relaxed" title={current.focus}>{current.focus}</div>
          </div>
        </div>
      </motion.div>
    </div>
  )
}