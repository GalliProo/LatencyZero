// ─── Shared PowerShell / Command Runner ────────────────────────────────
import { spawn } from 'child_process'
import { config } from '../config'

/**
 * Execute a PowerShell command and return trimmed stdout.
 * Rejects on non-zero exit code or spawn error.
 */
export async function runPowerShell(command: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn('powershell.exe', [
      '-NoProfile', '-NonInteractive', '-Command', command,
    ], {
      timeout: config.commandTimeoutMs,
      shell: false,
    })

    let stdout = ''
    let stderr = ''

    proc.stdout.on('data', (data: Buffer) => { stdout += data.toString() })
    proc.stderr.on('data', (data: Buffer) => { stderr += data.toString() })

    proc.on('close', (code) => {
      if (code === 0) resolve(stdout.trim())
      else reject(new Error(`PowerShell exit ${code}: ${stderr.trim() || 'no stderr'}`))
    })
    proc.on('error', reject)
  })
}

/**
 * Execute an arbitrary command (e.g. nvidia-smi, ping) and return trimmed stdout.
 */
export async function runCommand(
  cmd: string,
  args: string[] = [],
): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, {
      timeout: config.commandTimeoutMs,
      shell: false,
    })

    let stdout = ''
    let stderr = ''

    proc.stdout.on('data', (data: Buffer) => { stdout += data.toString() })
    proc.stderr.on('data', (data: Buffer) => { stderr += data.toString() })

    proc.on('close', (code) => {
      if (code === 0) resolve(stdout.trim())
      else reject(new Error(`${cmd} exit ${code}: ${stderr.trim() || 'no stderr'}`))
    })
    proc.on('error', reject)
  })
}

/**
 * Safe wrapper: returns null on any error instead of throwing.
 */
export async function safe<T>(
  fn: () => Promise<T>,
): Promise<T | null> {
  try {
    return await fn()
  } catch {
    return null
  }
}