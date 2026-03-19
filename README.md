# Next.js + FastAPI + Supabase SaaS Starter Template

A production-ready SaaS starter template with authentication, role-based access control, admin panel, and audit logging built on modern technologies.

## Features

- **Authentication** -- Email/password, MFA/TOTP, email verification, password reset, OAuth-ready
- **Admin Panel** -- Dashboard with stats, user management, RBAC configuration, audit logs
- **Role-Based Access Control** -- 13 permissions across 4 modules, hierarchical roles, JWT claims hook
- **Audit Logging** -- Tamper-proof activity trail with filtering and pagination
- **Dark Mode** -- System-aware theme switching via next-themes
- **Docker Support** -- Dockerfiles and docker-compose for containerized deployment

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 16.1, React 19, TypeScript, Tailwind CSS v4, shadcn/ui |
| Backend | FastAPI 0.128, SQLAlchemy 2.0 (async), Pydantic v2, slowapi |
| Database | Supabase PostgreSQL 15, Row-Level Security, UUID v7 |
| Auth | Supabase Auth (SSR cookies, JWKS verification, MFA/TOTP) |

## Architecture

```
Browser
  |
  v
Next.js (port 3000)                     FastAPI (port 8000)
  - Auth API routes (/api/auth/*)          - All database operations
  - User admin routes (/api/users/*)       - Business logic (services)
  - Rewrites /api/v1/* to FastAPI ------>  - Repository pattern
  - UI rendering                           - RBAC permission guards
  |                                        |
  v                                        v
Supabase (ports 55321-55327)
  - PostgreSQL database
  - Auth (GoTrue)
  - JWT claims hook (injects permissions)
```

Key design decisions:

- **No CORS needed.** Next.js rewrites `/api/v1/*` to FastAPI, so all requests appear same-origin.
- **Next.js handles auth only.** Login, register, MFA, password reset, and user admin actions (ban, delete, resend verification).
- **FastAPI handles all database operations.** Using the Router > Service > Repository > Database pattern.
- **Supabase client is never used in frontend components.** Only in API routes and middleware.

## Quick Start (Local Development)

### Prerequisites

- Node.js 20+
- Python 3.11+
- Docker (required by Supabase CLI)
- Supabase CLI (`npm install -g supabase`)
- Git

### 1. Clone and Install

```bash
git clone <repo-url>
cd nextjs-fastapi-supabase-starter-template
```

Install frontend dependencies:

```bash
cd frontend
cp .env.example .env.local
npm install
```

Install backend dependencies:

```bash
cd ../backend
cp .env.example .env
python -m venv venv

# Windows
venv\Scripts\activate

# macOS / Linux
source venv/bin/activate

pip install -r requirements.txt
```

### 2. Start Supabase

From the project root:

```bash
npx supabase start
```

This starts the local Supabase stack on custom ports to avoid conflicts with other projects:

| Service | Port |
|---------|------|
| API (Kong) | 55321 |
| Database (PostgreSQL) | 55322 |
| Studio (Dashboard) | 55323 |
| Inbucket (Email testing) | 55324 |
| SMTP | 55325 |
| POP3 | 55326 |
| Analytics | 55327 |

The `.env.example` files are pre-configured for these local ports. No changes needed for local development.

### 3. Run Migrations and Seed Data

```bash
npx supabase db reset --local
```

This applies all three migrations and seeds the database with default roles and permissions:

- `uuid_v7_function` -- Installs the UUID v7 generator function for time-ordered primary keys
- `rbac_system` -- Creates roles, permissions, user_roles, role_permissions, user_profiles, and audit_logs tables with RLS
- `jwt_claims_hook` -- Adds a PostgreSQL function that injects role and permissions into JWT tokens on every token issuance

### 4. Start Development Servers

Open two terminal windows:

```bash
# Terminal 1: Frontend (port 3000)
cd frontend
npm run dev
```

```bash
# Terminal 2: Backend (port 8000)
cd backend
uvicorn app.main:app --reload --port 8000
```

### 5. First User Setup

1. Open http://localhost:3000 and register a new account.
2. Check the email inbox at http://localhost:55324 (Inbucket) for the verification email.
3. Click the confirmation link in the email to verify your account.
4. Log in with your credentials.
5. To access the admin panel, promote your user to `super_admin` (see below).
6. Access the admin panel at http://localhost:3000/admin.

**Promote a user to super_admin:**

```bash
psql "postgresql://postgres:postgres@127.0.0.1:55322/postgres"
```

```sql
SELECT id, email FROM auth.users;

UPDATE user_roles
SET role_id = (SELECT id FROM roles WHERE name = 'super_admin')
WHERE user_id = 'USER-UUID-HERE';
```

The user must log out and log back in after a role change for the new permissions to take effect (permissions are embedded in the JWT token).

## Production Deployment (Supabase Cloud)

### 1. Create a Supabase Project

1. Go to https://supabase.com/dashboard and create a new project.
2. Note the following values from Project Settings > API:
   - Project URL (e.g., `https://abcdef.supabase.co`)
   - `anon` public key
   - `service_role` secret key
   - JWT Secret (Project Settings > API > JWT Settings)

