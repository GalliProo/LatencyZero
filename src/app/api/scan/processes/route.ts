import { NextRequest, NextResponse } from 'next/server'
import type { ProcessScanData } from '@/lib/types'
import { unavailableSource } from '@/lib/types'

let storedData: ProcessScanData | null = null

const UNAVAILABLE_RESPONSE: ProcessScanData = {
  module: 'processes',
  source: unavailableSource('No Windows agent connected. Start the LatencyZero Agent to collect real data.'),
  processes: [],
  findings: [],
}

export async function GET() {
  return NextResponse.json(storedData ?? UNAVAILABLE_RESPONSE)
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    if (body.module !== 'processes') {
      return NextResponse.json(
        { error: 'Invalid module. Expected "processes".' },
        { status: 400 }
      )
    }

    if (!body.source || typeof body.source.source !== 'string') {
      return NextResponse.json(
        { error: 'Invalid source field.' },
        { status: 400 }
      )
    }

    if (!Array.isArray(body.processes)) {
      return NextResponse.json(
        { error: 'Missing or invalid "processes" array.' },
        { status: 400 }
      )
    }

    storedData = body as ProcessScanData
    return NextResponse.json({ status: 'stored', module: 'processes' }, { status: 201 })
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body.' },
      { status: 400 }
    )
  }
}