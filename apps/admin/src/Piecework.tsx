import { useEffect, useState } from "react";
import { useOffice, useOfficeLoader } from "@plaashek/ui-office";
import { api } from "./api.js";
import { t } from "./copy.js";
import { WorkerCard, type CardDetails } from "./WorkerCard.js";

interface Worker {
  personId: string;
  name: string;
  cardId: string | null;
  code: string | null;
}

interface PieceRate {
  effectiveFrom: string;
  baseCentsPerKg: number;
  targetKg: number | null;
  bonusCentsPerKg: number | null;
}

/** Rand from cents, for the rate line — money is stored and sent as integer cents (ADR 0010). */
const rand = (cents: number) => (cents / 100).toFixed(2);

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

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    await guard(async () => {
      await action();
      await load();
    }, setError);
    setBusy(false);
  }

  function registerWorker(event: React.FormEvent) {
    event.preventDefault();
    const workerName = name.trim();
    if (!workerName) return;

    void run(async () => {
      const { card: issued } = await api<{ card: { code: string } }>("/piecework/workers", {
        method: "POST",
        token: session.token,
        body: JSON.stringify({ name: workerName }),
      });
      setName("");
      // Straight to the card: a worker with no printed card cannot be paid.
      setCard({ code: issued.code, personName: workerName, farmName: context.farm.name });
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
              <th>{c.worker}</th>
              <th>{c.cardCode}</th>
              {isAdmin && <th></th>}
            </tr>
          </thead>
          <tbody>
            {workers.map((worker) => (
              <tr key={worker.personId}>
                <td>{worker.name}</td>
                <td>{worker.code ?? <span className="muted">{c.noCard}</span>}</td>
                {isAdmin && (
                  <td className="row">
                    {worker.code && (
                      <button type="button" className="quiet" onClick={() => setCard({ code: worker.code!, personName: worker.name, farmName: context.farm.name })}>
                        {c.printCard}
                      </button>
                    )}
                    <button
                      type="button"
                      className="quiet"
                      disabled={busy}
                      onClick={() =>
                        run(async () => {
                          const { card: issued } = await api<{ card: { code: string } }>(`/piecework/workers/${worker.personId}/card`, {
                            method: "POST",
                            token: session.token,
                          });
                          setCard({ code: issued.code, personName: worker.name, farmName: context.farm.name });
                        })
                      }
                    >
                      {c.reissueCard}
                    </button>
                    {worker.cardId && (
                      <button
                        type="button"
                        className="quiet danger"
                        disabled={busy}
                        onClick={() => run(() => api(`/piecework/cards/${worker.cardId}/revoke`, { method: "POST", token: session.token }))}
                      >
                        {c.revokeCard}
                      </button>
                    )}
                  </td>
                )}
              </tr>
            ))}
            {workers.length === 0 && (
              <tr>
                <td colSpan={isAdmin ? 3 : 2} className="muted">
                  {c.noWorkers}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {isAdmin && (
        <form className="row" onSubmit={registerWorker}>
          <input value={name} onChange={(event) => setName(event.target.value)} placeholder={c.workerNamePlaceholder} aria-label={c.worker} />
          <button type="submit" disabled={busy}>
            {c.registerWorker}
          </button>
        </form>
      )}

      {card && <WorkerCard card={card} onClose={() => setCard(null)} />}
    </section>
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
