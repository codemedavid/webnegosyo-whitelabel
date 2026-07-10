import { ProductDetailSkeleton } from '@/components/customer/product-detail-skeleton'
import { TenantFlashLoading } from '@/components/customer/flash-screen-loader'

export default function ProductDetailLoading() {
    // Branded flash while loading when enabled; otherwise the product skeleton.
    return <TenantFlashLoading fallback={<ProductDetailSkeleton />} />
}

