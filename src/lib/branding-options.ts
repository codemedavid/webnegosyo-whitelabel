/**
 * The branding vocabulary an AI designer needs before it can call
 * update_branding: for every field with a closed set of values, the values.
 *
 * Two sources, merged: enums declared on `brandingSchema` (what the writer
 * accepts) and `select` fields in the Branding Studio registry (template names
 * that the schema types as plain strings — card_template, page_layout, …).
 * Registry options win on overlap because they are what the merchant sees.
 */

import { z } from 'zod'
import { brandingSchema } from '@/lib/branding-service'
import { BRANDING_SURFACES, type BrandingSurface } from '@/lib/branding-registry'

export type BrandingOptionMap = Record<string, readonly string[]>

interface EnumLike { options?: readonly unknown[] }
interface WrapperDef { innerType?: unknown; options?: readonly unknown[] }

/** Unwrap optional/nullable/default/`.or(literal)` wrappers down to a ZodEnum's values, if any. */
function findEnumValues(schema: unknown): readonly string[] | null {
  if (schema instanceof z.ZodEnum) {
    const options = (schema as unknown as EnumLike).options ?? []
    return options.map(String)
  }
  if (schema instanceof z.ZodOptional || schema instanceof z.ZodNullable || schema instanceof z.ZodDefault) {
    return findEnumValues((schema._def as WrapperDef).innerType)
  }
  if (schema instanceof z.ZodUnion) {
    for (const option of (schema._def as WrapperDef).options ?? []) {
      const found = findEnumValues(option)
      if (found) return found
    }
  }
  return null
}

/** Enum vocabularies declared directly on a Zod object schema. */
export function describeSchemaEnums(schema: z.ZodObject<z.ZodRawShape>): BrandingOptionMap {
  const out: Record<string, readonly string[]> = {}
  for (const [key, field] of Object.entries(schema.shape)) {
    const found = findEnumValues(field)
    if (found) out[key] = [...found]
  }
  return out
}

/** `select` fields across the Studio surfaces, keyed by field id. */
export function describeRegistrySelects(surfaces: readonly BrandingSurface[]): BrandingOptionMap {
  const out: Record<string, readonly string[]> = {}
  for (const surface of surfaces) {
    for (const section of surface.sections) {
      for (const field of section.fields) {
        if (field.type === 'select' && field.options && field.options.length > 0) {
          out[field.id] = [...field.options]
        }
      }
    }
  }
  return out
}

/** The merged vocabulary for the live schema + registry. */
export function describeBrandingOptions(): BrandingOptionMap {
  return { ...describeSchemaEnums(brandingSchema), ...describeRegistrySelects(BRANDING_SURFACES) }
}

/** Every column update_branding can write, in schema order. */
export function listBrandingFieldIds(): string[] {
  return Object.keys(brandingSchema.shape)
}
