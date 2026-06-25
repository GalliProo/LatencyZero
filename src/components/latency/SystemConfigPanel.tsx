'use client'

import { useState, useMemo } from 'react'
import { motion } from 'framer-motion'
import {
  Monitor, Cpu, Wifi, Gamepad2, HardDrive, Shield, Zap, Settings,
  CheckCircle, XCircle, AlertTriangle, Info, ChevronRight, BatteryFull
} from 'lucide-react'
import type { MetricsData } from './types'
import type { SystemScanData, DisplayScanData, ControllerScanData, DataSourceInfo, RootCauseFinding } from '@/lib/types'
import DataSourceBadge from '@/components/latency/DataSourceBadge'

interface SystemConfigPanelProps {
  metrics: MetricsData | null
  systemData?: SystemScanData | null
  displayData?: DisplayScanData | null
  controllerData?: ControllerScanData | null
}

interface ConfigItem {
  label: string
  value: string
  status: 'pass' | 'fail' | 'warn' | 'info'
  icon: React.ReactNode
  category: string
  detail?: string
  source?: DataSourceInfo
}

function isRealSource(data: { source: DataSourceInfo } | null | undefined): boolean {
  if (!data) return false
  return data.source.source === 'measured' || data.source.source === 'imported'
}

function buildConfigItems(
  systemData?: SystemScanData | null,
  displayData?: DisplayScanData | null,
  controllerData?: ControllerScanData | null
): ConfigItem[] {
  const hasSystem = isRealSource(systemData)
  const hasDisplay = isRealSource(displayData)
  const hasController = isRealSource(controllerData)

  const items: ConfigItem[] = []

  // ─── Display section ──────────────────────────────────
  if (hasDisplay && displayData) {
    items.push({
      label: 'Monitor',
      value: displayData.monitorName ?? 'Unknown',
      status: 'info',
      icon: <Monitor className="w-3.5 h-3.5" />,
      category: 'Display',
      detail: displayData.activeResolution ? `Active: ${displayData.activeResolution}` : undefined,
      source: displayData.source,
    })
    items.push({
      label: 'Refresh Rate',
      value: displayData.activeRefreshHz != null
        ? `${displayData.activeRefreshHz} Hz (active)${displayData.maxRefreshHz != null ? ` / ${displayData.maxRefreshHz} Hz (max)` : ''}`
        : 'Unknown',
      status: displayData.activeRefreshHz != null && displayData.maxRefreshHz != null && displayData.activeRefreshHz >= displayData.maxRefreshHz ? 'pass' : displayData.activeRefreshHz != null ? 'warn' : 'info',
      icon: <Monitor className="w-3.5 h-3.5" />,
      category: 'Display',
      detail: displayData.activeRefreshHz != null && displayData.maxRefreshHz != null && displayData.activeRefreshHz < displayData.maxRefreshHz
        ? `Monitor running below max refresh rate. Set to ${displayData.maxRefreshHz} Hz for lowest input lag.`
        : displayData.activeRefreshHz != null ? 'Monitor running at maximum native refresh rate.' : undefined,
      source: displayData.source,
    })
    items.push({
      label: 'VRR',
      value: displayData.vrrEnabled ? `${displayData.vrrType === 'g-sync' ? 'G-Sync' : displayData.vrrType === 'freesync' ? 'FreeSync' : 'VRR'} Enabled` : 'Disabled',
      status: displayData.vrrEnabled ? 'pass' : 'warn',
      icon: <Monitor className="w-3.5 h-3.5" />,
      category: 'Display',
      detail: displayData.vrrEnabled
        ? 'Variable Refresh Rate active. Eliminates tearing without V-Sync input lag.'
        : 'VRR disabled. Consider enabling G-Sync/FreeSync to eliminate tearing without V-Sync input lag.',
      source: displayData.source,
    })
    items.push({
      label: 'HDR',
      value: displayData.hdrEnabled ? 'On' : 'Off',
      status: displayData.hdrEnabled ? 'warn' : 'info',
      icon: <Monitor className="w-3.5 h-3.5" />,
      category: 'Display',
      detail: displayData.hdrEnabled
        ? 'HDR adds processing latency. Disable for competitive play unless visually required.'
        : 'HDR off — no additional processing latency.',
      source: displayData.source,
    })
    if (displayData.multiMonitor != null) {
      items.push({
        label: 'Multi-Monitor',
        value: displayData.multiMonitor ? 'Yes' : 'Single',
        status: displayData.multiMonitor ? 'warn' : 'pass',
        icon: <Monitor className="w-3.5 h-3.5" />,
        category: 'Display',
        detail: displayData.multiMonitor
          ? 'Multi-monitor setup detected. DWM desktop composition adds latency. Consider single monitor for competitive.'
          : 'Single monitor — optimal for lowest latency.',
        source: displayData.source,
      })
    }
    if (displayData.scaling) {
      items.push({
        label: 'Display Scaling',
        value: displayData.scaling,
        status: displayData.scaling.toLowerCase().includes('native') || displayData.scaling.toLowerCase() === 'none' ? 'pass' : 'warn',
        icon: <Monitor className="w-3.5 h-3.5" />,
        category: 'Display',
        detail: 'Native resolution with no scaling avoids GPU composition overhead.',
        source: displayData.source,
      })
    }
  } else {
    items.push(
      { label: 'Refresh Rate', value: '240 Hz (active) / 240 Hz (max)', status: 'pass', icon: <Monitor className="w-3.5 h-3.5" />, category: 'Display', detail: 'Monitor running at maximum native refresh rate.' },
      { label: 'VRR (G-Sync)', value: 'Enabled', status: 'pass', icon: <Monitor className="w-3.5 h-3.5" />, category: 'Display', detail: 'Variable Refresh Rate active. Eliminates tearing without V-Sync input lag.' },
      { label: 'HDR', value: 'Off', status: 'info', icon: <Monitor className="w-3.5 h-3.5" />, category: 'Display', detail: 'HDR can add processing latency. Keep OFF for competitive play unless visually required.' },
      { label: 'Present Mode', value: 'Flip Model (Fullscreen)', status: 'pass', icon: <Monitor className="w-3.5 h-3.5" />, category: 'Display', detail: 'Flip model provides lowest latency presentation path.' },
    )
  }

  // ─── Power section ────────────────────────────────────
  if (hasSystem && systemData) {
    const isHighPerf = systemData.powerPlan != null && (
      systemData.powerPlan.toLowerCase().includes('high performance') ||
      systemData.powerPlan.toLowerCase().includes('ultimate performance')
    )
    items.push({
      label: 'Power Plan',
      value: systemData.powerPlan ?? 'Unknown',
      status: systemData.powerPlan ? (isHighPerf ? 'pass' : 'fail') : 'info',
      icon: <Zap className="w-3.5 h-3.5" />,
      category: 'Power',
      detail: isHighPerf
        ? 'High Performance plan prevents CPU frequency scaling latency.'
        : systemData.powerPlan
          ? 'WARNING: Non-High-Performance power plan. CPU may downclock under load causing frametime spikes. Switch to "High Performance" or "Ultimate Performance".'
          : undefined,
      source: systemData.source,
    })
  } else {
    items.push(
      { label: 'Power Plan', value: 'High Performance', status: 'pass', icon: <Zap className="w-3.5 h-3.5" />, category: 'Power', detail: 'High Performance plan prevents CPU frequency scaling latency.' },
      { label: 'Core Parking', value: 'Disabled', status: 'pass', icon: <Cpu className="w-3.5 h-3.5" />, category: 'Power', detail: 'All cores available. No wake latency from parked cores.' },
    )
  }

  // ─── Kernel section ───────────────────────────────────
  items.push(
    { label: 'Timer Resolution', value: '0.5 ms', status: 'pass', icon: <Cpu className="w-3.5 h-3.5" />, category: 'Kernel', detail: 'Consistent timer resolution across focus states.' },
  )

  // ─── GPU section ──────────────────────────────────────
  items.push(
    { label: 'HAGS', value: 'Enabled', status: 'warn', icon: <Settings className="w-3.5 h-3.5" />, category: 'GPU', detail: 'HAGS results vary by title. Requires A/B testing per game for optimal frametime consistency.' },
  )

  // ─── Security section ─────────────────────────────────
  if (hasSystem && systemData) {
    if (systemData.secureBoot != null) {
      items.push({
        label: 'Secure Boot',
        value: systemData.secureBoot ? 'Enabled' : 'Disabled',
        status: 'info',
        icon: <Shield className="w-3.5 h-3.5" />,
        category: 'Security',
        detail: 'Security feature — minor CPU overhead. Do NOT disable without risk assessment.',
        source: systemData.source,
      })
    }
    if (systemData.vbsMemoryIntegrity != null) {
      items.push({
        label: 'VBS / Memory Integrity',
        value: systemData.vbsMemoryIntegrity ? 'Enabled' : 'Disabled',
        status: systemData.vbsMemoryIntegrity ? 'warn' : 'info',
        icon: <Shield className="w-3.5 h-3.5" />,
        category: 'Security',
        detail: systemData.vbsMemoryIntegrity
          ? 'VBS enabled — adds 5-15% input latency overhead. Some tournament players disable for maximum frametime consistency.'
          : 'Memory Integrity disabled. Reduces CPU overhead.',
        source: systemData.source,
      })
    }
    if (systemData.tpm != null) {
      items.push({
        label: 'TPM 2.0',
        value: systemData.tpm ? 'Present' : 'Not Present',
        status: systemData.tpm ? 'info' : 'info',
        icon: <Shield className="w-3.5 h-3.5" />,
        category: 'Security',
        detail: 'Required for Windows 11. No performance impact observed.',
        source: systemData.source,
      })
    }
  } else {
    items.push(
      { label: 'Secure Boot', value: 'Enabled', status: 'info', icon: <Shield className="w-3.5 h-3.5" />, category: 'Security', detail: 'Security feature — minor CPU overhead. Do NOT disable without risk assessment.' },
      { label: 'VBS / Memory Integrity', value: 'Enabled', status: 'warn', icon: <Shield className="w-3.5 h-3.5" />, category: 'Security', detail: 'Adds ~2-5% CPU overhead. Some tournament players disable for maximum frametime consistency.' },
      { label: 'TPM 2.0', value: 'Present', status: 'info', icon: <Shield className="w-3.5 h-3.5" />, category: 'Security', detail: 'Required for Windows 11. No performance impact observed.' },
    )
  }

  // ─── Input section ────────────────────────────────────
  if (hasController && controllerData) {
    if (controllerData.controllerName) {
      items.push({
        label: 'Controller',
        value: controllerData.controllerName,
        status: controllerData.transport === 'usb' ? 'pass' : controllerData.transport === 'bluetooth' ? 'warn' : 'info',
        icon: <Gamepad2 className="w-3.5 h-3.5" />,
        category: 'Input',
        detail: controllerData.transport === 'usb'
          ? 'Wired USB provides most consistent input latency for competitive play.'
          : controllerData.transport === 'bluetooth'
            ? 'WARNING: Bluetooth adds 3-8ms latency compared to wired USB.'
            : 'Controller detected.',
        source: controllerData.source,
      })
    }
    if (controllerData.transport) {
      items.push({
        label: 'Controller Transport',
        value: controllerData.transport.charAt(0).toUpperCase() + controllerData.transport.slice(1),
        status: controllerData.transport === 'usb' ? 'pass' : 'warn',
        icon: <Gamepad2 className="w-3.5 h-3.5" />,
        category: 'Input',
        detail: controllerData.transport === 'usb'
          ? 'Wired USB provides most consistent input latency for competitive play.'
          : 'Wireless transports add variable latency. Use wired for competitive play.',
        source: controllerData.source,
      })
    }
    if (controllerData.api) {
      items.push({
        label: 'Input API',
        value: controllerData.api.toUpperCase(),
        status: controllerData.api === 'gameinput' ? 'pass' : controllerData.api === 'xinput' ? 'info' : 'info',
        icon: <Gamepad2 className="w-3.5 h-3.5" />,
        category: 'Input',
        detail: controllerData.api === 'gameinput'
          ? 'Modern GameInput API active. Lowest overhead input path on Windows 11.'
          : `${controllerData.api} API detected.`,
        source: controllerData.source,
      })
    }
    if (controllerData.avgPollingMs != null) {
      const pollingStatus = controllerData.avgPollingMs <= 1 ? 'pass' : controllerData.avgPollingMs <= 4 ? 'info' : 'warn'
      items.push({
        label: 'Polling Rate',
        value: `${controllerData.avgPollingMs}ms avg${controllerData.p95PollingMs != null ? ` / ${controllerData.p95PollingMs}ms p95` : ''}`,
        status: pollingStatus,
        icon: <Gamepad2 className="w-3.5 h-3.5" />,
        category: 'Input',
        detail: controllerData.avgPollingMs <= 1
          ? 'Excellent polling rate — minimal input latency.'
          : `Polling rate of ${controllerData.avgPollingMs}ms. Lower is better for competitive play. Target: ≤1ms (1000Hz).`,
        source: controllerData.source,
      })
    }
  } else {
    items.push(
      { label: 'Controller Transport', value: 'USB Wired (1ms polling)', status: 'pass', icon: <Gamepad2 className="w-3.5 h-3.5" />, category: 'Input', detail: 'Wired USB provides most consistent input latency for competitive play.' },
      { label: 'GameInput Runtime', value: 'v1.0.26100.1', status: 'pass', icon: <Gamepad2 className="w-3.5 h-3.5" />, category: 'Input', detail: 'Modern GameInput API active. Lowest overhead input path on Windows 11.' },
    )
  }

  return items
}

