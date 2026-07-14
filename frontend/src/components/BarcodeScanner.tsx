"use client";

import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import type { IScannerControls } from "@zxing/browser";
import { X } from "lucide-react";

type Props = {
  onDetected: (upc: string) => void;
  onClose: () => void;
};

// Uses @zxing/browser (canvas + getUserMedia) rather than the native
// BarcodeDetector API — BarcodeDetector isn't implemented in Safari, and
// this app is used from an iPhone.
export function BarcodeScanner({ onDetected, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const reader = new BrowserMultiFormatReader();
    let controls: IScannerControls | undefined;
    let cancelled = false;

    reader
      .decodeFromVideoDevice(undefined, videoRef.current!, (result, _err, ctrl) => {
        controls = ctrl;
        if (result && !cancelled) {
          cancelled = true;
          ctrl.stop();
          onDetected(result.getText());
        }
      })
      .catch((err) => {
        setError(
          err instanceof Error
            ? err.message
            : "Couldn't access the camera — check permissions."
        );
      });

    return () => {
      cancelled = true;
      controls?.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      <div className="flex items-center justify-between px-6 py-4">
        <p className="text-[13px] font-medium text-white">Scan a barcode</p>
        <button
          onClick={onClose}
          aria-label="Close scanner"
          className="rounded-full bg-white/10 p-1.5 text-white transition-colors hover:bg-white/20"
        >
          <X size={18} />
        </button>
      </div>

      <div className="relative flex flex-1 items-center justify-center overflow-hidden">
        <video ref={videoRef} className="h-full w-full object-cover" muted playsInline />
        <div className="pointer-events-none absolute h-1/3 w-4/5 rounded-2xl border-2 border-white/70" />
      </div>

      {error && (
        <p className="px-6 py-4 text-center text-[13px] text-danger">{error}</p>
      )}
    </div>
  );
}
