import { NextRequest, NextResponse } from 'next/server'

// ─── Types ───────────────────────────────────────────────────────────
interface ReportMetrics {
  timestamp: number
  dpc: { current: number; max: number; avg: number }
  isr: { current: number; max: number; avg: number }
  frameTime: { current: number; avg: number; min1pct: number; min01pct: number }
  fps: { current: number; avg: number; min1pct: number; min01pct: number }
  hardware: {
    cpu: { usage: number; temp: number; clock: number }
    gpu: { usage: number; temp: number; clock: number; vram: number }
    ram: { usage: number; available: number; percent: number }
  }
  network: {
    ping: number; jitter: number; packetLoss: number
    download: number; upload: number
  }
  score: number
}

interface ReportDriver {
  name: string; module: string
  dpcCount: number; dpcTime: number
  isrCount: number; isrTime: number
  severity: 'good' | 'warning' | 'critical'
}

interface ReportAlert {
  id: string; type: string; severity: string
  message: string; value: number; threshold: number; timestamp: number
}

interface ReportBody {
  metrics?: ReportMetrics
  drivers?: ReportDriver[]
  alerts?: ReportAlert[]
  score?: number
  gameProfile?: string
  duration?: string
  samples?: number
}

// ─── Sample data for GET ─────────────────────────────────────────────
function sampleData(): Required<ReportBody> {
  const metrics: ReportMetrics = {
    timestamp: Date.now(),
    dpc: { current: 67.4, max: 892.1, avg: 48.3 },
    isr: { current: 18.2, max: 310.5, avg: 12.7 },
    frameTime: { current: 6.94, avg: 6.58, min1pct: 11.2, min01pct: 15.8 },
    fps: { current: 144.1, avg: 152.0, min1pct: 89.3, min01pct: 63.3 },
    hardware: {
      cpu: { usage: 43.2, temp: 67, clock: 4850 },
      gpu: { usage: 78.5, temp: 74, clock: 2050, vram: 7.8 },
      ram: { usage: 62.4, available: 12.0, percent: 62.4 },
    },
    network: {
      ping: 18.5, jitter: 1.82, packetLoss: 0.042,
      download: 485.2, upload: 98.1,
    },
    score: 82,
  }
  const drivers: ReportDriver[] = [
    { name: 'NVIDIA Display Driver', module: 'nvlddmkm.sys', dpcCount: 203, dpcTime: 842.3, isrCount: 112, isrTime: 287.1, severity: 'warning' },
    { name: 'Network Adapter (Intel)', module: 'e1d68x64.sys', dpcCount: 178, dpcTime: 52.1, isrCount: 95, isrTime: 14.3, severity: 'good' },
    { name: 'USB Root Hub', module: 'usbhub3.sys', dpcCount: 124, dpcTime: 38.7, isrCount: 68, isrTime: 9.8, severity: 'good' },
    { name: 'Audio Driver (Realtek)', module: 'rt64win.sys', dpcCount: 98, dpcTime: 28.4, isrCount: 52, isrTime: 7.2, severity: 'good' },
    { name: 'Storage Controller (NVMe)', module: 'stornvme.sys', dpcCount: 167, dpcTime: 72.5, isrCount: 88, isrTime: 21.6, severity: 'good' },
  ]
  const alerts: ReportAlert[] = [
    { id: 'dpc-001', type: 'dpc_spike', severity: 'warning', message: 'DPC latency spike detected: 892.1µs', value: 892.1, threshold: 500, timestamp: Date.now() - 120000 },
    { id: 'frame-001', type: 'frame_drop', severity: 'warning', message: 'Frame time exceeded 60fps target: 18.24ms', value: 18.24, threshold: 16.67, timestamp: Date.now() - 45000 },
  ]
  return { metrics, drivers, alerts, score: 82, gameProfile: 'Call of Duty Competitive', duration: '2m 15s', samples: 270 }
}

// ─── Helpers ─────────────────────────────────────────────────────────
function grade(score: number): { letter: string; color: string } {
  if (score >= 90) return { letter: 'S', color: '#00ff88' }
  if (score >= 80) return { letter: 'A', color: '#00f0ff' }
  if (score >= 65) return { letter: 'B', color: '#ffaa00' }
  if (score >= 50) return { letter: 'C', color: '#ff6644' }
  return { letter: 'F', color: '#ff3366' }
}

