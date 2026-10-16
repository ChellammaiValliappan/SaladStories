import { findAreaByPincode, PINCODE_RE } from "@/lib/delivery";
import { fail, ok } from "@/lib/http";

export async function GET(req: Request) {
  const pincode = new URL(req.url).searchParams.get("pincode")?.trim() ?? "";
  if (!PINCODE_RE.test(pincode)) return fail("Enter a valid 6-digit PIN code");
  const area = await findAreaByPincode(pincode);
  if (!area) return ok({ serviceable: false, message: "Sorry, Salad Stories is not delivering to this location yet." });
  return ok({ serviceable: true, area: { id: area.id, name: area.name } });
}
