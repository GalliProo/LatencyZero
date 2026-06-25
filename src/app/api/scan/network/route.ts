import { NextRequest, NextResponse } from 'next/server'
import type { NetworkScanData } from '@/lib/types'
import { unavailableSource } from '@/lib/types'

let storedData: NetworkScanData | null = null

const UNAVAILABLE_RESPONSE: NetworkScanData = {
  module: 'network',
  source: unavailableSource('No Windows agent connected. Start the LatencyZero Agent to collect real data.'),
  adapterName: null,
  adapterType: null,
  linkSpeed: null,
  pingGateway: null,
  ping1_1_1_1: null,
  ping8_8_8_8: null,
  avgPing: null,
  jitter: null,
  packetLoss: null,
  dnsTiming: null,
  findings: [],
}

export async function GET() {
  return NextResponse.json(storedData ?? UNAVAILABLE_RESPONSE)
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    if (body.module !== 'network') {
      return NextResponse.json(
        { error: 'Invalid module. Expected "network".' },
        { status: 400 }
      )
    }

    if (!body.source || typeof body.source.source !== 'string') {
      return NextResponse.json(
        { error: 'Invalid source field.' },
        { status: 400 }
      )
    }

    storedData = body as NetworkScanData
    return NextResponse.json({ status: 'stored', module: 'network' }, { status: 201 })
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body.' },
      { status: 400 }
    )
  }
}