import { describe, it, expect } from '@jest/globals'
import {
  buildObjectKey,
  contentTypeForBytes,
  maxUploadBytesFor,
  normalizeUploadContentType,
} from '@/lib/storage/object-key'
import { getUploadProvider, readR2Config } from '@/lib/storage/r2-config'

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0])
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0])

describe('normalizeUploadContentType', () => {
  it.each([
    ['image/jpeg', 'image/jpeg'],
    ['IMAGE/JPG', 'image/jpeg'],
    ['image/png; charset=binary', 'image/png'],
    ['video/mp4', 'video/mp4'],
    ['application/pdf', 'application/pdf'],
  ])('accepts %s as %s', (input, expected) => {
    expect(normalizeUploadContentType(input)).toBe(expected)
  })

  it.each(['image/svg+xml', 'text/html', 'application/javascript', 'application/xhtml+xml', '', 'nonsense'])(
    'refuses %s (active content or unknown)',
    (input) => {
      expect(normalizeUploadContentType(input)).toBeNull()
    },
  )
})

describe('maxUploadBytesFor', () => {
  it('allows larger videos than images', () => {
    expect(maxUploadBytesFor('video/mp4')).toBeGreaterThan(maxUploadBytesFor('image/png'))
  })
})

describe('buildObjectKey', () => {
  it('keeps the folder, a readable base name, a unique id and the type extension', () => {
    expect(
      buildObjectKey({ folder: 'menu-items/t1', fileName: 'Chicken Adobo.JPG', contentType: 'image/jpeg', id: 'abc123' }),
    ).toBe('menu-items/t1/Chicken_Adobo-abc123.jpg')
  })

  it('never lets the file name escape the folder', () => {
    const key = buildObjectKey({ folder: 'payment-proofs', fileName: '../../tenants/logo.png', contentType: 'image/png', id: 'x1' })
    expect(key.startsWith('payment-proofs/')).toBe(true)
    expect(key).not.toContain('..')
    expect(key.split('/')).toHaveLength(2)
  })

  it('falls back to "upload" for an empty name and bounds long names', () => {
    expect(buildObjectKey({ folder: 'f', fileName: '', contentType: 'image/png', id: 'i' })).toBe('f/upload-i.png')
    const long = buildObjectKey({ folder: 'f', fileName: `${'a'.repeat(300)}.png`, contentType: 'image/png', id: 'i' })
    expect(long.length).toBeLessThan(100)
  })
})

describe('contentTypeForBytes', () => {
  it('sniffs the bytes first, then the extension, else octet-stream', () => {
    expect(contentTypeForBytes(PNG, 'photo.jpg')).toBe('image/png')
    expect(contentTypeForBytes(JPEG, 'x')).toBe('image/jpeg')
    expect(contentTypeForBytes(new Uint8Array([1, 2, 3]), 'anim.gif')).toBe('image/gif')
    expect(contentTypeForBytes(new Uint8Array([1, 2, 3]), 'logo.svg')).toBe('application/octet-stream')
  })
})

describe('R2 config and the upload provider flag', () => {
  const full = {
    R2_ACCOUNT_ID: 'acc',
    R2_ACCESS_KEY_ID: 'key',
    R2_SECRET_ACCESS_KEY: 'secret',
  }

  it('reads the config with the default bucket', () => {
    expect(readR2Config(full)).toEqual({
      accountId: 'acc',
      accessKeyId: 'key',
      secretAccessKey: 'secret',
      bucket: 'webnegosyo-media',
    })
  })

  it('is null when any credential is missing', () => {
    expect(readR2Config({ ...full, R2_SECRET_ACCESS_KEY: '' })).toBeNull()
  })

  it('stays on ImageKit unless the flag says r2 AND R2 is configured', () => {
    expect(getUploadProvider({})).toBe('imagekit')
    expect(getUploadProvider(full)).toBe('imagekit')
    expect(getUploadProvider({ STORAGE_UPLOAD_PROVIDER: 'r2' })).toBe('imagekit')
    expect(getUploadProvider({ ...full, STORAGE_UPLOAD_PROVIDER: 'R2 ' })).toBe('r2')
    expect(getUploadProvider({ ...full, STORAGE_UPLOAD_PROVIDER: 'imagekit' })).toBe('imagekit')
  })
})
