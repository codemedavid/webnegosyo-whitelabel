import { classifyMenuRole } from '@/lib/boost/menu-roles'

describe('classifyMenuRole', () => {
  it('reads the role from the category name first', () => {
    expect(classifyMenuRole({ categoryName: 'Drinks', itemName: 'Chicken Special' })).toBe('drink')
    expect(classifyMenuRole({ categoryName: 'Desserts', itemName: 'Mango' })).toBe('dessert')
    expect(classifyMenuRole({ categoryName: 'Sides & Add-ons', itemName: 'Gravy' })).toBe('side')
    expect(classifyMenuRole({ categoryName: 'Rice Meals', itemName: 'Tapsilog' })).toBe('main')
  })

  it('understands Filipino menu vocabulary', () => {
    expect(classifyMenuRole({ categoryName: 'Inumin', itemName: 'Sago' })).toBe('drink')
    expect(classifyMenuRole({ categoryName: 'Panghimagas', itemName: 'Leche' })).toBe('dessert')
    expect(classifyMenuRole({ categoryName: 'Ulam', itemName: 'Adobo' })).toBe('main')
    expect(classifyMenuRole({ categoryName: null, itemName: 'Longsilog' })).toBe('main')
    expect(classifyMenuRole({ categoryName: null, itemName: 'Halo-Halo' })).toBe('dessert')
  })

  it('falls back to the item name when the category says nothing', () => {
    expect(classifyMenuRole({ categoryName: 'Best Sellers', itemName: 'Iced Tea (Large)' })).toBe('drink')
    expect(classifyMenuRole({ categoryName: 'Best Sellers', itemName: 'Cheesy Fries' })).toBe('side')
    expect(classifyMenuRole({ categoryName: 'Best Sellers', itemName: 'Chicken Burger' })).toBe('main')
  })

  it('lets a main keyword beat rice, so a rice meal is not a side', () => {
    expect(classifyMenuRole({ categoryName: null, itemName: 'Chicken Rice Meal' })).toBe('main')
    expect(classifyMenuRole({ categoryName: null, itemName: 'Extra Rice' })).toBe('side')
    expect(classifyMenuRole({ categoryName: null, itemName: 'Java Rice' })).toBe('side')
  })

  it('matches whole words only', () => {
    // "tea" inside "steak" must not make a steak a drink
    expect(classifyMenuRole({ categoryName: null, itemName: 'Ribeye Steak' })).toBe('main')
    // "pie" inside "pieces" must not make chicken a dessert
    expect(classifyMenuRole({ categoryName: null, itemName: 'Chicken 6 pieces' })).toBe('main')
  })

  it('returns other when nothing is recognisable', () => {
    expect(classifyMenuRole({ categoryName: 'Specials', itemName: 'Chef Surprise' })).toBe('other')
    expect(classifyMenuRole({ categoryName: undefined, itemName: '' })).toBe('other')
  })
})
