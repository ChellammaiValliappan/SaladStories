/**
 * The "develop" branch preview is a test site: Netlify gives it TEST_DATABASE_URL
 * (a Neon copy of the data) and TEST_AUTH_SECRET, and nothing is sent outside.
 * Production never has TEST_DATABASE_URL.
 */
export const isTestSite = () => !!process.env.TEST_DATABASE_URL;
