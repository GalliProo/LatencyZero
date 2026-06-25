'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ChevronDown, Cpu, Monitor, Wifi, HardDrive, Zap, Gamepad2,
  Thermometer, Shield, Settings, ArrowUpRight
} from 'lucide-react'

interface Tip {
  id: string
  category: string
  title: string
  description: string
  impact: 'high' | 'medium' | 'low'
  difficulty: 'easy' | 'medium' | 'advanced'
  icon: React.ReactNode
}

const tips: Tip[] = [
  {
    id: '1', category: 'Display', title: 'Verify Refresh Rate Configuration',
    description: 'Ensure your monitor is running at its maximum native refresh rate. Windows may default to 60Hz even on high-refresh displays. Check Settings > Display > Advanced display. For competitive play, 240Hz+ is recommended.',
    impact: 'high', difficulty: 'easy', icon: <Monitor className="w-4 h-4" />,
  },
  {
    id: '2', category: 'Kernel', title: 'DPC Latency: Update Network Driver',
    description: 'Elevated DPC latency from ndis.sys (network driver) is a common cause of frame time spikes. Update to the latest manufacturer driver or try an older stable version. Disable network features you don\'t use (Wi-Fi if on Ethernet, IPv6 if not needed).',
    impact: 'high', difficulty: 'medium', icon: <Cpu className="w-4 h-4" />,
  },
  {
    id: '3', category: 'Power', title: 'Switch to High Performance Power Plan',
    description: 'Windows "Balanced" plan causes CPU frequency scaling that introduces variable latency. Use "High Performance" or create a custom plan with: Minimum processor state 100%, Core parking disabled, PCI Express Link State Power Management off.',
    impact: 'high', difficulty: 'easy', icon: <Zap className="w-4 h-4" />,
  },
  {
    id: '4', category: 'GPU', title: 'Test HAGS (Hardware-Accelerated GPU Scheduling)',
    description: 'HAGS can reduce CPU overhead but some games show worse frame pacing with it enabled. Run an A/B test: compare frametime 1% lows with HAGS ON vs OFF for your specific title. Do NOT assume one setting is universally better.',
    impact: 'medium', difficulty: 'medium', icon: <Settings className="w-4 h-4" />,
  },
  {
    id: '5', category: 'Network', title: 'Enable QoS / SQM on Your Router',
    description: 'Bufferbloat (latency spikes under network load) degrades competitive ping consistency. Enable SQM (Smart Queue Management) or QoS on your router. Test by running ping while saturating your connection — latency should remain stable.',
    impact: 'high', difficulty: 'advanced', icon: <Wifi className="w-4 h-4" />,
  },
  {
    id: '6', category: 'Input', title: 'Controller: Use Wired USB Connection',
    description: 'Wireless controller input (Bluetooth/2.4GHz dongle) adds variable latency and polling jitter. For competitive play, USB wired connection provides the most consistent 1ms polling. Test your controller\'s polling regularity in the Controller Lab panel.',
    impact: 'medium', difficulty: 'easy', icon: <Gamepad2 className="w-4 h-4" />,
  },
  {
    id: '7', category: 'Storage', title: 'Check SSD Health and Free Space',
    description: 'SSDs near capacity or showing wear indicators can cause I/O latency spikes that manifest as game stutter. Keep at least 20% free space. Check health with Get-PhysicalDisk | Get-StorageReliabilityCounter in PowerShell.',
    impact: 'medium', difficulty: 'easy', icon: <HardDrive className="w-4 h-4" />,
  },
  {
    id: '8', category: 'Thermal', title: 'Monitor for Thermal Throttling',
    description: 'CPU/GPU temperatures above 85°C trigger thermal throttling, causing clock reductions and frame time instability. Ensure proper case airflow, repaste if needed, and consider undervolting. NVML/nvidia-smi can show throttle reasons in real-time.',
    impact: 'high', difficulty: 'medium', icon: <Thermometer className="w-4 h-4" />,
  },
  {
    id: '9', category: 'Security', title: 'Evaluate VBS/Memory Integrity Trade-offs',
    description: 'Virtualization-Based Security and Memory Integrity (Core Isolation) add ~2-5% CPU overhead and can affect frametime consistency. For tournament PCs, some pros disable these. This is a security vs. performance tradeoff — never recommended automatically.',
    impact: 'low', difficulty: 'advanced', icon: <Shield className="w-4 h-4" />,
  },
  {
    id: '10', category: 'Display', title: 'Enable VRR (Variable Refresh Rate)',
    description: 'VRR (G-Sync/FreeSync) eliminates screen tearing without the input lag of V-Sync. Ensure it\'s enabled in both monitor settings and Windows display settings. Combined with fullscreen or borderless with windowed optimizations, this provides the best latency/quality balance.',
    impact: 'medium', difficulty: 'easy', icon: <Monitor className="w-4 h-4" />,
  },
]

