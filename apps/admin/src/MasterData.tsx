import { Fragment, useEffect, useState } from "react";
import { api, ApiError, type Block, type Camp, type FarmContext, type Session } from "./api.js";
import { t } from "./copy.js";

/**
 * The farm's own people, blocks and camps (plan §12 Phase 4) — the names a
 * device is assigned to and Boord's block picker draw from. Add-only, like
 * `GET /farm` they read from: nothing downstream asks to rename or remove
 * one yet.
 */
export function MasterData({ session, onSessionExpired }: { session: Session; onSessionExpired: () => void }) {
  const [context, setContext] = useState<FarmContext | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const c = t();

  const isAdmin = session.role === "admin";

  async function load() {
    try {
      setContext(await api<FarmContext>("/farm", { token: session.token }));
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

  if (!context) return null;

  return (
    <Fragment>
      {error && <p className="error no-print">{error}</p>}

      <PeopleCard
        people={context.people}
        isAdmin={isAdmin}
        busy={busy}
        onAdd={(name) => run(() => api("/people", { method: "POST", token: session.token, body: JSON.stringify({ name }) }))}
      />

      <BlocksCard
        blocks={context.blocks}
        isAdmin={isAdmin}
        busy={busy}
        onAdd={(name) => run(() => api("/blocks", { method: "POST", token: session.token, body: JSON.stringify({ name }) }))}
      />

      <CampsCard
        camps={context.camps}
        blocks={context.blocks}
        isAdmin={isAdmin}
        busy={busy}
        onAdd={(body) => run(() => api("/camps", { method: "POST", token: session.token, body: JSON.stringify(body) }))}
      />
    </Fragment>
  );
}

function PeopleCard({
  people,
  isAdmin,
  busy,
  onAdd,
}: {
  people: { id: string; name: string }[];
  isAdmin: boolean;
  busy: boolean;
  onAdd: (name: string) => void;
}) {
  const c = t();

  if (people.length === 0 && !isAdmin) return null;

  return (
    <section className="no-print">
      <h2>{c.peopleHeading}</h2>
      {people.length === 0 && !isAdmin && <p className="empty">{c.noPeople}</p>}
      {(people.length > 0 || isAdmin) && (
        <div className="card">
          <table>
            <tbody>
              {people.map((person) => (
                <tr key={person.id}>
                  <td>{person.name}</td>
                </tr>
              ))}
              {isAdmin && <NewNameRow busy={busy} placeholder={c.personNamePlaceholder} label={c.addPerson} onCreate={onAdd} />}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function BlocksCard({
  blocks,
  isAdmin,
  busy,
  onAdd,
}: {
  blocks: Block[];
  isAdmin: boolean;
  busy: boolean;
  onAdd: (name: string) => void;
}) {
  const c = t();

  if (blocks.length === 0 && !isAdmin) return null;

  return (
    <section className="no-print">
      <h2>{c.blocksHeading}</h2>
      {blocks.length === 0 && !isAdmin && <p className="empty">{c.noBlocks}</p>}
      {(blocks.length > 0 || isAdmin) && (
        <div className="card">
          <table>
            <tbody>
              {blocks.map((block) => (
                <tr key={block.id}>
                  <td>{block.name}</td>
                </tr>
              ))}
              {isAdmin && <NewNameRow busy={busy} placeholder={c.blockNamePlaceholder} label={c.addBlock} onCreate={onAdd} />}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function CampsCard({
  camps,
  blocks,
  isAdmin,
  busy,
  onAdd,
}: {
  camps: Camp[];
  blocks: Block[];
  isAdmin: boolean;
  busy: boolean;
  onAdd: (body: { name: string; blockId?: string }) => void;
}) {
  const c = t();
  const blockName = (blockId: string | null) => blocks.find((b) => b.id === blockId)?.name ?? "";

  if (camps.length === 0 && !isAdmin) return null;

  return (
    <section className="no-print">
      <h2>{c.campsHeading}</h2>
      {camps.length === 0 && !isAdmin && <p className="empty">{c.noCamps}</p>}
      {(camps.length > 0 || isAdmin) && (
        <div className="card">
          <table>
            <thead>
              <tr>
                <th></th>
                <th>{c.campBlockCol}</th>
                {isAdmin && <th></th>}
              </tr>
            </thead>
            <tbody>
              {camps.map((camp) => (
                <tr key={camp.id}>
                  <td>{camp.name}</td>
                  <td>{blockName(camp.blockId)}</td>
                </tr>
              ))}
              {isAdmin && <NewCampRow busy={busy} blocks={blocks} onCreate={onAdd} />}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function NewNameRow({
  busy,
  placeholder,
  label,
  onCreate,
}: {
  busy: boolean;
  placeholder: string;
  label: string;
  onCreate: (name: string) => void;
}) {
  const [name, setName] = useState("");

  function submit() {
    onCreate(name);
    setName("");
  }

  return (
    <tr>
      <td>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder={placeholder} />
      </td>
      <td>
        <button type="button" disabled={busy || !name} onClick={submit}>
          {label}
        </button>
      </td>
    </tr>
  );
}

function NewCampRow({ busy, blocks, onCreate }: { busy: boolean; blocks: Block[]; onCreate: (body: { name: string; blockId?: string }) => void }) {
  const [name, setName] = useState("");
  const [blockId, setBlockId] = useState("");
  const c = t();

  function submit() {
    onCreate(blockId ? { name, blockId } : { name });
    setName("");
    setBlockId("");
  }

  return (
    <tr>
      <td>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder={c.campNamePlaceholder} />
      </td>
      <td>
        <select value={blockId} onChange={(e) => setBlockId(e.target.value)}>
          <option value="">{c.noBlockOption}</option>
          {blocks.map((block) => (
            <option key={block.id} value={block.id}>
              {block.name}
            </option>
          ))}
        </select>
      </td>
      <td>
        <button type="button" disabled={busy || !name} onClick={submit}>
          {c.addCamp}
        </button>
      </td>
    </tr>
  );
}
