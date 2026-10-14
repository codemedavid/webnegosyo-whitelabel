/** @jest-environment node */

import {
  ID_PHOTO_MODES,
  defaultTaxProfile,
  idPhotoModeOf,
  taxProfileFromRow,
  taxProfileToRow,
} from '@/lib/gov-discount'
import {
  MAX_ID_PHOTO_BYTES,
  decodePhotoDataUrl,
  idPhotoObjectPath,
  isPastRetention,
} from '@/lib/gov-discount-ledger/id-photos/rules'
import { uploadIdPhoto, type IdPhotoStore, type IdPhotoUploadRequest } from '@/lib/gov-discount-ledger/id-photos/upload-service'
import { purgeExpiredIdPhotos, type IdPhotoPurgeStore } from '@/lib/gov-discount-ledger/id-photos/purge-service'
import { photoIdsByGrant } from '@/lib/gov-discount-reports/id-photos'
import { taxSettingsFormSchema } from '@/lib/tax-settings/form-schema'

const TENANT = '11111111-1111-4111-8111-111111111111'
const NOW = new Date('2026-10-14T04:00:00.000Z')
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64, 1)])
const jpegDataUrl = (bytes: Buffer = JPEG) => `data:image/jpeg;base64,${bytes.toString('base64')}`

describe('ID photo mode: off or optional, never required', () => {
  it('offers exactly two modes', () => {
    expect(ID_PHOTO_MODES).toEqual(['off', 'optional'])
  })

  it.each([
    ['optional', 'optional'],
    ['off', 'off'],
    ['required', 'off'],
    [undefined, 'off'],
    [null, 'off'],
    ['OPTIONAL', 'off'],
  ])('reads %p as %p', (stored, mode) => {
    expect(idPhotoModeOf(stored)).toBe(mode)
  })

  it('starts a new store with photos off and round-trips the column', () => {
    const profile = defaultTaxProfile('vat')
    expect(profile.idPhotoMode).toBe('off')
    const row = taxProfileToRow({ ...profile, idPhotoMode: 'optional' })
    expect(row.id_photo_mode).toBe('optional')
    expect(taxProfileFromRow({ ...row, vat_status: 'vat' })?.idPhotoMode).toBe('optional')
    expect(taxProfileFromRow({ ...row, vat_status: 'vat', id_photo_mode: 'required' })?.idPhotoMode).toBe('off')
  })

  it('the settings form refuses "required"', () => {
    const field = taxSettingsFormSchema.shape.idPhotoMode
    expect(field.safeParse('optional').success).toBe(true)
    expect(field.safeParse('off').success).toBe(true)
    expect(field.safeParse('required').success).toBe(false)
  })
})

describe('decodePhotoDataUrl', () => {
  it('accepts a real JPEG', () => {
    const outcome = decodePhotoDataUrl(jpegDataUrl())
    expect(outcome.ok && outcome.photo.extension).toBe('jpg')
    expect(outcome.ok && outcome.photo.bytes.equals(JPEG)).toBe(true)
  })

  it('refuses bytes that are not the image the data URL claims', () => {
    expect(decodePhotoDataUrl(`data:image/jpeg;base64,${Buffer.from('<script>').toString('base64')}`)).toEqual({ ok: false, reason: 'invalid' })
    expect(decodePhotoDataUrl(`data:image/png;base64,${JPEG.toString('base64')}`)).toEqual({ ok: false, reason: 'invalid' })
  })

  it('refuses other types and non-data URLs', () => {
    expect(decodePhotoDataUrl(`data:image/svg+xml;base64,${JPEG.toString('base64')}`).ok).toBe(false)
    expect(decodePhotoDataUrl('https://example.com/id.jpg').ok).toBe(false)
  })

  it('refuses a photo over the cap', () => {
    const big = Buffer.concat([JPEG, Buffer.alloc(MAX_ID_PHOTO_BYTES, 1)])
    expect(decodePhotoDataUrl(jpegDataUrl(big))).toEqual({ ok: false, reason: 'too_large' })
  })
})

describe('retention and paths', () => {
  it('counts 90 days from capture', () => {
    expect(isPastRetention('2026-07-17T04:00:01.000Z', NOW.getTime())).toBe(false)
    expect(isPastRetention('2026-07-16T04:00:00.000Z', NOW.getTime())).toBe(true)
    expect(isPastRetention('not a date', NOW.getTime())).toBe(true)
  })

  it('files a photo under its store with a random name', () => {
    expect(idPhotoObjectPath(TENANT, 'abc', 'jpg')).toBe(`${TENANT}/abc.jpg`)
  })
})

