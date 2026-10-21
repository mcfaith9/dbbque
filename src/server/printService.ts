import os from 'node:os'
import fs from 'node:fs'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

export interface TicketPrintPayload {
  ticket_number: string
  queue_type: 'priority' | 'regular'
  created_at: string
  waiting_ahead?: number
}

export interface PrinterInfo {
  name: string
  isDefault: boolean
}

// In-memory printer override (can also be populated via PRINTER_NAME env variable)
let configuredPrinterName: string = process.env.PRINTER_NAME || ''

export function setConfiguredPrinter(name: string) {
  configuredPrinterName = name.trim()
}

export function getConfiguredPrinter(): string {
  return configuredPrinterName
}

/**
 * Format ticket slip text tailored for compact thermal ticket roll (58mm / 80mm).
 */
export function formatTicketText(ticket: TicketPrintPayload, lineWidth: number = 32): string {
  const center = (text: string) => {
    if (text.length >= lineWidth) return text
    const pad = Math.floor((lineWidth - text.length) / 2)
    return ' '.repeat(pad) + text
  }

  const divider = '='.repeat(lineWidth)
  const thinDivider = '-'.repeat(lineWidth)

  let formattedDate = ''
  try {
    formattedDate = new Date(ticket.created_at).toLocaleString()
  } catch {
    formattedDate = ticket.created_at || new Date().toLocaleString()
  }

  const isPriority = ticket.queue_type === 'priority'
  const laneTitle = isPriority ? '★ PRIORITY LANE ★' : 'REGULAR QUEUE'

  const lines: string[] = [
    divider,
    center('DBBQUE SYSTEM'),
    center('Queue Management'),
    divider,
    '',
    center(laneTitle),
    '',
    center('YOUR NUMBER:'),
    center(`[ ${ticket.ticket_number} ]`),
    '',
    divider,
    ticket.waiting_ahead !== undefined ? `Tickets ahead: ${ticket.waiting_ahead}` : '',
    `Date: ${formattedDate}`,
    thinDivider,
    center('Please watch display monitor'),
    center('and wait for your number.'),
    divider,
    '',
    '',
    '' // Extra feed lines for thermal tear-off
  ].filter((line) => line !== null && line !== undefined)

  return lines.join('\r\n')
}

/**
 * Retrieve installed printers on the host machine.
 */
export async function getInstalledPrinters(): Promise<PrinterInfo[]> {
  if (process.platform === 'win32') {
    try {
      // Use PowerShell to retrieve installed printers
      const psScript = `
        Get-CimInstance Win32_Printer | Select-Object Name, Default | ConvertTo-Json
      `
      const { stdout } = await execFileAsync('powershell.exe', [
        '-NoProfile',
        '-ExecutionPolicy',
        'Bypass',
        '-Command',
        psScript
      ])

      if (!stdout || !stdout.trim()) {
        return []
      }

      const parsed = JSON.parse(stdout)
      const list = Array.isArray(parsed) ? parsed : [parsed]
      return list.map((p: any) => ({
        name: String(p.Name || ''),
        isDefault: Boolean(p.Default)
      }))
    } catch (err) {
      console.warn('[PrintService] Failed to query Windows printers:', err)
      return []
    }
  }

  // Non-Windows dev fallback
  return [
    { name: 'System Default Thermal Printer', isDefault: true },
    { name: 'POS-58 Thermal USB', isDefault: false },
    { name: 'POS-80 Thermal USB', isDefault: false }
  ]
}

/**
 * Execute direct silent physical printing to the Windows printer without any browser dialogs.
 */
export async function printTicketSilently(ticket: TicketPrintPayload): Promise<{ success: boolean; message?: string; printerUsed?: string }> {
  // 1. Strict payload validation
  if (!ticket || !ticket.ticket_number) {
    return { success: false, message: 'Invalid ticket data: ticket number missing' }
  }

  // Sanitize ticket number to prevent command injection
  const safeTicketNumber = ticket.ticket_number.replace(/[^A-Za-z0-9_-]/g, '')
  if (!safeTicketNumber) {
    return { success: false, message: 'Invalid ticket number characters' }
  }

  const receiptContent = formatTicketText(ticket, 32)
  const targetPrinter = configuredPrinterName

  if (process.platform === 'win32') {
    // Write temporary receipt file with utf8 BOM for Windows PowerShell compatibility
    const tempDir = os.tmpdir()
    const tempFilePath = path.join(tempDir, `dbbque_ticket_${Date.now()}_${safeTicketNumber}.txt`)

    try {
      fs.writeFileSync(tempFilePath, receiptContent, { encoding: 'utf8' })

      // PowerShell Out-Printer sends silent raw print job directly to Windows spooler
      const psCommand = targetPrinter
        ? `Get-Content -LiteralPath '${tempFilePath.replace(/'/g, "''")}' -Raw -Encoding UTF8 | Out-Printer -Name '${targetPrinter.replace(/'/g, "''")}'`
        : `Get-Content -LiteralPath '${tempFilePath.replace(/'/g, "''")}' -Raw -Encoding UTF8 | Out-Printer`

      await execFileAsync('powershell.exe', [
        '-NoProfile',
        '-ExecutionPolicy',
        'Bypass',
        '-Command',
        psCommand
      ])

      return {
        success: true,
        message: 'Ticket sent to printer spooler successfully',
        printerUsed: targetPrinter || 'Default Windows Printer'
      }
    } catch (err: any) {
      console.error('[PrintService] Windows print job failed:', err)
      return {
        success: false,
        message: err?.message || 'Windows printer spooler error. Check printer USB cable and paper roll.'
      }
    } finally {
      // Clean up temporary file safely
      try {
        if (fs.existsSync(tempFilePath)) {
          fs.unlinkSync(tempFilePath)
        }
      } catch {
        // ignore cleanup error
      }
    }
  } else {
    // Non-Windows environment (e.g., Linux container / local dev simulation)
    console.log('[PrintService] Simulated Thermal Ticket Print:')
    console.log(receiptContent)
    return {
      success: true,
      message: 'Ticket sent to physical printer (Simulation / Virtual Spooler)',
      printerUsed: targetPrinter || 'Virtual Thermal Receipt Printer'
    }
  }
}
