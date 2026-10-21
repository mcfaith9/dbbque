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
 * Preserves the exact text layout and queue number format [ P-001 ].
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

  const lines: string[] = [
    divider,
    center('VISAYAN ELECTRIC'),
    divider,
    '',
    center(`[ ${ticket.ticket_number} ]`),
    '',
    divider,
    `Date: ${formattedDate}`,
    thinDivider,
    center('Please watch display monitor'),
    center('and wait for your number. Thank You :)'),
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
 * Execute direct silent physical printing to the Windows printer.
 * Uses .NET System.Drawing.Printing to render the ticket queue number in BIG (28pt) and BOLD
 * font while rendering the surrounding receipt in normal-sized text.
 * Completely silent (StandardPrintController suppresses print dialogs) with Out-Printer fallback.
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

  let formattedDate = ''
  try {
    formattedDate = new Date(ticket.created_at).toLocaleString()
  } catch {
    formattedDate = ticket.created_at || new Date().toLocaleString()
  }

  if (process.platform === 'win32') {
    const tempDir = os.tmpdir()
    const timestamp = Date.now()
    const tempFilePath = path.join(tempDir, `dbbque_ticket_${timestamp}_${safeTicketNumber}.txt`)

    try {
      // Write clean UTF-8 text file as fallback
      fs.writeFileSync(tempFilePath, receiptContent, { encoding: 'utf8' })

      const escapedPrinter = targetPrinter.replace(/'/g, "''")
      const escapedFilePath = tempFilePath.replace(/'/g, "''")
      const escapedTicketNumber = safeTicketNumber.replace(/'/g, "''")
      const escapedDate = formattedDate.replace(/'/g, "''")
      const escapedWaiting = (ticket.waiting_ahead !== undefined ? `Tickets ahead: ${ticket.waiting_ahead}` : '').replace(/'/g, "''")
      const dividerStr = '='.repeat(lineWidth).replace(/'/g, "''")
      const thinDividerStr = '-'.repeat(lineWidth).replace(/'/g, "''")

      // PowerShell script using .NET System.Drawing.Printing.PrintDocument:
      // - StandardPrintController ensures 100% silent printing (no print preview or dialog)
      // - Renders queue number in 28pt BOLD Segoe UI
      // - Renders headers in 11pt Bold, body text in 9pt Regular
      // - Falls back cleanly to Out-Printer if GDI canvas encounters an unexpected issue
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
            $allPrinters = Get-CimInstance Win32_Printer
            $activePrinters = $allPrinters | Where-Object {
                $_.WorkOffline -ne $true -and
                $_.PrinterStatus -ne 7 -and
                $_.Status -ne 'Error'
            }

            $def = $activePrinters | Where-Object { $_.Default -eq $true } | Select-Object -First 1
            if ($def) {
                $printerName = $def.Name
            } else {
                $firstActive = $activePrinters | Select-Object -First 1
                if ($firstActive) {
                    $printerName = $firstActive.Name
                } else {
                    $printerName = ($allPrinters | Select-Object -First 1).Name
                }
            }
        }

        if (-not $printerName) {
            throw "No operational printer found. Please connect and power on your printer."
        }

        try {
            Add-Type -AssemblyName System.Drawing

            $doc = New-Object System.Drawing.Printing.PrintDocument
            $doc.PrintController = New-Object System.Drawing.Printing.StandardPrintController
            $doc.PrinterSettings.PrinterName = $printerName

            $titleFont = New-Object System.Drawing.Font("Segoe UI", 11, [System.Drawing.FontStyle]::Bold)
            $subFont = New-Object System.Drawing.Font("Segoe UI", 9, [System.Drawing.FontStyle]::Regular)
            $monoFont = New-Object System.Drawing.Font("Segoe UI", 8, [System.Drawing.FontStyle]::Regular)
            # BIG AND BOLD QUEUE NUMBER FONT (28pt Bold)
            $queueFont = New-Object System.Drawing.Font("Segoe UI", 28, [System.Drawing.FontStyle]::Bold)
            $instrFont = New-Object System.Drawing.Font("Segoe UI", 8.5, [System.Drawing.FontStyle]::Regular)
            $brush = [System.Drawing.Brushes]::Black

            $centerFormat = New-Object System.Drawing.StringFormat
            $centerFormat.Alignment = [System.Drawing.StringAlignment]::Center

            $leftFormat = New-Object System.Drawing.StringFormat
            $leftFormat.Alignment = [System.Drawing.StringAlignment]::Near

            $doc.add_PrintPage({
                param($sender, $ev)
                $g = $ev.Graphics
                $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit

                $slipWidth = if (${lineWidth} -ge 40) { 380.0 } else { 280.0 }
                $y = 12.0

                # 1. Header
                $r = New-Object System.Drawing.RectangleF(0, $y, $slipWidth, 18.0)
                $g.DrawString("VISAYAN ELECTRIC", $titleFont, $brush, $r, $centerFormat)
                $y += 18.0

                # 2. Top Divider
                $r = New-Object System.Drawing.RectangleF(0, $y, $slipWidth, 14.0)
                $g.DrawString('${dividerStr}', $monoFont, $brush, $r, $centerFormat)
                $y += 18.0

                # 3. BIG AND BOLD QUEUE NUMBER
                $y += 4.0
                $r = New-Object System.Drawing.RectangleF(0, $y, $slipWidth, 48.0)
                $g.DrawString("[ ${escapedTicketNumber} ]", $queueFont, $brush, $r, $centerFormat)
                $y += 50.0

                # 4. Mid Divider
                $r = New-Object System.Drawing.RectangleF(0, $y, $slipWidth, 14.0)
                $g.DrawString('${dividerStr}', $monoFont, $brush, $r, $centerFormat)
                $y += 18.0

                # 6. Date
                $r = New-Object System.Drawing.RectangleF(10.0, $y, ($slipWidth - 20.0), 16.0)
                $g.DrawString('Date: ${escapedDate}', $subFont, $brush, $r, $leftFormat)
                $y += 16.0

                # 7. Thin Divider
                $r = New-Object System.Drawing.RectangleF(0, $y, $slipWidth, 14.0)
                $g.DrawString('${thinDividerStr}', $monoFont, $brush, $r, $centerFormat)
                $y += 16.0

                # 7.5. Tickets Ahead (if available)
                if ('${escapedWaiting}') {
                    $r = New-Object System.Drawing.RectangleF(10.0, $y, ($slipWidth - 20.0), 16.0)
                    $g.DrawString('${escapedWaiting}', $subFont, $brush, $r, $leftFormat)
                    $y += 16.0
                }

                # 8. Instructions
                $r = New-Object System.Drawing.RectangleF(0, $y, $slipWidth, 15.0)
                $g.DrawString("Please watch display monitor and wait for", $instrFont, $brush, $r, $centerFormat)
                $y += 15.0

                $r = New-Object System.Drawing.RectangleF(0, $y, $slipWidth, 15.0)
                $g.DrawString("your number. Thank You :)", $instrFont, $brush, $r, $centerFormat)
                $y += 16.0

                # 9. Bottom Divider
                $r = New-Object System.Drawing.RectangleF(0, $y, $slipWidth, 14.0)
                $g.DrawString('${dividerStr}', $monoFont, $brush, $r, $centerFormat)

                $ev.HasMorePages = $false
            })

            $doc.Print()
            Write-Output "SUCCESS:GDI:$printerName"
        } catch {
            # Fallback to plain Out-Printer if GDI print driver encountered an error
            Get-Content -LiteralPath '${escapedFilePath}' -Raw -Encoding UTF8 | Out-Printer -Name $printerName
            Write-Output "SUCCESS:OUTPRINTER:$printerName"
        }
      `

      const { stdout } = await execFileAsync('powershell.exe', [
        '-NoProfile',
        '-ExecutionPolicy',
        'Bypass',
        '-Command',
        psScript
      ])

      const trimmedOut = stdout.trim()
      if (trimmedOut.includes('SUCCESS:')) {
        const parts = trimmedOut.split('\n').filter(l => l.includes('SUCCESS:')).pop() || ''
        const usedPrinter = parts.split(':')[2]?.trim() || targetPrinter || 'Default Windows Printer'
        console.log(`[PrintService] Physical print job submitted successfully to: ${usedPrinter}`)
        return {
          success: true,
          message: `Ticket printed with bold queue number to ${usedPrinter}`,
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
        message: err?.message || 'Windows printer spooler error. Please check printer power and connection.'
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
    console.log('[PrintService] Simulated Physical Ticket Print (Big & Bold Queue Number):')
    console.log(receiptContent)
    return {
      success: true,
      message: 'Ticket sent to physical printer (Simulation / Virtual Spooler)',
      printerUsed: targetPrinter || 'EPSON L5590 Series (Simulated)'
    }
  }
}
