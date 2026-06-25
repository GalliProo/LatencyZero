'use client'

import { Cpu, Gpu, MemoryStick, Thermometer } from 'lucide-react'
import type { MetricsData } from './types'
import type { GPUScanData, SystemScanData } from '@/lib/types'
import DataSourceBadge from '@/components/latency/DataSourceBadge'

interface HardwarePanelProps {
  metrics: MetricsData | null
  gpuData?: GPUScanData | null
  systemData?: SystemScanData | null
}

function tempColor(temp: number): string {
  if (temp < 70) return 'text-[#00ff88]'
  if (temp < 85) return 'text-[#ffaa00]'
  return 'text-[#ff3366]'
}

function tempStatus(temp: number): string {
  if (temp < 70) return 'bg-[#00ff88]'
  if (temp < 85) return 'bg-[#ffaa00]'
  return 'bg-[#ff3366]'
}

function usageColor(usage: number): string {
  if (usage < 60) return 'bg-[#00ff88]'
  if (usage < 85) return 'bg-[#ffaa00]'
  return 'bg-[#ff3366]'
}

function isRealData(data: { source: { source: string } } | null | undefined): boolean {
  if (!data) return false
  return data.source.source === 'measured' || data.source.source === 'imported'
}

export default function HardwarePanel({ metrics, gpuData, systemData }: HardwarePanelProps) {
  if (!metrics) return null
  const { cpu, gpu, ram } = metrics.hardware

  const hasRealGpu = isRealData(gpuData)
  const hasRealSystem = isRealData(systemData)
  const hasAnyReal = hasRealGpu || hasRealSystem

  // GPU temperature diagnostic explanation
  const gpuTempDiag = gpu.temp >= 85
    ? 'CRITICAL: GPU temperature above 85°C. Likely causing clock throttling and frametime instability. Improve airflow or undervolt.'
    : gpu.temp >= 80
    ? 'WARNING: GPU temperature 80–85°C. May trigger power/thermal throttling on some GPUs, causing clock reduction.'
    : gpu.temp >= 70
    ? 'Light warning: GPU temperature 70–80°C. Within safe range but monitor under sustained load.'
    : 'Good: GPU temperature below 70°C.'

  // Determine VRAM total from real data or fallback
  const vramTotal = (gpuData?.vramTotal != null && gpuData.vramTotal > 0) ? gpuData.vramTotal : 24

  return (
    <div className="bg-[#0d0d14] rounded-lg border border-[#1a1a2e] p-4 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-white mb-0.5">Hardware Monitor</h3>
          <p className="text-[10px] text-gray-500">Sensor telemetry{hasAnyReal ? '' : ' — all data is currently simulated'}</p>
        </div>
        <div className="flex items-center gap-2">
          {hasAnyReal && gpuData && <DataSourceBadge source={gpuData.source} size="sm" />}
          {hasRealSystem && systemData && <DataSourceBadge source={systemData.source} size="sm" />}
          {!hasAnyReal && (
            <span className="text-[8px] font-mono font-bold text-gray-500 bg-gray-500/10 border border-gray-500/20 px-2 py-0.5 rounded">SIMULATED</span>
          )}
        </div>
      </div>

      {/* Real GPU Name from agent scan */}
      {hasRealGpu && gpuData?.gpuName && (
        <div className="flex items-center gap-2 px-2 py-1.5 rounded bg-[#12121a] border border-[#1a1a2e]">
          <Gpu className="w-3.5 h-3.5 text-[#a855f7]" />
          <span className="text-[11px] text-white font-medium">{gpuData.gpuName}</span>
          {gpuData.driverVersion && (
            <span className="text-[9px] text-gray-500 font-mono ml-auto">Driver {gpuData.driverVersion}</span>
          )}
        </div>
      )}

      {/* Real CPU Name from system scan */}
      {hasRealSystem && systemData?.cpuName && (
        <div className="flex items-center gap-2 px-2 py-1.5 rounded bg-[#12121a] border border-[#1a1a2e]">
          <Cpu className="w-3.5 h-3.5 text-[#00f0ff]" />
          <span className="text-[11px] text-white font-medium truncate">{systemData.cpuName}</span>
          {systemData.ramTotal != null && (
            <span className="text-[9px] text-gray-500 font-mono ml-auto shrink-0">{systemData.ramTotal} GB RAM{systemData.ramSpeed ? ` @ ${systemData.ramSpeed} MHz` : ''}</span>
          )}
        </div>
      )}

      {/* CPU */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Cpu className="w-3.5 h-3.5 text-[#00f0ff]" />
            <span className="text-xs font-medium text-gray-300">CPU</span>
          </div>
          <div className="flex items-center gap-2 text-[10px] font-mono flex-wrap">
            <span className="text-gray-400">{cpu.clock} MHz</span>
            <span className="text-gray-600">·</span>
            <span className={tempColor(cpu.temp)}>{cpu.temp}°C</span>
          </div>
        </div>
        <div className="space-y-1.5">
          <div className="flex justify-between text-[10px]">
            <span className="text-gray-500">Usage</span>
            <span className="text-gray-400 font-mono">{cpu.usage}%</span>
          </div>
          <div className="h-2 bg-[#1a1a2e] rounded-full overflow-hidden">
            <div className={`h-full rounded-full transition-all duration-300 progress-shimmer ${usageColor(cpu.usage)}`} style={{ width: `${cpu.usage}%` }} />
          </div>
          <div className="flex justify-between text-[10px]">
            <span className="text-gray-500">Temperature</span>
            <span className={`font-mono ${tempColor(cpu.temp)}`}>{cpu.temp}°C</span>
          </div>
          <div className="h-2 bg-[#1a1a2e] rounded-full overflow-hidden">
            <div className={`h-full rounded-full transition-all duration-300 ${tempStatus(cpu.temp)}`} style={{ width: `${Math.min((cpu.temp / 100) * 100, 100)}%` }} />
          </div>
        </div>
      </div>

      <div className="border-t border-[#1a1a2e]" />

      {/* GPU */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Gpu className="w-3.5 h-3.5 text-[#a855f7]" />
            <span className="text-xs font-medium text-gray-300">GPU</span>
          </div>
          <div className="flex items-center gap-2 text-[10px] font-mono flex-wrap">
            <span className="text-gray-400">{gpu.clock} MHz</span>
            <span className="text-gray-600">·</span>
            <span className={tempColor(gpu.temp)}>{gpu.temp}°C</span>
            <span className="text-gray-600">·</span>
            <span className="text-gray-500">VRAM {gpu.vram} GB</span>
          </div>
        </div>
        <div className="space-y-1.5">
          <div className="flex justify-between text-[10px]">
            <span className="text-gray-500">Usage</span>
            <span className="text-gray-400 font-mono">{gpu.usage}%</span>
          </div>
          <div className="h-2 bg-[#1a1a2e] rounded-full overflow-hidden">
            <div className={`h-full rounded-full transition-all duration-300 progress-shimmer ${usageColor(gpu.usage)}`} style={{ width: `${gpu.usage}%` }} />
          </div>
          <div className="flex justify-between text-[10px]">
            <span className="text-gray-500">Temperature</span>
            <span className={`font-mono ${tempColor(gpu.temp)}`}>{gpu.temp}°C</span>
          </div>
          <div className="h-2 bg-[#1a1a2e] rounded-full overflow-hidden">
            <div className={`h-full rounded-full transition-all duration-300 ${tempStatus(gpu.temp)}`} style={{ width: `${Math.min((gpu.temp / 100) * 100, 100)}%` }} />
          </div>
          <div className="flex justify-between text-[10px]">
            <span className="text-gray-500">VRAM</span>
            <span className="text-gray-400 font-mono">{gpu.vram} GB / {vramTotal} GB</span>
          </div>
          <div className="h-2 bg-[#1a1a2e] rounded-full overflow-hidden">
            <div className="h-full rounded-full bg-gradient-to-r from-[#a855f7] to-[#c084fc] transition-all duration-300" style={{ width: `${(gpu.vram / vramTotal) * 100}%` }} />
          </div>
        </div>

        {/* Real GPU extras from agent data */}
        {hasRealGpu && gpuData && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-[10px]">
            {gpuData.gpuClock != null && (
              <div className="flex justify-between px-2">
                <span className="text-gray-500">GPU Clock (real)</span>
                <span className="text-gray-300 font-mono flex items-center gap-1.5">
                  {gpuData.gpuClock} MHz
                  <DataSourceBadge source={gpuData.source} />
                </span>
              </div>
            )}
            {gpuData.temperature != null && (
              <div className="flex justify-between px-2">
                <span className="text-gray-500">GPU Temp (real)</span>
                <span className={`font-mono flex items-center gap-1.5 ${tempColor(gpuData.temperature)}`}>
                  {gpuData.temperature}°C
                  <DataSourceBadge source={gpuData.source} />
                </span>
              </div>
            )}
            {gpuData.temperatureHotspot != null && (
              <div className="flex justify-between px-2">
                <span className="text-gray-500">Hotspot</span>
                <span className={`font-mono ${tempColor(gpuData.temperatureHotspot)}`}>{gpuData.temperatureHotspot}°C</span>
              </div>
            )}
            {gpuData.powerDraw != null && gpuData.powerLimit != null && (
              <div className="flex justify-between px-2">
                <span className="text-gray-500">Power</span>
                <span className="text-gray-300 font-mono">{gpuData.powerDraw}W / {gpuData.powerLimit}W</span>
              </div>
            )}
            {gpuData.fanSpeed != null && (
              <div className="flex justify-between px-2">
                <span className="text-gray-500">Fan</span>
                <span className="text-gray-300 font-mono">{gpuData.fanSpeed}%</span>
              </div>
            )}
            {gpuData.throttleReason && (
              <div className="flex justify-between px-2">
                <span className="text-gray-500">Throttle</span>
                <span className="text-[#ffaa00] font-mono">{gpuData.throttleReason}</span>
              </div>
            )}
            {gpuData.pcieBusInfo && (
              <div className="flex justify-between px-2">
                <span className="text-gray-500">PCIe</span>
                <span className="text-gray-300 font-mono">{gpuData.pcieBusInfo}</span>
              </div>
            )}
          </div>
        )}

        {/* GPU findings from agent scan */}
        {hasRealGpu && gpuData?.findings && gpuData.findings.length > 0 && (
          <div className="space-y-1.5">
            {gpuData.findings.map((f) => (
              <div key={f.id} className={`text-[9px] leading-relaxed px-2 py-1.5 rounded border ${
                f.severity === 'critical' ? 'bg-[#ff3366]/10 border-[#ff3366]/30 text-[#ff3366]' :
                f.severity === 'high' || f.severity === 'warning' ? 'bg-[#ffaa00]/10 border-[#ffaa00]/30 text-[#ffaa00]' :
                'bg-[#00f0ff]/5 border-[#00f0ff]/15 text-[#00f0ff]/70'
              }`}>
                <span className="font-medium">{f.title}</span>{f.recommendation ? ` — ${f.recommendation}` : ''}
              </div>
            ))}
          </div>
        )}

        {gpu.temp >= 70 && (
          <div className={`text-[9px] leading-relaxed px-2 py-1.5 rounded border ${
            gpu.temp >= 85 ? 'bg-[#ff3366]/10 border-[#ff3366]/30 text-[#ff3366]' :
            gpu.temp >= 80 ? 'bg-[#ffaa00]/10 border-[#ffaa00]/30 text-[#ffaa00]' :
            'bg-[#ffaa00]/5 border-[#ffaa00]/15 text-[#ffaa00]/70'
          }`}>
            {gpuTempDiag} {!hasRealGpu && <span className="opacity-50">(SIMULATED — connect the Windows Agent for real data)</span>}
          </div>
        )}
      </div>

      <div className="border-t border-[#1a1a2e]" />

      {/* RAM */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MemoryStick className="w-3.5 h-3.5 text-[#f59e0b]" />
            <span className="text-xs font-medium text-gray-300">RAM</span>
          </div>
          <span className="text-[10px] font-mono text-gray-400">{ram.available} GB available</span>
        </div>
        <div className="flex justify-between text-[10px]">
          <span className="text-gray-500">Usage</span>
          <span className="text-gray-400 font-mono">{ram.percent}%</span>
        </div>
        <div className="h-2 bg-[#1a1a2e] rounded-full overflow-hidden">
          <div className={`h-full rounded-full transition-all duration-300 progress-shimmer ${usageColor(ram.percent)}`} style={{ width: `${ram.percent}%` }} />
        </div>
      </div>
    </div>
  )
}