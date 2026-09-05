import { createClient } from '@supabase/supabase-js'

// The anon key is designed for browser clients and is protected by Supabase
// Row Level Security. Environment variables can override these defaults.
// Keeping this fallback makes the public Vercel deployment work even when its
// dashboard has not been configured with VITE_ variables yet.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://qdtqsmutrmcjdldckzud.supabase.co'
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXAiLCJyZWYiOiJxZHRxc211dHJtY2pkbGRja3p1ZCIsInJvbGUiOiJhbm9uIiwiaWF0IjoxNzg4NTc3OTQxLCJleHAiOjIxMDQxNTM5NDF9.RFfQ2s87VGqurv-BL0c8_RfC6PxJL6Q52hGpi5FmbCw'

export const supabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey)
export const supabase = supabaseConfigured ? createClient(supabaseUrl, supabaseAnonKey) : null
