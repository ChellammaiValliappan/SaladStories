import type { AddressData } from "@/db";

type C = {
  name?: string; phone?: string; whatsapp?: string; email?: string; address?: AddressData | null;
  preferredSlotId?: string | null; foodPreferences?: string; instructions?: string; notes?: string;
};

function F({ label, name, defaultValue, type = "text", required, inputMode, hint, className = "", placeholder }: {
  label: string; name: string; defaultValue?: string | null; type?: string; required?: boolean; inputMode?: "numeric" | "tel" | "email"; hint?: string; className?: string; placeholder?: string;
}) {
  return (
    <div className={className}>
      <label className="label" htmlFor={`c-${name}`}>{label}</label>
      <input id={`c-${name}`} name={name} type={type} required={required} inputMode={inputMode} defaultValue={defaultValue ?? ""} placeholder={placeholder} className="field" />
      {hint && <p className="mt-1 text-xs text-ink-soft">{hint}</p>}
    </div>
  );
}

/** Shared customer form fields (add and edit). */
export function CustomerFields({ c, slots }: { c?: C; slots: { id: string; label: string }[] }) {
  const a = c?.address;
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <F label="Full name" name="name" required defaultValue={c?.name} className="sm:col-span-2" />
      <F label="Mobile number" name="phone" required inputMode="tel" defaultValue={c?.phone} />
      <F label="WhatsApp number" name="whatsapp" inputMode="tel" defaultValue={c?.whatsapp} hint="Leave blank if same as mobile" />
      <F label="Email (optional)" name="email" type="email" inputMode="email" defaultValue={c?.email} className="sm:col-span-2" />
      <F label="House / flat no." name="house" defaultValue={a?.house} />
      <F label="Building / street" name="building" defaultValue={a?.building} />
      <F label="Area" name="area" defaultValue={a?.area} />
      <F label="PIN code" name="pincode" inputMode="numeric" defaultValue={a?.pincode} />
      <F label="Landmark" name="landmark" defaultValue={a?.landmark} />
      <F label="Delivery note" name="deliveryNote" defaultValue={a?.instructions} placeholder="e.g. Leave with security" />
      <div>
        <label className="label" htmlFor="c-preferredSlotId">Preferred delivery time</label>
        <select id="c-preferredSlotId" name="preferredSlotId" defaultValue={c?.preferredSlotId ?? ""} className="field">
          <option value="">No preference</option>
          {slots.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
      </div>
      <F label="Food preferences" name="foodPreferences" defaultValue={c?.foodPreferences} placeholder="e.g. Veg only, mild spice, no onion" />
      <F label="Instructions for the kitchen / delivery" name="instructions" defaultValue={c?.instructions} className="sm:col-span-2" />
      <div className="sm:col-span-2">
        <label className="label" htmlFor="c-notes">Private notes</label>
        <textarea id="c-notes" name="notes" defaultValue={c?.notes ?? ""} className="field min-h-20" />
      </div>
    </div>
  );
}
