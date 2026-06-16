import { useEffect, useState } from 'react'
import type { UpdateStatus } from '../../../shared/types'

/**
 * Listens for auto-update events from the main process and shows a popup when a
 * new version has finished downloading. The merchant taps "Restart & update"
 * and electron-updater replaces the app in place, then relaunches.
 */
export function UpdatePrompt(): React.JSX.Element | null {
  const [status, setStatus] = useState<UpdateStatus>({ state: 'idle' })
  const [dismissed, setDismissed] = useState(false)
  const [installing, setInstalling] = useState(false)

  useEffect(() => {
    const unsubscribe = window.api.onUpdateStatus((next) => {
      setStatus(next)
      // A freshly downloaded update should always re-surface the prompt.
      if (next.state === 'downloaded' || next.state === 'available') setDismissed(false)
    })
    return unsubscribe
  }, [])

  if (dismissed) return null

  if (status.state === 'downloading') {
    return (
      <div className="update-toast">
        <span className="update-toast__dot" />
        Downloading update… {status.percent}%
      </div>
    )
  }

  if (status.state === 'downloaded') {
    return (
      <div className="update-card">
        <div className="update-card__body">
          <strong>Update ready</strong>
          <p>Version {status.version} is ready to install.</p>
        </div>
        <div className="update-card__actions">
          <button className="btn ghost" onClick={() => setDismissed(true)} disabled={installing}>
            Later
          </button>
          <button
            className="btn primary"
            disabled={installing}
            onClick={() => {
              setInstalling(true)
              void window.api.installUpdate()
            }}
          >
            {installing ? 'Restarting…' : 'Restart & update'}
          </button>
        </div>
      </div>
    )
  }

  return null
}
