"use client";

import { useActionState, useState } from "react";
import { deleteAddress, makeDefault, saveAddress, updateProfile } from "@/app/(store)/account/actions";

type Address = {
  id: string; label: string; fullName: string; phone: string; house: string; building: string; street: string; area: string;
  city: string; state: string; pincode: string; landmark: string; instructions: string; isDefault: boolean;
};

export function ProfileForm({ user }: { user: { name: string; email: string; phone: string } }) {
  const [state, action, pending] = useActionState(updateProfile, null);
  return (
    <form action={action} className="panel mt-4 space-y-4 p-5">
      <div>
        <label className="label" htmlFor="p-name">Name</label>
        <input id="p-name" name="name" className="field" defaultValue={user.name} required />
      </div>
      <div>
        <label className="label" htmlFor="p-email">Email</label>
        <input id="p-email" className="field bg-crate/40" value={user.email} readOnly />
      </div>
      <div>
        <label className="label" htmlFor="p-phone">Mobile number</label>
        <input id="p-phone" name="phone" className="field" inputMode="tel" maxLength={10} defaultValue={user.phone} />
      </div>
      {state?.error && <p className="text-sm font-semibold text-tomato">{state.error}</p>}
      {state?.ok && <p className="text-sm font-semibold text-basil">{state.ok}</p>}
      <button className="btn btn-primary" disabled={pending}>{pending ? "Saving…" : "Save profile"}</button>
    </form>
  );
}

export function AddressManager({ addresses, defaults }: { addresses: Address[]; defaults: { fullName: string; phone: string } }) {
  const [editing, setEditing] = useState<Address | "new" | null>(null);
  return (
    <div className="mt-4 space-y-3">
      {addresses.map((a) => (
        <div key={a.id} className="panel p-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="font-bold">{a.label} {a.isDefault && <span className="ml-1 rounded-full bg-basil-soft px-2 py-0.5 text-xs text-basil-deep">Default</span>}</p>
              <p className="text-sm text-ink-soft">{[a.house, a.building, a.street, a.area, a.city, a.pincode].filter(Boolean).join(", ")}</p>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2 text-sm font-semibold">
            <button type="button" className="rounded-lg px-2 py-1 text-basil hover:bg-basil-soft" onClick={() => setEditing(a)}>Edit</button>
            {!a.isDefault && (
              <form action={makeDefault}><input type="hidden" name="id" value={a.id} /><button className="rounded-lg px-2 py-1 text-basil hover:bg-basil-soft">Make default</button></form>
            )}
            <form action={deleteAddress} onSubmit={(e) => !confirm("Delete this address?") && e.preventDefault()}>
              <input type="hidden" name="id" value={a.id} />
              <button className="rounded-lg px-2 py-1 text-tomato hover:bg-tomato/10">Delete</button>
            </form>
          </div>
        </div>
      ))}
      {editing ? (
        <AddressForm address={editing === "new" ? null : editing} defaults={defaults} onDone={() => setEditing(null)} />
      ) : (
        <button type="button" className="btn btn-ghost w-full" onClick={() => setEditing("new")}>Add an address</button>
      )}
    </div>
  );
}

function AddressForm({ address, defaults, onDone }: { address: Address | null; defaults: { fullName: string; phone: string }; onDone: () => void }) {
  const [state, action, pending] = useActionState(async (prev: unknown, fd: FormData) => {
    const r = await saveAddress(prev, fd);
    if (r?.ok) onDone();
    return r;
  }, null);
  const a = address;
  const f = (name: keyof Address, label: string, opts: { optional?: boolean; def?: string; mode?: "numeric" | "tel" } = {}) => (
    <div>
      <label className="label" htmlFor={`a-${name}`}>{label}{opts.optional && <span className="font-normal text-ink-soft"> (optional)</span>}</label>
      <input id={`a-${name}`} name={name} className="field" inputMode={opts.mode} defaultValue={(a?.[name] as string) ?? opts.def ?? ""} required={!opts.optional} />
    </div>
  );
  return (
    <form action={action} className="panel grid gap-3 p-5 sm:grid-cols-2">
      {a && <input type="hidden" name="id" value={a.id} />}
      {f("label", "Label", { def: "Home" })}
      {f("fullName", "Name", { def: defaults.fullName })}
      {f("phone", "Mobile", { def: defaults.phone, mode: "tel" })}
      {f("house", "House / flat")}
      {f("building", "Building", { optional: true })}
      {f("street", "Street", { optional: true })}
      {f("area", "Area")}
      {f("pincode", "PIN code", { mode: "numeric" })}
      {f("city", "City", { def: "Chennai" })}
      {f("state", "State", { def: "Tamil Nadu" })}
      {f("landmark", "Landmark", { optional: true })}
      {f("instructions", "Delivery instructions", { optional: true })}
      {state?.error && <p className="text-sm font-semibold text-tomato sm:col-span-2">{state.error}</p>}
      <div className="flex gap-2 sm:col-span-2">
        <button className="btn btn-primary" disabled={pending}>{pending ? "Saving…" : "Save address"}</button>
        <button type="button" className="btn btn-ghost" onClick={onDone}>Cancel</button>
      </div>
    </form>
  );
}
