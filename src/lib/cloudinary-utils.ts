/**
 * Cloudinary URL transformation utilities
 * 
 * These utilities allow us to leverage Cloudinary's built-in image transformations
 * instead of relying on Next.js's Image Optimization API which can timeout or fail
 * when fetching external images.
 */

interface CloudinaryTransformOptions {
    /** Width in pixels */
    width?: number
    /** Height in pixels */
    height?: number
    /** Quality (1-100, default: auto) */
    quality?: number | 'auto'
    /** Crop mode */
    crop?: 'fill' | 'fit' | 'scale' | 'thumb' | 'crop' | 'pad' | 'limit'
    /** Gravity/focus point for cropping */
    gravity?: 'auto' | 'face' | 'center' | 'north' | 'south' | 'east' | 'west'
    /** Format to convert to */
    format?: 'auto' | 'webp' | 'avif' | 'png' | 'jpg'
    /** Enable automatic format selection */
    fetchFormat?: 'auto'
    /** Device pixel ratio for responsive images */
    dpr?: number | 'auto'
}

/**
 * Check if a URL is a Cloudinary URL
 */
export function isCloudinaryUrl(url: string | null | undefined): boolean {
    if (!url) return false
    return url.includes('res.cloudinary.com') || url.includes('cloudinary.com')
}

/**
 * Transform a Cloudinary URL with the specified options
 * 
 * @param url - The original Cloudinary URL
 * @param options - Transformation options
 * @returns The transformed URL with Cloudinary transformations applied
 * 
 * @example
 * // Basic resize
 * transformCloudinaryUrl('https://res.cloudinary.com/.../image.png', { width: 200, height: 200 })
 * 
 * // With quality and format
 * transformCloudinaryUrl(url, { width: 400, quality: 80, format: 'auto' })
 */
export function transformCloudinaryUrl(
    url: string | null | undefined,
    options: CloudinaryTransformOptions = {}
): string | null {
    if (!url) return null

    // If not a Cloudinary URL, return as-is
    if (!isCloudinaryUrl(url)) {
        return url
    }

    // Build transformation string
    const transforms: string[] = []

    if (options.width) {
        transforms.push(`w_${options.width}`)
    }

    if (options.height) {
        transforms.push(`h_${options.height}`)
    }

    if (options.quality) {
        transforms.push(`q_${options.quality}`)
    }

    if (options.crop) {
        transforms.push(`c_${options.crop}`)
    } else if (options.width || options.height) {
        // Default to fill crop if dimensions specified
        transforms.push('c_fill')
    }

    if (options.gravity) {
        transforms.push(`g_${options.gravity}`)
    }

    if (options.format) {
        transforms.push(`f_${options.format}`)
    }

    if (options.dpr) {
        transforms.push(`dpr_${options.dpr}`)
    }

    // Only add defaults if there are other user-requested transforms
    if (transforms.length > 0) {
        // Add auto quality if not explicitly set
        if (!options.quality) {
            transforms.push('q_auto')
        }
        // Add auto format if not explicitly set
        if (!options.format) {
            transforms.push('f_auto')
        }
    }

    // If no transforms requested, return original URL
    if (transforms.length === 0) {
        return url
    }

    const transformString = transforms.join(',')

    // Insert transformation into URL
    // Cloudinary URL format: https://res.cloudinary.com/{cloud_name}/image/upload/{transformations}/{version}/{public_id}
    const uploadIndex = url.indexOf('/upload/')

    if (uploadIndex === -1) {
        // Not a standard upload URL, return as-is
        return url
    }

    // Check if there are already transformations
    // Recognize chained transforms: segments starting with letters/underscore, possibly separated by ',' or '/'
    const afterUpload = url.substring(uploadIndex + 8) // Skip "/upload/"
    const hasExistingTransforms = /^[a-z]+_[^/]+(?:[\/,][^/]+)*/.test(afterUpload)

    if (hasExistingTransforms) {
        // Replace existing transformations
        const pathParts = afterUpload.split('/')
        // Find where version starts (v followed by numbers)
        let spliceIndex = pathParts.findIndex(part => /^v\d+$/.test(part))

        if (spliceIndex < 0) {
            // No version segment found, find the first non-transform segment
            const firstNonTransformIndex = pathParts.findIndex(part => !/^[a-z]+_/.test(part))
            // Use that index, or pathParts.length if all segments are transforms
            spliceIndex = firstNonTransformIndex >= 0 ? firstNonTransformIndex : pathParts.length
        }

        if (spliceIndex > 0) {
            // Replace existing transform segments with our new transforms
            pathParts.splice(0, spliceIndex, transformString)
            return url.substring(0, uploadIndex + 8) + pathParts.join('/')
        }
    }

    // Insert new transformations after /upload/
    return url.substring(0, uploadIndex + 8) + transformString + '/' + afterUpload
}

