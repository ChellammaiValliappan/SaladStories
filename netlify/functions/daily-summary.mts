// Netlify Scheduled Function (free plan): every night at 10:00 pm IST (16:30 UTC)
// it asks the site to send the owner today's sales summary on Telegram + email.
export default async () => {
  const base = process.env.URL || "https://saladstories.netlify.app";
  const secret = process.env.CRON_SECRET || process.env.AUTH_SECRET || "";
  const res = await fetch(`${base}/api/cron/daily-summary`, { method: "POST", headers: { authorization: `Bearer ${secret}` } });
  console.log("daily-summary", res.status, await res.text());
};

export const config = { schedule: "30 16 * * *" };