### 2. Link and Deploy Migrations

```bash
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push
```

### 3. Seed Production Data

Run the seed file against your production database to create the default roles and permissions:

```bash
psql "YOUR_PRODUCTION_DATABASE_URL" -f supabase/seeds/rbac_seed.sql
```

You can find your production database URL in Supabase Dashboard > Project Settings > Database.

### 4. Configure Environment Variables

Update `frontend/.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
PRIVATE_SUPABASE_SERVICE_KEY=your-service-role-key
NEXT_PUBLIC_SITE_URL=https://yourdomain.com
NEXT_PUBLIC_PRODUCTNAME=YourAppName
```

Update `backend/.env`:

```bash
DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@db.YOUR_PROJECT_REF.supabase.co:5432/postgres
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
JWT_SECRET=your-jwt-secret
USE_JWKS=true
ENVIRONMENT=production
LOG_LEVEL=WARNING
```

### 5. Deploy the Application

**Frontend (Vercel):**

```bash
cd frontend
vercel deploy --prod
```

Set `NEXT_PUBLIC_API_URL` in Vercel environment variables to point to your deployed backend URL. This is used by `next.config.ts` to proxy `/api/v1/*` requests.

**Backend (Railway, Render, or Fly.io):**

Deploy the `backend/` directory using the included `Dockerfile`. Set the start command to:

