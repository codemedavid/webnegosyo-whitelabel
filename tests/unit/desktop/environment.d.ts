// These web-runner tests import desktop modules, so include the same ambient
// API and Vite declarations used by the desktop project's own type checker.
import type { DesktopApi } from '../../../webnegosyo-desktop/src/preload/index.d.ts'
import '../../../webnegosyo-desktop/src/renderer/src/env'

declare global {
  interface Window {
    api: DesktopApi
  }
}
