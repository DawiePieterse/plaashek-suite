import { useEffect, useState } from "react";
import { rand, useOffice, useOfficeLoader } from "@plaashek/ui-office";
import { api, downloadCsv } from "./api.js";
import { t } from "./copy.js";
import { WorkerCard, type CardDetails } from "./WorkerCard.js";

interface Worker {
  personId: string;
  name: string;
  /** The farm's own number for this worker (ADR 0011) — typed here, printed on the card, and the payment system's join key. */
  workerNumber: string | null;
  active: boolean;
}

interface ImportSummary {
  created: number;
  updated: number;
  /** `reason` is a code — the office's own language words it, like every other message. */
  skipped: { row: number; reason: string }[];
}

interface PieceRate {
  effectiveFrom: string;
  baseCentsPerKg: number;
  targetKg: number | null;
  bonusCentsPerKg: number | null;
}

/**
 * Seasonal piece-work (docs/piecework-build-scope.md): the register, the
 * printed cards, the rate, and what that adds up to. Pay is calculated here
 * and exported — Plaashek does not issue payslips and does not move money
 * (ADR 0010).
 */
export function Piecework({ onRateChanged }: { onRateChanged: () => void }) {
  const { session, context } = useOffice();
  const guard = useOfficeLoader();
  const [workers, setWorkers] = useState<Worker[] | null>(null);
  const [current, setCurrent] = useState<PieceRate | null>(null);
  const [card, setCard] = useState<CardDetails | null>(null);
  const [name, setName] = useState("");
  const [workerNumber, setWorkerNumber] = useState("");
  const [imported, setImported] = useState<ImportSummary | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const c = t();

  const isAdmin = session.role === "admin";

  async function load() {
    await guard(async () => {
      const [workerList, rateList] = await Promise.all([
        api<{ workers: Worker[] }>("/piecework/workers", { token: session.token }),
        api<{ rates: PieceRate[] }>("/piece-rates", { token: session.token }),
      ]);
      setWorkers(workerList.workers);
      // Rates are effective-dated history; only the newest one is in force.
      setCurrent(rateList.rates[0] ?? null);
    }, setError);
  }

  useEffect(() => {
    void load();
  }, [session.token]);

  /** Returns whether it went through, so a refused edit can put the row back. */
  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    const outcome = await guard(async () => {
      await action();
      await load();
      return true;
    }, setError);
    setBusy(false);
    return outcome === true;
  }

  function registerWorker(event: React.FormEvent) {
    event.preventDefault();
    const workerName = name.trim();
    const number = workerNumber.trim();
    if (!workerName || !number) return;

    void run(async () => {
      await api("/piecework/workers", {
        method: "POST",
        token: session.token,
        body: JSON.stringify({ name: workerName, workerNumber: number }),
      });
      setName("");
      setWorkerNumber("");
      // Straight to the card: a worker with no printed card cannot be scanned.
      setCard({ number, personName: workerName, farmName: context.farm.name });
    });
  }

  /** The farm's own file, posted as-is (ADR 0011) — `worker_number` says who each row is. */
  function importFile(file: File) {
    void run(async () => {
      const summary = await api<ImportSummary>("/piecework/workers/import", {
        method: "POST",
        token: session.token,
        body: await file.text(),
        headers: { "content-type": "text/csv" },
      });
      setImported(summary);
    });
  }

  if (!workers) return null;

  return (
    <section className="no-print">
      <h2>{c.pieceworkHeading}</h2>
      {error && <p className="error">{error}</p>}

      <h3>{c.rateHeading}</h3>
      {current ? (
        <p className="muted">
          {current.targetKg === null || current.bonusCentsPerKg === null
            ? c.rateFlat(rand(current.baseCentsPerKg), current.effectiveFrom)
            : c.rateTiered(rand(current.baseCentsPerKg), current.targetKg, rand(current.bonusCentsPerKg), current.effectiveFrom)}
        </p>
      ) : (
        <p className="empty">{c.noRate}</p>
      )}
      {isAdmin && (
        <RateForm
          busy={busy}
          onCreate={(body) =>
            run(async () => {
              await api("/piece-rates", { method: "POST", token: session.token, body: JSON.stringify(body) });
              // The payout panel below owns its own read; a new rate re-prices it.
              onRateChanged();
            })
          }
        />
      )}

      <h3>{c.workersHeading}</h3>
      <div className="card">
        <table>
          <thead>
            <tr>
              <th>{c.workerNumber}</th>
              <th>{c.worker}</th>
              <th>{c.workerActive}</th>
              {isAdmin && <th></th>}
            </tr>
          </thead>
          <tbody>
            {workers.map((worker) =>
              isAdmin ? (
                <EditableWorkerRow
                  key={worker.personId}
                  worker={worker}
                  busy={busy}
                  onSave={(body) =>
                    run(() => api(`/piecework/workers/${worker.personId}`, { method: "PATCH", token: session.token, body: JSON.stringify(body) }))
                  }
                  onPrint={() => setCard({ number: worker.workerNumber ?? "", personName: worker.name, farmName: context.farm.name })}
                />
              ) : (
                <tr key={worker.personId}>
                  <td>{worker.workerNumber}</td>
                  <td>{worker.name}</td>
                  <td>{worker.active ? c.yes : c.no}</td>
                </tr>
              ),
            )}
            {workers.length === 0 && (
              <tr>
                <td colSpan={isAdmin ? 4 : 3} className="muted">
                  {c.noWorkers}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {isAdmin && (
        <>
          <form className="row" onSubmit={registerWorker}>
            <input
              value={workerNumber}
              onChange={(event) => setWorkerNumber(event.target.value)}
              placeholder={c.workerNumberPlaceholder}
              aria-label={c.workerNumber}
              className="short"
            />
            <input value={name} onChange={(event) => setName(event.target.value)} placeholder={c.workerNamePlaceholder} aria-label={c.worker} />
            <button type="submit" disabled={busy}>
              {c.registerWorker}
            </button>
          </form>

          <div className="row">
            <label className="quiet file">
              {c.importWorkers}
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  // Cleared so picking the same corrected file again still fires.
                  event.target.value = "";
                  if (file) importFile(file);
                }}
              />
            </label>
            <button type="button" className="quiet" onClick={() => void downloadCsv("/export/workers.csv", session.token)}>
              {c.exportWorkers}
            </button>
          </div>
          <p className="muted">{c.importNote}</p>

          {imported && (
            <p className={imported.skipped.length > 0 ? "waiting" : "muted"}>
              {c.imported(imported.created, imported.updated)}
              {imported.skipped.length > 0 && ` ${c.importSkipped(imported.skipped.map((skip) => c.importSkippedRow(skip.row, c.importReason[skip.reason] ?? skip.reason)).join("; "))}`}
            </p>
          )}
        </>
      )}

      {card && <WorkerCard card={card} onClose={() => setCard(null)} />}
    </section>
  );
}

