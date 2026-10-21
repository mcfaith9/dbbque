export interface PrintableTicket {
  ticket_number: string
  queue_type: 'priority' | 'regular'
  created_at: string
  waiting_ahead?: number
}

export interface PrintResult {
  success: boolean
  message?: string
  printerUsed?: string
}

export interface PrinterDriver {
  name: string
  print: (ticket: PrintableTicket) => Promise<PrintResult>
}

/**
 * Driver that sends tickets directly to the local Windows Print Spooler / USB thermal printer
 * without triggering any browser print dialog.
 */
export class LocalhostThermalDriver implements PrinterDriver {
  name = 'Automatic Silent Thermal Printer (USB / Local Spooler)'

  async print(ticket: PrintableTicket): Promise<PrintResult> {
    try {
      const response = await fetch('/api/print/ticket', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          ticket_number: ticket.ticket_number,
          queue_type: ticket.queue_type,
          created_at: ticket.created_at,
          waiting_ahead: ticket.waiting_ahead
        })
      })

      const data = await response.json()
      if (response.ok && data.success) {
        return {
          success: true,
          message: data.message || 'Ticket printed successfully',
          printerUsed: data.printerUsed
        }
      }

      return {
        success: false,
        message: data.message || `Printing failed with HTTP status ${response.status}`
      }
    } catch (err: any) {
      console.error('[Printer] Localhost print request failed:', err)
      return {
        success: false,
        message: err?.message || 'Could not reach local printing service. Check server connection.'
      }
    }
  }
}

class PrinterService {
  private driver: PrinterDriver = new LocalhostThermalDriver()

  setDriver(driver: PrinterDriver) {
    this.driver = driver
  }

  getDriverName(): string {
    return this.driver.name
  }

  async printTicket(ticket: PrintableTicket): Promise<PrintResult> {
    try {
      return await this.driver.print(ticket)
    } catch (err: any) {
      return {
        success: false,
        message: err?.message || 'Unexpected printer exception'
      }
    }
  }

  async getConfig(): Promise<{ configuredPrinter: string; isWindows: boolean }> {
    try {
      const res = await fetch('/api/print/config')
      return await res.json()
    } catch {
      return { configuredPrinter: 'Default Printer', isWindows: false }
    }
  }

  async getPrinters(): Promise<{ printers: { name: string; isDefault: boolean }[]; configuredPrinter: string; isWindows: boolean }> {
    try {
      const res = await fetch('/api/print/printers')
      return await res.json()
    } catch {
      return { printers: [], configuredPrinter: 'Default Printer', isWindows: false }
    }
  }
}

export const printerService = new PrinterService()
