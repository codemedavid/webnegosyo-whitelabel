/** Whether the provider might have accepted a paid booking before failure. */
export class LalamoveBookingError extends Error {
  constructor(message: string, readonly bookingMayExist: boolean) {
    super(message)
    this.name = 'LalamoveBookingError'
  }
}
