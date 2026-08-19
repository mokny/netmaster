#!/bin/sh
set -e

echo "NetMaster: wende Datenbank-Migrationen an..."
npx prisma migrate deploy

echo "NetMaster: stelle sicher, dass ein Admin-Account existiert..."
npm run seed

exec "$@"
