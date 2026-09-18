import { useEffect, useState } from "react";
import { api, ApiError, type FarmContext, type Session } from "./api.js";
import { t } from "./copy.js";
import { WorkerCard, type CardDetails } from "./WorkerCard.js";

interface Worker {
  personId: string;
  name: string;
  cardId: string | null;
  code: string | null;
  issuedAt: string | null;
}

interface PieceRate {
  id: string;
  effectiveFrom: string;
  baseCentsPerKg: number;
  targetKg: number | null;
  bonusCentsPerKg: number | null;
}

interface Payout {
  season: { id: string; name: string } | null;
  from: string | null;
  to: string | null;
  people: { personId: string; personName: string; kg: number; days: number; cents: number; unratedKg: number }[];
  unattributedCrates: number;
  unattributedKg: number;
}

const rand = (cents: number) => (cents / 100).toFixed(2);

/**
 * Seasonal piece-work (docs/piecework-build-scope.md): the register, the
 * printed cards, the rate, and what that adds up to. Pay is calculated here
 * and exported — Plaashek does not issue payslips and does not move money
 * (ADR 0010).
 */
export function Piecework({ session, onSessionExpired }: { session: Session; onSessionExpired: () => void }) {
  const [workers, setWorkers] = useState<Worker[] | null>(null);
  const [rates, setRates] = useState<PieceRate[]>([]);
  const [payout, setPayout] = useState<Payout | null>(null);
  const [card, setCard] = useState<CardDetails | null>(null);
  /** Printed on the card, so the worker's own farm is on the paper they carry. */
  const [farmName, setFarmName] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const c = t();

  const isAdmin = session.role === "admin";

  async function load() {
    try {
      const [workerList, rateList, paid, context] = await Promise.all([
        api<{ workers: Worker[] }>("/piecework/workers", { token: session.token }),
        api<{ rates: PieceRate[] }>("/piece-rates", { token: session.token }),
        api<Payout>("/piecework/payout", { token: session.token }),
        api<FarmContext>("/farm", { token: session.token }),
      ]);
      setFarmName(context.farm.name);
      setWorkers(workerList.workers);
      setRates(rateList.rates);
      setPayout(paid);
    } catch (caught) {
      if (caught instanceof ApiError && caught.code === "unauthenticated") return onSessionExpired();
      setError(caught instanceof ApiError ? caught.message : c.offline);
    }
  }

  useEffect(() => {
    void load();
  }, [session.token]);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await action();
      await load();
    } catch (caught) {
      if (caught instanceof ApiError && caught.code === "unauthenticated") return onSessionExpired();
      setError(caught instanceof ApiError ? caught.message : c.offline);
    } finally {
      setBusy(false);
    }
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
      setCard({ code: issued.code, personName: workerName, farmName });
    });
  }

  if (!workers) return null;

  const current = rates[0];
  const totalCents = payout?.people.reduce((sum, person) => sum + person.cents, 0) ?? 0;
  const totalKg = payout?.people.reduce((sum, person) => sum + person.kg, 0) ?? 0;

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
        <RateForm busy={busy} onCreate={(body) => run(() => api("/piece-rates", { method: "POST", token: session.token, body: JSON.stringify(body) }))} />
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
                  <td className="row-actions">
                    {worker.code && (
                      <button type="button" className="quiet" onClick={() => setCard({ code: worker.code!, personName: worker.name, farmName })}>
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
                          setCard({ code: issued.code, personName: worker.name, farmName });
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

      <h3>{c.payoutHeading}</h3>
      {!payout?.season ? (
        <p className="empty">{c.noSeason}</p>
      ) : (
        <>
          <p className="muted">{c.payoutPeriod(payout.season.name, payout.from ?? "", payout.to ?? "")}</p>
          <div className="card">
            <table>
              <thead>
                <tr>
                  <th>{c.worker}</th>
                  <th className="num">{c.days}</th>
                  <th className="num">{c.kg}</th>
                  <th className="num">{c.rand}</th>
                </tr>
              </thead>
              <tbody>
                {payout.people.map((person) => (
                  <tr key={person.personId}>
                    <td>{person.personName}</td>
                    <td className="num">{person.days}</td>
                    <td className="num">{person.kg.toFixed(1)}</td>
                    <td className="num">{rand(person.cents)}</td>
                  </tr>
                ))}
                {payout.people.length === 0 && (
                  <tr>
                    <td colSpan={4} className="muted">
                      {c.noPiecework}
                    </td>
                  </tr>
                )}
              </tbody>
              <tfoot>
                <tr>
                  <td>{c.total}</td>
                  <td className="num" />
                  <td className="num">{totalKg.toFixed(1)}</td>
                  <td className="num">{rand(totalCents)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          {payout.unattributedCrates > 0 && <p className="error">{c.unattributed(payout.unattributedCrates, payout.unattributedKg)}</p>}
          {/* A rand total is what the farm's own rate produced, not a statement that it is lawful (ADR 0010). */}
          <p className="muted">{c.payoutDisclaimer}</p>
        </>
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
