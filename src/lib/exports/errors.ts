/** A refusal the person can act on: its message is shown as is. */
export class ExportError extends Error {
  readonly status: number
  constructor(message: string, status = 400) {
    super(message)
    this.name = 'ExportError'
    this.status = status
  }
}
