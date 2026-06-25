import { NextRequest, NextResponse } from 'next/server'
import type { ControllerScanData } from '@/lib/types'
import { unavailableSource } from '@/lib/types'

let storedData: ControllerScanData | null = null

const UNAVAILABLE_RESPONSE: ControllerScanData = {
  module: 'controller',
  source: unavailableSource('No Windows agent connected. Start the LatencyZero Agent to collect real data.'),
  controllerName: null,
  transport: null,
  api: null,
  avgPollingMs: null,
  p95PollingMs: null,
  inputJitterMs: null,
  estimatedDropRate: null,
  findings: [],
}

export async function GET() {
  return NextResponse.json(storedData ?? UNAVAILABLE_RESPONSE)
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    if (body.module !== 'controller') {
      return NextResponse.json(
        { error: 'Invalid module. Expected "controller".' },
        { status: 400 }
      )
    }

    if (!body.source || typeof body.source.source !== 'string') {
      return NextResponse.json(
        { error: 'Invalid source field.' },
        { status: 400 }
      )
    }

    storedData = body as ControllerScanData
    return NextResponse.json({ status: 'stored', module: 'controller' }, { status: 201 })
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body.' },
      { status: 400 }
    )
  }
}