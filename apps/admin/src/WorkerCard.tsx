import { toDataURL } from "qrcode";
import { useEffect, useState } from "react";
import { t } from "./copy.js";

export interface CardDetails {
  code: string;
  personName: string;
  farmName: string;
}

/**
 * The printed worker card (ADR 0009). The QR is what the phone reads at the
 * scale; the same code is printed in readable characters underneath, because
 * a camera that will not focus in the sun is the normal case, not the edge
 * case — the supervisor types it instead.
 */
export function WorkerCard({ card, onClose }: { card: CardDetails; onClose: () => void }) {
  const [qr, setQr] = useState("");
  const c = t();

  useEffect(() => {
    toDataURL(card.code, { width: 320, margin: 1 }).then(setQr).catch(() => setQr(""));
  }, [card.code]);

  return (
    <div className="modal-backdrop">
      <div className="modal">
        <div className="slip">
          <h2>{c.cardTitle}</h2>
          <dl>
            <dt>{c.slipFarm}</dt>
            <dd>{card.farmName}</dd>
            <dt>{c.cardWorker}</dt>
            <dd>{card.personName}</dd>
          </dl>

          {qr ? <img src={qr} alt={c.cardTitle} /> : <p>{c.qrLoading}</p>}

          <p className="card-code">{card.code}</p>
          <p className="slip-note">{c.cardNote}</p>
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
