import { NextRequest, NextResponse } from 'next/server'
import { parseLatencyMonTxt, LatencyMonParseError } from '@/lib/latencymon-parser'

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file')

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { success: false, error: 'No file provided. Use form field "file".' },
        { status: 400 }
      )
    }

    // Validate file extension
    const filename = file.name.toLowerCase()
    if (!filename.endsWith('.txt')) {
      return NextResponse.json(
        { success: false, error: 'Invalid file type. Only .txt files are accepted.' },
        { status: 400 }
      )
    }

    // Validate file size (max 10MB)
    const maxSize = 10 * 1024 * 1024
    if (file.size > maxSize) {
      return NextResponse.json(
        { success: false, error: 'File too large. Maximum size is 10MB.' },
        { status: 400 }
      )
    }

    // Read file content as text (LatencyMon TXT is ASCII/UTF-8)
    const buffer = await file.arrayBuffer()
    const decoder = new TextDecoder('utf-8', { fatal: false })
    const content = decoder.decode(buffer)

    if (!content.trim()) {
      return NextResponse.json(
        { success: false, error: 'File is empty.' },
        { status: 400 }
      )
    }

    // Parse the LatencyMon report
    const data = parseLatencyMonTxt(content)

    return NextResponse.json({ success: true, data })
  } catch (err) {
    if (err instanceof LatencyMonParseError) {
      return NextResponse.json(
        {
          success: false,
          error: err.message,
          ...(err.line !== undefined ? { line: err.line } : {}),
        },
        { status: 422 }
      )
    }

    const message = err instanceof Error ? err.message : 'Unknown error occurred'
    return NextResponse.json(
      { success: false, error: `Parse error: ${message}` },
      { status: 500 }
    )
  }
}