'use client'

import Image, { ImageProps } from 'next/image'
import { transformImageUrl, isOptimizableImageUrl } from '@/lib/imagekit-utils'

interface OptimizedImageProps extends Omit<ImageProps, 'src'> {
    src: string | null | undefined
    /** 
     * If true, always use Cloudinary transformations for Cloudinary URLs
     * instead of Next.js Image Optimization. This is more reliable for
     * external Cloudinary images.
     * @default true
     */
    useCloudinaryTransform?: boolean
    /**
     * Cloudinary quality setting (1-100 or 'auto')
     * @default 'auto'
     */
    cloudinaryQuality?: number | 'auto'
    /**
     * If true, lazy load the image using native browser lazy loading.
     * This is ignored if `priority` is set to true.
     * @default true
     */
    lazy?: boolean
}

function parseSizeTokenToPx(sizeToken: string, viewportWidth: number): number | null {
    const pxMatch = sizeToken.match(/^(\d+(?:\.\d+)?)px$/)
    if (pxMatch) {
        return Number(pxMatch[1])
    }

    const vwMatch = sizeToken.match(/^(\d+(?:\.\d+)?)vw$/)
    if (vwMatch) {
        return Math.round((Number(vwMatch[1]) / 100) * viewportWidth)
    }

    return null
}

/**
 * Estimate the largest rendered width from a `sizes` string.
 * Handles common patterns like:
 * `(max-width: 768px) 50vw, (max-width: 1200px) 33vw, 25vw`
 */
function estimateRenderedWidthFromSizes(sizes?: string): number | null {
    if (!sizes) return null

    const entries = sizes.split(',').map((part) => part.trim()).filter(Boolean)
    if (entries.length === 0) return null

    let maxWidth = 0

    for (const entry of entries) {
        const mediaMatch = entry.match(/^\((?:max|min)-width:\s*(\d+)px\)\s+(.+)$/)
        if (mediaMatch) {
            const viewport = Number(mediaMatch[1])
            const sizeToken = mediaMatch[2].trim()
            const width = parseSizeTokenToPx(sizeToken, viewport)
            if (width && width > maxWidth) {
                maxWidth = width
            }
            continue
        }

        // Last fallback entry without media condition
        const width = parseSizeTokenToPx(entry, 1440)
        if (width && width > maxWidth) {
            maxWidth = width
        }
    }

    return maxWidth > 0 ? maxWidth : null
}

/**
 * An optimized image component that uses Cloudinary's native transformations
 * instead of Next.js Image Optimization for Cloudinary URLs.
 * 
 * This prevents timeout errors and 400/500 errors that can occur when
 * Next.js tries to fetch and optimize external Cloudinary images.
 * 
 * For non-Cloudinary URLs, it falls back to the standard Next.js Image component.
 * 
 * @example
 * // Basic usage - automatically uses Cloudinary transforms for Cloudinary URLs
 * <OptimizedImage src={tenant.logo_url} alt="Logo" width={96} height={96} />
 * 
 * // With fill layout
 * <OptimizedImage src={imageUrl} alt="Banner" fill className="object-cover" />
 * 
 * // Eager loading for above-fold images
 * <OptimizedImage src={hero} alt="Hero" fill priority />
 */
export function OptimizedImage({
    src,
    alt,
    useCloudinaryTransform = true,
    cloudinaryQuality = 'auto',
    lazy = true,
    width,
    height,
    fill,
    sizes,
    priority,
    ...props
}: OptimizedImageProps) {
    // Handle null/undefined src
    if (!src) {
        return null
    }

    // Determine loading strategy: priority overrides lazy
    const loadingProp = priority ? undefined : (lazy ? 'lazy' : 'eager')

    // If it's a CDN URL (ImageKit or legacy Cloudinary) use CDN transforms
    if (useCloudinaryTransform && isOptimizableImageUrl(src)) {
        // Calculate dimensions for transformation.
        // For fill images, estimate a practical max width from `sizes` to avoid loading originals.
        const estimatedFillWidth = fill ? estimateRenderedWidthFromSizes(sizes) : null
        const requestedWidth = typeof width === 'number'
            ? width
            : fill
                ? (estimatedFillWidth || 1200)
                : undefined
        const requestedHeight = typeof height === 'number' ? height : undefined
        // The * 2 multiplier already accounts for retina/2x displays,
        // so we do NOT add dpr:'auto' (which would double the size again).
        const transformWidth = typeof requestedWidth === 'number'
            ? Math.min(2000, Math.round(requestedWidth * 2))
            : undefined
        const transformHeight = typeof requestedHeight === 'number'
            ? Math.min(2000, Math.round(requestedHeight * 2))
            : undefined
        const cropMode = transformWidth && transformHeight ? 'fill' : 'limit'

        // Apply CDN transformations
        const transformedUrl = transformImageUrl(src, {
            width: transformWidth,
            height: transformHeight,
            quality: cloudinaryQuality,
            crop: cropMode,
        }) || src

        // Use unoptimized prop to bypass Next.js optimization
        return (
            <Image
                src={transformedUrl}
                alt={alt}
                width={width}
                height={height}
                fill={fill}
                sizes={sizes}
                priority={priority}
                loading={loadingProp}
                decoding="async"
                unoptimized
                {...props}
            />
        )
    }

    // For non-Cloudinary URLs, use standard Next.js Image optimization
    return (
        <Image
            src={src}
            alt={alt}
            width={width}
            height={height}
            fill={fill}
            sizes={sizes}
            priority={priority}
            loading={loadingProp}
            decoding="async"
            {...props}
        />
    )
}

export default OptimizedImage
