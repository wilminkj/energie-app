import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Supabase URL en anon key zijn vereist. Maak een .env bestand aan op basis van .env.example.'
  )
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
