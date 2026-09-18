import { useEffect, useRef, useState } from "react";
import { t } from "./copy.js";

/**
 * Reads a worker card at the scale (ADR 0009). The phone never shows a list
 * of people — it reads the card it is handed, or a supervisor types the code
 * printed on it when the camera cannot.
 */

/** Not in lib.dom yet; Chromium on Android has shipped it since 83. */
interface BarcodeDetectorLike {
  detect(source: CanvasImageSource): Promise<{ rawValue: string }[]>;
}
type BarcodeDetectorCtor = new (options?: { formats?: string[] }) => BarcodeDetectorLike;

const detectorCtor = () => (globalThis as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector;

/**
 * Mirrors the server's `normaliseCardCode`. Only used for the local lookup in
 * the cached card list — the server normalises again and is authoritative, so
 * if these two ever drift the phone just fails to name the picker locally and
 * the crate still gets attributed at sync.
 */
export function normaliseCardCode(raw: string): string {
  return raw
    .trim()
    .toUpperCase()
    .replace(/[\s-]/g, "")
    .replace(/O/g, "0")
    .replace(/[IL]/g, "1");
}

export function CardScanner({ onCode }: { onCode: (code: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [scanning, setScanning] = useState(false);
  const [typed, setTyped] = useState("");
  const [failed, setFailed] = useState(false);
  const c = t();

  useEffect(() => {
    if (!scanning) return;

    const Detector = detectorCtor();
    if (!Detector) {
      // No camera API on this handset — the printed code is the fallback.
      setFailed(true);
      setScanning(false);
      return;
    }

    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setInterval> | null = null;
    let stopped = false;

    const stop = () => {
      stopped = true;
      if (timer) clearInterval(timer);
      stream?.getTracks().forEach((track) => track.stop());
    };

    navigator.mediaDevices
      ?.getUserMedia({ video: { facingMode: "environment" } })
      .then(async (opened) => {
        if (stopped) return opened.getTracks().forEach((track) => track.stop());
        stream = opened;
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = opened;
        await video.play().catch(() => {});

        const detector = new Detector({ formats: ["qr_code"] });
        timer = setInterval(async () => {
          try {
            const [found] = await detector.detect(video);
            if (!found) return;
            stop();
            setScanning(false);
            navigator.vibrate?.(40);
            onCode(normaliseCardCode(found.rawValue));
          } catch {
            // A frame that will not decode is the normal case, not an error.
          }
        }, 300);
      })
      .catch(() => {
        // Permission refused, or no camera — say so once and offer the keyboard.
        setFailed(true);
        setScanning(false);
      });

    return stop;
  }, [scanning]);

  function submitTyped(event: React.FormEvent) {
    event.preventDefault();
    const code = normaliseCardCode(typed);
    if (!code) return;
    setTyped("");
    onCode(code);
  }

  return (
    <div className="scanner">
      {scanning ? (
        <>
          <video ref={videoRef} className="preview" muted playsInline />
          <button type="button" className="quiet" onClick={() => setScanning(false)}>
            {c.stopScanning}
          </button>
        </>
      ) : (
        <button type="button" onClick={() => setScanning(true)}>
          {c.scanCard}
        </button>
      )}

      {failed && <p className="refused">{c.cameraUnavailable}</p>}

      <form onSubmit={submitTyped} className="field">
        <label className="field">
          {c.cardCodeLabel}
          <input value={typed} onChange={(event) => setTyped(event.target.value)} autoCapitalize="characters" autoComplete="off" />
        </label>
        <button type="submit" className="quiet">
          {c.useCode}
        </button>
      </form>
    </div>
  );
}
