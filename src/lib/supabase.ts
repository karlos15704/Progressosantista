import { createClient } from '@supabase/supabase-js';

// @ts-ignore
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://kieifmfjonynbqvmhzis.supabase.co';
// @ts-ignore
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_LBmWn0aH9NxX68r8SZzQog__ortltvi';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
