import { useEffect, useRef, useState } from "react";
import { t } from "./copy.js";

/**
 * Reads a worker card at the scale (ADR 0009). The card's QR holds nothing
 * but the farm's own number for that worker (ADR 0011), so a supervisor whose
 * camera will not focus can read the same number off the paper and type it.
 * The phone never shows a list of people.
 */

/** Not in lib.dom yet; Chromium on Android has shipped it since 83. */
interface BarcodeDetectorLike {
  detect(source: CanvasImageSource): Promise<{ rawValue: string }[]>;
}
type BarcodeDetectorCtor = new (options?: { formats?: string[] }) => BarcodeDetectorLike;

/**
 * Mirrors the server's `normaliseWorkerNumber`. Only used for the local
 * lookup in the cached register — the server normalises again and is
 * authoritative, so if these two ever drift the phone just fails to name the
 * picker locally and the crate still gets attributed at sync.
 *
 * Leading zeros are never stripped: "014" and "14" are different numbers in
 * a payroll, and the farm owns the numbering (ADR 0011).
 */
export function normaliseWorkerNumber(raw: string): string {
  return raw.trim().toUpperCase().replace(/[\s-]/g, "");
}

export function CardScanner({ onCode }: { onCode: (code: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [scanning, setScanning] = useState(false);
  const [typed, setTyped] = useState("");
  const [failed, setFailed] = useState(false);
  const c = t();

  useEffect(() => {
    if (!scanning) return;

    const Detector = (globalThis as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector;
    if (!Detector) {
      // No camera API on this handset — the printed code is the fallback.
      setFailed(true);
      setScanning(false);
      return;
    }

    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;

    const stop = () => {
      stopped = true;
      if (timer) clearTimeout(timer);
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

        // Self-scheduling, not an interval: a decode on a cheap handset can
        // take longer than the gap, and overlapping detections pile up frames
        // faster than they finish.
        const look = async () => {
          try {
            const [found] = await detector.detect(video);
            if (found) {
              // The effect's cleanup stops the camera when `scanning` flips.
              setScanning(false);
              navigator.vibrate?.(40);
              onCode(normaliseWorkerNumber(found.rawValue));
              return;
            }
          } catch {
            // A frame that will not decode is the normal case, not an error.
          }
          if (!stopped) timer = setTimeout(look, 300);
        };

        timer = setTimeout(look, 300);
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
    const workerNumber = normaliseWorkerNumber(typed);
    if (!workerNumber) return;
    setTyped("");
    onCode(workerNumber);
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
          <input value={typed} onChange={(event) => setTyped(event.target.value)} inputMode="numeric" autoCapitalize="characters" autoComplete="off" />
        </label>
        <button type="submit" className="quiet">
          {c.useCode}
        </button>
      </form>
    </div>
  );
}
