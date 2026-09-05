# IDENTIX

AI-assisted identity and document authenticity screening MVP built with React, Vite, and Supabase.

## Features

- Supabase email authentication and user profiles
- Protected dashboard, verification, history, profile, and report views
- Multi-file PDF/JPG/JPEG/PNG upload with 10 MB per-file validation
- Deterministic demo analysis with an 80% approval threshold
- Private Supabase Storage paths per user and verification session
- Saved verification sessions, checks, issues, recommendations, and downloadable reports

## Local setup

Requirements: Node.js 18+ and a Supabase project.

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create `.env.local` in the project root:

   ```env
   VITE_SUPABASE_URL=https://your-project.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-public-key
   ```

   Use the public `anon` key only. Never use the Supabase `service_role` key in this frontend.

3. In Supabase, open **SQL Editor**, paste the contents of `supabase/schema.sql`, and run it.

4. In Supabase Authentication, enable the Email provider. For quick local testing, email confirmation can be disabled temporarily.

   For password-free access, users can request a secure email sign-in link from the login screen. Add your Vercel deployment URL to **Authentication → URL Configuration → Redirect URLs** in Supabase so the link can return users to the deployed workspace.

5. Start the app:

   ```bash
   npm run dev
   ```

6. Build for production:

   ```bash
   npm run build
   ```

## GitHub upload

Upload the project files to a new GitHub repository. Do not upload:

- `.env.local`
- `node_modules/`
- `dist/`

Those are already excluded by `.gitignore`. Keep `.env.example` in the repository as the safe configuration template.

## Vercel deployment

1. Push the repository to GitHub.
2. In Vercel, choose **Add New → Project** and import the repository.
3. Vercel detects Vite automatically. The included `vercel.json` uses:
   - Build command: `npm run build`
   - Output directory: `dist`
4. This repository includes `.env.production` with the project's public Supabase URL and anon key, so Vercel builds are configured automatically. You can instead add these Environment Variables in Vercel for **Production**, **Preview**, and **Development** if you prefer to manage them in Vercel:

   ```text
   VITE_SUPABASE_URL
   VITE_SUPABASE_ANON_KEY
   ```

5. Deploy, then redeploy after changing environment variables.

The app uses hash navigation, so pages remain deployable on Vercel without a separate backend.

## Important limitation

Document screening is deterministic demo analysis. It does not connect to UIDAI, PAN, Passport, or any government verification API.
