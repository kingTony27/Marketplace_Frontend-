import { createClient } from "@supabase/supabase-js";

// Server-side only — never import this file from client components.
// Uses the service role key, which bypasses Row Level Security entirely.
export const supabasePublic = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
{
   auth: { persistSession: false, autoRefreshToken: false },}
);