/**
 * Get optimized image URL for different use cases
 */
export const cloudinaryPresets = {
    /** Thumbnail: 64x64, optimized */
    thumbnail: (url: string | null | undefined) =>
        transformCloudinaryUrl(url, { width: 64, height: 64, crop: 'fill', quality: 'auto' }),

    /** Small avatar/logo: 40x40 */
    avatar: (url: string | null | undefined) =>
        transformCloudinaryUrl(url, { width: 40, height: 40, crop: 'fill', quality: 'auto' }),

    /** Medium logo: 96x96 */
    logo: (url: string | null | undefined) =>
        transformCloudinaryUrl(url, { width: 96, height: 96, crop: 'fill', quality: 'auto' }),

    /** Card image: 400px wide */
    card: (url: string | null | undefined) =>
        transformCloudinaryUrl(url, { width: 400, quality: 'auto', crop: 'fill' }),

    /** Large card image: 600px wide */
    cardLarge: (url: string | null | undefined) =>
        transformCloudinaryUrl(url, { width: 600, quality: 'auto', crop: 'fill' }),

    /** Banner/hero: 1200px wide */
    banner: (url: string | null | undefined) =>
        transformCloudinaryUrl(url, { width: 1200, quality: 'auto', crop: 'fill' }),

    /** Full width responsive */
    responsive: (url: string | null | undefined, width: number) =>
        transformCloudinaryUrl(url, { width, quality: 'auto', dpr: 'auto' }),
}

/**
 * Extract the Cloudinary public_id from a secure_url.
 *
 * Strips the host, the `/upload/` prefix, any chained transformation segments,
 * the optional version segment (`v123...`), and the file extension.
 * Returns null for non-Cloudinary or unparseable URLs.
 *
 * @example
 * extractCloudinaryPublicId('https://res.cloudinary.com/demo/image/upload/v1/payment-proofs/abc.png')
 * // => 'payment-proofs/abc'
 */
export function extractCloudinaryPublicId(url: string | null | undefined): string | null {
    if (!url || !isCloudinaryUrl(url)) return null

    const uploadIndex = url.indexOf('/upload/')
    if (uploadIndex === -1) return null

    const afterUpload = url.substring(uploadIndex + 8) // skip "/upload/"
    const segments = afterUpload.split('/').filter(Boolean)

    // Drop leading transformation segments (e.g. "w_200,c_fill") and the version segment.
    let start = 0
    while (start < segments.length && /^[a-z]+_[^/]+/.test(segments[start])) {
        start += 1
    }
    if (start < segments.length && /^v\d+$/.test(segments[start])) {
        start += 1
    }

    const remaining = segments.slice(start)
    if (remaining.length === 0) return null

    const publicIdWithExt = remaining.join('/')
    const lastDot = publicIdWithExt.lastIndexOf('.')
    return lastDot > 0 ? publicIdWithExt.substring(0, lastDot) : publicIdWithExt
}

/**
 * Generate srcset for responsive images
 */
export function generateCloudinarySrcSet(
    url: string | null | undefined,
    widths: number[] = [320, 640, 960, 1280, 1920]
): string {
    if (!url || !isCloudinaryUrl(url)) {
        return ''
    }

    return widths
        .map(w => `${transformCloudinaryUrl(url, { width: w, quality: 'auto' })} ${w}w`)
        .join(', ')
}
