import { t } from "./copy.js";
import { PrintableSlip } from "./PrintableSlip.js";

export interface CardDetails {
  /** The farm's own number for this worker (ADR 0011) — the QR holds nothing else. */
  number: string;
  personName: string;
  farmName: string;
}

/**
 * The printed worker card (ADR 0009). The QR holds the farm's own worker
 * number and nothing else (ADR 0011), and the same number is printed in
 * readable characters underneath — a camera that will not focus in the sun
 * is the normal case, not the edge case, so the supervisor types it instead.
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
      qrValue={card.number}
      note={c.cardNote}
      onClose={onClose}
    >
      <p className="card-code">{card.number}</p>
    </PrintableSlip>
  );
}
