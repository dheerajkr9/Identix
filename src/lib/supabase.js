import { createClient } from '@supabase/supabase-js'

// The anon key is designed for browser clients and is protected by Supabase
// Row Level Security. Environment variables can override these defaults.
// Keeping this fallback makes the public Vercel deployment work even when its
// dashboard has not been configured with VITE_ variables yet.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://qdtqsmutrmcjdldckzud.supabase.co'
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFkdHFzbXV0cm1jamRsZGNrenVkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg1Nzc5NDEsImV4cCI6MjEwNDE1Mzk0MX0.RFfQ2s87VGqurv-BL0c8_RfC6PxJL6Q52hGpi5FmbCw'

export const supabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey)
export const supabase = supabaseConfigured ? createClient(supabaseUrl, supabaseAnonKey) : null
