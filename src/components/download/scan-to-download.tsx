"use client";

import { useSyncExternalStore } from "react";
import { QRCodeSVG } from "qrcode.react";

const QR_SIZE_PX = 92;
const QR_LOGO_PX = 22;
const QR_INK = "#1C1613";

function subscribeToNothing(): () => void {
  return () => {};
}

/** This page on whatever host served it, so a preview deploy scans to itself. */
function readDownloadUrl(): string {
  return `${window.location.origin}/download`;
}

/**
 * For a visitor on a computer: scan once and the page opens on the phone,
 * where the right store button is already first.
 */
export function ScanToDownload() {
  const url = useSyncExternalStore(subscribeToNothing, readDownloadUrl, () => null);

  return (
    <div className="inline-flex items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.04] p-3 pr-6">
      <div className="rounded-xl bg-white p-2">
        {url ? (
          <QRCodeSVG
            value={url}
            size={QR_SIZE_PX}
            level="H"
            fgColor={QR_INK}
            imageSettings={{
              src: "/download/app-icon.png",
              width: QR_LOGO_PX,
              height: QR_LOGO_PX,
              excavate: true,
            }}
            aria-label="QR code that opens this download page on your phone"
          />
        ) : (
          <div style={{ width: QR_SIZE_PX, height: QR_SIZE_PX }} aria-hidden />
        )}
      </div>
      <div>
        <p className="font-semibold text-white">On a computer?</p>
        <p className="mt-1 max-w-[15rem] text-sm text-white/55">
          Point your phone&apos;s camera here to get the app.
        </p>
      </div>
    </div>
  );
}
