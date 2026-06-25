import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET() {
  try {
    const sessions = await db.session.findMany({
      orderBy: { createdAt: 'desc' },
      take: 20,
      include: {
        snapshots: {
          orderBy: { timestamp: 'desc' },
          take: 1,
        },
      },
    })
    return NextResponse.json(sessions)
  } catch {
    return NextResponse.json([], { status: 200 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const session = await db.session.create({
      data: {
        name: body.name || `Session ${new Date().toISOString().slice(0, 19)}`,
        game: body.game || null,
        profile: body.profile || 'call_of_duty',
        score: body.score || 0,
        duration: body.duration || 0,
        samples: body.samples || 0,
        summary: body.summary ? JSON.stringify(body.summary) : '{}',
        avgDpc: body.avgDpc || 0,
        maxDpc: body.maxDpc || 0,
        avgIsr: body.avgIsr || 0,
        maxIsr: body.maxIsr || 0,
        avgFrametime: body.avgFrametime || 0,
        minFps1pct: body.minFps1pct || 0,
        avgPing: body.avgPing || 0,
        packetLoss: body.packetLoss || 0,
        status: 'completed',
      },
    })
    return NextResponse.json(session, { status: 201 })
  } catch (e) {
    console.error('Session save error:', e)
    return NextResponse.json({ error: 'Failed to save session' }, { status: 500 })
  }
}