function fakeStore(overrides: Partial<IdPhotoStore> = {}) {
  const calls: string[] = []
  const store: jest.Mocked<IdPhotoStore> = {
    loadPhotoMode: jest.fn(async () => 'optional' as const),
    findGrant: jest.fn(async () => ({ outletId: 'outlet-1' })),
    findPhoto: jest.fn(async () => null),
    putObject: jest.fn(async (path: string) => {
      calls.push(`put:${path}`)
    }),
    savePhoto: jest.fn(async () => {
      calls.push('save')
    }),
    removeObjects: jest.fn(async (paths: readonly string[]) => {
      calls.push(`remove:${paths.join(',')}`)
    }),
    ...overrides,
  } as jest.Mocked<IdPhotoStore>
  return { store, calls }
}

const UPLOADER = { userId: 'user-1', branchOutletId: null, mayReplaceAny: false }

const request = (overrides: Partial<IdPhotoUploadRequest> = {}): IdPhotoUploadRequest => ({
  tenantId: TENANT,
  backend: 'platform_supabase',
  externalOrderId: 'order-1',
  claimantRef: 'claimant-1',
  capturedAt: '2026-10-14T03:59:00.000Z',
  photo: jpegDataUrl(),
  ...overrides,
})

describe('uploadIdPhoto', () => {
  const newId = () => 'photo-1'

  it('stores the photo under the store, against the grant’s branch, as the verified uploader', async () => {
    const { store } = fakeStore()
    const outcome = await uploadIdPhoto(store, request(), UPLOADER, NOW, newId)

    expect(outcome).toEqual({ ok: true, replaced: false })
    expect(store.findGrant).toHaveBeenCalledWith(TENANT, 'platform_supabase', 'order-1', 'claimant-1')
    expect(store.putObject).toHaveBeenCalledWith(`${TENANT}/photo-1.jpg`, expect.any(Buffer), 'image/jpeg')
    expect(store.savePhoto).toHaveBeenCalledWith({
      tenant_id: TENANT,
      outlet_id: 'outlet-1',
      backend: 'platform_supabase',
      external_order_id: 'order-1',
      claimant_ref: 'claimant-1',
      object_path: `${TENANT}/photo-1.jpg`,
      captured_at: '2026-10-14T03:59:00.000Z',
      uploaded_by: 'user-1',
    })
  })

  it('refuses when the store keeps no photos — before touching anything else', async () => {
    const { store } = fakeStore({ loadPhotoMode: jest.fn(async () => 'off' as const) })
    const outcome = await uploadIdPhoto(store, request(), UPLOADER, NOW, newId)
    expect(outcome).toMatchObject({ ok: false, status: 410, code: 'photos_off' })
    expect(store.findGrant).not.toHaveBeenCalled()
    expect(store.putObject).not.toHaveBeenCalled()
  })

  it('refuses a photo older than 90 days', async () => {
    const { store } = fakeStore()
    const outcome = await uploadIdPhoto(store, request({ capturedAt: '2026-07-01T00:00:00.000Z' }), UPLOADER, NOW, newId)
    expect(outcome).toMatchObject({ ok: false, status: 410, code: 'expired' })
    expect(store.putObject).not.toHaveBeenCalled()
  })

  it('refuses something that is not a photo', async () => {
    const { store } = fakeStore()
    const outcome = await uploadIdPhoto(store, request({ photo: 'data:image/jpeg;base64,AAAA' }), UPLOADER, NOW, newId)
    expect(outcome).toMatchObject({ ok: false, status: 400, code: 'invalid_photo' })
  })

  it('asks the register to retry while the grant is not in the sales book yet', async () => {
    const { store } = fakeStore({ findGrant: jest.fn(async () => null) })
    const outcome = await uploadIdPhoto(store, request(), UPLOADER, NOW, newId)
    expect(outcome).toMatchObject({ ok: false, status: 409, code: 'claim_pending' })
    expect(store.putObject).not.toHaveBeenCalled()
  })

  it('a retake replaces the row first, then deletes the old picture', async () => {
    const { store, calls } = fakeStore({ findPhoto: jest.fn(async () => ({ path: `${TENANT}/old.jpg`, uploadedBy: 'user-1' })) })
    const outcome = await uploadIdPhoto(store, request(), UPLOADER, NOW, newId)
    expect(outcome).toEqual({ ok: true, replaced: true })
    expect(calls).toEqual([`put:${TENANT}/photo-1.jpg`, 'save', `remove:${TENANT}/old.jpg`])
  })

  it("refuses a branch account filing a photo on another branch's grant", async () => {
    const { store } = fakeStore()
    const outcome = await uploadIdPhoto(store, request(), { ...UPLOADER, branchOutletId: 'outlet-2' }, NOW, newId)
    expect(outcome).toMatchObject({ ok: false, status: 403, code: 'wrong_branch' })
    expect(store.putObject).not.toHaveBeenCalled()
  })

  it("never lets one cashier overwrite another's photo — a reviewer may", async () => {
    const existing = jest.fn(async () => ({ path: `${TENANT}/old.jpg`, uploadedBy: 'someone-else' }))
    const refused = await uploadIdPhoto(fakeStore({ findPhoto: existing }).store, request(), UPLOADER, NOW, newId)
    const reviewer = await uploadIdPhoto(
      fakeStore({ findPhoto: existing }).store,
      request(),
      { ...UPLOADER, mayReplaceAny: true },
      NOW,
      newId,
    )
    expect(refused).toMatchObject({ ok: false, status: 403, code: 'replace_refused' })
    expect(reviewer).toEqual({ ok: true, replaced: true })
  })

  it('takes the new object back out when its row cannot be written', async () => {
    const { store, calls } = fakeStore({
      savePhoto: jest.fn(async () => {
        throw new Error('db down')
      }),
    })
    await expect(uploadIdPhoto(store, request(), UPLOADER, NOW, newId)).rejects.toThrow('db down')
    expect(calls).toEqual([`put:${TENANT}/photo-1.jpg`, `remove:${TENANT}/photo-1.jpg`])
  })
})

