import { toDataURL } from "qrcode";
import { useEffect, useState, type ReactNode } from "react";
import { t } from "./copy.js";

/**
 * The shell both pieces of printed paper share: a pairing slip (plan §3.4)
 * and a worker card (ADR 0009). Each is a modal holding a QR, the facts that
 * identify it, and a print button — and each leaves the office, so the print
 * rules in `styles.css` have to hold for both. One shell means a print fix
 * lands on both rather than on whichever was remembered.
 */
export function PrintableSlip({
  title,
  facts,
  qrValue,
  note,
  children,
  onClose,
}: {
  title: string;
  /** Label/value pairs above the QR — the paper says what it is for. */
  facts: [string, string][];
  qrValue: string;
  note: string;
  /** Anything between the QR and the note; the worker card puts its readable code here. */
  children?: ReactNode;
  onClose: () => void;
}) {
  const [qr, setQr] = useState("");
  const c = t();

  useEffect(() => {
    toDataURL(qrValue, { width: 320, margin: 1 })
      .then(setQr)
      .catch(() => setQr(""));
  }, [qrValue]);

  return (
    <div className="modal-backdrop">
      <div className="modal">
        <div className="slip">
          <h2>{title}</h2>
          <dl>
            {facts.map(([label, value]) => (
              <Fact key={label} label={label} value={value} />
            ))}
          </dl>

          {qr ? <img src={qr} alt={title} /> : <p>{c.qrLoading}</p>}
          {children}

          <p className="slip-note">{note}</p>
        </div>

        <div className="modal-actions no-print">
          <button type="button" onClick={() => window.print()}>
            {c.print}
          </button>
          <button type="button" className="link" onClick={onClose}>
            {c.close}
          </button>
        </div>
      </div>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </>
  );
}
