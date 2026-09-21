import { useEffect, useState } from "react";
import { useFlush, useSavedToast } from "./capture.js";
import { t } from "./copy.js";
import { enqueue, enqueueMany } from "./queue.js";
import { readStored, writeStored } from "./storage.js";
import { fetchAnimals, fetchCamps, type Claims } from "./ticket.js";

interface Animal {
  id: string;
  tagNumber: string | null;
  sex: string;
}

interface Camp {
  id: string;
  name: string;
}

type Action = "move" | "treatment" | "weigh";

const ANIMALS_KEY = "plaashek.field.animals";
const CAMPS_KEY = "plaashek.field.camps";

/**
 * Kudde capture (docs/kudde-build-scope.md, ADR 0014): an animal picker, then
 * one of three small forms. Moving a group is one action on the screen but
 * writes one `movements` row per animal — no herd-level op exists, so a
 * batch save just enqueues one op per selected animal. The phone never asks
 * where an animal came from, only where it is going: `from_camp_id` is
 * something the office derives later, not something a worker in a camp full
 * of cattle can answer on demand. No weather, no GPS — the same reasoning
 * as Span and Stoor: this is about the animal, not a place or a crop
 * observation.
 */
export function Kudde({ ticket, claims }: { ticket: string; claims: Claims }) {
  const [animals, setAnimals] = useState<Animal[]>(() => readStored<Animal[]>(ANIMALS_KEY, []));
  const [camps, setCamps] = useState<Camp[]>(() => readStored<Camp[]>(CAMPS_KEY, []));
  const [action, setAction] = useState<Action>("move");
  const [selectedAnimalIds, setSelectedAnimalIds] = useState<Set<string>>(new Set());
  const [animalId, setAnimalId] = useState("");
  const [toCampId, setToCampId] = useState("");
  const [treatmentType, setTreatmentType] = useState("");
  const [dose, setDose] = useState("");
  const [note, setNote] = useState("");
  const [weightKg, setWeightKg] = useState("");
  const [saved, markSaved] = useSavedToast();
  const { pending, setPending, refused, flush } = useFlush(ticket, t().errors);
  const c = t();

  useEffect(() => {
    fetchAnimals(ticket)
      .then(({ animals: fresh }) => {
        setAnimals(fresh);
        writeStored(ANIMALS_KEY, fresh);
      })
      .catch(() => {}); // offline — the cached list stands

    fetchCamps(ticket)
      .then(({ camps: fresh }) => {
        setCamps(fresh);
        writeStored(CAMPS_KEY, fresh);
      })
      .catch(() => {});
  }, [ticket]);

  function animalLabel(animal: Animal) {
    return `${animal.tagNumber ?? c.noTag} · ${animal.sex}`;
  }

  function toggleAnimal(id: string) {
    setSelectedAnimalIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function save(event: React.FormEvent) {
    event.preventDefault();

    if (action === "move") {
      if (selectedAnimalIds.size === 0 || !toCampId) return;
      // One save, one moment: every animal in the group moved at the same time,
      // so one client_time for the whole batch is more honest than a fresh
      // timestamp per animal — and lets the server dedupe its per-batch lookup.
      const clientTime = new Date().toISOString();
      const ops = [...selectedAnimalIds].map((id) => ({
        entity: "movements" as const,
        entity_id: crypto.randomUUID(),
        client_time: clientTime,
        season_id: claims.seasonId,
        payload: { animal_id: id, to_camp_id: toCampId },
      }));
      setPending(enqueueMany(ops).length);
      setSelectedAnimalIds(new Set());
    } else if (action === "treatment") {
      if (!animalId || !treatmentType.trim()) return;
      setPending(
        enqueue({
          entity: "treatments",
          entity_id: crypto.randomUUID(),
          client_time: new Date().toISOString(),
          season_id: claims.seasonId,
          payload: {
            animal_id: animalId,
            treatment_type: treatmentType.trim(),
            dose: dose.trim() || null,
            note: note.trim() || null,
          },
        }).length,
      );
      setTreatmentType("");
      setDose("");
      setNote("");
    } else {
      if (!animalId || !weightKg) return;
      setPending(
        enqueue({
          entity: "weights",
          entity_id: crypto.randomUUID(),
          client_time: new Date().toISOString(),
          season_id: claims.seasonId,
          payload: { animal_id: animalId, weight_kg: Number(weightKg) },
        }).length,
      );
      setWeightKg("");
    }

    markSaved();
    navigator.vibrate?.(60);
    void flush();
  }

  return (
    <main>
      <div className="toggle">
        <button type="button" className={action === "move" ? "on" : ""} onClick={() => setAction("move")}>
          {c.moveAction}
        </button>
        <button type="button" className={action === "treatment" ? "on" : ""} onClick={() => setAction("treatment")}>
          {c.treatmentAction}
        </button>
        <button type="button" className={action === "weigh" ? "on" : ""} onClick={() => setAction("weigh")}>
          {c.weighAction}
        </button>
      </div>

      {animals.length === 0 && <p className="refused">{c.noAnimals}</p>}

      <form onSubmit={save}>
        {action === "move" ? (
          <>
            <p className="status">{c.chooseAnimals}</p>
            <ul className="checklist">
              {animals.map((animal) => (
                <li key={animal.id}>
                  <label>
                    <input type="checkbox" checked={selectedAnimalIds.has(animal.id)} onChange={() => toggleAnimal(animal.id)} />
                    {animalLabel(animal)}
                  </label>
                </li>
              ))}
            </ul>

            {selectedAnimalIds.size > 0 && <p className="status">{c.selectedAnimalsCount(selectedAnimalIds.size)}</p>}

            <label className="field">
              {c.toCampLabel}
              <select value={toCampId} onChange={(e) => setToCampId(e.target.value)} required>
                <option value="" disabled>
                  {c.chooseCamp}
                </option>
                {camps.map((camp) => (
                  <option key={camp.id} value={camp.id}>
                    {camp.name}
                  </option>
                ))}
              </select>
            </label>

            {camps.length === 0 && <p className="refused">{c.noCamps}</p>}
          </>
        ) : (
          <label className="field">
            {c.animalLabel}
            <select value={animalId} onChange={(e) => setAnimalId(e.target.value)} required autoFocus>
              <option value="" disabled>
                {c.chooseAnimal}
              </option>
              {animals.map((animal) => (
                <option key={animal.id} value={animal.id}>
                  {animalLabel(animal)}
                </option>
              ))}
            </select>
          </label>
        )}

        {action === "treatment" && (
          <>
            <label className="field">
              {c.treatmentTypeLabel}
              <input type="text" value={treatmentType} onChange={(e) => setTreatmentType(e.target.value)} required />
            </label>
            <label className="field">
              {c.doseLabelOptional}
              <input type="text" value={dose} onChange={(e) => setDose(e.target.value)} />
            </label>
            <label className="field">
              {c.noteLabelOptional}
              <input type="text" value={note} onChange={(e) => setNote(e.target.value)} />
            </label>
          </>
        )}

        {action === "weigh" && (
          <label className="field">
            {c.weightLabel}
            <input type="number" inputMode="decimal" min="0" step="0.1" value={weightKg} onChange={(e) => setWeightKg(e.target.value)} required />
          </label>
        )}

        <button type="submit">{c.save}</button>
      </form>

      {saved && <p className="saved toast">{c.savedOnPhone}</p>}
      {refused && <p className="refused">{refused}</p>}

      <footer>
        {pending > 0 && <span className="badge">{pending}</span>}
        {pending > 0 ? c.waitingToSend(pending) : c.allSent}
      </footer>
    </main>
  );
}
