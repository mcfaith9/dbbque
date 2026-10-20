export interface PrintableTicket {
  ticket_number: string
  queue_type: 'priority' | 'regular'
  created_at: string
  waiting_ahead?: number
}

export interface PrinterDriver {
  name: string
  print: (ticket: PrintableTicket) => Promise<boolean>
}

class BrowserPrinterDriver implements PrinterDriver {
  name = 'Standard Browser / Thermal Receipt Driver'

  async print(ticket: PrintableTicket): Promise<boolean> {
    return new Promise((resolve) => {
      try {
        const iframe = document.createElement('iframe')
        iframe.style.position = 'fixed'
        iframe.style.right = '0'
        iframe.style.bottom = '0'
        iframe.style.width = '0'
        iframe.style.height = '0'
        iframe.style.border = '0'
        document.body.appendChild(iframe)

        const doc = iframe.contentWindow?.document
        if (!doc) {
          resolve(false)
          return
        }

        const formattedDate = new Date(ticket.created_at).toLocaleString()
        const isPriority = ticket.queue_type === 'priority'

        doc.open()
        doc.write(`
          <!DOCTYPE html>
          <html>
            <head>
              <meta charset="utf-8" />
              <title>Ticket ${ticket.ticket_number}</title>
              <style>
                @page {
                  size: 80mm auto;
                  margin: 0;
                }
                body {
                  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                  width: 72mm;
                  margin: 0 auto;
                  padding: 12px 6px;
                  text-align: center;
                  color: #000;
                  background: #fff;
                }
                .header {
                  font-size: 16px;
                  font-weight: 700;
                  margin-bottom: 4px;
                  letter-spacing: 1px;
                }
                .sub {
                  font-size: 11px;
                  color: #555;
                  margin-bottom: 12px;
                }
                .badge {
                  display: inline-block;
                  font-size: 11px;
                  font-weight: 800;
                  padding: 3px 8px;
                  border-radius: 4px;
                  background: ${isPriority ? '#000' : '#e5e7eb'};
                  color: ${isPriority ? '#fff' : '#000'};
                  text-transform: uppercase;
                  letter-spacing: 1px;
                  margin-bottom: 8px;
                }
                .ticket-no {
                  font-size: 44px;
                  font-weight: 900;
                  letter-spacing: 2px;
                  margin: 8px 0;
                  line-height: 1;
                }
                .divider {
                  border-top: 1px dashed #666;
                  margin: 12px 0;
                }
                .info {
                  font-size: 11px;
                  line-height: 1.5;
                  margin-bottom: 8px;
                }
                .waiting {
                  font-size: 12px;
                  font-weight: 600;
                  margin: 6px 0;
                }
                .footer {
                  font-size: 10px;
                  color: #777;
                  margin-top: 8px;
                }
              </style>
            </head>
            <body>
              <div class="header">DBBQUE SYSTEM</div>
              <div class="sub">Queue Management</div>
              <div class="badge">${isPriority ? '★ Priority Lane ★' : 'Regular Customer'}</div>
              <div class="ticket-no">${ticket.ticket_number}</div>
              <div class="divider"></div>
              ${ticket.waiting_ahead !== undefined ? `<div class="waiting">Tickets ahead of you: <strong>${ticket.waiting_ahead}</strong></div>` : ''}
              <div class="info">
                Please watch the display monitor and listen for your number to be called.
              </div>
              <div class="divider"></div>
              <div class="footer">
                Date: ${formattedDate}
              </div>
            </body>
          </html>
        `)
        doc.close()

        setTimeout(() => {
          try {
            iframe.contentWindow?.focus()
            iframe.contentWindow?.print()
            resolve(true)
          } catch (e) {
            console.warn('Print trigger failed:', e)
            resolve(false)
          } finally {
            setTimeout(() => {
              document.body.removeChild(iframe)
            }, 2000)
          }
        }, 300)
      } catch (err) {
        console.error('Print error:', err)
        resolve(false)
      }
    })
  }
}

class PrinterService {
  private driver: PrinterDriver = new BrowserPrinterDriver()

  setDriver(driver: PrinterDriver) {
    this.driver = driver
  }

  getDriverName(): string {
    return this.driver.name
  }

  async printTicket(ticket: PrintableTicket): Promise<{ success: boolean; message?: string }> {
    try {
      const ok = await this.driver.print(ticket)
      return { success: ok }
    } catch (err: any) {
      return { success: false, message: err?.message || 'Printer failed to print' }
    }
  }
}

export const printerService = new PrinterService()
