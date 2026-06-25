'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import type { MetricsData, DriverInfo, AlertItem, LatencyPoint, FrameTimePoint, PingPoint } from '@/components/latency/types'

interface UseMetricsReturn {
  metrics: MetricsData | null
  drivers: DriverInfo[]
  alerts: AlertItem[]
  latencyData: LatencyPoint[]
  frameTimeData: FrameTimePoint[]
  pingData: PingPoint[]
  connected: boolean
  dismissAlert: (id: string) => void
}

const MAX_LATENCY_POINTS = 120
const MAX_PING_POINTS = 60

export function useMetrics(): UseMetricsReturn {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const driversIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const [metrics, setMetrics] = useState<MetricsData | null>(null)
  const [drivers, setDrivers] = useState<DriverInfo[]>([])
  const [alerts, setAlerts] = useState<AlertItem[]>([])
  const [latencyData, setLatencyData] = useState<LatencyPoint[]>([])
  const [frameTimeData, setFrameTimeData] = useState<FrameTimePoint[]>([])
  const [pingData, setPingData] = useState<PingPoint[]>([])
  const [connected, setConnected] = useState(false)

  const formatTime = useCallback((ts: number) => {
    const d = new Date(ts)
    return `${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}`
  }, [])

  const dismissAlert = useCallback((id: string) => {
    setAlerts(prev => prev.filter(a => a.id !== id))
  }, [])

  // Fetch metrics every 500ms
  useEffect(() => {
    let mounted = true

    const fetchMetrics = async () => {
      try {
        const res = await fetch('/api/metrics')
        if (!res.ok) return
        const data = await res.json()
        if (!mounted) return

        const m = data.metrics as MetricsData
        setMetrics(m)
        setConnected(true)

        const time = formatTime(m.timestamp)
        setLatencyData(prev => [...prev.slice(-MAX_LATENCY_POINTS + 1), { time, dpc: m.dpc.current, isr: m.isr.current }])
        setFrameTimeData(prev => [...prev.slice(-MAX_LATENCY_POINTS + 1), { time, frameTime: m.frameTime.current }])
        setPingData(prev => [...prev.slice(-MAX_PING_POINTS + 1), { time, ping: m.network.ping }])

        // Add new alerts
        if (data.alerts && Array.isArray(data.alerts)) {
          setAlerts(prev => [...prev.slice(-50), ...data.alerts])
        }
      } catch {
        setConnected(false)
      }
    }

    fetchMetrics()
    intervalRef.current = setInterval(fetchMetrics, 500)

    return () => {
      mounted = false
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [formatTime])

  // Fetch drivers every 8 seconds
  useEffect(() => {
    const fetchDrivers = async () => {
      try {
        const res = await fetch('/api/metrics?type=drivers')
        if (!res.ok) return
        const data = await res.json()
        setDrivers(Array.isArray(data) ? data : (data.drivers || []))
      } catch { /* silent */ }
    }

    fetchDrivers()
    driversIntervalRef.current = setInterval(fetchDrivers, 8000)

    return () => {
      if (driversIntervalRef.current) clearInterval(driversIntervalRef.current)
    }
  }, [])

  return { metrics, drivers, alerts, latencyData, frameTimeData, pingData, connected, dismissAlert }
}