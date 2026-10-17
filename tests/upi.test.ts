import { describe, expect, it } from "vitest";
import { gpayAndroidUri, parseUpiLink, upiUri } from "@/lib/upi";

const pay = { upiId: "saladstories@ybl", payeeName: "Salad Stories", amount: 15645, orderNumber: "SS261017-ABCDE", merchantCode: "5814" };

describe("UPI links", () => {
  it("always fills in the exact amount, note, reference and merchant code", () => {
    const u = upiUri(pay);
    expect(u).toContain("pa=saladstories%40ybl");
    expect(u).toContain("am=156.45");
    expect(u).toContain("cu=INR");
    expect(u).toContain("tr=SS261017-ABCDE"); // merchant only
    expect(u).toContain("mc=5814");
    expect(u).toContain("pn=Salad%20Stories");
  });
  it("skips an invalid merchant code", () => {
    expect(upiUri({ ...pay, merchantCode: "abc" })).not.toContain("mc=");
  });
  it("opens Google Pay on Android", () => {
    expect(gpayAndroidUri(pay)).toMatch(/^intent:\/\/pay\?.*#Intent;scheme=upi;package=com\.google\.android\.apps\.nbu\.paisa\.user;end$/);
  });
  it("reads a business QR's text", () => {
    expect(parseUpiLink("upi://pay?pa=Q123456789@YBL&pn=Salad%20Stories&mc=5814&mode=02")).toEqual({ upiId: "q123456789@ybl", payeeName: "Salad Stories", merchantCode: "5814", extras: { mode: "02" } });
    expect(parseUpiLink("hello")).toBeNull();
  });
});

describe("personal Google Pay QR", () => {
  const qr = "upi://pay?pa=asha.r@oksbi&pn=Asha%20R&aid=uGICAgICAsPDsMA";
  it("keeps the QR's own fields and name, adds amount, no shop-only fields", () => {
    const parsed = parseUpiLink(qr)!;
    expect(parsed.extras).toEqual({ aid: "uGICAgICAsPDsMA" });
    const u = upiUri({ upiId: parsed.upiId, payeeName: parsed.payeeName, amount: 15645, orderNumber: "SS1", merchantCode: parsed.merchantCode, qrExtras: parsed.extras });
    expect(u).toBe("upi://pay?pa=asha.r%40oksbi&pn=Asha%20R&aid=uGICAgICAsPDsMA&am=156.45&cu=INR&tn=Salad%20Stories%20SS1");
  });
});
