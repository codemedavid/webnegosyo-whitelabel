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
  title: "Whitelabel App",
  description: "A modern Next.js application with TypeScript and Tailwind CSS",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link
          href="https://api.mapbox.com/mapbox-gl-js/v3.0.1/mapbox-gl.css"
          rel="stylesheet"
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `!function(f,b,e,v,n,t,s)
{if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};
if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];
s.parentNode.insertBefore(t,s)}(window, document,'script',
'https://connect.facebook.net/en_US/fbevents.js');
fbq('init', '939808131983849');
fbq('track', 'PageView');`,
          }}
        />
      </head>
      <body
        suppressHydrationWarning
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <noscript>
          <img
            height="1"
            width="1"
            style={{ display: "none" }}
            src="https://www.facebook.com/tr?id=939808131983849&ev=PageView&noscript=1"
            alt=""
          />
        </noscript>
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
