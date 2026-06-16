'use client'

import { useState, useCallback } from 'react'
import Image from 'next/image'
import { X } from 'lucide-react'
import { Dialog, DialogContent, DialogClose, DialogTitle } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'

interface ImageModalProps {
    isOpen: boolean
    onOpenChange: (open: boolean) => void
    imageUrl: string | null
    itemName: string
}

export function ImageModal({ isOpen, onOpenChange, imageUrl, itemName }: ImageModalProps) {
    const [isImageLoaded, setIsImageLoaded] = useState(false)

    const handleImageLoad = useCallback(() => {
        setIsImageLoaded(true)
    }, [])

    const hasImage = imageUrl && imageUrl.trim() !== ''

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent
                className="max-w-4xl w-[95vw] h-[90vh] p-0 border-none overflow-hidden z-[110]"
                overlayClassName="z-[110]"
                style={{ backgroundColor: 'var(--pd-modal-bg)' }}
            >
                {/* Hidden title for accessibility */}
                <DialogTitle className="sr-only">{itemName} - Image Preview</DialogTitle>
                <DialogClose className="absolute top-4 right-4 z-50">
                    <div
                        className="rounded-full p-2 transition-colors cursor-pointer"
                        style={{ backgroundColor: 'var(--pd-modal-close-bg)' }}
                        aria-label="Close"
                    >
                        <X className="h-6 w-6" style={{ color: 'var(--pd-modal-close)' }} />
                    </div>
                </DialogClose>
                <div className="w-full h-full flex items-center justify-center p-4">
                    {!isImageLoaded && (
                        <Skeleton
                            className="absolute w-[80vw] h-[80vh]"
                            style={{ backgroundColor: 'var(--pd-image-placeholder)' }}
                        />
                    )}
                    {hasImage && (
                        <Image
                            src={imageUrl!}
                            alt={itemName}
                            width={1200}
                            height={1200}
                            className={`max-w-full max-h-full object-contain transition-opacity duration-300 ${isImageLoaded ? 'opacity-100' : 'opacity-0'}`}
                            onLoad={handleImageLoad}
                            priority
                        />
                    )}
                </div>
            </DialogContent>
        </Dialog>
    )
}
