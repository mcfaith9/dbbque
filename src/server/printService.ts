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
  isOnline?: boolean
}

// In-memory printer configuration (can also be set via PRINTER_NAME env variable)
let configuredPrinterName: string = process.env.PRINTER_NAME || ''

// Configurable paper roll width: 32 columns (standard 58mm roll) or 48 columns (standard 80mm roll)
let configuredLineWidth: number = Number(process.env.PRINTER_WIDTH) || 32

export function setConfiguredPrinter(name: string) {
  configuredPrinterName = name.trim()
}

export function getConfiguredPrinter(): string {
  return configuredPrinterName
}

export function setConfiguredLineWidth(width: number) {
  // Supports both column count (32 vs 48) and paper roll width in mm (58 vs 80)
  if (width === 80 || width === 48 || width > 58) {
    configuredLineWidth = 48 // 80mm thermal paper (48 columns)
  } else {
    configuredLineWidth = 32 // 58mm thermal paper (32 columns)
  }
}

export function getConfiguredLineWidth(): number {
  return configuredLineWidth
}

/**
 * Format ticket slip text tailored for Windows printing and receipt paper.
 * Uses clean standard text formatting compatible with ALL Windows printers
 * (EPSON L5590 ink-tank, desktop printers, and thermal printers).
 */
export function formatTicketText(ticket: TicketPrintPayload, lineWidth: number = configuredLineWidth): string {
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

  // Centered, prominent queue number slip layout
  const lines: string[] = [
    divider,
    center('DBBQUE SYSTEM'),
    center('Queue Management'),
    divider,
    '',
    center(`* * *  [ ${ticket.ticket_number} ]  * * *`),
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
    '' // Extra feed lines for tear-off
  ].filter((line) => line !== null && line !== undefined)

  return lines.join('\r\n')
}

/**
 * Retrieve installed printers on the host machine, filtering and identifying online status.
 */
export async function getInstalledPrinters(): Promise<PrinterInfo[]> {
  if (process.platform === 'win32') {
    try {
      const psScript = `
        Get-CimInstance Win32_Printer | Select-Object Name, Default, WorkOffline, PrinterStatus | ConvertTo-Json
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
        isDefault: Boolean(p.Default),
        isOnline: !Boolean(p.WorkOffline) && Number(p.PrinterStatus) !== 7
      }))
    } catch (err) {
      console.warn('[PrintService] Failed to query Windows printers:', err)
      return []
    }
  }

  // Non-Windows dev fallback
  return [
    { name: 'EPSON L5590 Series', isDefault: true, isOnline: true },
    { name: 'System Default Printer', isDefault: false, isOnline: true },
    { name: 'POS-58 Thermal USB', isDefault: false, isOnline: true }
  ]
}

/**
 * Execute direct silent physical printing to the Windows printer using Out-Printer.
 * Compatible with Epson L5590 Series, HP, standard desktop printers, and thermal printers.
 * Safely filters out offline or erroring printers.
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

  const lineWidth = configuredLineWidth
  const receiptContent = formatTicketText(ticket, lineWidth)
  const targetPrinter = configuredPrinterName

  if (process.platform === 'win32') {
    const tempDir = os.tmpdir()
    const timestamp = Date.now()
    const tempFilePath = path.join(tempDir, `dbbque_ticket_${timestamp}_${safeTicketNumber}.txt`)

    try {
      // Write clean UTF-8 text file for Windows Out-Printer
      fs.writeFileSync(tempFilePath, receiptContent, { encoding: 'utf8' })

      const escapedPrinter = targetPrinter.replace(/'/g, "''")
      const escapedFilePath = tempFilePath.replace(/'/g, "''")

      // PowerShell script:
      // 1. Resolves target printer (ignoring offline/erroring devices like pending deletion HP printers)
      // 2. Pipes the text through Out-Printer directly to Windows Print Spooler
      // 3. Verifies execution and reports the printer actually used
      const psScript = `
        $ErrorActionPreference = 'Stop'
        $target = '${escapedPrinter}'

        if ($target) {
            $printerObj = Get-CimInstance Win32_Printer | Where-Object { $_.Name -eq $target } | Select-Object -First 1
            if (-not $printerObj) {
                throw "Specified printer '$target' was not found in Windows."
            }
            if ($printerObj.WorkOffline -eq $true) {
                throw "Specified printer '$target' is currently Offline."
            }
            $printerName = $printerObj.Name
        } else {
            # Automatically find available online printers (excluding Offline, PendingDeletion, Error)
            $allPrinters = Get-CimInstance Win32_Printer
            $activePrinters = $allPrinters | Where-Object {
                $_.WorkOffline -ne $true -and
                $_.PrinterStatus -ne 7 -and
                $_.Status -ne 'Error'
            }

            # Prefer the default printer if it is online and healthy
            $def = $activePrinters | Where-Object { $_.Default -eq $true } | Select-Object -First 1
            if ($def) {
                $printerName = $def.Name
            } else {
                # Otherwise pick the first online printer (e.g. EPSON L5590 Series)
                $firstActive = $activePrinters | Select-Object -First 1
                if ($firstActive) {
                    $printerName = $firstActive.Name
                } else {
                    # Last fallback if all show offline flags
                    $printerName = ($allPrinters | Select-Object -First 1).Name
                }
            }
        }

        if (-not $printerName) {
            throw "No operational printer found. Please connect and power on your printer."
        }

        # Send text job silently to the resolved Windows printer
        Get-Content -LiteralPath '${escapedFilePath}' -Raw -Encoding UTF8 | Out-Printer -Name $printerName
        Write-Output "SUCCESS:$printerName"
      `

      const { stdout } = await execFileAsync('powershell.exe', [
        '-NoProfile',
        '-ExecutionPolicy',
        'Bypass',
        '-Command',
        psScript
      ])

      const trimmedOut = stdout.trim()
      if (trimmedOut.startsWith('SUCCESS:')) {
        const usedPrinter = trimmedOut.split(':')[1]?.trim() || targetPrinter || 'Default Windows Printer'
        console.log(`[PrintService] Physical print job submitted successfully to: ${usedPrinter}`)
        return {
          success: true,
          message: `Ticket sent to printer spooler (${usedPrinter})`,
          printerUsed: usedPrinter
        }
      }

      return {
        success: false,
        message: 'Printer spooler returned unexpected output: ' + trimmedOut
      }
    } catch (err: any) {
      console.error('[PrintService] Windows print job failed:', err?.message || err)
      return {
        success: false,
        message: err?.message || 'Windows printer spooler error. Please check printer power and USB connection.'
      }
    } finally {
      try {
        if (fs.existsSync(tempFilePath)) {
          fs.unlinkSync(tempFilePath)
        }
      } catch {}
    }
  } else {
    // Non-Windows environment (e.g. Linux container / local dev simulation)
    console.log('[PrintService] Simulated Physical Ticket Print:')
    console.log(receiptContent)
    return {
      success: true,
      message: 'Ticket sent to physical printer (Simulation / Virtual Spooler)',
      printerUsed: targetPrinter || 'EPSON L5590 Series (Simulated)'
    }
  }
}
