#!/usr/bin/env sh
# Set the bookvault_api role password from the environment (B0.4). The migration
# never contains it. Usage:
#   ADMIN_DATABASE_URL=postgresql://postgres:...@host:port/postgres \
#   BOOKVAULT_API_DB_PASSWORD=... sh backend/scripts/set_api_role_password.sh
# Local Supabase without psql on the host: set PSQL="docker exec -i supabase_db_BookVault psql -U postgres"
set -eu
: "${BOOKVAULT_API_DB_PASSWORD:?set BOOKVAULT_API_DB_PASSWORD}"
PSQL="${PSQL:-psql ${ADMIN_DATABASE_URL:?set ADMIN_DATABASE_URL}}"
echo "ALTER ROLE bookvault_api PASSWORD :'pw';" | $PSQL -v ON_ERROR_STOP=1 -v pw="$BOOKVAULT_API_DB_PASSWORD"
echo "bookvault_api password set"
