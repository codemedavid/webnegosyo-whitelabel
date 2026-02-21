'use client'

export default function MenuLoading() {
    return (
        <div className="min-h-screen bg-gray-50 animate-pulse">
            {/* Header skeleton */}
            <header className="sticky top-0 z-50 w-full border-b bg-white">
                <div className="container mx-auto px-4">
                    <div className="flex h-20 items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="h-12 w-12 rounded-full bg-gray-200" />
                            <div>
                                <div className="h-5 w-32 rounded bg-gray-200 mb-1" />
                                <div className="h-3 w-24 rounded bg-gray-200" />
                            </div>
                        </div>
                        <div className="h-8 w-8 rounded-full bg-gray-200" />
                    </div>
                </div>
            </header>

            {/* Category bar skeleton */}
            <div className="border-b bg-white">
                <div className="container mx-auto px-4">
                    <div className="flex gap-4 py-4 overflow-hidden">
                        {Array.from({ length: 5 }).map((_, i) => (
                            <div key={i} className="h-8 w-20 rounded-md bg-gray-200 shrink-0" />
                        ))}
                    </div>
                </div>
            </div>

            {/* Hero skeleton */}
            <main className="container mx-auto px-4 py-12">
                <div className="text-center mb-16">
                    <div className="h-10 w-48 rounded bg-gray-200 mx-auto mb-4" />
                    <div className="h-5 w-64 rounded bg-gray-200 mx-auto" />
                </div>

                {/* Grid skeleton */}
                <div className="grid gap-6 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
                    {Array.from({ length: 6 }).map((_, i) => (
                        <div key={i} className="rounded-xl bg-white border border-gray-100 overflow-hidden shadow-sm">
                            <div className="aspect-[4/3] bg-gray-200" />
                            <div className="p-4">
                                <div className="h-5 w-3/4 rounded bg-gray-200 mb-2" />
                                <div className="h-4 w-full rounded bg-gray-200 mb-3" />
                                <div className="h-5 w-16 rounded bg-gray-200" />
                            </div>
                        </div>
                    ))}
                </div>
            </main>
        </div>
    )
}
