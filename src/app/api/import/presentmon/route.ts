import { NextRequest, NextResponse } from 'next/server'
import { parsePresentMonCsv, ParseError } from '@/lib/presentmon-parser'

export const runtime = 'nodejs'

// Max file size: 200 MB
const MAX_FILE_SIZE = 200 * 1024 * 1024

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file')

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { success: false, error: 'No file provided. Use form field "file" with a .csv file.' },
        { status: 400 },
      )
    }

    // Validate file extension
    const filename = file.name.toLowerCase()
    if (!filename.endsWith('.csv')) {
      return NextResponse.json(
        { success: false, error: 'Invalid file type. Only .csv files are accepted.' },
        { status: 400 },
      )
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        {
          success: false,
          error: `File too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum size is ${MAX_FILE_SIZE / 1024 / 1024} MB.`,
        },
        { status: 400 },
      )
    }

    if (file.size === 0) {
      return NextResponse.json(
        { success: false, error: 'File is empty.' },
        { status: 400 },
      )
    }

    // Read file content as text (UTF-8)
    const csvContent = await file.text()

    // Parse the CSV
    const data = parsePresentMonCsv(csvContent)

    return NextResponse.json({
      success: true,
      data,
    })
  } catch (err) {
    if (err instanceof ParseError) {
      return NextResponse.json(
        {
          success: false,
          error: err.message,
          row: err.row ?? undefined,
        },
        { status: 422 },
      )
    }

    console.error('PresentMon import error:', err)
    return NextResponse.json(
      {
        success: false,
        error: 'An unexpected error occurred while processing the file.',
      },
      { status: 500 },
    )
  }
}