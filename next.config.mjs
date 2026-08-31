/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Allow CI/verification builds to use a separate output directory
  // (NEXT_DIST_DIR=.next-verify) so they never clash with a locally running
  // `next dev` sharing .next — stale chunks there cause
  // "Cannot find module './NNN.js'" runtime errors. Unset (e.g. on Vercel),
  // this stays the default ".next".
  distDir: process.env.NEXT_DIST_DIR || ".next",
};

export default nextConfig;
