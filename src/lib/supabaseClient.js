import { createClient } from '@supabase/supabase-js'

function readEnv(key) {
  return import.meta.env[key]
}

const supabaseUrl =
  readEnv('VITE_SUPABASE_URL') || readEnv('NEXT_PUBLIC_SUPABASE_URL')
const supabaseAnonKey =
  readEnv('VITE_SUPABASE_ANON_KEY') ||
  readEnv('VITE_SUPABASE_PUBLISHABLE_KEY') ||
  readEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY')

if (!supabaseUrl || !supabaseAnonKey) {
  // Fail fast in dev if env isn’t wired.
  console.warn(
    'Missing Supabase env vars. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local.',
  )
}

export const supabase = createClient(supabaseUrl ?? '', supabaseAnonKey ?? '')

