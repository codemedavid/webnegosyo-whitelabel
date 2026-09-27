/**
 * What part a dish plays in a meal — the vocabulary every Boost Sales idea is
 * built from ("a drink with every main", "main + side + drink").
 *
 * Only 12 of ~18k live menu items ever got a BCG classification, so ideas
 * cannot lean on merchant-entered metadata. The category and item names are
 * the one signal every menu has, in English and in Filipino.
 */

export type MenuRole = 'main' | 'side' | 'drink' | 'dessert' | 'other'

const DRINK_WORDS = [
  'drink', 'drinks', 'beverage', 'beverages', 'inumin', 'refreshment', 'refreshments',
  'coffee', 'kape', 'tea', 'teas', 'milktea', 'juice', 'juices', 'shake', 'shakes',
  'soda', 'sodas', 'softdrink', 'softdrinks', 'frappe', 'frappes', 'latte', 'lattes',
  'smoothie', 'smoothies', 'lemonade', 'water', 'cola', 'coke', 'sprite',
  'beer', 'beers', 'cooler', 'coolers', 'iced', 'espresso', 'americano', 'cappuccino',
  'mocha', 'chocolate drink', 'soft drinks', 'milk tea', 'sago',
]

const DESSERT_WORDS = [
  'dessert', 'desserts', 'sweets', 'panghimagas', 'halo-halo', 'halohalo',
  'halo halo', 'cake', 'cakes', 'ice cream', 'icecream', 'leche', 'flan', 'pastry',
  'pastries', 'brownie', 'brownies', 'cookie', 'cookies', 'donut', 'donuts',
  'doughnut', 'doughnuts', 'pie', 'pies', 'sundae', 'sundaes', 'turon', 'mais con yelo',
  'churros', 'waffle', 'waffles', 'cheesecake', 'mochi', 'puto', 'kakanin', 'bibingka',
]

const MAIN_WORDS = [
  'meal', 'meals', 'main', 'mains', 'entree', 'entrees', 'ulam', 'silog', 'burger',
  'burgers', 'pasta', 'pastas', 'pizza', 'pizzas', 'chicken', 'pork', 'beef', 'fish',
  'seafood', 'seafoods', 'noodle', 'noodles', 'ramen', 'sandwich', 'sandwiches',
  'wings', 'steak', 'steaks', 'bowl', 'bowls', 'platter', 'platters', 'pancit',
  'adobo', 'sisig', 'lechon', 'liempo', 'inasal', 'bulalo', 'sinigang', 'kare-kare',
  'spaghetti', 'carbonara', 'lasagna', 'shawarma', 'burrito', 'tacos', 'lomi',
  'mami', 'bilao', 'value meal', 'rice meal', 'rice meals', 'ribs', 'barbecue', 'bbq',
]

const SIDE_WORDS = [
  'side', 'sides', 'add-on', 'add-ons', 'addon', 'addons', 'add on', 'add ons',
  'extra', 'extras', 'fries', 'rice', 'kanin', 'salad', 'salads', 'soup', 'soups',
  'sabaw', 'appetizer', 'appetizers', 'starter', 'starters', 'coleslaw', 'mashed',
  'onion rings', 'dip', 'dips', 'sauce', 'sauces', 'gravy', 'java rice', 'garlic rice',
]

/** Words ending in -silog are all rice meals: tapsilog, longsilog, tocilog. */
const SILOG_PATTERN = /[a-z]+silog\b|[a-z]+silog$/

function normalize(text: string): string {
  return ` ${text.toLowerCase().replace(/[^a-z0-9\-\s]/g, ' ').replace(/\s+/g, ' ').trim()} `
}

function hasWord(haystack: string, words: readonly string[]): boolean {
  return words.some((word) => haystack.includes(` ${word} `))
}

/**
 * Precedence is drink → dessert → main → side. A main keyword must beat
 * "rice" (a Chicken Rice Meal is a main), while "Extra Rice" with no main
 * keyword stays a side.
 */
function roleOf(text: string | null | undefined): MenuRole {
  if (!text) return 'other'
  const haystack = normalize(text)
  if (haystack.trim().length === 0) return 'other'
  if (hasWord(haystack, DRINK_WORDS)) return 'drink'
  if (hasWord(haystack, DESSERT_WORDS)) return 'dessert'
  if (hasWord(haystack, MAIN_WORDS) || SILOG_PATTERN.test(haystack.trim())) return 'main'
  if (hasWord(haystack, SIDE_WORDS)) return 'side'
  return 'other'
}

export interface MenuRoleInput {
  categoryName?: string | null
  itemName: string
}

/** The category name decides first; the item name only when it says nothing. */
export function classifyMenuRole({ categoryName, itemName }: MenuRoleInput): MenuRole {
  const fromCategory = roleOf(categoryName)
  if (fromCategory !== 'other') return fromCategory
  return roleOf(itemName)
}
