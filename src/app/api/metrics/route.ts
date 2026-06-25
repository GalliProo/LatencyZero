import { NextRequest, NextResponse } from 'next/server'

function generateMetrics() {
  const base = () => 1 + (Math.random() - 0.5) * 0.6
  const spike = Math.random() < 0.05 ? (2 + Math.random() * 4) : 1

  const dpcCurrent = Math.max(5, 50 * base() * spike)
  const isrCurrent = Math.max(1, 15 * base() * spike)
  // Target 120fps = 8.33ms per frame; generate around 6-7ms with noise
  const frameTime = Math.max(2, 6.8 * base() * spike)
  const fps = Math.min(300, 1000 / frameTime)
  const ping = Math.max(3, 18 * base() * (spike > 1.5 ? 2.5 : 1))
  const jitter = Math.max(0.1, 2 * base())
  const packetLoss = spike > 1.5 ? Math.random() * 3 : Math.random() * 0.2
  const cpuUsage = Math.max(10, Math.min(100, 45 * base() * (spike > 1.5 ? 1.3 : 1)))
  const gpuUsage = Math.max(30, Math.min(100, 78 * base()))
  const cpuTemp = Math.max(35, Math.min(98, 52 + cpuUsage * 0.35))
  const gpuTemp = Math.max(40, Math.min(95, 60 + gpuUsage * 0.3))
  const ramPercent = Math.max(40, Math.min(95, 62 * base()))

  const score = Math.round(Math.max(0, Math.min(100,
    100
    - (dpcCurrent > 500 ? (dpcCurrent - 500) / 50 : 0)
    - (isrCurrent > 200 ? (isrCurrent - 200) / 30 : 0)
    - (frameTime > 10 ? (frameTime - 10) * 3 : 0)
    - (ping > 40 ? (ping - 40) / 3 : 0)
    - (packetLoss > 0.5 ? packetLoss * 5 : 0)
    - (cpuTemp > 80 ? (cpuTemp - 80) * 0.5 : 0)
  )))

  return {
    timestamp: Date.now(),
    dpc: { current: +dpcCurrent.toFixed(2), max: +(dpcCurrent * 2.5).toFixed(2), avg: +(dpcCurrent * 0.8).toFixed(2) },
    isr: { current: +isrCurrent.toFixed(2), max: +(isrCurrent * 2).toFixed(2), avg: +(isrCurrent * 0.7).toFixed(2) },
    frameTime: { current: +frameTime.toFixed(3), avg: +(frameTime * 0.95).toFixed(3), min1pct: +(frameTime * 1.8).toFixed(3), min01pct: +(frameTime * 2.5).toFixed(3) },
    fps: { current: +fps.toFixed(1), avg: +(fps * 0.98).toFixed(1), min1pct: +(1000 / (frameTime * 1.8)).toFixed(1), min01pct: +(1000 / (frameTime * 2.5)).toFixed(1) },
    hardware: {
      cpu: { usage: +cpuUsage.toFixed(1), temp: Math.round(cpuTemp), clock: Math.round(4800 * base()) },
      gpu: { usage: +gpuUsage.toFixed(1), temp: Math.round(gpuTemp), clock: Math.round(2100 * base()), vram: +(8.2 * base()).toFixed(1) },
      ram: { usage: +ramPercent.toFixed(1), available: +(32 * (1 - ramPercent / 100)).toFixed(1), percent: +ramPercent.toFixed(1) },
    },
    network: {
      ping: +ping.toFixed(1), jitter: +jitter.toFixed(2), packetLoss: +packetLoss.toFixed(3),
      download: +(450 * base()).toFixed(1), upload: +(95 * base()).toFixed(1),
    },
    score,
  }
}

const driverTemplates = [
  { name: 'NVIDIA Display Driver', module: 'nvlddmkm.sys', dpcBase: 120, isrBase: 25 },
  { name: 'Network Adapter (Intel)', module: 'e1d68x64.sys', dpcBase: 45, isrBase: 12 },
  { name: 'USB Root Hub', module: 'usbhub3.sys', dpcBase: 30, isrBase: 8 },
  { name: 'Audio Driver (Realtek)', module: 'rt64win.sys', dpcBase: 25, isrBase: 6 },
  { name: 'Storage Controller (NVMe)', module: 'stornvme.sys', dpcBase: 55, isrBase: 18 },
  { name: 'Windows Kernel', module: 'ntoskrnl.exe', dpcBase: 35, isrBase: 10 },
  { name: 'DirectX Graphics Kernel', module: 'dxgkrnl.sys', dpcBase: 85, isrBase: 22 },
  { name: 'Power Management', module: 'acpi.sys', dpcBase: 15, isrBase: 4 },
  { name: 'PCI Express', module: 'pci.sys', dpcBase: 20, isrBase: 5 },
  { name: 'TCP/IP Stack', module: 'tcpip.sys', dpcBase: 40, isrBase: 11 },
]

