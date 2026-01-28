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
    crop?: 'fill' | 'fit' | 'scale' | 'thumb' | 'crop' | 'pad'
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
    } else {
        // Default to auto quality for best compression
        transforms.push('q_auto')
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
    } else {
        // Default to auto format for best browser support
        transforms.push('f_auto')
    }

    if (options.dpr) {
        transforms.push(`dpr_${options.dpr}`)
    }

    // If no transforms, return original URL
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
    const afterUpload = url.substring(uploadIndex + 8) // Skip "/upload/"
    const hasExistingTransforms = afterUpload.match(/^[a-z]_/)

    if (hasExistingTransforms) {
        // Replace existing transformations
        const pathParts = afterUpload.split('/')
        // Find where version starts (v followed by numbers)
        const versionIndex = pathParts.findIndex(part => /^v\d+$/.test(part))

        if (versionIndex > 0) {
            // There are existing transforms before the version
            pathParts.splice(0, versionIndex, transformString)
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
