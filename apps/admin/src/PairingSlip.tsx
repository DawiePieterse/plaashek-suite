import { moduleName } from "@plaashek/ui-office";
import { formatWhen, type PairingToken } from "./api.js";
import { t } from "./copy.js";
import { PrintableSlip } from "./PrintableSlip.js";

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
  const c = t();

  return (
    <PrintableSlip
      title={c.slipTitle}
      facts={[
        [c.slipFarm, slip.farmName],
        [c.slipPerson, slip.personName],
        [c.slipModule, moduleName(slip.pairingToken.moduleCode)],
        [c.slipPrinted, formatWhen(slip.pairingToken.printedAt)],
        [c.slipExpires, formatWhen(slip.pairingToken.expiresAt)],
      ]}
      qrValue={slip.pairingToken.qrUrl}
      note={c.slipNote}
      onClose={onClose}
    />
  );
}
