'use client'

import { Skeleton } from '@/components/ui/skeleton'

export function ProductDetailSkeleton() {
    return (
        <div className="min-h-screen flex flex-col bg-gray-50 pt-16 pb-24">
            {/* Header */}
            <header className="fixed top-0 left-0 right-0 z-50 p-3">
                <div className="flex items-center justify-between">
                    <Skeleton className="h-10 w-10 rounded-full" />
                    <Skeleton className="h-10 w-10 rounded-full" />
                </div>
            </header>

            {/* Product Image */}
            <div className="relative w-full aspect-square max-h-[50vh] bg-gray-100">
                <Skeleton className="w-full h-full" />
            </div>

            {/* Product Info */}
            <div className="px-5 py-6 space-y-4">
                <div className="text-center space-y-2">
                    <Skeleton className="h-8 w-3/4 mx-auto" />
                    <Skeleton className="h-4 w-1/2 mx-auto" />
                </div>

                <Skeleton className="h-20 w-full" />

                {/* Variations */}
                <div className="space-y-3 pt-4">
                    <Skeleton className="h-5 w-32" />
                    <div className="flex gap-2">
                        <Skeleton className="h-10 w-24 rounded-full" />
                        <Skeleton className="h-10 w-24 rounded-full" />
                        <Skeleton className="h-10 w-24 rounded-full" />
                    </div>
                </div>

                {/* Add-ons */}
                <div className="space-y-3 pt-4">
                    <Skeleton className="h-5 w-24" />
                    <Skeleton className="h-14 w-full rounded-xl" />
                    <Skeleton className="h-14 w-full rounded-xl" />
                </div>
            </div>

            {/* Footer */}
            <footer className="fixed bottom-0 left-0 right-0 bg-white border-t p-5">
                <div className="flex items-center justify-between mb-4">
                    <Skeleton className="h-8 w-24" />
                    <Skeleton className="h-10 w-32 rounded-full" />
                </div>
                <div className="flex gap-3">
                    <Skeleton className="h-12 flex-1 rounded-full" />
                    <Skeleton className="h-12 flex-1 rounded-full" />
                </div>
            </footer>
        </div>
    )
}
