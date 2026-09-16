"use client";

import { RouteErrorFallback, type RouteErrorProps } from '@/components/shared/route-error-fallback';

export default function GlobalError(props: RouteErrorProps) {
    return (
        <html lang="en">
            <body>
                <RouteErrorFallback {...props} boundary="global" />
            </body>
        </html>
    );
}
