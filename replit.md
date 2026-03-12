# QR Guard

A full-stack mobile-first QR code scanning and management app built with Expo (React Native) and Express.

## Architecture

- **Frontend**: Expo (React Native) with Expo Router for navigation, running on port 8081
- **Backend**: Express server running on port 5000
- **Database**: PostgreSQL with Drizzle ORM
- **Shared**: Common schema definitions in `shared/schema.ts`

## Project Structure

- `app/` - Expo Router screens (auth, tabs, qr-detail)
- `server/` - Express backend (routes, storage, templates)
- `shared/` - Shared Zod/Drizzle schema
- `components/` - Reusable React Native components
- `contexts/` - React Context providers (AuthContext)
- `lib/` - Utility libraries (TanStack Query client)
- `assets/` - Static assets
- `patches/` - Package patches via patch-package

## Workflows

- **Start Backend**: `npm run server:dev` — runs Express on port 5000 via tsx
- **Start Frontend**: `npm run expo:dev` — runs Expo Metro bundler on port 8081

## Key Dependencies

- `expo` ~54.0.27, `expo-router` ~6.0.17
- `express` ^5.0.1
- `drizzle-orm` with `pg` for PostgreSQL
- `@tanstack/react-query` for data fetching
- `tsx` for running TypeScript server directly
- `bcryptjs` for password hashing

## Environment Variables

- `DATABASE_URL` — PostgreSQL connection string (provisioned by Replit)
- `PORT` — Server port (defaults to 5000)
- `REPLIT_DEV_DOMAIN` — Used for CORS and Expo proxy URL configuration

## Database

Schema is defined in `shared/schema.ts`. To push schema changes:
```
npm run db:push
```

## Deployment

- Build: `npm run expo:static:build && npm run server:build`
- Run: `npm run server:prod`
