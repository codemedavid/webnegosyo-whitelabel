import type { Metadata } from "next";
import { Suspense } from "react";
import { Geist, Geist_Mono } from "next/font/google";
import { CartProvider } from "@/hooks/useCart";
import { QueryProvider } from "@/providers/query-provider";
import { MessengerPsidCapture } from "@/components/shared/messenger-psid-capture";
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
  // Declared here (not as src/app/favicon.ico) so a tenant layout's `icons`
  // replaces it: the file convention is injected into every route and
  // browsers pick it over the merchant's logo.
  icons: "/favicon.ico",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      {/* No Meta pixel here: only the marketing pages load it (components/tracking/marketing-pixel.tsx). */}
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
