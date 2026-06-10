/**
 * Central API base URL.
 * In development: http://127.0.0.1:8000  (default)
 * In production:  value of NEXT_PUBLIC_API_URL env var (set in Vercel dashboard)
 */
export const API_BASE =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") || "http://127.0.0.1:8000";
