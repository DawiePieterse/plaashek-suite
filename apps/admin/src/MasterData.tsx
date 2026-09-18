import { Fragment, useMemo, useState } from "react";
import { type Block, type Camp, useOffice, useOfficeLoader } from "@plaashek/ui-office";
import { t } from "./copy.js";

/**
 * The farm's own people, blocks and camps (plan §12 Phase 4) — the names a
 * device is assigned to and Boord's block picker draw from. Add-only, like
 * `GET /farm` they read from: nothing downstream asks to rename or remove
 * one yet.
 */
export function MasterData() {
  const { session, context, api, refreshFarm } = useOffice();
  const guard = useOfficeLoader();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const c = t();

  // Owner has the same rights as admin in the Farm Admin Tool — only
  // Plaashek Management can restrict what a farm's own office can do to itself.
  const isAdmin = true;

  /** Every add goes through here: one error path, one refresh of the shared farm context so the new row shows up everywhere it's read (the device picker included). */
  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    await guard(async () => {
      await action();
      await refreshFarm();
    }, setError);
    setBusy(false);
  }

  return (
    <Fragment>
      {error && <p className="error no-print">{error}</p>}

      <NamedListCard
        heading={c.peopleHeading}
        emptyText={c.noPeople}
        placeholder={c.personNamePlaceholder}
        addLabel={c.addPerson}
        items={context.people}
        isAdmin={isAdmin}
        busy={busy}
        onAdd={(name) => run(() => api("/people", { method: "POST", token: session.token, body: JSON.stringify({ name }) }))}
      />

      <NamedListCard
        heading={c.blocksHeading}
        emptyText={c.noBlocks}
        placeholder={c.blockNamePlaceholder}
        addLabel={c.addBlock}
        items={context.blocks}
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

/** People and Blocks are both just a farm-scoped name list with an add row — Camps needs its own card for the block picker. */
function NamedListCard({
  heading,
  emptyText,
  placeholder,
  addLabel,
  items,
  isAdmin,
  busy,
  onAdd,
}: {
  heading: string;
  emptyText: string;
  placeholder: string;
  addLabel: string;
  items: { id: string; name: string }[];
  isAdmin: boolean;
  busy: boolean;
  onAdd: (name: string) => void;
}) {
  return (
    <section className="no-print">
      <h2>{heading}</h2>
      {items.length === 0 && !isAdmin && <p className="empty">{emptyText}</p>}
      {(items.length > 0 || isAdmin) && (
        <div className="card">
          <table>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td>{item.name}</td>
                </tr>
              ))}
              {isAdmin && <NewNameRow busy={busy} placeholder={placeholder} label={addLabel} onCreate={onAdd} />}
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
  const blockNameById = useMemo(() => new Map(blocks.map((b) => [b.id, b.name])), [blocks]);

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
                  <td>{camp.blockId ? blockNameById.get(camp.blockId) : ""}</td>
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