```bash
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

## Docker Deployment

A `docker-compose.yml` is included for containerized deployment of the frontend and backend:

```bash
# Create a .env file in the project root with your Supabase credentials
docker-compose up --build
```

The compose file starts both services:

- Frontend on port 3000
- Backend on port 8000

Note: The compose file does not include Supabase itself. You need either a local Supabase instance (`npx supabase start`) or a Supabase Cloud project.

## RBAC System

### Default Roles

| Role | Hierarchy Level | Description |
|------|----------------|-------------|
| `super_admin` | 10000 | Full system access, all 13 permissions, system-protected |
| `user` | 100 | Base role, no admin permissions |

Both roles are system roles (`is_system = true`) and cannot be deleted through the API. You can create custom roles with any hierarchy level through the admin panel.

### Permissions (13 total)

| Module | Permissions |
|--------|------------|
| users | `read_all`, `update_all`, `delete_all`, `assign_roles` |
| roles | `create`, `read`, `update`, `delete` |
| permissions | `create`, `read`, `update`, `delete` |
| audit | `read` |

### How It Works

1. Roles and permissions are stored in PostgreSQL tables with a many-to-many relationship (`role_permissions` junction table).
2. A JWT claims hook (`custom_access_token_hook`) runs on every token issuance and injects the user's role name, hierarchy level, and permission strings into the JWT payload.
3. The FastAPI backend validates permissions using dependency injection: `dependencies=[Depends(require_permission("roles:create"))]`.
4. The frontend reads permissions from the JWT claims via `useAdminClaims()` and conditionally renders UI elements with `hasPermission()`.

## Project Structure

```
nextjs-fastapi-supabase-starter-template/
|
|-- frontend/
|   |-- src/
|   |   |-- app/                    # Pages and API routes
|   |   |   |-- admin/              # Admin panel (dynamic [module] route)
|   |   |   |-- app/                # Authenticated app pages (dashboard, settings)
|   |   |   |-- auth/               # Auth pages (login, register, 2fa, verify-email)
|   |   |   |-- api/
|   |   |       |-- auth/           # Auth API routes (login, register, MFA, etc.)
|   |   |       |-- users/[userId]/ # User admin actions (ban, delete, reset-password)
|   |   |-- components/
|   |   |   |-- admin/modules/      # Admin UI (dashboard, users, rbac, audit)
|   |   |   |-- common/             # Shared components (SiteNav, SiteFooter)
|   |   |   |-- forms/              # Form components (auth, user)
|   |   |   |-- ui/                 # shadcn/ui primitives
|   |   |-- lib/
|   |       |-- services/           # API service layer
|   |       |-- schemas/            # Zod validation schemas
|   |       |-- supabase/           # Supabase clients (API routes only)
|   |       |-- context/            # React context (GlobalContext)
|   |-- next.config.ts              # API rewrite rules (/api/v1/* -> FastAPI)
|
|-- backend/
|   |-- app/
|   |   |-- api/v1/                 # FastAPI route handlers
|   |   |   |-- auth.py             # GET /auth/me
|   |   |   |-- profile.py          # GET/PATCH /profile
|   |   |   |-- users.py            # GET /users/stats, /users/with-roles
|   |   |   |-- user_roles.py       # User role assignment
|   |   |   |-- roles.py            # CRUD + permission assignment
|   |   |   |-- permissions.py      # List (grouped) + create/delete
|   |   |   |-- audit.py            # GET /audit/logs (paginated)
|   |   |   |-- dashboard.py        # GET /dashboard/stats
|   |   |   |-- modules.py          # GET /modules (distinct audit modules)
|   |   |-- services/               # Business logic layer
|   |   |-- repositories/           # Data access layer (SQLAlchemy queries)
|   |   |-- models/                 # SQLAlchemy ORM models
|   |   |-- schemas/                # Pydantic schemas (request/ and response/)
|   |   |-- core/                   # Config, security, dependencies, rate limiting
|   |   |-- db/                     # Database session management
|   |   |-- middleware/             # Custom middleware
|   |-- requirements.txt
|   |-- Dockerfile
|
|-- supabase/
|   |-- migrations/                 # 3 SQL migration files
|   |   |-- 20260201000000_uuid_v7_function.sql
|   |   |-- 20260201000001_rbac_system.sql
|   |   |-- 20260201000002_jwt_claims_hook.sql
|   |-- seeds/
|   |   |-- rbac_seed.sql           # Default roles (2) and permissions (13)
|   |-- config.toml                 # Local Supabase port configuration
|
|-- docker-compose.yml              # Frontend + Backend containers
```

## Environment Variables

### Frontend (`frontend/.env.local`)

| Variable | Description | Required |
|----------|-------------|----------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase API URL | Yes |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anonymous key | Yes |
| `PRIVATE_SUPABASE_SERVICE_KEY` | Supabase service role key (server-side only) | Yes |
| `NEXT_PUBLIC_PRODUCTNAME` | Application display name | Yes |
| `NEXT_PUBLIC_SITE_URL` | Application URL (used in email verification links) | Production |

### Backend (`backend/.env`)

| Variable | Description | Required |
|----------|-------------|----------|
| `DATABASE_URL` | PostgreSQL connection string (port 55322 locally) | Yes |
| `SUPABASE_URL` | Supabase API URL (port 55321 locally) | Yes |
| `SUPABASE_ANON_KEY` | Supabase anonymous key | Yes |
| `JWT_SECRET` | JWT signing secret (from Supabase project settings) | Yes |
| `USE_JWKS` | Use JWKS endpoint for JWT verification (`true` recommended) | Yes |
| `ENVIRONMENT` | `development` or `production` | No |
| `LOG_LEVEL` | Logging level: `DEBUG`, `INFO`, `WARNING` | No |
| `DB_POOL_SIZE` | SQLAlchemy connection pool size (default: 10) | No |
| `DB_MAX_OVERFLOW` | Max overflow connections (default: 20) | No |
| `ENABLE_CORS` | Enable CORS middleware (default: `false`, not needed with rewrites) | No |

## Security Features

- **CSRF Protection** -- `enforceSameOrigin` check on all mutation API routes
- **JWT Verification** -- JWKS-based (recommended) or HS256, with no silent fallback between modes
- **MFA/TOTP** -- Fail-closed enforcement; MFA verification errors redirect to login, never silently pass
- **Rate Limiting** -- slowapi on authentication and sensitive endpoints (role assignment, password changes)
- **Row-Level Security** -- RLS policies on all database tables
- **Superadmin Protection** -- Live `auth.admin.getUserById()` check before any admin modification; stale metadata is never trusted
- **httpOnly Cookie Sessions** -- Tokens are set as httpOnly cookies, never exposed in response bodies
- **Session Invalidation** -- Admin actions (ban, delete, password reset) revoke all target user sessions via GoTrue admin API

## Useful URLs (Local Development)

| URL | Description |
|-----|-------------|
| http://localhost:3000 | Frontend application |
| http://localhost:3000/admin | Admin panel (requires super_admin role) |
| http://localhost:8000/docs | FastAPI Swagger documentation |
| http://localhost:8000/redoc | FastAPI ReDoc documentation |
| http://localhost:8000/health | Backend health check endpoint |
| http://localhost:55323 | Supabase Studio (database GUI) |
| http://localhost:55324 | Inbucket (email testing inbox) |

## Troubleshooting

### Supabase won't start

Make sure Docker is running and no other services are using ports 55321-55327:

```bash
npx supabase status
```

If you need to start fresh:

```bash
npx supabase stop
npx supabase start
npx supabase db reset --local
```

### Backend can't connect to database

1. Verify Supabase is running: `npx supabase status`
2. Check `DATABASE_URL` in `backend/.env` points to port 55322
3. Test the connection directly: `psql "postgresql://postgres:postgres@127.0.0.1:55322/postgres"`

### JWT validation errors

1. Verify `JWT_SECRET` in `backend/.env` matches your Supabase project's JWT secret
2. Check token expiration (default: 1 hour, configurable in `supabase/config.toml`)
3. Try setting `USE_JWKS=false` for HS256 fallback during debugging

### Frontend API calls return 502

The FastAPI backend must be running on port 8000. Next.js rewrites `/api/v1/*` requests to `http://127.0.0.1:8000/api/v1/*` (configured in `next.config.ts`).

### Admin panel shows "Access Denied"

Your user needs the `super_admin` role. Promote your user using the SQL commands in the "First User Setup" section, then log out and log back in to refresh the JWT token with updated permissions.

## License

MIT
