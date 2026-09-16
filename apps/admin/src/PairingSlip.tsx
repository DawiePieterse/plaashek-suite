import { toDataURL } from "qrcode";
import { useEffect, useState } from "react";
import { formatWhen, moduleName, type PairingToken } from "./api.js";

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

  useEffect(() => {
    toDataURL(slip.pairingToken.qrUrl, { width: 320, margin: 1 }).then(setQr).catch(() => setQr(""));
  }, [slip.pairingToken.qrUrl]);

  return (
    <div className="modal-backdrop">
      <div className="modal">
        <div className="slip">
          <h2>Paringstrokie</h2>
          <dl>
            <dt>Plaas</dt>
            <dd>{slip.farmName}</dd>
            <dt>Persoon</dt>
            <dd>{slip.personName}</dd>
            <dt>Program</dt>
            <dd>{moduleName(slip.pairingToken.moduleCode)}</dd>
            <dt>Gedruk</dt>
            <dd>{formatWhen(slip.pairingToken.printedAt)}</dd>
            <dt>Verval</dt>
            <dd>{formatWhen(slip.pairingToken.expiresAt)}</dd>
          </dl>

          {qr ? <img src={qr} alt="Paring-QR" /> : <p>QR laai…</p>}

          <p className="slip-note">
            Skandeer hierdie QR met die foon, by die kantoor waar daar sein is. Een keer geldig.
          </p>
        </div>

        <div className="modal-actions no-print">
          <button type="button" onClick={() => window.print()}>
            Druk
          </button>
          <button type="button" className="link" onClick={onClose}>
            Toemaak
          </button>
        </div>
      </div>
    </div>
  );
}
