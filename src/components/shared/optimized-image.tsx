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
 */
export function OptimizedImage({
    src,
    alt,
    useCloudinaryTransform = true,
    cloudinaryQuality = 'auto',
    width,
    height,
    fill,
    ...props
}: OptimizedImageProps) {
    // Handle null/undefined src
    if (!src) {
        return null
    }

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
            {...props}
        />
    )
}

export default OptimizedImage
