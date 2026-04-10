import type { Metadata } from "next";
import { Suspense } from "react";
import { Geist, Geist_Mono } from "next/font/google";
import { CartProvider } from "@/hooks/useCart";
import { QueryProvider } from "@/providers/query-provider";
import { MessengerPsidCapture } from "@/components/shared/messenger-psid-capture";
import { MetaPixelBootstrap } from "@/components/tracking/meta-pixel-bootstrap";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "WebNegosyo",
  description: "Sell More with Smart Menu",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const metaPixelId = process.env.NEXT_PUBLIC_META_PIXEL_ID;

  return (
    <html lang="en">
      <head>
        <link
          href="https://api.mapbox.com/mapbox-gl-js/v3.0.1/mapbox-gl.css"
          rel="stylesheet"
        />
        <MetaPixelBootstrap pixelId={metaPixelId} />
      </head>
      <body
        suppressHydrationWarning
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <QueryProvider>
          <CartProvider>
            <Suspense fallback={null}>
              <MessengerPsidCapture />
            </Suspense>
            {children}
            <Toaster />
          </CartProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
