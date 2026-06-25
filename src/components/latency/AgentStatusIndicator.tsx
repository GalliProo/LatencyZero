'use client'

import { Wifi, WifiOff, Clock } from 'lucide-react'
import type { AgentStatus } from '@/hooks/useAgentData'

interface AgentStatusIndicatorProps {
  status: AgentStatus
}

function formatUptime(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  return `${h}h ${m}m`
}

export default function AgentStatusIndicator({ status }: AgentStatusIndicatorProps) {
  const { agentConnected, lastHeartbeat, version, uptime } = status

  // Stale check: no heartbeat for >30s
  const isStale = agentConnected && lastHeartbeat && (Date.now() - lastHeartbeat > 30000)

  let dotColor: string
  let label: string
  let bgClass: string
  let borderClass: string

  if (!agentConnected) {
    dotColor = 'bg-gray-500'
    label = 'NO AGENT'
    bgClass = 'bg-gray-500/5'
    borderClass = 'border-gray-500/20'
  } else if (isStale) {
    dotColor = 'bg-[#ffaa00]'
    label = 'AGENT STALE'
    bgClass = 'bg-[#ffaa00]/5'
    borderClass = 'border-[#ffaa00]/20'
  } else {
    dotColor = 'bg-[#00ff88]'
    label = 'AGENT CONNECTED'
    bgClass = 'bg-[#00ff88]/5'
    borderClass = 'border-[#00ff88]/20'
  }

  return (
    <div className={`flex items-center gap-2 px-2.5 py-1 rounded border text-[9px] font-mono ${bgClass} ${borderClass}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${dotColor} ${agentConnected && !isStale ? 'animate-pulse' : ''}`} />
      <span className={
        !agentConnected ? 'text-gray-500' :
        isStale ? 'text-[#ffaa00]' :
        'text-[#00ff88]'
      }>
        {label}
      </span>
      {version && agentConnected && !isStale && (
        <span className="text-gray-600">v{version}</span>
      )}
      {uptime != null && agentConnected && !isStale && (
        <span className="text-gray-600 flex items-center gap-0.5">
          <Clock className="w-2.5 h-2.5" />
          {formatUptime(uptime)}
        </span>
      )}
    </div>
  )
}