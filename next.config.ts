import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  images: {
    // Cache optimized images longer to reduce repeated requests
    
    domains: ['images.unsplash.com', 'res.cloudinary.com', 'ik.imagekit.io', 'via.placeholder.com'],
    minimumCacheTTL: 60 * 60 * 24 * 30, // 30 days
    formats: ['image/webp', 'image/avif'], // Modern image formats
    deviceSizes: [640, 750, 828, 1080, 1200], // Optimize for common device sizes
    imageSizes: [16, 32, 48, 64, 96, 128, 256], // Common icon/image sizes
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'res.cloudinary.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'ik.imagekit.io',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'via.placeholder.com',
        port: '',
        pathname: '/**',
      },
      // Loyverse catalog images. The sync mirrors them to ImageKit, but a
      // failed mirror falls back to the Loyverse-hosted URL, which must render
      // rather than crash the menu page.
      {
        protocol: 'https',
        hostname: 'api.loyverse.com',
        port: '',
        pathname: '/image/**',
      },
    ],
  },

  // Experimental features for performance
  experimental: {
    // Optimize package imports for common libraries
    optimizePackageImports: [
      'lucide-react',
      'framer-motion',
      '@radix-ui/react-dialog',
      '@radix-ui/react-slot',
    ],
  },

  // Compiler optimizations
  compiler: {
    // Strip console noise in production but keep console.error: the
    // middleware's catch blocks were the only trace of a failing tenant
    // lookup, and they were compiled away, so 504s looked causeless in logs.
    removeConsole: process.env.NODE_ENV === 'production' ? { exclude: ['error'] } : false,
  },

  // Enable static optimization where possible
  staticPageGenerationTimeout: 120,

  // Merchant MCP clients may probe OAuth discovery on the resource URL.
  // These rewrites expose only the remaining merchant authorization server.
  async rewrites() {
    return [
      {
        source: '/api/mcp/merchant/mcp/.well-known/oauth-authorization-server',
        destination: '/.well-known/oauth-authorization-server',
      },
      {
        source: '/api/mcp/merchant/mcp/.well-known/openid-configuration',
        destination: '/.well-known/openid-configuration',
      },
      {
        source: '/api/mcp/merchant/mcp/.well-known/oauth-protected-resource',
        destination: '/.well-known/oauth-protected-resource/api/mcp/merchant',
      },
      {
        source: '/api/mcp/merchant/mcp/.well-known/jwks.json',
        destination: '/.well-known/jwks.json',
      },
      {
        source: '/api/mcp/merchant/.well-known/oauth-authorization-server/:path*',
        destination: '/.well-known/oauth-authorization-server',
      },
      {
        source: '/api/mcp/merchant/.well-known/openid-configuration/:path*',
        destination: '/.well-known/openid-configuration',
      },
      {
        source: '/api/mcp/merchant/.well-known/oauth-protected-resource/:path*',
        destination: '/.well-known/oauth-protected-resource/api/mcp/merchant',
      },
    ]
  },

  // Headers for caching
  async headers() {
    return [
      // Product detail pages - short browser cache, CDN cache aligned with ISR
      {
        source: '/:tenant/menu/item/:itemId',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=30, s-maxage=300, stale-while-revalidate=60',
          },
        ],
      },
      // Menu list pages
      {
        source: '/:tenant/menu',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=30, s-maxage=300, stale-while-revalidate=60',
          },
        ],
      },
      // Static assets - immutable, long cache
      {
        source: '/_next/static/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
    ];
  },
};

export default withSentryConfig(nextConfig, {
  // For all available options, see:
  // https://www.npmjs.com/package/@sentry/webpack-plugin#options

  org: "webnegosyo",

  project: "javascript-nextjs",

  // Only print logs for uploading source maps in CI
  silent: !process.env.CI,

  // For all available options, see:
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/

  // Upload a larger set of source maps for prettier stack traces (increases build time)
  widenClientFileUpload: true,

  // Route browser requests to Sentry through a Next.js rewrite to circumvent ad-blockers.
  // This can increase your server load as well as your hosting bill.
  // Note: Check that the configured route will not match with your Next.js middleware, otherwise reporting of client-
  // side errors will fail.
  tunnelRoute: "/monitoring",

  webpack: {
    // Enables automatic instrumentation of Vercel Cron Monitors. (Does not yet work with App Router route handlers.)
    // See the following for more information:
    // https://docs.sentry.io/product/crons/
    // https://vercel.com/docs/cron-jobs
    automaticVercelMonitors: true,

    // Tree-shaking options for reducing bundle size
    treeshake: {
      // Automatically tree-shake Sentry logger statements to reduce bundle size
      removeDebugLogging: true,
    },
  },
});
