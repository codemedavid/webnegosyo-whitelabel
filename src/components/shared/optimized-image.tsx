'use client'

import { useState } from 'react'
import Image, { ImageProps, ImageLoaderProps } from 'next/image'
import { transformImageUrl, isOptimizableImageUrl } from '@/lib/imagekit-utils'

/** Largest variant the CDN is asked for; menu originals are never bigger. */
const MAX_CDN_WIDTH = 2000
/** Retina multiplier applied to a CSS width before asking the CDN. */
const DEVICE_PIXEL_RATIO = 2
/** Widest common phone viewport; drives the mobile-first default `src`. */
const MOBILE_VIEWPORT_WIDTH = 430
/** Fallback CSS width for a `fill` image whose `sizes` cannot be parsed. */
const DEFAULT_FILL_WIDTH = 1200

interface OptimizedImageProps extends Omit<ImageProps, 'src'> {
    src: string | null | undefined
    /**
     * Image to display when `src` is empty OR when the primary image fails to
     * load. Used to fall back to the tenant logo for menu item images.
     * When both `src` and `fallbackSrc` are empty, nothing is rendered.
     */
    fallbackSrc?: string | null
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
 * Estimate the rendered width on a phone from a `sizes` string: the first
 * `(max-width: Npx)` branch evaluated at a phone viewport. Mobile-first because
 * the default `src` should be the SMALL candidate; browsers with srcset support
 * pick their own variant, so only phones and legacy engines ever fetch it.
 */
function estimateMobileRenderedWidthFromSizes(sizes?: string): number | null {
    if (!sizes) return null

    const entries = sizes.split(',').map((part) => part.trim()).filter(Boolean)
    for (const entry of entries) {
        const mediaMatch = entry.match(/^\(max-width:\s*(\d+)px\)\s+(.+)$/)
        if (!mediaMatch) continue
        const viewport = Math.min(Number(mediaMatch[1]), MOBILE_VIEWPORT_WIDTH)
        const width = parseSizeTokenToPx(mediaMatch[2].trim(), viewport)
        if (width) return width
    }

    return estimateRenderedWidthFromSizes(sizes)
}

/**
 * next/image loader for CDN-hosted `fill` images. next/image derives the
 * candidate widths from `sizes` + the configured deviceSizes and calls this
 * once per width, so the browser gets a real srcset of CDN variants instead of
 * one tablet-sized `unoptimized` URL. `f-auto` lets the CDN serve WebP/AVIF.
 */
function cdnFillLoader({ src, width, quality }: ImageLoaderProps): string {
    return transformImageUrl(src, {
        width: Math.min(MAX_CDN_WIDTH, width),
        quality: typeof quality === 'number' ? quality : 'auto',
        format: 'auto',
        crop: 'limit',
    }) || src
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
    fallbackSrc,
    alt,
    useCloudinaryTransform = true,
    cloudinaryQuality = 'auto',
    lazy = true,
    width,
    height,
    fill,
    sizes,
    priority,
    onError,
    ...props
}: OptimizedImageProps) {
    // Tracks whether the primary image failed to load so we can swap to the
    // fallback. Reset naturally on remount (cards are keyed by item id).
    const [primaryFailed, setPrimaryFailed] = useState(false)

    // Resolve the effective source: use the fallback when the primary is empty
    // or has errored. Render nothing only when neither source is available.
    const useFallback = !src || primaryFailed
    const resolvedSrc = useFallback ? (fallbackSrc || null) : src
    if (!resolvedSrc) {
        return null
    }

    // Only wire the error-swap while showing the primary image AND a fallback
    // exists to swap to — prevents an infinite error loop on the fallback.
    const showingPrimary = !useFallback
    const handleError: ImageProps['onError'] = (event) => {
        onError?.(event)
        if (showingPrimary && fallbackSrc) {
            setPrimaryFailed(true)
        }
    }

    // Determine loading strategy: priority overrides lazy
    const loadingProp = priority ? undefined : (lazy ? 'lazy' : 'eager')

    const isCdnImage = useCloudinaryTransform && isOptimizableImageUrl(resolvedSrc)

    // CDN `fill` images (menu cards): real srcset via the CDN loader, with a
    // phone-sized default `src` so nothing downloads the largest branch.
    if (isCdnImage && fill) {
        const mobileWidth = estimateMobileRenderedWidthFromSizes(sizes) || DEFAULT_FILL_WIDTH
        const mobileSrc = cdnFillLoader({
            src: resolvedSrc,
            width: Math.round(mobileWidth * DEVICE_PIXEL_RATIO),
            quality: typeof cloudinaryQuality === 'number' ? cloudinaryQuality : undefined,
        })

        return (
            <Image
                src={resolvedSrc}
                alt={alt}
                fill
                sizes={sizes}
                priority={priority}
                loading={loadingProp}
                decoding="async"
                loader={cdnFillLoader}
                overrideSrc={mobileSrc}
                quality={typeof cloudinaryQuality === 'number' ? cloudinaryQuality : undefined}
                {...props}
                onError={handleError}
            />
        )
    }

    // Fixed-size CDN images (logos, thumbnails): a single cropped CDN variant.
    if (isCdnImage) {
        const requestedWidth = typeof width === 'number' ? width : undefined
        const requestedHeight = typeof height === 'number' ? height : undefined
        // The multiplier already accounts for retina/2x displays,
        // so we do NOT add dpr:'auto' (which would double the size again).
        const transformWidth = typeof requestedWidth === 'number'
            ? Math.min(MAX_CDN_WIDTH, Math.round(requestedWidth * DEVICE_PIXEL_RATIO))
            : undefined
        const transformHeight = typeof requestedHeight === 'number'
            ? Math.min(MAX_CDN_WIDTH, Math.round(requestedHeight * DEVICE_PIXEL_RATIO))
            : undefined
        const cropMode = transformWidth && transformHeight ? 'fill' : 'limit'

        // Apply CDN transformations
        const transformedUrl = transformImageUrl(resolvedSrc, {
            width: transformWidth,
            height: transformHeight,
            quality: cloudinaryQuality,
            crop: cropMode,
        }) || resolvedSrc

        // Use unoptimized prop to bypass Next.js optimization
        return (
            <Image
                src={transformedUrl}
                alt={alt}
                width={width}
                height={height}
                sizes={sizes}
                priority={priority}
                loading={loadingProp}
                decoding="async"
                unoptimized
                {...props}
                onError={handleError}
            />
        )
    }

    // For non-Cloudinary URLs, use standard Next.js Image optimization
    return (
        <Image
            src={resolvedSrc}
            alt={alt}
            width={width}
            height={height}
            fill={fill}
            sizes={sizes}
            priority={priority}
            loading={loadingProp}
            decoding="async"
            {...props}
            onError={handleError}
        />
    )
}

export default OptimizedImage