/**
 * The register is edited in place: a mistyped number, a name spelled off a
 * payslip, or a worker who has left. Nothing here touches crates already
 * captured — they stay attributed to the person, and each crate still carries
 * the number that was actually scanned at the time.
 */
function EditableWorkerRow({
  worker,
  busy,
  onSave,
  onPrint,
}: {
  worker: Worker;
  busy: boolean;
  onSave: (body: { name: string; workerNumber: string; active: boolean }) => Promise<boolean>;
  onPrint: () => void;
}) {
  const [name, setName] = useState(worker.name);
  const [number, setNumber] = useState(worker.workerNumber ?? "");
  const c = t();

  const changed = name !== worker.name || number !== (worker.workerNumber ?? "");

  /** A number the office cannot have — already someone else's — must not sit on screen as if it stuck. */
  async function save(body: { name: string; workerNumber: string; active: boolean }) {
    if (await onSave(body)) return;
    setName(worker.name);
    setNumber(worker.workerNumber ?? "");
  }

  return (
    <tr>
      <td>
        <input value={number} onChange={(event) => setNumber(event.target.value)} aria-label={c.workerNumber} className="short" />
      </td>
      <td>
        <input value={name} onChange={(event) => setName(event.target.value)} aria-label={c.worker} />
      </td>
      <td>
        <input
          className="switch"
          type="checkbox"
          checked={worker.active}
          disabled={busy}
          aria-label={c.workerActive}
          onChange={(event) => void save({ name, workerNumber: number, active: event.target.checked })}
        />
      </td>
      <td className="row">
        <button type="button" className="quiet" disabled={busy || !changed} onClick={() => void save({ name, workerNumber: number, active: worker.active })}>
          {c.saveWorker}
        </button>
        <button type="button" className="quiet" disabled={!worker.workerNumber} onClick={onPrint}>
          {c.printCard}
        </button>
      </td>
    </tr>
  );
}

/** Rand in, cents out — money never round-trips as a float (ADR 0010). */
function RateForm({ busy, onCreate }: { busy: boolean; onCreate: (body: Record<string, unknown>) => void }) {
  const [effectiveFrom, setEffectiveFrom] = useState(new Date().toISOString().slice(0, 10));
  const [base, setBase] = useState("");
  const [target, setTarget] = useState("");
  const [bonus, setBonus] = useState("");
  const c = t();

  const toCents = (value: string) => Math.round(Number(value) * 100);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!base) return;
    const tiered = target !== "" && bonus !== "";
    onCreate({
      effectiveFrom,
      baseCentsPerKg: toCents(base),
      targetKg: tiered ? Number(target) : null,
      bonusCentsPerKg: tiered ? toCents(bonus) : null,
    });
    setBase("");
    setTarget("");
    setBonus("");
  }

  return (
    <form className="row" onSubmit={submit}>
      <label className="field">
        {c.effectiveFrom}
        <input type="date" value={effectiveFrom} onChange={(event) => setEffectiveFrom(event.target.value)} required />
      </label>
      <label className="field">
        {c.baseRate}
        <input type="number" step="0.01" min="0" value={base} onChange={(event) => setBase(event.target.value)} required />
      </label>
      <label className="field">
        {c.targetKgLabel}
        <input type="number" step="1" min="0" value={target} onChange={(event) => setTarget(event.target.value)} />
      </label>
      <label className="field">
        {c.bonusRate}
        <input type="number" step="0.01" min="0" value={bonus} onChange={(event) => setBonus(event.target.value)} />
      </label>
      <button type="submit" disabled={busy}>
        {c.saveRate}
      </button>
    </form>
  );
}
