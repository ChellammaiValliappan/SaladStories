// Netlify Scheduled Function (free plan): every 15 minutes the site runs its
// background jobs — tomorrow's orders list at the time set in Settings (default 8 pm IST),
// renewal reminders, completing finished plans, retrying failed notifications,
// the 10 pm summary and Monday's backup. Every job has a run key, so nothing runs twice.
export default async () => {
  const base = process.env.URL || "https://saladstories.netlify.app";
  const secret = process.env.CRON_SECRET || process.env.AUTH_SECRET || "";
  const res = await fetch(`${base}/api/cron/tick`, { method: "POST", headers: { authorization: `Bearer ${secret}` } });
  console.log("tick", res.status, (await res.text()).slice(0, 500));
};

export const config = { schedule: "*/15 * * * *" };