const statusIcon = {
  pass: <CheckCircle className="w-3.5 h-3.5 text-[#00ff88]" />,
  fail: <XCircle className="w-3.5 h-3.5 text-[#ff3366]" />,
  warn: <AlertTriangle className="w-3.5 h-3.5 text-[#ffaa00]" />,
  info: <Info className="w-3.5 h-3.5 text-[#00f0ff]" />,
}

export default function SystemConfigPanel({ metrics, systemData, displayData, controllerData }: SystemConfigPanelProps) {
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [expandedItem, setExpandedItem] = useState<string | null>(null)

  const configItems = useMemo(
    () => buildConfigItems(systemData, displayData, controllerData),
    [systemData, displayData, controllerData]
  )

  const categories = useMemo(
    () => Array.from(new Set(configItems.map(c => c.category))),
    [configItems]
  )

  const filtered = selectedCategory
    ? configItems.filter(c => c.category === selectedCategory)
    : configItems

  const passCount = configItems.filter(c => c.status === 'pass').length
  const warnCount = configItems.filter(c => c.status === 'warn').length
  const failCount = configItems.filter(c => c.status === 'fail').length

  const hasRealSystem = isRealSource(systemData)
  const hasRealDisplay = isRealSource(displayData)
  const hasRealController = isRealSource(controllerData)
  const hasAnyReal = hasRealSystem || hasRealDisplay || hasRealController

  // Power plan for quick diagnostic card
  const powerPlan = hasRealSystem && systemData?.powerPlan ? systemData.powerPlan : 'High Performance'
  const isHighPerf = powerPlan.toLowerCase().includes('high performance') || powerPlan.toLowerCase().includes('ultimate performance')

  return (
    <div className="bg-[#0d0d14] rounded-lg border border-[#1a1a2e] p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-sm font-semibold text-white section-title-deco">System Configuration Audit</h3>
          <p className="text-[10px] text-gray-500 mt-0.5">Competitive readiness check — display, power, security, network, input</p>
        </div>
        <div className="flex items-center gap-2 text-[10px]">
          <span className="text-[#00ff88] font-mono">{passCount} OK</span>
          <span className="text-gray-600">|</span>
          <span className="text-[#ffaa00] font-mono">{warnCount} WARN</span>
          {failCount > 0 && (
            <>
              <span className="text-gray-600">|</span>
              <span className="text-[#ff3366] font-mono">{failCount} FAIL</span>
            </>
          )}
          {hasAnyReal ? (
            <span className="text-[8px] font-mono font-bold text-[#00ff88] bg-[#00ff88]/10 border border-[#00ff88]/30 px-2 py-0.5 rounded">REAL DATA</span>
          ) : (
            <span className="text-[8px] font-mono font-bold text-gray-500 bg-gray-500/10 border border-gray-500/20 px-2 py-0.5 rounded">SIMULATED</span>
          )}
        </div>
      </div>

      {/* Inline findings from system scan — warning or higher */}
      {hasRealSystem && systemData?.findings && systemData.findings.length > 0 && (
        <div className="mb-3 space-y-1.5">
          {systemData.findings
            .filter((f: RootCauseFinding) => f.severity === 'critical' || f.severity === 'high' || f.severity === 'warning')
            .map((f: RootCauseFinding) => (
              <div key={f.id} className={`text-[9px] leading-relaxed px-2.5 py-2 rounded border flex items-start gap-2 ${
                f.severity === 'critical' ? 'bg-[#ff3366]/10 border-[#ff3366]/30 text-[#ff3366]' :
                f.severity === 'high' ? 'bg-[#ffaa00]/10 border-[#ffaa00]/30 text-[#ffaa00]' :
                'bg-[#ffaa00]/5 border-[#ffaa00]/15 text-[#ffaa00]/70'
              }`}>
                <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
                <div>
                  <span className="font-medium">{f.title}</span>
                  {f.recommendation && <span className="opacity-80"> — {f.recommendation}</span>}
                </div>
              </div>
            ))}
        </div>
      )}

      {/* Real system info header */}
      {hasRealSystem && systemData && (
        <div className="mb-3 space-y-1.5 text-[10px] bg-[#12121a] rounded-lg border border-[#1a1a2e] p-3">
          <div className="flex justify-between">
            <span className="text-gray-500">CPU</span>
            <span className="text-gray-300 font-mono truncate ml-4 max-w-[60%]">{systemData.cpuName ?? 'Unknown'}</span>
          </div>
          {systemData.gpuName && (
            <div className="flex justify-between">
              <span className="text-gray-500">GPU</span>
              <span className="text-gray-300 font-mono truncate ml-4 max-w-[60%]">{systemData.gpuName}</span>
            </div>
          )}
          {systemData.windowsBuild && (
            <div className="flex justify-between">
              <span className="text-gray-500">Windows</span>
              <span className="text-gray-300 font-mono">{systemData.windowsBuild}</span>
            </div>
          )}
          {systemData.motherboard && (
            <div className="flex justify-between">
              <span className="text-gray-500">Motherboard</span>
              <span className="text-gray-300 font-mono truncate ml-4 max-w-[60%]">{systemData.motherboard}</span>
            </div>
          )}
          {systemData.biosVersion && (
            <div className="flex justify-between">
              <span className="text-gray-500">BIOS</span>
              <span className="text-gray-300 font-mono truncate ml-4 max-w-[60%]">{systemData.biosVersion}</span>
            </div>
          )}
          {systemData.ramTotal != null && (
            <div className="flex justify-between">
              <span className="text-gray-500">RAM</span>
              <span className="text-gray-300 font-mono">{systemData.ramTotal} GB{systemData.ramSpeed ? ` @ ${systemData.ramSpeed} MHz` : ''}</span>
            </div>
          )}
          <div className="pt-1">
            <DataSourceBadge source={systemData.source} showCollector />
          </div>
        </div>
      )}

      {/* Quick Diagnostics */}
      <h4 className="text-xs font-medium text-white mb-2 section-title-deco">Quick Diagnostics</h4>
      <div className="grid grid-cols-2 gap-2 mb-3">
        <div className="bg-[#12121a] rounded-lg border border-[#1a1a2e] p-3 deep-shadow card-hover-border">
          <div className="flex items-center gap-2 mb-1">
            <Zap className="w-3.5 h-3.5 text-[#00f0ff]" />
            <span className="text-[10px] text-gray-500 uppercase tracking-wider">Timer Resolution</span>
          </div>
          <div className="text-lg font-mono font-bold text-white">0.5<span className="text-xs text-gray-500 ml-1">ms</span></div>
          <span className="inline-flex items-center gap-1 mt-1 text-[9px] text-[#00ff88]">
            <CheckCircle className="w-2.5 h-2.5" /> OPTIMAL
          </span>
        </div>
        <div className={`bg-[#12121a] rounded-lg border p-3 deep-shadow card-hover-border ${isHighPerf ? 'border-[#1a1a2e]' : 'border-[#ff3366]/30'}`}>
          <div className="flex items-center gap-2 mb-1">
            <BatteryFull className={`w-3.5 h-3.5 ${isHighPerf ? 'text-[#ffaa00]' : 'text-[#ff3366]'}`} />
            <span className="text-[10px] text-gray-500 uppercase tracking-wider">Power Plan</span>
            {hasRealSystem && systemData && <DataSourceBadge source={systemData.source} size="xs" />}
          </div>
          <div className={`text-sm font-mono font-bold truncate ${isHighPerf ? 'text-white' : 'text-[#ff3366]'}`} title={powerPlan}>{powerPlan}</div>
          <span className={`inline-flex items-center gap-1 mt-1 text-[9px] ${isHighPerf ? 'text-[#00ff88]' : 'text-[#ff3366]'}`}>
            {isHighPerf ? <><CheckCircle className="w-2.5 h-2.5" /> CORRECT</> : <><XCircle className="w-2.5 h-2.5" /> WRONG PLAN</>}
          </span>
        </div>
      </div>

      <div className="flex flex-wrap gap-1 mb-3">
        <button
          onClick={() => setSelectedCategory(null)}
          className={`px-2 py-1 rounded text-[10px] font-medium transition-all ${
            !selectedCategory
              ? 'bg-[#00f0ff]/15 text-[#00f0ff] border border-[#00f0ff]/30 border-l-2 border-l-[#00f0ff]'
              : 'text-gray-500 hover:text-gray-300 border border-transparent'
          }`}
        >
          ALL ({configItems.length})
        </button>
        {categories.map(cat => {
          const count = configItems.filter(c => c.category === cat).length
          return (
            <button
              key={cat}
              onClick={() => setSelectedCategory(selectedCategory === cat ? null : cat)}
              className={`px-2 py-1 rounded text-[10px] font-medium transition-all ${
                selectedCategory === cat
                  ? 'bg-[#00f0ff]/15 text-[#00f0ff] border border-[#00f0ff]/30 border-l-2 border-l-[#00f0ff]'
                  : 'text-gray-500 hover:text-gray-300 border border-transparent'
              }`}
            >
              {cat} ({count})
            </button>
          )
        })}
      </div>

      <div className="space-y-1.5 max-h-[400px] overflow-y-auto pr-1 custom-scrollbar">
        {filtered.map((item, i) => {
          const isOpen = expandedItem === item.label
          return (
            <motion.div
              key={`${item.category}-${item.label}`}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.03 }}
              className={`rounded-md border transition-colors ${
                isOpen ? 'border-[#2a2a3e] bg-[#12121a]' : 'border-transparent hover:bg-[#12121a]/50'
              } ${item.status === 'pass' && !isOpen ? 'border-l-2 border-l-[#00ff88]/30' : item.status === 'fail' && !isOpen ? 'border-l-2 border-l-[#ff3366]/30' : item.status === 'warn' && !isOpen ? 'border-l-2 border-l-[#ffaa00]/30' : ''}`}
            >
              <button
                onClick={() => setExpandedItem(isOpen ? null : item.label)}
                className="w-full flex items-center gap-3 p-2.5 text-left"
              >
                <div className="text-gray-400">{statusIcon[item.status]}</div>
                <div className="text-gray-500">{item.icon}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-gray-500 uppercase tracking-wider">{item.category}</span>
                  </div>
                  <span className="text-[11px] text-gray-300 font-medium">{item.label}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-gray-400 font-mono font-medium max-w-[200px] sm:max-w-[320px] lg:max-w-[400px] truncate hidden sm:block" title={item.value}>{item.value}</span>
                  {item.source && <DataSourceBadge source={item.source} size="xs" />}
                  <ChevronRight className={`w-3.5 h-3.5 text-gray-600 shrink-0 transition-transform ${isOpen ? 'rotate-90' : ''}`} />
                </div>
              </button>
              {isOpen && item.detail && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  className="overflow-hidden"
                >
                  <div className="px-3 pb-2.5 pl-14">
                    <p className="text-[10px] text-gray-500 leading-relaxed">{item.detail}</p>
                  </div>
                </motion.div>
              )}
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}