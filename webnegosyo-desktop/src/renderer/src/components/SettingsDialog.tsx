import { useEffect, useState } from 'react'
import type { AppSettings, PrinterInfo } from '../../../shared/types'

interface SettingsDialogProps {
  onClose: () => void
  onSaved: (settings: AppSettings) => void
}

export function SettingsDialog({ onClose, onSaved }: SettingsDialogProps): React.JSX.Element {
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [printers, setPrinters] = useState<PrinterInfo[]>([])

  useEffect(() => {
    void Promise.all([window.api.getSettings(), window.api.listPrinters()]).then(
      ([loaded, found]) => {
        setSettings(loaded)
        setPrinters(found)
      }
    )
  }, [])

  const handleSave = async (): Promise<void> => {
    if (!settings) return
    const saved = await window.api.setSettings(settings)
    onSaved(saved)
    onClose()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Printer Settings</h2>
        {!settings ? (
          <p>Loading…</p>
        ) : (
          <>
            <div className="field">
              <label>Receipt printer</label>
              <select
                value={settings.printerName}
                onChange={(e) => setSettings({ ...settings, printerName: e.target.value })}
              >
                <option value="">System default printer</option>
                {printers.map((p) => (
                  <option key={p.name} value={p.name}>
                    {p.displayName}
                    {p.isDefault ? ' (default)' : ''}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label>Paper width</label>
              <select
                value={settings.paperWidthMm}
                onChange={(e) =>
                  setSettings({ ...settings, paperWidthMm: Number(e.target.value) as 58 | 80 })
                }
              >
                <option value={80}>80mm (standard thermal)</option>
                <option value={58}>58mm (compact thermal)</option>
              </select>
            </div>

            <div className="field">
              <label>Receipt footer message</label>
              <input
                type="text"
                value={settings.receiptFooter}
                onChange={(e) => setSettings({ ...settings, receiptFooter: e.target.value })}
              />
            </div>

            <div className="check-row">
              <input
                id="autoprint"
                type="checkbox"
                checked={settings.autoPrintEnabled}
                onChange={(e) => setSettings({ ...settings, autoPrintEnabled: e.target.checked })}
              />
              <label htmlFor="autoprint">Auto-print receipt when a new order arrives</label>
            </div>

            <div className="modal-actions">
              <button className="btn ghost" onClick={onClose}>
                Cancel
              </button>
              <button className="btn primary" onClick={() => void handleSave()}>
                Save
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
