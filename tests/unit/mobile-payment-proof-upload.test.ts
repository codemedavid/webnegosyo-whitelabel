/** @jest-environment node */
jest.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: jest.fn(async () => ({ granted: true })),
  launchImageLibraryAsync: jest.fn(async () => ({ canceled: false, assets: [{ uri: 'file:///photo.jpg', mimeType: 'image/jpeg', fileSize: 100 }] })),
  MediaTypeOptions: { Images: 'Images' },
}), { virtual: true })

const originalFetch = global.fetch
const originalFormData = global.FormData
const originalBaseUrl = process.env.EXPO_PUBLIC_WEB_BASE_URL

beforeEach(() => {
  jest.resetModules()
  process.env.EXPO_PUBLIC_WEB_BASE_URL = 'https://store.example.com'
  // React Native accepts its { uri, name, type } file shape in FormData.
  global.FormData = class { append = jest.fn() } as unknown as typeof FormData
  global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({ url: 'https://images.example.com/proof.jpg', fileId: 'proof-id', filePath: '/payment-proofs/proof.jpg' }) })) as unknown as typeof fetch
})

afterEach(() => {
  global.fetch = originalFetch
  global.FormData = originalFormData
  if (originalBaseUrl === undefined) delete process.env.EXPO_PUBLIC_WEB_BASE_URL
  else process.env.EXPO_PUBLIC_WEB_BASE_URL = originalBaseUrl
})

test('customer mobile uploads through the bounded proof endpoint without obtaining unrestricted credentials', async () => {
  const { pickAndUploadPaymentProof } = jest.requireActual<{
    pickAndUploadPaymentProof: () => Promise<{ fileId: string } | null>
  }>('../../mobile/lib/imagekit-upload')
  await expect(pickAndUploadPaymentProof()).resolves.toMatchObject({ fileId: 'proof-id' })
  expect(global.fetch).toHaveBeenCalledTimes(1)
  expect(global.fetch).toHaveBeenCalledWith('https://store.example.com/api/payment-proof/upload', { method: 'POST', body: expect.anything() })
})
