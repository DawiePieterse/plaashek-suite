import { useEffect, useState } from "react";
import { useOffice, useOfficeLoader } from "@plaashek/ui-office";
import { api } from "./api.js";
import { t } from "./copy.js";

interface Animal {
  id: string;
  /** The farm's own ear tag (ADR 0011's pattern, ADR 0014) — typed here, never generated. */
  tagNumber: string | null;
  sex: string;
  breed: string | null;
  birthDate: string | null;
  active: boolean;
}

/**
 * Kudde's register (docs/kudde-build-scope.md) — the office types the tag
 * already in the animal's ear, its sex and breed in whatever words the farm
 * uses, and an optional birth date. Marking an animal sold or dead inactive
 * drops it off the field picker without losing its movement, treatment or
 * weight history. The headcount and treatment/weight rollup is the shared
 * `KuddeRollup` panel; this is only the register.
 */
export function Kudde() {
  const { session } = useOffice();
  const guard = useOfficeLoader();
  const [animals, setAnimals] = useState<Animal[] | null>(null);
  const [tagNumber, setTagNumber] = useState("");
  const [sex, setSex] = useState("");
  const [breed, setBreed] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const c = t();

  const isAdmin = session.role === "admin";

  async function load() {
    await guard(async () => {
      const { animals: fresh } = await api<{ animals: Animal[] }>("/animals", { token: session.token });
      setAnimals(fresh);
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

  function registerAnimal(event: React.FormEvent) {
    event.preventDefault();
    const animalSex = sex.trim();
    if (!animalSex) return;

    void run(async () => {
      await api("/animals", {
        method: "POST",
        token: session.token,
        body: JSON.stringify({ tagNumber: tagNumber.trim() || null, sex: animalSex, breed: breed.trim() || null }),
      });
      setTagNumber("");
      setSex("");
      setBreed("");
    });
  }

  if (!animals) return null;

  return (
    <section className="no-print">
      <h2>{c.kuddeRegisterHeading}</h2>
      {error && <p className="error">{error}</p>}

      <div className="card">
        <table>
          <thead>
            <tr>
              <th>{c.animalTag}</th>
              <th>{c.animalSex}</th>
              <th>{c.animalBreed}</th>
              <th>{c.animalBirthDate}</th>
              <th>{c.animalActive}</th>
              {isAdmin && <th></th>}
            </tr>
          </thead>
          <tbody>
            {animals.map((animal) =>
              isAdmin ? (
                <EditableAnimalRow
                  key={animal.id}
                  animal={animal}
                  busy={busy}
                  onSave={(body) => run(() => api(`/animals/${animal.id}`, { method: "PATCH", token: session.token, body: JSON.stringify(body) }))}
                />
              ) : (
                <tr key={animal.id}>
                  <td>{animal.tagNumber ?? ""}</td>
                  <td>{animal.sex}</td>
                  <td>{animal.breed ?? ""}</td>
                  <td>{animal.birthDate ?? ""}</td>
                  <td>{animal.active ? c.yes : c.no}</td>
                </tr>
              ),
            )}
            {animals.length === 0 && (
              <tr>
                <td colSpan={isAdmin ? 6 : 5} className="muted">
                  {c.noAnimalsYet}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {isAdmin && (
        <form className="row" onSubmit={registerAnimal}>
          <input value={tagNumber} onChange={(event) => setTagNumber(event.target.value)} placeholder={c.animalTagPlaceholder} aria-label={c.animalTag} className="short" />
          <input value={sex} onChange={(event) => setSex(event.target.value)} placeholder={c.animalSexPlaceholder} aria-label={c.animalSex} className="short" />
          <input value={breed} onChange={(event) => setBreed(event.target.value)} placeholder={c.animalBreedPlaceholder} aria-label={c.animalBreed} />
          <button type="submit" disabled={busy}>
            {c.registerAnimal}
          </button>
        </form>
      )}
    </section>
  );
}

/**
 * Fix a tag, correct the sex or breed, add a birth date, or mark an animal
 * sold or dead inactive. Nothing here touches movements, treatments or
 * weights already captured against this animal.
 */
function EditableAnimalRow({
  animal,
  busy,
  onSave,
}: {
  animal: Animal;
  busy: boolean;
  onSave: (body: { tagNumber: string | null; sex: string; breed: string | null; birthDate: string | null; active: boolean }) => Promise<boolean>;
}) {
  const [tagNumber, setTagNumber] = useState(animal.tagNumber ?? "");
  const [sex, setSex] = useState(animal.sex);
  const [breed, setBreed] = useState(animal.breed ?? "");
  const [birthDate, setBirthDate] = useState(animal.birthDate ?? "");
  const c = t();

  const changed =
    tagNumber !== (animal.tagNumber ?? "") || sex !== animal.sex || breed !== (animal.breed ?? "") || birthDate !== (animal.birthDate ?? "");

  /** A tag the office cannot have — already another animal's — must not sit on screen as if it stuck. */
  async function save(body: { tagNumber: string | null; sex: string; breed: string | null; birthDate: string | null; active: boolean }) {
    if (await onSave(body)) return;
    setTagNumber(animal.tagNumber ?? "");
    setSex(animal.sex);
    setBreed(animal.breed ?? "");
    setBirthDate(animal.birthDate ?? "");
  }

  const current = () => ({
    tagNumber: tagNumber.trim() || null,
    sex,
    breed: breed.trim() || null,
    birthDate: birthDate || null,
    active: animal.active,
  });

  return (
    <tr>
      <td>
        <input value={tagNumber} onChange={(event) => setTagNumber(event.target.value)} aria-label={c.animalTag} className="short" />
      </td>
      <td>
        <input value={sex} onChange={(event) => setSex(event.target.value)} aria-label={c.animalSex} className="short" />
      </td>
      <td>
        <input value={breed} onChange={(event) => setBreed(event.target.value)} aria-label={c.animalBreed} />
      </td>
      <td>
        <input type="date" value={birthDate} onChange={(event) => setBirthDate(event.target.value)} aria-label={c.animalBirthDate} />
      </td>
      <td>
        <input
          className="switch"
          type="checkbox"
          checked={animal.active}
          disabled={busy}
          aria-label={c.animalActive}
          onChange={(event) => void save({ ...current(), active: event.target.checked })}
        />
      </td>
      <td>
        <button type="button" className="quiet" disabled={busy || !changed} onClick={() => void save(current())}>
          {c.saveAnimal}
        </button>
      </td>
    </tr>
  );
}
