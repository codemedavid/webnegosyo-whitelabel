import { BrowserWindow } from 'electron'
import type { AppSettings, ReceiptPayload, PrintResult } from '../shared/types'

const PESO = '₱'

function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function money(value: number): string {
  return `${PESO}${value.toFixed(2)}`
}

export function buildReceiptHtml(payload: ReceiptPayload, settings: AppSettings): string {
  const { order, tenantName, copyLabel } = payload
  const narrow = settings.paperWidthMm === 58
  const orderNo = order._id.slice(-6).toUpperCase()
  const placedAt = new Date(order._creationTime).toLocaleString('en-PH', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })

  const itemsHtml = (order.items ?? [])
    .map((item) => {
      const lines: string[] = []
      lines.push(
        `<div class="row item"><span>${item.quantity} x ${esc(item.menuItemName)}</span><span>${money(item.subtotal)}</span></div>`
      )
      if (item.bundleName) {
        lines.push(`<div class="sub">Bundle: ${esc(item.bundleName)}${item.slotName ? ` (${esc(item.slotName)})` : ''}</div>`)
      }
      if (item.variationSelections?.length) {
        for (const sel of item.variationSelections) {
          lines.push(`<div class="sub">${esc(sel.typeName)}: ${esc(sel.optionName)}</div>`)
        }
      } else if (item.variation) {
        lines.push(`<div class="sub">${esc(item.variation)}</div>`)
      }
      for (const addon of item.addons ?? []) {
        const qty = addon.quantity && addon.quantity > 1 ? `${addon.quantity} x ` : ''
        lines.push(`<div class="sub">+ ${qty}${esc(addon.name)} (${money(addon.price)})</div>`)
      }
      if (item.specialInstructions) {
        lines.push(`<div class="sub note">"${esc(item.specialInstructions)}"</div>`)
      }
      return lines.join('')
    })
    .join('')

  const subtotal = (order.items ?? []).reduce((sum, item) => sum + item.subtotal, 0)
  const deliveryRow = order.deliveryFee
    ? `<div class="row"><span>Delivery Fee</span><span>${money(order.deliveryFee)}</span></div>`
    : ''

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    width: ${settings.paperWidthMm}mm;
    font-family: "Courier New", monospace;
    font-size: ${narrow ? '10px' : '12px'};
    color: #000;
    padding: ${narrow ? '2mm' : '3mm'};
  }
  .center { text-align: center; }
  .bold { font-weight: bold; }
  .lg { font-size: ${narrow ? '13px' : '16px'}; }
  .hr { border-top: 1px dashed #000; margin: 4px 0; }
  .row { display: flex; justify-content: space-between; gap: 6px; }
  .row.item { margin-top: 3px; }
  .row span:first-child { flex: 1; word-break: break-word; }
  .sub { padding-left: 12px; font-size: ${narrow ? '9px' : '11px'}; }
  .note { font-style: italic; }
  .total { font-size: ${narrow ? '12px' : '15px'}; font-weight: bold; margin-top: 3px; }
  .meta { margin: 1px 0; }
  .footer { margin-top: 8px; }
  .copy { margin-top: 4px; font-size: ${narrow ? '9px' : '10px'}; }
</style>
</head>
<body>
  <div class="center bold lg">${esc(tenantName)}</div>
  <div class="hr"></div>
  <div class="meta row"><span>Order #${esc(orderNo)}</span><span>${esc(order.orderType ?? '')}</span></div>
  <div class="meta">${esc(placedAt)}</div>
  <div class="meta">Customer: ${esc(order.customerName)}</div>
  <div class="meta">Contact: ${esc(order.customerContact)}</div>
  ${order.deliveryAddress ? `<div class="meta">Address: ${esc(order.deliveryAddress)}</div>` : ''}
  <div class="hr"></div>
  ${itemsHtml}
  <div class="hr"></div>
  <div class="row"><span>Subtotal</span><span>${money(subtotal)}</span></div>
  ${deliveryRow}
  <div class="row total"><span>TOTAL</span><span>${money(order.total)}</span></div>
  ${order.paymentMethod ? `<div class="meta">Payment: ${esc(order.paymentMethod)}${order.paymentStatus ? ` (${esc(order.paymentStatus)})` : ''}</div>` : ''}
  ${order.paymentMethodDetails ? `<div class="meta">${esc(order.paymentMethodDetails)}</div>` : ''}
  <div class="hr"></div>
  <div class="center footer">${esc(settings.receiptFooter)}</div>
  ${copyLabel ? `<div class="center copy">${esc(copyLabel)}</div>` : ''}
</body>
</html>`
}

const PX_TO_MICRONS = 25400 / 96

export async function printReceipt(
  payload: ReceiptPayload,
  settings: AppSettings
): Promise<PrintResult> {
  const html = buildReceiptHtml(payload, settings)
  const win = new BrowserWindow({
    show: false,
    webPreferences: { sandbox: true, offscreen: true },
  })

  try {
    await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
    const contentHeightPx = (await win.webContents.executeJavaScript(
      'document.body.scrollHeight'
    )) as number

    const heightMicrons = Math.max(
      Math.ceil(contentHeightPx * PX_TO_MICRONS) + 5000,
      30000
    )

    const result = await new Promise<PrintResult>((resolve) => {
      win.webContents.print(
        {
          silent: true,
          printBackground: false,
          deviceName: settings.printerName || undefined,
          margins: { marginType: 'none' },
          pageSize: {
            width: settings.paperWidthMm * 1000,
            height: heightMicrons,
          },
        },
        (success, failureReason) => {
          resolve(success ? { ok: true } : { ok: false, error: failureReason || 'Print failed' })
        }
      )
    })
    return result
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  } finally {
    win.destroy()
  }
}
