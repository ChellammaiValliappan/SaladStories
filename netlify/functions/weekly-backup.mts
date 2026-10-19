// Netlify Scheduled Function (free plan): every Monday at 8:00 am IST (02:30 UTC)
// it sends the owner a CSV of every order (backup + payment report) on Telegram + email.
export default async () => {
  const base = process.env.URL || "https://saladstories.netlify.app";
  const secret = process.env.CRON_SECRET || process.env.AUTH_SECRET || "";
  const res = await fetch(`${base}/api/cron/weekly-backup`, { method: "POST", headers: { authorization: `Bearer ${secret}` } });
  console.log("weekly-backup", res.status, await res.text());
};

export const config = { schedule: "30 2 * * 1" };
