'use client'

import Image, { ImageProps } from 'next/image'
import { transformCloudinaryUrl, isCloudinaryUrl } from '@/lib/cloudinary-utils'

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
    priority,
    ...props
}: OptimizedImageProps) {
    // Handle null/undefined src
    if (!src) {
        return null
    }

    // Determine loading strategy: priority overrides lazy
    const loadingProp = priority ? undefined : (lazy ? 'lazy' : 'eager')

    // If it's a Cloudinary URL and we should use Cloudinary transforms
    if (useCloudinaryTransform && isCloudinaryUrl(src)) {
        // Calculate dimensions for transformation
        const transformWidth = fill ? undefined : (typeof width === 'number' ? width : undefined)
        const transformHeight = fill ? undefined : (typeof height === 'number' ? height : undefined)

        // Apply Cloudinary transformations
        const transformedUrl = transformCloudinaryUrl(src, {
            width: transformWidth ? transformWidth * 2 : undefined, // 2x for retina
            height: transformHeight ? transformHeight * 2 : undefined,
            quality: cloudinaryQuality,
            crop: 'fill',
        }) || src

        // Use unoptimized prop to bypass Next.js optimization
        return (
            <Image
                src={transformedUrl}
                alt={alt}
                width={width}
                height={height}
                fill={fill}
                priority={priority}
                loading={loadingProp}
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
            priority={priority}
            loading={loadingProp}
            {...props}
        />
    )
}

export default OptimizedImage
