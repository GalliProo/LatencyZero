import { NextRequest, NextResponse } from 'next/server'

// Agent status in-memory storage
let agentConnected = false
let lastHeartbeat: number | null = null
let version: string | null = null
let uptime: number | null = null

// If no heartbeat for 30 seconds, consider agent disconnected
const HEARTBEAT_TIMEOUT_MS = 30_000

function isAgentAlive(): boolean {
  if (!agentConnected || !lastHeartbeat) return false
  return Date.now() - lastHeartbeat < HEARTBEAT_TIMEOUT_MS
}

interface AgentStatusResponse {
  agentConnected: boolean
  lastHeartbeat: number | null
  version: string | null
  uptime: number | null
}

export async function GET() {
  const status: AgentStatusResponse = {
    agentConnected: isAgentAlive(),
    lastHeartbeat,
    version,
    uptime,
  }
  return NextResponse.json(status)
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    // Agent heartbeat
    if (body.type === 'heartbeat') {
      agentConnected = true
      lastHeartbeat = Date.now()
      if (typeof body.version === 'string') version = body.version
      if (typeof body.uptime === 'number') uptime = body.uptime

      return NextResponse.json({
        status: 'ack',
        serverTime: Date.now(),
      })
    }

    // Agent disconnect
    if (body.type === 'disconnect') {
      agentConnected = false
      lastHeartbeat = null
      version = null
      uptime = null

      return NextResponse.json({ status: 'disconnected' })
    }

    return NextResponse.json(
      { error: 'Unknown heartbeat type. Use "heartbeat" or "disconnect".' },
      { status: 400 }
    )
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body.' },
      { status: 400 }
    )
  }
}