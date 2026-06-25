'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import type {
  SystemScanData,
  GPUScanData,
  NetworkScanData,
  ProcessScanData,
  DisplayScanData,
  ControllerScanData,
} from '@/lib/types'

export interface AgentStatus {
  agentConnected: boolean
  lastHeartbeat: number | null
  version: string | null
  uptime: number | null
}

export interface AgentData {
  status: AgentStatus
  system: SystemScanData | null
  gpu: GPUScanData | null
  network: NetworkScanData | null
  processes: ProcessScanData | null
  display: DisplayScanData | null
  controller: ControllerScanData | null
  lastFetched: number | null
  isFetching: boolean
  fetchError: string | null
  refetch: () => Promise<void>
  hasAnyRealData: boolean
  simulatedRatio: number
  mode: 'demo' | 'real'
}

const INITIAL_STATUS: AgentStatus = {
  agentConnected: false,
  lastHeartbeat: null,
  version: null,
  uptime: null,
}

/** Fast poll when agent connected, slow poll when no agent */
const FAST_INTERVAL_MS = 5000
const SLOW_INTERVAL_MS = 30000

async function safeFetch<T>(url: string, signal?: AbortSignal): Promise<T | null> {
  try {
    const res = await fetch(url, { signal })
    if (!res.ok) return null
    return res.json() as Promise<T>
  } catch {
    if (signal?.aborted) return null
    return null
  }
}

export function useAgentData(refreshIntervalMs = FAST_INTERVAL_MS): AgentData {
  const [status, setStatus] = useState<AgentStatus>(INITIAL_STATUS)
  const [system, setSystem] = useState<SystemScanData | null>(null)
  const [gpu, setGpu] = useState<GPUScanData | null>(null)
  const [network, setNetwork] = useState<NetworkScanData | null>(null)
  const [processes, setProcesses] = useState<ProcessScanData | null>(null)
  const [display, setDisplay] = useState<DisplayScanData | null>(null)
  const [controller, setController] = useState<ControllerScanData | null>(null)
  const [lastFetched, setLastFetched] = useState<number | null>(null)
  const [isFetching, setIsFetching] = useState(false)
  const [fetchError, setFetchError] = useState<string | null>(null)

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const mountedRef = useRef(true)
  const abortRef = useRef<AbortController | null>(null)
  const fetchCountRef = useRef(0)
  const agentConnectedRef = useRef(false)

  const isRealSource = useCallback((data: { source: { source: string } } | null | undefined): boolean => {
    if (!data) return false
    return data.source.source === 'measured' || data.source.source === 'imported' || data.source.source === 'estimated'
  }, [])

  const fetchAll = useCallback(async () => {
    if (!mountedRef.current) return

    // Abort any in-flight requests before starting a new cycle
    if (abortRef.current) {
      abortRef.current.abort()
    }
    abortRef.current = new AbortController()
    const signal = abortRef.current.signal

    setIsFetching(true)
    setFetchError(null)

    try {
      const [statusData, sysData, gpuData, netData, procData, dispData, ctrlData] = await Promise.all([
        safeFetch<AgentStatus>('/api/scan/status', signal),
        safeFetch<SystemScanData>('/api/scan/system', signal),
        safeFetch<GPUScanData>('/api/scan/gpu', signal),
        safeFetch<NetworkScanData>('/api/scan/network', signal),
        safeFetch<ProcessScanData>('/api/scan/processes', signal),
        safeFetch<DisplayScanData>('/api/scan/display', signal),
        safeFetch<ControllerScanData>('/api/scan/controller', signal),
      ])

      if (!mountedRef.current || signal.aborted) return

      // Stale-while-revalidate: only update state with new data, preserving old values
      // if fetch was aborted or component unmounted
      if (statusData) setStatus(statusData)
      if (sysData) setSystem(sysData)
      if (gpuData) setGpu(gpuData)
      if (netData) setNetwork(netData)
      if (procData) setProcesses(procData)
      if (dispData) setDisplay(dispData)
      if (ctrlData) setController(ctrlData)
      setLastFetched(Date.now())

      // Track agent connection state for adaptive polling
      if (statusData?.agentConnected) {
        agentConnectedRef.current = true
      } else if (fetchCountRef.current >= 1) {
        // After first fetch cycle, check if all scan data is unavailable
        const allUnavailable = !sysData?.source?.source ||
          sysData.source.source === 'unavailable'
        if (allUnavailable) {
          agentConnectedRef.current = false
        }
      }

      fetchCountRef.current++
    } catch (err) {
      if (mountedRef.current && !signal.aborted) {
        setFetchError(err instanceof Error ? err.message : 'Fetch failed')
      }
    } finally {
      if (mountedRef.current && !signal.aborted) {
        setIsFetching(false)
      }
    }
  }, [])

  // Memoize the scan modules array to avoid recreating on every render
  const scanModules = useMemo(
    () => [system, gpu, network, processes, display, controller] as const,
    [system, gpu, network, processes, display, controller],
  )

  const hasAnyRealData = scanModules.some(isRealSource)
  const realCount = scanModules.filter(isRealSource).length
  const simulatedRatio = 1 - (realCount / scanModules.length)
  const mode: 'demo' | 'real' = realCount >= 2 ? 'real' : 'demo'

  // Adaptive polling: switch interval based on agent connection state
  useEffect(() => {
    mountedRef.current = true

    const getInterval = () => {
      // Always start with the provided interval for the first fetch
      if (fetchCountRef.current === 0) return refreshIntervalMs
      // If agent is connected, use fast polling
      if (agentConnectedRef.current) return FAST_INTERVAL_MS
      // If no agent, use slow polling
      return SLOW_INTERVAL_MS
    }

    fetchAll()

    if (refreshIntervalMs > 0) {
      // Set up interval with current rate
      const startInterval = () => {
        if (intervalRef.current) {
          clearInterval(intervalRef.current)
        }
        intervalRef.current = setInterval(() => {
          const currentInterval = getInterval()
          // Re-evaluate interval after each fetch cycle
          fetchAll().then(() => {
            if (!mountedRef.current) return
            const newInterval = getInterval()
            if (newInterval !== currentInterval) {
              startInterval()
            }
          })
        }, getInterval())
      }
      startInterval()
    }

    return () => {
      mountedRef.current = false
      if (abortRef.current) {
        abortRef.current.abort()
        abortRef.current = null
      }
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [fetchAll, refreshIntervalMs])

  return {
    status,
    system,
    gpu,
    network,
    processes,
    display,
    controller,
    lastFetched,
    isFetching,
    fetchError,
    refetch: fetchAll,
    hasAnyRealData,
    simulatedRatio,
    mode,
  }
}