describe('purgeExpiredIdPhotos', () => {
  function purgeStore(batches: { id: string; objectPath: string }[][]) {
    const calls: string[] = []
    const queue = [...batches]
    const store: IdPhotoPurgeStore = {
      listExpired: jest.fn(async () => queue.shift() ?? []),
      removeObjects: jest.fn(async (paths) => {
        calls.push(`remove:${paths.join(',')}`)
      }),
      deleteRows: jest.fn(async (ids) => {
        calls.push(`delete:${ids.join(',')}`)
      }),
    }
    return { store, calls }
  }

  it('deletes the objects before their rows, batch by batch', async () => {
    const { store, calls } = purgeStore([
      [
        { id: 'a', objectPath: 't/a.jpg' },
        { id: 'b', objectPath: 't/b.jpg' },
      ],
      [{ id: 'c', objectPath: 't/c.jpg' }],
    ])
    const outcome = await purgeExpiredIdPhotos(store, NOW, 2, 5)
    expect(outcome).toEqual({ deleted: 3, hasMore: false })
    expect(calls).toEqual(['remove:t/a.jpg,t/b.jpg', 'delete:a,b', 'remove:t/c.jpg', 'delete:c'])
    expect(store.listExpired).toHaveBeenCalledWith(NOW.toISOString(), 2)
  })

  it('keeps the rows when the objects could not be removed (the next run retries)', async () => {
    const { store } = purgeStore([[{ id: 'a', objectPath: 't/a.jpg' }]])
    ;(store.removeObjects as jest.Mock).mockRejectedValueOnce(new Error('storage down'))
    await expect(purgeExpiredIdPhotos(store, NOW)).rejects.toThrow('storage down')
    expect(store.deleteRows).not.toHaveBeenCalled()
  })

  it('says when there is more than one run can delete', async () => {
    const full = [{ id: 'a', objectPath: 't/a.jpg' }]
    const { store } = purgeStore([full, full])
    expect(await purgeExpiredIdPhotos(store, NOW, 1, 2)).toEqual({ deleted: 2, hasMore: true })
  })
})

describe('photoIdsByGrant', () => {
  it('matches by order and claimant across revisions', () => {
    const grants = [
      { id: 'g1', backend: 'platform_supabase', externalOrderId: 'o1', claimantRef: 'c1' },
      { id: 'g2', backend: 'platform_supabase', externalOrderId: 'o1', claimantRef: 'c2' },
      { id: 'g3', backend: 'convex', externalOrderId: 'o1', claimantRef: 'c1' },
    ]
    const photos = [{ id: 'p1', backend: 'platform_supabase', externalOrderId: 'o1', claimantRef: 'c1' }]
    expect(photoIdsByGrant(grants, photos)).toEqual({ g1: 'p1' })
    expect(photoIdsByGrant(grants, [])).toEqual({})
  })
})
