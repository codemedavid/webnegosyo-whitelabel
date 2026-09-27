/**
 * The columns an ingredient spreadsheet can carry.
 *
 * One list drives everything: the template's header row and its hints, the
 * export's columns, the column matcher's guesses, and the labels on the review
 * screen. The export writing the template's headers is what makes a file
 * round-trip — export, edit, import — with no matching step at all.
 *
 * Pure data, no server imports: the import wizard runs in the browser.
 */

export type ImportFieldKey =
  | 'name'
  | 'sku'
  | 'category'
  | 'unit'
  | 'unit_cost'
  | 'reorder_level'
  | 'on_hand'
  | 'is_prep'
  | 'is_active'

export interface ImportField {
  key: ImportFieldKey
  /** The header our template and export write. */
  label: string
  /** One line on what belongs in the column, shown in the template and matcher. */
  hint: string
  example: string
  isRequired: boolean
  /**
   * Other headers that mean this column, already normalized (lowercase,
   * letters and digits only). Exact matches win over "contains" matches.
   */
  synonyms: readonly string[]
}

export const IMPORT_FIELDS: readonly ImportField[] = [
  {
    key: 'name',
    label: 'Name',
    hint: 'What you call it. Rows with a name you already have update that ingredient.',
    example: 'Mozzarella',
    isRequired: true,
    synonyms: [
      'name',
      'ingredient',
      'ingredientname',
      'item',
      'itemname',
      'product',
      'productname',
      'material',
      'rawmaterial',
      'description',
      'itemdescription',
    ],
  },
  {
    key: 'sku',
    label: 'SKU',
    hint: 'Optional code. When filled in, it is matched before the name.',
    example: 'CHS-001',
    isRequired: false,
    synonyms: ['sku', 'code', 'itemcode', 'productcode', 'skucode', 'barcode', 'itemno', 'itemnumber'],
  },
  {
    key: 'category',
    label: 'Category',
    hint: 'Optional group, like Dairy or Meat.',
    example: 'Dairy',
    isRequired: false,
    synonyms: ['category', 'categoryname', 'group', 'section', 'department', 'class'],
  },
  {
    key: 'unit',
    label: 'Unit',
    hint: 'How you count it: kg, g, L, ml, pc — or any unit you added.',
    example: 'kg',
    isRequired: false,
    synonyms: ['unit', 'units', 'uom', 'unitofmeasure', 'unitofmeasurement', 'stockunit', 'measure'],
  },
  {
    key: 'unit_cost',
    label: 'Unit cost',
    hint: 'What one unit costs you, in pesos.',
    example: '450',
    isRequired: false,
    synonyms: [
      'unitcost',
      'cost',
      'costperunit',
      'price',
      'unitprice',
      'purchaseprice',
      'buyingprice',
      'costprice',
    ],
  },
  {
    key: 'reorder_level',
    label: 'Reorder level',
    hint: 'Warn me when stock drops to this.',
    example: '2',
    isRequired: false,
    synonyms: [
      'reorderlevel',
      'reorder',
      'reorderpoint',
      'reorderqty',
      'parlevel',
      'par',
      'minimum',
      'minstock',
      'minimumstock',
      'lowstock',
      'alertlevel',
      'safetystock',
    ],
  },
  {
    key: 'on_hand',
    label: 'On hand',
    hint: 'How much you have right now. Recorded as a stock count.',
    example: '5',
    isRequired: false,
    synonyms: [
      'onhand',
      'qty',
      'quantity',
      'qtyonhand',
      'stock',
      'stockonhand',
      'currentstock',
      'currentqty',
      'instock',
      'balance',
      'count',
      'available',
    ],
  },
  {
    key: 'is_prep',
    label: 'Prep item',
    hint: 'Yes if you make it in-house, like a sauce or dough.',
    example: 'No',
    isRequired: false,
    synonyms: ['prepitem', 'prep', 'isprep', 'madeinhouse', 'homemade', 'composite'],
  },
  {
    key: 'is_active',
    label: 'Active',
    hint: 'No to retire it without deleting its history.',
    example: 'Yes',
    isRequired: false,
    synonyms: ['active', 'isactive', 'inuse', 'status', 'enabled'],
  },
]

export const TEMPLATE_HEADERS: string[] = IMPORT_FIELDS.map((field) => field.label)

const FIELDS_BY_KEY = new Map(IMPORT_FIELDS.map((field) => [field.key, field]))

export function getImportField(key: ImportFieldKey): ImportField {
  const field = FIELDS_BY_KEY.get(key)
  if (!field) throw new Error(`Unknown import field: ${key}`)
  return field
}
