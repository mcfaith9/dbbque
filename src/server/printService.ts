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

// ESC/POS command sequences for hardware thermal printers
export const ESC_CODES = {
  INIT: '\x1b@',
  ALIGN_CENTER: '\x1ba\x01',
  ALIGN_LEFT: '\x1ba\x00',
  BOLD_ON: '\x1bE\x01',
  BOLD_OFF: '\x1bE\x00',
  SIZE_DOUBLE: '\x1d!\x11', // 2x height, 2x width (standard 58mm)
  SIZE_TRIPLE: '\x1d!\x22', // 3x height, 3x width (wider 80mm)
  SIZE_NORMAL: '\x1d!\x00',
  CUT: '\x1dV\x00'
}

/**
 * Strips ESC/POS binary escape sequences to produce a clean plain-text fallback.
 */
export function stripEscPos(text: string, ticketNumber?: string, lineWidth: number = 32): string {
  const center = (t: string) => {
    if (t.length >= lineWidth) return t
    const pad = Math.floor((lineWidth - t.length) / 2)
    return ' '.repeat(pad) + t
  }

  // Remove ESC and GS control sequences
  let cleaned = text.replace(/\x1b[a-zA-Z0-9\x00-\x1f]|\x1d[a-zA-Z0-9\x00-\x1f]{1,2}/g, '')
  if (ticketNumber && !cleaned.includes(`[ ${ticketNumber} ]`)) {
    cleaned = cleaned.replace(/\[\s*\]/, center(`[ ${ticketNumber} ]`))
  }
  return cleaned
}

