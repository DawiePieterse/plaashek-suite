import { toDataURL } from "qrcode";
import { useEffect, useState } from "react";
import { formatWhen, moduleName, type PairingToken } from "./api.js";
import { t } from "./copy.js";

export interface SlipDetails {
  pairingToken: PairingToken;
  farmName: string;
  personName: string;
}

/**
 * The printed slip is the credential (plan §3.4) — farm, person, module, printed
 * and expiry dates on the paper, so a slip found later can be recognised and killed.
 */
export function PairingSlip({ slip, onClose }: { slip: SlipDetails; onClose: () => void }) {
  const [qr, setQr] = useState("");
  const c = t();

  useEffect(() => {
    toDataURL(slip.pairingToken.qrUrl, { width: 320, margin: 1 }).then(setQr).catch(() => setQr(""));
  }, [slip.pairingToken.qrUrl]);

  return (
    <div className="modal-backdrop">
      <div className="modal">
        <div className="slip">
          <h2>{c.slipTitle}</h2>
          <dl>
            <dt>{c.slipFarm}</dt>
            <dd>{slip.farmName}</dd>
            <dt>{c.slipPerson}</dt>
            <dd>{slip.personName}</dd>
            <dt>{c.slipModule}</dt>
            <dd>{moduleName(slip.pairingToken.moduleCode)}</dd>
            <dt>{c.slipPrinted}</dt>
            <dd>{formatWhen(slip.pairingToken.printedAt)}</dd>
            <dt>{c.slipExpires}</dt>
            <dd>{formatWhen(slip.pairingToken.expiresAt)}</dd>
          </dl>

          {qr ? <img src={qr} alt={c.slipTitle} /> : <p>{c.qrLoading}</p>}

          <p className="slip-note">{c.slipNote}</p>
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
