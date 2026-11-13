import { PROOF_MAX_EDGE, readUploadReply, shrinkTarget, uploadProofFile } from './payment-proof-upload'

describe('readUploadReply', () => {
  it('returns the url and file id the upload route answers with', () => {
    expect(readUploadReply(200, { url: 'https://ik.imagekit.io/x/payment-proofs/a.jpg', fileId: 'f1', deleteToken: 't' })).toEqual({
      url: 'https://ik.imagekit.io/x/payment-proofs/a.jpg',
      fileId: 'f1',
    })
  })

  it('words each refusal for the customer', () => {
    expect(() => readUploadReply(413, {})).toThrow('too large')
    expect(() => readUploadReply(429, {})).toThrow('Too many uploads')
    expect(() => readUploadReply(400, { error: 'Only JPEG, PNG or WEBP images.' })).toThrow('Only JPEG, PNG or WEBP images.')
    expect(() => readUploadReply(500, {})).toThrow('couldn’t upload')
    expect(() => readUploadReply(200, { url: 'x' })).toThrow('couldn’t upload')
  })
})

describe('shrinkTarget', () => {
  it('keeps small photos as they are', () => {
    expect(shrinkTarget(1170, 1600)).toBeNull()
    expect(shrinkTarget(0, 0)).toBeNull()
  })

  it('limits the long edge', () => {
    expect(shrinkTarget(1290, 2796)).toEqual({ height: PROOF_MAX_EDGE })
    expect(shrinkTarget(4032, 3024)).toEqual({ width: PROOF_MAX_EDGE })
  })
})

describe('uploadProofFile', () => {
  it('posts the file as an order proof to the web upload route', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({ status: 200, json: async () => ({ url: 'https://ik.imagekit.io/u.jpg', fileId: 'f' }) })
    const result = await uploadProofFile('https://store.example/', { uri: 'file:///a.jpg', name: 'a.jpg', type: 'image/jpeg' }, fetchImpl)
    expect(result).toEqual({ url: 'https://ik.imagekit.io/u.jpg', fileId: 'f' })
    expect(fetchImpl).toHaveBeenCalledWith('https://store.example/api/payment-proof/upload', expect.any(FormData))
    const form = fetchImpl.mock.calls[0][1] as FormData
    expect(form.get('purpose')).toBe('order')
  })

  it('turns a dropped connection into words', async () => {
    const fetchImpl = jest.fn().mockRejectedValue(new TypeError('Network request failed'))
    await expect(uploadProofFile('https://s', { uri: 'file:///a.jpg', name: 'a.jpg', type: 'image/jpeg' }, fetchImpl)).rejects.toThrow('couldn’t upload')
  })
})