/**
 * Format ticket slip text tailored for compact thermal ticket roll (58mm / 80mm).
 * Renders the queue number BIG, BOLD, and CENTERED using ESC/POS formatting codes.
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

  // Choose size multiplier based on roll width:
  // 58mm (32 cols): Double size (2x width + 2x height, takes 18 of 32 columns)
  // 80mm (48 cols): Triple size (3x width + 3x height, takes 27 of 48 columns)
  const sizeCommand = lineWidth >= 40 ? ESC_CODES.SIZE_TRIPLE : ESC_CODES.SIZE_DOUBLE

  // BIG, BOLD, and CENTERED queue number format: [ P-001 ]
  const bigBoldQueueNumber = `${ESC_CODES.ALIGN_CENTER}${ESC_CODES.BOLD_ON}${sizeCommand}[ ${ticket.ticket_number} ]${ESC_CODES.SIZE_NORMAL}${ESC_CODES.BOLD_OFF}${ESC_CODES.ALIGN_LEFT}`

  const lines: string[] = [
    divider,
    center('DBBQUE SYSTEM'),
    center('Queue Management'),
    divider,
    '',
    bigBoldQueueNumber,
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
 * Uses Windows Winspool RAW printing to support hardware ESC/POS bold and double-size scaling,
 * with fallback to Out-Printer for standard text-only drivers.
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
    const rawFilePath = path.join(tempDir, `dbbque_raw_${timestamp}_${safeTicketNumber}.prn`)
    const plainFilePath = path.join(tempDir, `dbbque_plain_${timestamp}_${safeTicketNumber}.txt`)

    try {
      // 1. Prepare raw ESC/POS binary file with hardware initialization and auto-cut
      const rawHeader = ESC_CODES.INIT
      const rawFooter = `\r\n\r\n\r\n${ESC_CODES.CUT}`
      const fullRawContent = rawHeader + receiptContent + rawFooter
      fs.writeFileSync(rawFilePath, Buffer.from(fullRawContent, 'binary'))

      // 2. Prepare clean plaintext version (strips ESC/POS codes for Out-Printer fallback)
      const plainContent = stripEscPos(receiptContent, ticket.ticket_number, lineWidth)
      fs.writeFileSync(plainFilePath, plainContent, { encoding: 'utf8' })

      // 3. PowerShell execution with Win32 Spooler RAW printing + Out-Printer fallback
      const escapedPrinter = targetPrinter.replace(/'/g, "''")
      const escapedRawPath = rawFilePath.replace(/'/g, "''")
      const escapedPlainPath = plainFilePath.replace(/'/g, "''")

      const psScript = `
        $ErrorActionPreference = 'Stop'
        $printer = '${escapedPrinter}'

        if (-not $printer) {
            $def = Get-CimInstance Win32_Printer | Where-Object { $_.Default -eq $true } | Select-Object -First 1
            if ($def) { $printer = $def.Name }
            else {
                $any = Get-CimInstance Win32_Printer | Select-Object -First 1
                if ($any) { $printer = $any.Name }
            }
        }

        if (-not $printer) {
            throw "No available printer found on Windows."
        }

        $rawHelperCode = @'
        using System;
        using System.IO;
        using System.Runtime.InteropServices;

        public class RawPrinterHelper {
            [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Ansi)]
            public class DOCINFOA {
                [MarshalAs(UnmanagedType.LPStr)] public string pDocName;
                [MarshalAs(UnmanagedType.LPStr)] public string pOutputFile;
                [MarshalAs(UnmanagedType.LPStr)] public string pDataType;
            }
            [DllImport("winspool.Drv", EntryPoint = "OpenPrinterA", SetLastError = true, CharSet = CharSet.Ansi, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
            public static extern bool OpenPrinter([MarshalAs(UnmanagedType.LPStr)] string szPrinter, out IntPtr hPrinter, IntPtr pd);

            [DllImport("winspool.Drv", EntryPoint = "ClosePrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
            public static extern bool ClosePrinter(IntPtr hPrinter);

            [DllImport("winspool.Drv", EntryPoint = "StartDocPrinterA", SetLastError = true, CharSet = CharSet.Ansi, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
            public static extern bool StartDocPrinter(IntPtr hPrinter, Int32 level, [In, MarshalAs(UnmanagedType.LPStruct)] DOCINFOA di);

            [DllImport("winspool.Drv", EntryPoint = "EndDocPrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
            public static extern bool EndDocPrinter(IntPtr hPrinter);

            [DllImport("winspool.Drv", EntryPoint = "StartPagePrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
            public static extern bool StartPagePrinter(IntPtr hPrinter);

            [DllImport("winspool.Drv", EntryPoint = "EndPagePrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
            public static extern bool EndPagePrinter(IntPtr hPrinter);

            [DllImport("winspool.Drv", EntryPoint = "WritePrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
            public static extern bool WritePrinter(IntPtr hPrinter, IntPtr pBytes, Int32 dwCount, out Int32 dwWritten);

            public static bool SendFile(string printerName, string filePath) {
                if (!File.Exists(filePath)) return false;
                byte[] bytes = File.ReadAllBytes(filePath);
                IntPtr pUnmanagedBytes = Marshal.AllocCoTaskMem(bytes.Length);
                Marshal.Copy(bytes, 0, pUnmanagedBytes, bytes.Length);

                IntPtr hPrinter = IntPtr.Zero;
                DOCINFOA di = new DOCINFOA();
                di.pDocName = "DBBQUE Ticket";
                di.pDataType = "RAW";

                bool ok = false;
                if (OpenPrinter(printerName, out hPrinter, IntPtr.Zero)) {
                    if (StartDocPrinter(hPrinter, 1, di)) {
                        if (StartPagePrinter(hPrinter)) {
                            int written = 0;
                            ok = WritePrinter(hPrinter, pUnmanagedBytes, bytes.Length, out written);
                            EndPagePrinter(hPrinter);
                        }
                        EndDocPrinter(hPrinter);
                    }
                    ClosePrinter(hPrinter);
                }
                Marshal.FreeCoTaskMem(pUnmanagedBytes);
                return ok;
            }
        }
'@

        try {
            if (-not ([System.Management.Automation.PSTypeName]'RawPrinterHelper').Type) {
                Add-Type -TypeDefinition $rawHelperCode
            }
            $printed = [RawPrinterHelper]::SendFile($printer, '${escapedRawPath}')
            if (-not $printed) {
                throw "Winspool RAW printing returned false."
            }
            Write-Output "SUCCESS:RAW:$printer"
        } catch {
            # Fallback to standard Out-Printer with clean plain text
            Get-Content -LiteralPath '${escapedPlainPath}' -Raw -Encoding UTF8 | Out-Printer -Name $printer
            Write-Output "SUCCESS:OUTPRINTER:$printer"
        }
      `

      const { stdout } = await execFileAsync('powershell.exe', [
        '-NoProfile',
        '-ExecutionPolicy',
        'Bypass',
        '-Command',
        psScript
      ])

      const usedPrinter = stdout.includes('SUCCESS:')
        ? stdout.split(':')[2]?.trim() || targetPrinter || 'Default Windows Printer'
        : targetPrinter || 'Default Windows Printer'

      return {
        success: true,
        message: 'Ticket sent to printer spooler successfully (Hardware ESC/POS)',
        printerUsed: usedPrinter
      }
    } catch (err: any) {
      console.error('[PrintService] Windows print job failed:', err)
      return {
        success: false,
        message: err?.message || 'Windows printer spooler error. Check printer USB cable and paper roll.'
      }
    } finally {
      // Clean up temporary files safely
      try {
        if (fs.existsSync(rawFilePath)) fs.unlinkSync(rawFilePath)
      } catch {}
      try {
        if (fs.existsSync(plainFilePath)) fs.unlinkSync(plainFilePath)
      } catch {}
    }
  } else {
    // Non-Windows environment (e.g. Linux container / local dev simulation)
    const cleanDisplay = stripEscPos(receiptContent, ticket.ticket_number, lineWidth)
    console.log('[PrintService] Simulated Thermal Ticket Print:')
    console.log(cleanDisplay)
    return {
      success: true,
      message: 'Ticket sent to physical printer (Simulation / Virtual Spooler)',
      printerUsed: targetPrinter || 'Virtual Thermal Receipt Printer'
    }
  }
}
