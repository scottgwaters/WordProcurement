# Word Procurement

A web application for collaborative word curation for the Wordnauts iOS word-guessing game.

## Features

- **Dashboard**: Overview of word curation progress with stats and recent activity
- **Review Queue**: Approve or reject unverified words with filtering options
- **Word Browser**: Search, filter, and edit all words in the database
- **AI Hint Generator**: Generate age-appropriate hints using Claude AI
- **User Authentication**: Track who reviews and edits words

## Tech Stack

- **Next.js 16** with App Router
- **TypeScript** for type safety
- **Tailwind CSS** for Apple-inspired minimal design
- **Supabase** for authentication and PostgreSQL database
- **Claude API** for AI hint generation

## Setup

### 1. Clone and Install

```bash
cd WordProcurement
npm install
```

### 2. Create Supabase Project

1. Go to [supabase.com](https://supabase.com) and create a new project
2. Go to Settings > API to get your project URL and keys
3. Enable Email authentication in Authentication > Providers

### 3. Set Up Database

Run the SQL in `scripts/schema.sql` in your Supabase SQL editor:

1. Go to SQL Editor in your Supabase dashboard
2. Copy and paste the contents of `scripts/schema.sql`
3. Run the query to create tables and policies

### 4. Configure Environment Variables

Copy `.env.local.example` to `.env.local` and fill in your values:

```bash
cp .env.local.example .env.local
```

Required variables:
- `NEXT_PUBLIC_SUPABASE_URL` - Your Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Your Supabase anon/public key
- `SUPABASE_SERVICE_ROLE_KEY` - Your Supabase service role key (for import script)
- `ANTHROPIC_API_KEY` - Your Claude API key (for AI hints)

### 5. Import Existing Words (Optional)

If you have existing words in the Wordnauts iOS app:

```bash
npm run import-words
```

This imports words from `../Wordnauts/Wordnauts/Resources/answer_words.json`.

### 6. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Deployment

### Deploy to Vercel

1. Push your code to GitHub
2. Import the project in [Vercel](https://vercel.com)
3. Add environment variables in Vercel project settings
4. Deploy

## Project Structure

```
WordProcurement/
├── app/
│   ├── layout.tsx           # Root layout with Inter font
│   ├── page.tsx             # Dashboard (requires auth)
│   ├── login/page.tsx       # Login/signup page
│   ├── review/page.tsx      # Review queue
│   ├── words/
│   │   ├── page.tsx         # Word browser
│   │   └── [id]/page.tsx    # Word detail/edit
│   └── api/
│       ├── words/route.ts   # Words CRUD API
│       ├── words/[id]/verify/route.ts
│       └── generate-hints/route.ts
├── components/
│   ├── Header.tsx           # Navigation header
│   ├── WordCard.tsx         # Word display with actions
│   ├── FilterBar.tsx        # Search and filter controls
│   └── HintGenerator.tsx    # AI hint generation UI
├── lib/
│   ├── types.ts             # TypeScript types
│   ├── supabase.ts          # Browser Supabase client
│   ├── supabase-server.ts   # Server Supabase client
│   └── claude.ts            # Claude API integration
├── scripts/
│   ├── schema.sql           # Database schema
│   └── import-words.ts      # Import script
└── middleware.ts            # Auth protection
```

## Database Schema

### words
- `id` - UUID primary key
- `word` - The word (uppercase)
- `age_group` - "4-6", "7-9", or "10-12"
- `level` - 1, 2, or 3
- `category` - Word category (animals, food, etc.)
- `hints` - JSON with easy, medium, hard hints
- `verified` - Whether word has been reviewed
- `verified_by` - User who verified
- `verified_at` - Verification timestamp

### activity_log
- Tracks all word changes (created, verified, rejected, edited)
- Links to user and word

## Design System

Apple-inspired minimal design:
- Clean white backgrounds
- Subtle shadows and borders
- Inter font (SF Pro alternative)
- Blue accent (#0071e3)
- Green for success, orange for warning, red for error
