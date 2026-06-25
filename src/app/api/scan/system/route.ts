import { NextRequest, NextResponse } from 'next/server'
import type { SystemScanData } from '@/lib/types'
import { unavailableSource } from '@/lib/types'

// In-memory storage for agent data
let storedData: SystemScanData | null = null

const UNAVAILABLE_RESPONSE: SystemScanData = {
  module: 'windows_system',
  source: unavailableSource('No Windows agent connected. Start the LatencyZero Agent to collect real data.'),
  cpuName: null,
  gpuName: null,
  ramTotal: null,
  ramSpeed: null,
  windowsVersion: null,
  windowsBuild: null,
  motherboard: null,
  biosVersion: null,
  powerPlan: null,
  secureBoot: null,
  tpm: null,
  vbsMemoryIntegrity: null,
  findings: [],
}

export async function GET() {
  return NextResponse.json(storedData ?? UNAVAILABLE_RESPONSE)
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    // Validate required fields
    if (body.module !== 'windows_system') {
      return NextResponse.json(
        { error: 'Invalid module. Expected "windows_system".' },
        { status: 400 }
      )
    }

    if (!body.source || typeof body.source.source !== 'string') {
      return NextResponse.json(
        { error: 'Invalid source field.' },
        { status: 400 }
      )
    }

    // Store the data
    storedData = body as SystemScanData
    return NextResponse.json({ status: 'stored', module: 'windows_system' }, { status: 201 })
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body.' },
      { status: 400 }
    )
  }
}