const impactConfig = {
  high: { label: 'HIGH', color: 'text-[#ff3366]', bg: 'bg-[#ff3366]/10', border: 'border-[#ff3366]/20' },
  medium: { label: 'MED', color: 'text-[#ffaa00]', bg: 'bg-[#ffaa00]/10', border: 'border-[#ffaa00]/20' },
  low: { label: 'LOW', color: 'text-[#00ff88]', bg: 'bg-[#00ff88]/10', border: 'border-[#00ff88]/20' },
}

const difficultyConfig = {
  easy: { label: 'EASY', color: 'text-[#00f0ff]' },
  medium: { label: 'MEDIUM', color: 'text-[#ffaa00]' },
  advanced: { label: 'ADVANCED', color: 'text-[#ff3366]' },
}

export default function OptimizationTips() {
  const [expanded, setExpanded] = useState<string | null>(null)
  const [filter, setFilter] = useState<'all' | 'high' | 'medium' | 'low'>('all')

  const filtered = filter === 'all' ? tips : tips.filter(t => t.impact === filter)

  return (
    <div className="bg-[#0d0d14] rounded-lg border border-[#1a1a2e] p-4">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-white">Optimization Intelligence</h3>
          <p className="text-[10px] text-gray-500 mt-0.5">AI-analyzed suggestions based on your system diagnostics — never auto-applied</p>
        </div>
      </div>

      <div className="flex items-center gap-1.5 mb-3">
        {(['all', 'high', 'medium', 'low'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-2.5 py-1 rounded text-[10px] font-medium transition-all ${
              filter === f
                ? 'bg-[#00f0ff]/15 text-[#00f0ff] border border-[#00f0ff]/30'
                : 'text-gray-500 hover:text-gray-300 border border-transparent'
            }`}
          >
            {f === 'all' ? 'ALL' : f.toUpperCase()}
          </button>
        ))}
      </div>

      <div className="space-y-2 max-h-96 overflow-y-auto pr-1 custom-scrollbar">
        <AnimatePresence>
          {filtered.map((tip) => {
            const ic = impactConfig[tip.impact]
            const dc = difficultyConfig[tip.difficulty]
            const isOpen = expanded === tip.id

            return (
              <motion.div
                key={tip.id}
                layout
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                className={`rounded-lg border transition-colors ${isOpen ? `${ic.border} bg-[#12121a]` : 'border-[#1a1a2e] hover:border-[#2a2a3e]'}`}
              >
                <button
                  onClick={() => setExpanded(isOpen ? null : tip.id)}
                  className="w-full flex items-start gap-3 p-3 text-left"
                >
                  <div className={`${ic.bg} ${ic.color} p-1.5 rounded-md mt-0.5 shrink-0`}>
                    {tip.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[10px] text-gray-500 uppercase tracking-wider">{tip.category}</span>
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${ic.bg} ${ic.color}`}>{ic.label} IMPACT</span>
                      <span className={`text-[9px] ${dc.color}`}>{dc.label}</span>
                    </div>
                    <h4 className="text-xs font-medium text-white mt-1 leading-snug">{tip.title}</h4>
                  </div>
                  <ChevronDown className={`w-4 h-4 text-gray-500 shrink-0 transition-transform mt-1 ${isOpen ? 'rotate-180' : ''}`} />
                </button>

                <AnimatePresence>
                  {isOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <div className="px-3 pb-3 pl-14">
                        <p className="text-[11px] text-gray-400 leading-relaxed">{tip.description}</p>
                        <button className="mt-2 flex items-center gap-1 text-[10px] text-[#00f0ff] hover:text-[#00f0ff]/80 transition-colors">
                          View detailed guide <ArrowUpRight className="w-3 h-3" />
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            )
          })}
        </AnimatePresence>
      </div>
    </div>
  )
}