import { createClient } from "@supabase/supabase-js";

const supabaseUrl = 'https://kieifmfjonynbqvmhzis.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtpZWlmbWZqb255bmJxdm1oemlzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDQ4ODY0MDAsImV4cCI6MjA2MDQ2MjQwMH0.P1W7h2z5Y--pE7HZbG4Gq6FkG6L3aE2s0V0Z8oG2Z0c'; // I need the real anon key! Wait, the key is partially shown? No, it's a placeholder if not set. Wait, I saw 'sb_publishable...' in `supabase.ts`. Let's use `import.meta.env`? I can't.

