# Khambati Impex — Stock Manager

React + Vite frontend with Supabase (Auth + Postgres).

## Database changes (no manual SQL in Supabase UI)

This repo stores the database schema as migrations under `supabase/migrations/`.

- **First time (link to your hosted Supabase project)**:

```bash
npm run db:link
```

- **Apply migrations to hosted Supabase**:

```bash
npm run db:push
```

- **Run Supabase locally (optional)**:

```bash
npm run db:start
npm run db:reset
```

## App env vars

Create `.env.local`:

```bash
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

## Run the app

```bash
npm install
npm run dev
```

