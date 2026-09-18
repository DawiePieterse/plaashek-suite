import { t } from "./copy.js";
import { PrintableSlip } from "./PrintableSlip.js";

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
  const c = t();

  return (
    <PrintableSlip
      title={c.cardTitle}
      facts={[
        [c.slipFarm, card.farmName],
        [c.cardWorker, card.personName],
      ]}
      qrValue={card.code}
      note={c.cardNote}
      onClose={onClose}
    >
      <p className="card-code">{card.code}</p>
    </PrintableSlip>
  );
}