function severityBadge(sev: string): string {
  switch (sev) {
    case 'critical': return `<span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:10px;font-weight:700;letter-spacing:0.5px;color:#ff3366;background:rgba(255,51,102,0.12);border:1px solid rgba(255,51,102,0.3);">CRITICAL</span>`
    case 'warning': return `<span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:10px;font-weight:700;letter-spacing:0.5px;color:#ffaa00;background:rgba(255,170,0,0.12);border:1px solid rgba(255,170,0,0.3);">WARNING</span>`
    case 'good': return `<span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:10px;font-weight:700;letter-spacing:0.5px;color:#00ff88;background:rgba(0,255,136,0.12);border:1px solid rgba(0,255,136,0.3);">OK</span>`
    default: return `<span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:10px;font-weight:700;letter-spacing:0.5px;color:#888;background:rgba(136,136,136,0.1);border:1px solid rgba(136,136,136,0.2);">${sev.toUpperCase()}</span>`
  }
}

function priorityBadge(p: string): string {
  const cfg: Record<string, { color: string; bg: string; border: string }> = {
    high:   { color: '#ff3366', bg: 'rgba(255,51,102,0.12)', border: 'rgba(255,51,102,0.3)' },
    medium: { color: '#ffaa00', bg: 'rgba(255,170,0,0.12)', border: 'rgba(255,170,0,0.3)' },
    low:    { color: '#00f0ff', bg: 'rgba(0,240,255,0.12)', border: 'rgba(0,240,255,0.3)' },
  }
  const c = cfg[p] || cfg.low
  return `<span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:10px;font-weight:700;letter-spacing:0.5px;color:${c.color};background:${c.bg};border:1px solid ${c.border};">${p.toUpperCase()}</span>`
}

function valueColor(value: number, warn: number, bad: number): string {
  if (value >= bad) return '#ff3366'
  if (value >= warn) return '#ffaa00'
  return '#00ff88'
}

function networkQuality(ping: number, jitter: number, packetLoss: number): { label: string; color: string } {
  if (ping <= 20 && jitter <= 2 && packetLoss <= 0.1) return { label: 'Excellent', color: '#00ff88' }
  if (ping <= 40 && jitter <= 5 && packetLoss <= 0.5) return { label: 'Good', color: '#00f0ff' }
  if (ping <= 80 && jitter <= 10 && packetLoss <= 1) return { label: 'Fair', color: '#ffaa00' }
  return { label: 'Poor', color: '#ff3366' }
}

function generateFindings(metrics: ReportMetrics, drivers: ReportDriver[], score: number) {
  const findings: Array<{ id: string; priority: string; domain: string; title: string; evidence: string; recommendation: string }> = []

  if (score < 50) {
    findings.push({
      id: 'SYS-001', priority: 'high', domain: 'System',
      title: `Overall system performance critically degraded (Score: ${score}/100)`,
      evidence: 'Multiple subsystems showing issues simultaneously.',
      recommendation: 'Run full diagnostic scan and address high-priority items first.',
    })
  }

  if (metrics.dpc.max > 500) {
    const badDrivers = drivers.filter(d => d.severity !== 'good')
    findings.push({
      id: 'DPC-001', priority: metrics.dpc.max > 1000 ? 'high' : 'medium', domain: 'Kernel',
      title: `DPC latency spikes detected — max: ${metrics.dpc.max.toFixed(1)}µs`,
      evidence: `Microsoft guideline: DPC should not exceed ~100µs. Measured max: ${metrics.dpc.max.toFixed(1)}µs.`,
      recommendation: badDrivers.length > 0
        ? `Primary contributors: ${badDrivers.map(d => d.name).join(', ')}. Update or rollback these drivers.`
        : 'Update chipset and network drivers to latest stable versions.',
    })
  }

  if (metrics.frameTime.min1pct > 12) {
    findings.push({
      id: 'FRAME-001', priority: metrics.frameTime.min1pct > 20 ? 'high' : 'medium', domain: 'Frame Pacing',
      title: `1% low frametime elevated: ${metrics.frameTime.min1pct.toFixed(2)}ms (${(1000 / metrics.frameTime.min1pct).toFixed(0)} FPS)`,
      evidence: `For competitive play, 1% low should stay above target refresh rate. Current 1% low translates to ${(1000 / metrics.frameTime.min1pct).toFixed(0)} FPS.`,
      recommendation: 'Check for background processes, thermal throttling, or storage issues causing periodic stutter.',
    })
  }

  if (metrics.network.ping > 40) {
    findings.push({
      id: 'NET-001', priority: metrics.network.ping > 80 ? 'high' : 'medium', domain: 'Network',
      title: `Elevated network latency: ${metrics.network.ping.toFixed(1)}ms avg, jitter: ${metrics.network.jitter.toFixed(2)}ms`,
      evidence: `Competitive target: <30ms ping, <3ms jitter. Packet loss: ${metrics.network.packetLoss.toFixed(3)}%.`,
      recommendation: 'Use wired Ethernet. Enable QoS/SQM on router. Test for bufferbloat under load.',
    })
  }

  if (metrics.hardware.gpu.temp > 82) {
    findings.push({
      id: 'THERM-001', priority: 'medium', domain: 'Thermal',
      title: `GPU temperature elevated: ${metrics.hardware.gpu.temp}°C`,
      evidence: 'Sustained temps above 80°C may trigger power/thermal throttling, causing clock reduction and frametime instability.',
      recommendation: 'Improve case airflow, check thermal paste, consider undervolting.',
    })
  }

  if (metrics.hardware.ram.percent > 85) {
    findings.push({
      id: 'RAM-001', priority: 'low', domain: 'System',
      title: `RAM usage high: ${metrics.hardware.ram.percent}%`,
      evidence: `${metrics.hardware.ram.available}GB available. High RAM usage can cause hard pagefaults and stutter.`,
      recommendation: 'Close unnecessary background applications before competitive play.',
    })
  }

  findings.push({
    id: 'CONF-001', priority: 'low', domain: 'Config',
    title: 'HAGS enabled — requires per-title A/B validation',
    evidence: 'HAGS can improve or worsen frametime depending on game/engine/driver combination.',
    recommendation: 'Test with HAGS ON vs OFF for your specific competitive title. Compare 1% low frametimes.',
  })

  return findings.sort((a, b) => {
    const p: Record<string, number> = { high: 3, medium: 2, low: 1 }
    return (p[b.priority] ?? 0) - (p[a.priority] ?? 0)
  })
}

