import { NextRequest, NextResponse } from 'next/server'
import type { GPUScanData } from '@/lib/types'
import { unavailableSource } from '@/lib/types'

let storedData: GPUScanData | null = null

const UNAVAILABLE_RESPONSE: GPUScanData = {
  module: 'nvidia_gpu',
  source: unavailableSource('No Windows agent connected. Start the LatencyZero Agent to collect real data.'),
  gpuName: null,
  driverVersion: null,
  gpuUsage: null,
  vramUsage: null,
  vramTotal: null,
  gpuClock: null,
  memClock: null,
  temperature: null,
  temperatureHotspot: null,
  powerDraw: null,
  powerLimit: null,
  fanSpeed: null,
  throttleReason: null,
  pcieBusInfo: null,
  findings: [],
}

export async function GET() {
  return NextResponse.json(storedData ?? UNAVAILABLE_RESPONSE)
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    if (body.module !== 'nvidia_gpu') {
      return NextResponse.json(
        { error: 'Invalid module. Expected "nvidia_gpu".' },
        { status: 400 }
      )
    }

    if (!body.source || typeof body.source.source !== 'string') {
      return NextResponse.json(
        { error: 'Invalid source field.' },
        { status: 400 }
      )
    }

    storedData = body as GPUScanData
    return NextResponse.json({ status: 'stored', module: 'nvidia_gpu' }, { status: 201 })
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body.' },
      { status: 400 }
    )
  }
}