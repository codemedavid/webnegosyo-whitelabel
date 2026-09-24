/**
 * A menu-data write must refresh every storefront surface that shows the menu:
 * the cached data reads (tag `storefront:{slug}`), the menu page with its item
 * pages, and the tenant home page. Path-only revalidation of `/{slug}/menu`
 * purged an `unstable_cache` entry only when the menu route had written it —
 * a second reader such as the home page would keep serving the old menu.
 */
import { readFileSync, readdirSync } from 'fs'
import path from 'path'

jest.mock('next/cache', () => ({ revalidateTag: jest.fn(), revalidatePath: jest.fn() }))

describe('revalidateStorefrontMenu', () => {
  it('purges the storefront data tag, the menu layout and the tenant home', async () => {
    const nextCache = await import('next/cache')
    const { revalidateStorefrontMenu } = await import('@/lib/storefront/revalidate')

    revalidateStorefrontMenu('shop')

    expect(nextCache.revalidateTag).toHaveBeenCalledWith('storefront:shop')
    expect(nextCache.revalidatePath).toHaveBeenCalledWith('/shop/menu', 'layout')
    expect(nextCache.revalidatePath).toHaveBeenCalledWith('/shop')
  })

  it.each(['[tenant]', 'a/b', '..', ''])('never purges for the non-plain slug %p, which would hit every storefront', async (slug) => {
    const nextCache = await import('next/cache')
    const { revalidateStorefrontMenu } = await import('@/lib/storefront/revalidate')
    ;(nextCache.revalidateTag as jest.Mock).mockClear()
    ;(nextCache.revalidatePath as jest.Mock).mockClear()
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})

    revalidateStorefrontMenu(slug)

    expect(nextCache.revalidateTag).not.toHaveBeenCalled()
    expect(nextCache.revalidatePath).not.toHaveBeenCalled()
    warn.mockRestore()
  })
})

describe('server actions', () => {
  const actionsDir = path.join(process.cwd(), 'src/app/actions')
  const files = readdirSync(actionsDir).filter((name) => name.endsWith('.ts'))

  it.each(files)('%s refreshes the storefront menu only through revalidateStorefrontMenu', (name) => {
    const source = readFileSync(path.join(actionsDir, name), 'utf8')
    expect(source).not.toMatch(/revalidatePath\(`\/\$\{[\w.]+\}\/menu[`/]/)
  })
})