function generateDrivers() {
  return driverTemplates.map(d => {
    const noise = () => 0.7 + Math.random() * 0.6
    const spike = Math.random() < 0.08 ? 3 + Math.random() * 5 : 1
    const dpcTime = d.dpcBase * noise() * spike
    const isrTime = d.isrBase * noise() * spike
    return {
      name: d.name, module: d.module,
      dpcCount: Math.round(150 * noise()),
      dpcTime: +dpcTime.toFixed(1),
      isrCount: Math.round(80 * noise()),
      isrTime: +isrTime.toFixed(1),
      severity: dpcTime > 1000 ? 'critical' : dpcTime > 500 ? 'warning' : 'good',
    }
  })
}

export async function GET(request: NextRequest) {
  const type = request.nextUrl.searchParams.get('type')

  if (type === 'drivers') {
    return NextResponse.json({
      dataSource: 'simulated',
      confidence: 0,
      drivers: generateDrivers(),
    })
  }

  const metrics = generateMetrics()

  // Only generate alerts for truly exceptional spikes in demo mode
  // to reduce alert spam
  const alerts: Array<{
    id: string; type: string; severity: string; message: string; value: number; threshold: number; timestamp: number; confidence: number; source: string
  }> = []

  // DPC: only alert at critical levels (>1000µs) in simulated mode
  if (metrics.dpc.current > 1000) {
    alerts.push({
      id: `dpc-${Date.now()}`, type: 'dpc_spike',
      severity: 'critical',
      message: `[SIMULATED] DPC latency critical spike: ${metrics.dpc.current.toFixed(1)}µs`,
      value: metrics.dpc.current, threshold: 1000, timestamp: Date.now(),
      confidence: 0, source: 'simulated',
    })
  }

  // Frame time: only alert when severely over budget (>2x)
  if (metrics.frameTime.current > 16.67) {
    alerts.push({
      id: `frame-${Date.now()}`, type: 'frame_drop',
      severity: 'critical',
      message: `[SIMULATED] Frame time severely over budget: ${metrics.frameTime.current.toFixed(2)}ms (120fps budget: 8.33ms)`,
      value: metrics.frameTime.current, threshold: 16.67, timestamp: Date.now(),
      confidence: 0, source: 'simulated',
    })
  }

  // Ping: only alert at extreme levels (>150ms) in simulated mode
  if (metrics.network.ping > 150) {
    alerts.push({
      id: `ping-${Date.now()}`, type: 'ping_spike',
      severity: 'critical',
      message: `[SIMULATED] Extreme network ping spike: ${metrics.network.ping.toFixed(1)}ms`,
      value: metrics.network.ping, threshold: 150, timestamp: Date.now(),
      confidence: 0, source: 'simulated',
    })
  }

  // Packet loss: only alert at severe levels (>5%)
  if (metrics.network.packetLoss > 5) {
    alerts.push({
      id: `loss-${Date.now()}`, type: 'packet_loss',
      severity: 'critical',
      message: `[SIMULATED] Severe packet loss: ${metrics.network.packetLoss.toFixed(2)}%`,
      value: metrics.network.packetLoss, threshold: 5, timestamp: Date.now(),
      confidence: 0, source: 'simulated',
    })
  }

  // GPU temp: only alert at critical hotspot levels
  if (metrics.hardware.gpu.temp > 90) {
    alerts.push({
      id: `temp-${Date.now()}`, type: 'temp_warning',
      severity: 'critical',
      message: `[SIMULATED] GPU temperature critical: ${metrics.hardware.gpu.temp}°C`,
      value: metrics.hardware.gpu.temp, threshold: 90, timestamp: Date.now(),
      confidence: 0, source: 'simulated',
    })
  }

  return NextResponse.json({
    dataSource: 'simulated',
    confidence: 0,
    score: {
      value: metrics.score,
      source: 'simulated',
      label: 'Demo Score (Simulated)',
    },
    metrics,
    alerts,
  })
}