// ─── HTML Generator ──────────────────────────────────────────────────
function buildHTML(data: Required<ReportBody>): string {
  const { metrics, drivers, alerts, score, gameProfile, duration, samples } = data
  const g = grade(score)
  const findings = generateFindings(metrics, drivers, score)
  const highCount = findings.filter(f => f.priority === 'high').length
  const medCount = findings.filter(f => f.priority === 'medium').length
  const lowCount = findings.filter(f => f.priority === 'low').length
  const netQ = networkQuality(metrics.network.ping, metrics.network.jitter, metrics.network.packetLoss)
  const now = new Date().toISOString().slice(0, 19).replace('T', ' ')
  const scanTime = new Date(metrics.timestamp).toISOString().slice(0, 19).replace('T', ' ')

  const overallStatus = highCount > 0 ? 'ATTENTION' : medCount > 2 ? 'NEEDS IMPROVEMENT' : 'COMPETITIVE READY'
  const overallColor = highCount > 0 ? '#ff3366' : medCount > 2 ? '#ffaa00' : '#00ff88'

  const top5Drivers = [...drivers].sort((a, b) => b.dpcTime - a.dpcTime).slice(0, 5)

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>LatencyZero Diagnostic Report</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    background: #0a0a0f;
    color: #c8c8d4;
    font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
    line-height: 1.6;
    padding: 0;
    min-height: 100vh;
  }

  .mono { font-family: 'JetBrains Mono', 'Fira Code', 'Cascadia Code', 'SF Mono', Consolas, monospace; }

  .container {
    max-width: 960px;
    margin: 0 auto;
    padding: 24px 20px 40px;
  }

  /* ── Header ─────────────────────────── */
  .header {
    text-align: center;
    padding: 36px 0 28px;
    border-bottom: 1px solid #1a1a2e;
    margin-bottom: 32px;
  }
  .header h1 {
    font-size: 28px;
    font-weight: 800;
    color: #fff;
    letter-spacing: -0.5px;
    margin-bottom: 4px;
  }
  .header h1 span { color: #00f0ff; }
  .header .subtitle {
    font-size: 13px;
    color: #555;
    margin-bottom: 16px;
  }
  .header .meta {
    display: flex;
    justify-content: center;
    gap: 24px;
    flex-wrap: wrap;
    font-size: 12px;
    color: #666;
  }
  .header .meta span { display: flex; align-items: center; gap: 6px; }
  .header .meta .dot { width: 6px; height: 6px; border-radius: 50%; background: #00ff88; }

  /* ── Section ────────────────────────── */
  .section { margin-bottom: 28px; }
  .section-title {
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 1.5px;
    color: #555;
    margin-bottom: 14px;
    padding-left: 2px;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .section-title::after {
    content: '';
    flex: 1;
    height: 1px;
    background: #1a1a2e;
  }

  /* ── Cards ──────────────────────────── */
  .card {
    background: #0d0d14;
    border: 1px solid #1a1a2e;
    border-radius: 10px;
    padding: 20px;
    margin-bottom: 12px;
  }

  /* ── Executive Summary ──────────────── */
  .exec-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 12px;
  }
  .exec-card {
    background: #0d0d14;
    border: 1px solid #1a1a2e;
    border-radius: 10px;
    padding: 20px;
    text-align: center;
  }
  .exec-card .label {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 1px;
    color: #555;
    margin-bottom: 8px;
  }

  /* Score Circle */
  .score-circle {
    width: 100px;
    height: 100px;
    border-radius: 50%;
    border: 3px solid ${g.color};
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    margin: 0 auto 8px;
    background: rgba(${g.color === '#ff3366' ? '255,51,102' : g.color === '#ff6644' ? '255,102,68' : g.color === '#ffaa00' ? '255,170,0' : g.color === '#00f0ff' ? '0,240,255' : '0,255,136'}, 0.06);
    box-shadow: 0 0 30px rgba(${g.color === '#ff3366' ? '255,51,102' : g.color === '#ff6644' ? '255,102,68' : g.color === '#ffaa00' ? '255,170,0' : g.color === '#00f0ff' ? '0,240,255' : '0,255,136'}, 0.15);
  }
  .score-circle .num {
    font-size: 32px;
    font-weight: 800;
    color: ${g.color};
    line-height: 1;
  }
  .score-circle .grade {
    font-size: 11px;
    color: #666;
    margin-top: 2px;
  }
  .score-circle .grade b { color: ${g.color}; }

  .status-badge {
    display: inline-block;
    padding: 4px 14px;
    border-radius: 6px;
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.5px;
    color: ${overallColor};
    background: ${overallColor}14;
    border: 1px solid ${overallColor}40;
  }

  /* ── Tables ─────────────────────────── */
  .table-wrap { overflow-x: auto; -webkit-overflow-scrolling: touch; }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
  }
  thead th {
    text-align: left;
    padding: 10px 14px;
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 1px;
    color: #555;
    border-bottom: 1px solid #1a1a2e;
    white-space: nowrap;
  }
  tbody td {
    padding: 10px 14px;
    border-bottom: 1px solid #12121a;
    white-space: nowrap;
  }
  tbody tr:last-child td { border-bottom: none; }
  tbody tr:hover { background: rgba(255,255,255,0.015); }
  td.val { font-family: 'JetBrains Mono', 'Fira Code', monospace; font-weight: 600; color: #e0e0e8; }

  /* ── Hardware Grid ──────────────────── */
  .hw-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 12px;
  }
  .hw-card {
    background: #0d0d14;
    border: 1px solid #1a1a2e;
    border-radius: 10px;
    padding: 16px;
  }
  .hw-card .hw-label {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 1px;
    color: #555;
    margin-bottom: 6px;
  }
  .hw-card .hw-value {
    font-family: 'JetBrains Mono', 'Fira Code', monospace;
    font-size: 22px;
    font-weight: 700;
    color: #e0e0e8;
    line-height: 1.2;
  }
  .hw-card .hw-sub {
    font-size: 11px;
    color: #555;
    margin-top: 4px;
  }
  .hw-bar {
    height: 4px;
    border-radius: 2px;
    background: #1a1a2e;
    margin-top: 10px;
    overflow: hidden;
  }
  .hw-bar-fill {
    height: 100%;
    border-radius: 2px;
    transition: width 0.3s ease;
  }

  /* ── Findings ───────────────────────── */
  .finding {
    background: #0d0d14;
    border: 1px solid #1a1a2e;
    border-radius: 10px;
    padding: 16px 20px;
    margin-bottom: 10px;
  }
  .finding .finding-head {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    margin-bottom: 8px;
  }
  .finding .finding-title {
    font-size: 13px;
    font-weight: 600;
    color: #e0e0e8;
    line-height: 1.4;
    flex: 1;
  }
  .finding .finding-meta {
    display: flex;
    gap: 8px;
    align-items: center;
    margin-bottom: 6px;
    flex-wrap: wrap;
  }
  .finding .finding-id {
    font-size: 11px;
    font-family: 'JetBrains Mono', 'Fira Code', monospace;
    color: #555;
  }
  .finding .finding-domain {
    font-size: 11px;
    color: #444;
  }
  .finding .finding-body {
    font-size: 12px;
    color: #888;
    line-height: 1.6;
    padding-left: 28px;
  }
  .finding .finding-body .ev-label,
  .finding .finding-body .rec-label {
    font-size: 9px;
    text-transform: uppercase;
    letter-spacing: 1px;
    color: #555;
    display: block;
    margin-top: 8px;
    margin-bottom: 2px;
  }
  .finding .finding-body .rec-text {
    color: #00f0ff;
  }

  /* ── Network Quality ────────────────── */
  .net-quality {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-top: 12px;
    padding: 12px 16px;
    background: #0a0a0f;
    border: 1px solid #1a1a2e;
    border-radius: 8px;
  }
  .net-quality .nq-dot {
    width: 10px; height: 10px; border-radius: 50%; background: ${netQ.color};
    box-shadow: 0 0 8px ${netQ.color};
  }
  .net-quality .nq-label { font-weight: 600; color: ${netQ.color}; font-size: 14px; }
  .net-quality .nq-desc { color: #666; font-size: 12px; }

  /* ── Footer ─────────────────────────── */
  .footer {
    text-align: center;
    padding: 24px 0 0;
    border-top: 1px solid #1a1a2e;
    margin-top: 36px;
  }
  .footer .brand { font-size: 12px; color: #444; font-weight: 600; }
  .footer .brand span { color: #00f0ff; }
  .footer .ts { font-size: 11px; color: #333; margin-top: 4px; }

  /* ── Alerts Count Row ───────────────── */
  .alerts-row {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
  }
  .alerts-row .alert-chip {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 14px;
    border-radius: 8px;
    background: #0a0a0f;
    border: 1px solid #1a1a2e;
    font-size: 12px;
  }
  .alerts-row .alert-chip .ac-count {
    font-family: 'JetBrains Mono', 'Fira Code', monospace;
    font-weight: 700;
    font-size: 16px;
  }

  /* ── Responsive ─────────────────────── */
  @media (max-width: 640px) {
    .container { padding: 16px 12px 32px; }
    .header h1 { font-size: 22px; }
    .exec-grid { grid-template-columns: 1fr 1fr; gap: 8px; }
    .exec-card { padding: 14px; }
    .hw-grid { grid-template-columns: 1fr 1fr; gap: 8px; }
    .score-circle { width: 80px; height: 80px; }
    .score-circle .num { font-size: 26px; }
    thead th, tbody td { padding: 8px 10px; font-size: 12px; }
    .finding .finding-body { padding-left: 0; }
    .header .meta { gap: 12px; }
  }

  /* ── Print ──────────────────────────── */
  @media print {
    body { background: #fff; color: #1a1a1a; }
    .card, .exec-card, .hw-card, .finding { background: #f8f8f8; border-color: #ddd; }
    .section-title { color: #888; }
    .section-title::after { background: #ddd; }
    table { color: #333; }
    thead th { color: #888; border-bottom-color: #ccc; }
    tbody td { border-bottom-color: #eee; }
    .header { border-bottom-color: #ccc; }
    .footer { border-top-color: #ccc; }
    .hw-bar { background: #e0e0e0; }
    .net-quality { background: #f0f0f0; border-color: #ddd; }
    .finding .finding-body .rec-text { color: #0066aa; }
    .finding .finding-body .ev-label,
    .finding .finding-body .rec-label { color: #888; }
    .header .meta { color: #888; }
    .header .subtitle { color: #888; }
    .score-circle { border-color: #333; box-shadow: none; background: #f0f0f0; }
    .score-circle .num { color: #333; }
    .score-circle .grade b { color: #333; }
    .status-badge { border-color: #333; }
  }
</style>
</head>
<body>
<div class="container">

  <!-- ════════ HEADER ════════ -->
  <div class="header">
    <h1><span>LatencyZero</span> Diagnostic Report</h1>
    <div class="subtitle">Competitive Gaming Performance Analysis</div>
    <div class="meta">
      <span><span class="dot"></span> Generated: ${now}</span>
      <span>Scan: ${scanTime}</span>
      <span>Duration: ${duration}</span>
      <span>Samples: ${samples}</span>
    </div>
  </div>

  <!-- ════════ EXECUTIVE SUMMARY ════════ -->
  <div class="section">
    <div class="section-title">Executive Summary</div>
    <div class="exec-grid">
      <div class="exec-card">
        <div class="label">Performance Score</div>
        <div class="score-circle">
          <div class="num mono">${score}</div>
          <div class="grade">Grade <b>${g.letter}</b></div>
        </div>
      </div>
      <div class="exec-card">
        <div class="label">Overall Status</div>
        <div style="padding-top: 16px;">
          <div class="status-badge">${overallStatus}</div>
        </div>
      </div>
      <div class="exec-card">
        <div class="label">Findings Breakdown</div>
        <div style="padding-top: 12px;" class="alerts-row">
          <div class="alert-chip">
            <span class="ac-count" style="color:#ff3366;">${highCount}</span>
            <span style="color:#888;">High</span>
          </div>
          <div class="alert-chip">
            <span class="ac-count" style="color:#ffaa00;">${medCount}</span>
            <span style="color:#888;">Med</span>
          </div>
          <div class="alert-chip">
            <span class="ac-count" style="color:#00f0ff;">${lowCount}</span>
            <span style="color:#888;">Low</span>
          </div>
        </div>
      </div>
      <div class="exec-card">
        <div class="label">Game Profile</div>
        <div style="padding-top: 12px; font-size: 14px; font-weight: 600; color: #e0e0e8;">${gameProfile}</div>
      </div>
    </div>
  </div>

  <!-- ════════ SYSTEM METRICS ════════ -->
  <div class="section">
    <div class="section-title">System Metrics</div>
    <div class="card">
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Metric</th>
              <th>Current</th>
              <th>Average</th>
              <th>Maximum</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>DPC Latency</td>
              <td class="val" style="color:${valueColor(metrics.dpc.current, 100, 500)}">${metrics.dpc.current.toFixed(1)} µs</td>
              <td class="val" style="color:${valueColor(metrics.dpc.avg, 100, 500)}">${metrics.dpc.avg.toFixed(1)} µs</td>
              <td class="val" style="color:${valueColor(metrics.dpc.max, 200, 1000)}">${metrics.dpc.max.toFixed(1)} µs</td>
              <td>${metrics.dpc.max < 200 ? severityBadge('good') : metrics.dpc.max < 1000 ? severityBadge('warning') : severityBadge('critical')}</td>
            </tr>
            <tr>
              <td>ISR Latency</td>
              <td class="val" style="color:${valueColor(metrics.isr.current, 50, 200)}">${metrics.isr.current.toFixed(1)} µs</td>
              <td class="val" style="color:${valueColor(metrics.isr.avg, 50, 200)}">${metrics.isr.avg.toFixed(1)} µs</td>
              <td class="val" style="color:${valueColor(metrics.isr.max, 100, 500)}">${metrics.isr.max.toFixed(1)} µs</td>
              <td>${metrics.isr.max < 100 ? severityBadge('good') : metrics.isr.max < 500 ? severityBadge('warning') : severityBadge('critical')}</td>
            </tr>
            <tr>
              <td>Frame Time</td>
              <td class="val" style="color:${valueColor(metrics.frameTime.current, 11.11, 16.67)}">${metrics.frameTime.current.toFixed(3)} ms</td>
              <td class="val" style="color:${valueColor(metrics.frameTime.avg, 11.11, 16.67)}">${metrics.frameTime.avg.toFixed(3)} ms</td>
              <td class="val" style="color:#888">—</td>
              <td>${metrics.frameTime.avg < 11.11 ? severityBadge('good') : metrics.frameTime.avg < 16.67 ? severityBadge('warning') : severityBadge('critical')}</td>
            </tr>
            <tr>
              <td>Frame Time (1% Low)</td>
              <td class="val" style="color:#888">—</td>
              <td class="val" style="color:${valueColor(metrics.frameTime.min1pct, 12, 20)}">${metrics.frameTime.min1pct.toFixed(3)} ms</td>
              <td class="val" style="color:#888">—</td>
              <td>${metrics.frameTime.min1pct < 12 ? severityBadge('good') : metrics.frameTime.min1pct < 20 ? severityBadge('warning') : severityBadge('critical')}</td>
            </tr>
            <tr>
              <td>FPS (Current)</td>
              <td class="val" style="color:${valueColor(144 - metrics.fps.current, 30, 60)}">${metrics.fps.current.toFixed(1)}</td>
              <td class="val" style="color:#888">${metrics.fps.avg.toFixed(1)}</td>
              <td class="val" style="color:#888">${metrics.fps.min1pct.toFixed(1)}</td>
              <td>${metrics.fps.min1pct > 120 ? severityBadge('good') : metrics.fps.min1pct > 60 ? severityBadge('warning') : severityBadge('critical')}</td>
            </tr>
            <tr>
              <td>Ping</td>
              <td class="val" style="color:${valueColor(metrics.network.ping, 30, 60)}">${metrics.network.ping.toFixed(1)} ms</td>
              <td class="val" style="color:#888">—</td>
              <td class="val" style="color:#888">—</td>
              <td>${metrics.network.ping < 30 ? severityBadge('good') : metrics.network.ping < 60 ? severityBadge('warning') : severityBadge('critical')}</td>
            </tr>
            <tr>
              <td>Jitter</td>
              <td class="val" style="color:${valueColor(metrics.network.jitter, 2, 5)}">${metrics.network.jitter.toFixed(2)} ms</td>
              <td class="val" style="color:#888">—</td>
              <td class="val" style="color:#888">—</td>
              <td>${metrics.network.jitter < 2 ? severityBadge('good') : metrics.network.jitter < 5 ? severityBadge('warning') : severityBadge('critical')}</td>
            </tr>
            <tr>
              <td>Packet Loss</td>
              <td class="val" style="color:${valueColor(metrics.network.packetLoss, 0.1, 0.5)}">${metrics.network.packetLoss.toFixed(3)}%</td>
              <td class="val" style="color:#888">—</td>
              <td class="val" style="color:#888">—</td>
              <td>${metrics.network.packetLoss < 0.1 ? severityBadge('good') : metrics.network.packetLoss < 0.5 ? severityBadge('warning') : severityBadge('critical')}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>

  <!-- ════════ HARDWARE STATUS ════════ -->
  <div class="section">
    <div class="section-title">Hardware Status</div>
    <div class="hw-grid">
      <div class="hw-card">
        <div class="hw-label">CPU Usage</div>
        <div class="hw-value" style="color:${valueColor(metrics.hardware.cpu.usage, 70, 90)}">${metrics.hardware.cpu.usage.toFixed(1)}%</div>
        <div class="hw-sub">${metrics.hardware.cpu.temp}°C &middot; ${metrics.hardware.cpu.clock} MHz</div>
        <div class="hw-bar"><div class="hw-bar-fill" style="width:${metrics.hardware.cpu.usage}%;background:${valueColor(metrics.hardware.cpu.usage, 70, 90)}"></div></div>
      </div>
      <div class="hw-card">
        <div class="hw-label">GPU Usage</div>
        <div class="hw-value" style="color:${valueColor(metrics.hardware.gpu.usage, 80, 95)}">${metrics.hardware.gpu.usage.toFixed(1)}%</div>
        <div class="hw-sub">${metrics.hardware.gpu.temp}°C &middot; ${metrics.hardware.gpu.clock} MHz &middot; ${metrics.hardware.gpu.vram} GB VRAM</div>
        <div class="hw-bar"><div class="hw-bar-fill" style="width:${metrics.hardware.gpu.usage}%;background:${valueColor(metrics.hardware.gpu.usage, 80, 95)}"></div></div>
      </div>
      <div class="hw-card">
        <div class="hw-label">CPU Temperature</div>
        <div class="hw-value" style="color:${valueColor(metrics.hardware.cpu.temp, 75, 85)}">${metrics.hardware.cpu.temp}°C</div>
        <div class="hw-sub">Safe limit: ~95°C</div>
        <div class="hw-bar"><div class="hw-bar-fill" style="width:${Math.min(100, (metrics.hardware.cpu.temp / 100) * 100)}%;background:${valueColor(metrics.hardware.cpu.temp, 75, 85)}"></div></div>
      </div>
      <div class="hw-card">
        <div class="hw-label">GPU Temperature</div>
        <div class="hw-value" style="color:${valueColor(metrics.hardware.gpu.temp, 80, 88)}">${metrics.hardware.gpu.temp}°C</div>
        <div class="hw-sub">Safe limit: ~90°C</div>
        <div class="hw-bar"><div class="hw-bar-fill" style="width:${Math.min(100, (metrics.hardware.gpu.temp / 100) * 100)}%;background:${valueColor(metrics.hardware.gpu.temp, 80, 88)}"></div></div>
      </div>
      <div class="hw-card">
        <div class="hw-label">RAM Usage</div>
        <div class="hw-value" style="color:${valueColor(metrics.hardware.ram.percent, 75, 90)}">${metrics.hardware.ram.percent.toFixed(1)}%</div>
        <div class="hw-sub">${metrics.hardware.ram.available} GB available</div>
        <div class="hw-bar"><div class="hw-bar-fill" style="width:${metrics.hardware.ram.percent}%;background:${valueColor(metrics.hardware.ram.percent, 75, 90)}"></div></div>
      </div>
      <div class="hw-card">
        <div class="hw-label">Network Bandwidth</div>
        <div class="hw-value" style="color:#00f0ff">${metrics.network.download.toFixed(0)} <span style="font-size:12px;color:#555;">Mbps ↓</span></div>
        <div class="hw-sub">${metrics.network.upload.toFixed(0)} Mbps upload</div>
        <div class="hw-bar"><div class="hw-bar-fill" style="width:85%;background:#00f0ff"></div></div>
      </div>
    </div>
  </div>

  <!-- ════════ DRIVER ANALYSIS ════════ -->
  <div class="section">
    <div class="section-title">Driver Analysis — Top 5 by DPC Time</div>
    <div class="card">
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Driver</th>
              <th>Module</th>
              <th>DPC Time</th>
              <th>DPC Count</th>
              <th>ISR Time</th>
              <th>ISR Count</th>
              <th>Severity</th>
            </tr>
          </thead>
          <tbody>
            ${top5Drivers.map(d => `
            <tr>
              <td style="color:#c8c8d4;font-weight:500;">${d.name}</td>
              <td class="val" style="font-size:11px;color:#666;">${d.module}</td>
              <td class="val" style="color:${valueColor(d.dpcTime, 200, 1000)}">${d.dpcTime.toFixed(1)} µs</td>
              <td class="val">${d.dpcCount}</td>
              <td class="val" style="color:${valueColor(d.isrTime, 80, 300)}">${d.isrTime.toFixed(1)} µs</td>
              <td class="val">${d.isrCount}</td>
              <td>${severityBadge(d.severity)}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>
  </div>

  <!-- ════════ NETWORK ANALYSIS ════════ -->
  <div class="section">
    <div class="section-title">Network Analysis</div>
    <div class="card">
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Metric</th>
              <th>Value</th>
              <th>Competitive Target</th>
              <th>Assessment</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Ping (Latency)</td>
              <td class="val" style="color:${valueColor(metrics.network.ping, 30, 60)}">${metrics.network.ping.toFixed(1)} ms</td>
              <td style="color:#555;">&lt; 30 ms</td>
              <td>${metrics.network.ping < 30 ? severityBadge('good') : metrics.network.ping < 60 ? severityBadge('warning') : severityBadge('critical')}</td>
            </tr>
            <tr>
              <td>Jitter</td>
              <td class="val" style="color:${valueColor(metrics.network.jitter, 2, 5)}">${metrics.network.jitter.toFixed(2)} ms</td>
              <td style="color:#555;">&lt; 3 ms</td>
              <td>${metrics.network.jitter < 2 ? severityBadge('good') : metrics.network.jitter < 5 ? severityBadge('warning') : severityBadge('critical')}</td>
            </tr>
            <tr>
              <td>Packet Loss</td>
              <td class="val" style="color:${valueColor(metrics.network.packetLoss, 0.1, 0.5)}">${metrics.network.packetLoss.toFixed(3)}%</td>
              <td style="color:#555;">&lt; 0.1%</td>
              <td>${metrics.network.packetLoss < 0.1 ? severityBadge('good') : metrics.network.packetLoss < 0.5 ? severityBadge('warning') : severityBadge('critical')}</td>
            </tr>
            <tr>
              <td>Download</td>
              <td class="val" style="color:#00f0ff">${metrics.network.download.toFixed(1)} Mbps</td>
              <td style="color:#555;">&gt; 50 Mbps</td>
              <td>${metrics.network.download >= 50 ? severityBadge('good') : severityBadge('warning')}</td>
            </tr>
            <tr>
              <td>Upload</td>
              <td class="val" style="color:#00f0ff">${metrics.network.upload.toFixed(1)} Mbps</td>
              <td style="color:#555;">&gt; 10 Mbps</td>
              <td>${metrics.network.upload >= 10 ? severityBadge('good') : severityBadge('warning')}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="net-quality">
        <span class="nq-dot"></span>
        <span class="nq-label">${netQ.label}</span>
        <span class="nq-desc">&mdash; Overall connection quality for competitive gaming</span>
      </div>
    </div>
  </div>

  <!-- ════════ FINDINGS ════════ -->
  <div class="section">
    <div class="section-title">Findings &amp; Recommendations</div>
    ${findings.length === 0 ? `
      <div class="card" style="text-align:center;padding:32px;">
        <div style="font-size:14px;color:#00ff88;font-weight:600;">No issues detected</div>
        <div style="font-size:12px;color:#555;margin-top:4px;">Your system is performing within competitive thresholds.</div>
      </div>
    ` : findings.map(f => `
      <div class="finding">
        <div class="finding-head">
          ${priorityBadge(f.priority)}
          <span class="finding-title">${f.title}</span>
        </div>
        <div class="finding-meta">
          <span class="finding-id">${f.id}</span>
          <span class="finding-domain">&middot; ${f.domain}</span>
        </div>
        <div class="finding-body">
          <span class="ev-label">Evidence</span>
          ${f.evidence}
          <span class="rec-label">Recommendation</span>
          <span class="rec-text">${f.recommendation}</span>
        </div>
      </div>
    `).join('')}
  </div>

  <!-- ════════ FOOTER ════════ -->
  <div class="footer">
    <div class="brand">Generated by <span>LatencyZero</span> v1.9</div>
    <div class="ts">${now} &middot; ${samples} samples over ${duration}</div>
  </div>

</div>
</body>
</html>`
}

// ─── Route Handlers ──────────────────────────────────────────────────
export async function GET() {
  const data = sampleData()
  const html = buildHTML(data)
  return new Response(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Disposition': 'attachment; filename="latencyzero-report.html"',
    },
  })
}

export async function POST(request: NextRequest) {
  try {
    const body: ReportBody = await request.json()

    // Merge with sample data for any missing fields
    const fallback = sampleData()
    const data: Required<ReportBody> = {
      metrics: body.metrics ?? fallback.metrics,
      drivers: body.drivers ?? fallback.drivers,
      alerts: body.alerts ?? fallback.alerts,
      score: body.score ?? fallback.score,
      gameProfile: body.gameProfile ?? fallback.gameProfile,
      duration: body.duration ?? fallback.duration,
      samples: body.samples ?? fallback.samples,
    }

    const html = buildHTML(data)
    return new Response(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Disposition': 'attachment; filename="latencyzero-report.html"',
      },
    })
  } catch {
    return NextResponse.json(
      { error: 'Invalid request body. Expected JSON with metrics, drivers, alerts, score, gameProfile, duration, samples.' },
      { status: 400 }
    )
  }
}