/**
 * Browser-side ImageKit upload helper.
 *
 * Replaces the Cloudinary unsigned-preset upload. ImageKit requires a
 * server-signed token, so this first fetches `/api/imagekit/auth`, then POSTs
 * the file to the ImageKit upload endpoint. Uses XHR so callers can show upload
 * progress.
 */

const IMAGEKIT_UPLOAD_ENDPOINT = 'https://upload.imagekit.io/api/v1/files/upload'

export interface ImageKitUploadResult {
  /** Full delivery URL */
  url: string
  /** Opaque ImageKit file id (used for deletion) */
  fileId: string
  /** Path relative to the URL endpoint (used to scope deletion) */
  filePath: string
}

interface UploadAuth {
  token: string
  expire: number
  signature: string
  publicKey: string
}

export function isImageKitConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_IMAGEKIT_PUBLIC_KEY &&
      process.env.NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT,
  )
}

async function fetchUploadAuth(): Promise<UploadAuth> {
  const res = await fetch('/api/imagekit/auth')
  if (!res.ok) {
    throw new Error('Could not authorize upload. Please try again.')
  }
  return (await res.json()) as UploadAuth
}

interface UploadOptions {
  folder: string
  fileName?: string
  onProgress?: (percent: number) => void
}

/**
 * Upload a single image file to ImageKit and return its url + fileId + filePath.
 * Throws on auth failure, network error, or a non-2xx upload response.
 */
export async function uploadImageToImageKit(
  file: File,
  { folder, fileName, onProgress }: UploadOptions,
): Promise<ImageKitUploadResult> {
  if (!isImageKitConfigured()) {
    throw new Error('Image upload is not configured.')
  }

  const auth = await fetchUploadAuth()

  const formData = new FormData()
  formData.append('file', file)
  formData.append('fileName', fileName || file.name || 'upload')
  formData.append('publicKey', auth.publicKey)
  formData.append('signature', auth.signature)
  formData.append('expire', String(auth.expire))
  formData.append('token', auth.token)
  formData.append('folder', folder)
  formData.append('useUniqueFileName', 'true')

  return new Promise<ImageKitUploadResult>((resolve, reject) => {
    const xhr = new XMLHttpRequest()

    if (onProgress) {
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          onProgress(Math.round((e.loaded / e.total) * 100))
        }
      })
    }

    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const json = JSON.parse(xhr.responseText) as {
            url?: string
            fileId?: string
            filePath?: string
          }
          if (json.url && json.fileId && json.filePath) {
            // ImageKit returns filePath with a leading slash; normalize it.
            resolve({
              url: json.url,
              fileId: json.fileId,
              filePath: json.filePath.replace(/^\//, ''),
            })
            return
          }
          reject(new Error('Upload response was missing fields.'))
        } catch {
          reject(new Error('Could not parse upload response.'))
        }
      } else {
        reject(new Error('Upload failed. Please try again.'))
      }
    })

    xhr.addEventListener('error', () => {
      reject(new Error('Upload failed. Please check your connection.'))
    })

    xhr.open('POST', IMAGEKIT_UPLOAD_ENDPOINT)
    xhr.send(formData)
  })
}
