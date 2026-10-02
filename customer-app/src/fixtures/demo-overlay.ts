/**
 * Prototype-only: real photos from our own demo store (Webnegosyo Coffee) laid
 * over the contract fixtures, whose example.com URLs never load. Everything
 * not listed here renders the designed placeholder — as it will for any
 * tenant dish without a photo.
 */
const DEMO_CDN = 'https://ik.imagekit.io/hd3mbcia1'

export const DEMO_ITEM_IMAGES: Record<string, string> = {
  'item-latte': `${DEMO_CDN}/menu-items/dezjmyg1plozitovovaf.png`,
  'item-sea-salt': `${DEMO_CDN}/menu-items/xk1akmn1cepmxmglqnwi.png`,
  'item-croissant': `${DEMO_CDN}/menu-items/kbrgsdxb2zorufl5s1ci.png`,
}

export const DEMO_LOGO = `${DEMO_CDN}/tenants/logos/xgdfcpnlfwylqjz9ae8v.jpg`
