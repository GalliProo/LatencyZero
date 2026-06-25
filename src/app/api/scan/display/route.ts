import { NextRequest, NextResponse } from 'next/server'
import type { DisplayScanData } from '@/lib/types'
import { unavailableSource } from '@/lib/types'

let storedData: DisplayScanData | null = null

const UNAVAILABLE_RESPONSE: DisplayScanData = {
  module: 'display',
  source: unavailableSource('No Windows agent connected. Start the LatencyZero Agent to collect real data.'),
  monitorName: null,
  activeResolution: null,
  activeRefreshHz: null,
  maxRefreshHz: null,
  hdrEnabled: null,
  vrrEnabled: null,
  vrrType: null,
  scaling: null,
  multiMonitor: null,
  findings: [],
}

export async function GET() {
  return NextResponse.json(storedData ?? UNAVAILABLE_RESPONSE)
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    if (body.module !== 'display') {
      return NextResponse.json(
        { error: 'Invalid module. Expected "display".' },
        { status: 400 }
      )
    }

    if (!body.source || typeof body.source.source !== 'string') {
      return NextResponse.json(
        { error: 'Invalid source field.' },
        { status: 400 }
      )
    }

    storedData = body as DisplayScanData
    return NextResponse.json({ status: 'stored', module: 'display' }, { status: 201 })
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body.' },
      { status: 400 }
    )
  }
}