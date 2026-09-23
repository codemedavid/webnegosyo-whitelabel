import { z } from 'zod'

/**
 * BiteSpeed's own settings, stored under `storefront_pack_settings.bitespeed`.
 * Plain module: validated on save (branding-service) and read on render.
 *
 * Content the storefront already has a column for — hero title, description,
 * image, kicker and button label, promotion banners, footer contact — is read
 * from those columns, so it stays shared with every other pack. Only what is
 * specific to this design lives here. Every field has a default, so a tenant
 * that picks BiteSpeed gets a complete home page before touching a setting.
 */
const text = (max: number, fallback: string) => z.string().trim().max(max).default(fallback)

export const bitespeedSettingsSchema = z.object({
  /** Second hero line, drawn in the accent color under the hero title. */
  hero_highlight: text(40, ''),
  best_sellers_title: text(40, 'Best Sellers'),
  best_sellers_subtitle: text(80, "The crowd favorites you can't resist"),
  show_how_it_works: z.boolean().default(true),
  how_it_works_title: text(40, 'How it Works'),
  how_it_works_subtitle: text(80, 'Three simple steps to satisfy your cravings'),
  step_1_title: text(24, 'Choose'),
  step_1_body: text(90, 'Browse our menu and pick your favorite meals.'),
  step_2_title: text(24, 'Pay'),
  step_2_body: text(90, 'Check out in a few taps, or pay when your order arrives.'),
  step_3_title: text(24, 'Enjoy'),
  step_3_body: text(90, 'Hot and fresh, prepared the moment you order.'),
})

export type BiteSpeedSettings = z.output<typeof bitespeedSettingsSchema>
