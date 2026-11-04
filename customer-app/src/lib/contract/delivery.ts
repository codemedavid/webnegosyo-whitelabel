import { z } from 'zod'
import { isoDateTimeSchema, pesoAmountSchema } from './primitives'

/** Address search results the app offers under the delivery field. */
export const APP_PLACES_MAX = 8

const latitudeSchema = z.number().finite().min(-90).max(90)
const longitudeSchema = z.number().finite().min(-180).max(180)

export const APP_PLACE_QUERY_MIN = 3
export const APP_PLACE_QUERY_MAX = 120

/** `GET /places?q=&outletId=` — what the customer typed, trimmed. */
export const appPlacesQuerySchema = z.object({
  q: z.string().trim().min(APP_PLACE_QUERY_MIN).max(APP_PLACE_QUERY_MAX),
  outletId: z.string().trim().min(1).max(64).nullable(),
})

export type AppPlacesQuery = z.infer<typeof appPlacesQuerySchema>

export const appPlaceSchema = z.object({
  id: z.string().min(1).optional(),
  /** A landmark's own name ("SM North EDSA"); null for a plain street address. */
  name: z.string().min(1).nullable(),
  address: z.string().min(1),
  lat: latitudeSchema,
  lng: longitudeSchema,
})

export type AppPlace = z.infer<typeof appPlaceSchema>

export const appPlacesResultSchema = z.object({
  places: z.array(appPlaceSchema).max(APP_PLACES_MAX),
})

export type AppPlacesResult = z.infer<typeof appPlacesResultSchema>

export const APP_DELIVERY_ADDRESS_MAX = 300

/** `POST /delivery/quote`. The store comes from the build, never from here. */
export const appDeliveryQuoteRequestSchema = z.object({
  /** The branch the customer picked; null for a single-location store. */
  outletId: z.string().trim().min(1).max(64).nullable(),
  address: z.string().trim().min(1).max(APP_DELIVERY_ADDRESS_MAX),
  lat: latitudeSchema,
  lng: longitudeSchema,
})

export type AppDeliveryQuoteRequest = z.infer<typeof appDeliveryQuoteRequestSchema>

/**
 * The fee to deliver to that spot BEFORE any free-delivery waiver: the waiver
 * depends on the cart, so the app applies `freeDeliveryMinimum` for display
 * and the order route decides it again from the server-priced subtotal.
 */
export const appDeliveryQuoteSchema = z.object({
  fee: pesoAmountSchema,
  /** Items subtotal at which delivery is free; null when the store has no such offer. */
  freeDeliveryMinimum: pesoAmountSchema.nullable(),
  etaMinutes: z.number().int().nonnegative().nullable(),
  /**
   * A courier (Lalamove) quotation the order must carry back unchanged in
   * `delivery.quoteToken`, together with the SAME address and pin. Opaque to
   * the app. Null when the store prices delivery itself.
   */
  quoteToken: z.string().min(1).max(8192).nullable(),
  /** When `quoteToken` stops being accepted; null without one. Quote again after it. */
  expiresAt: isoDateTimeSchema.nullable(),
  /** Road distance the fee was priced on; null when the store does not price by distance. */
  distanceKm: z.number().finite().nonnegative().nullable(),
})

export type AppDeliveryQuote = z.infer<typeof appDeliveryQuoteSchema>
