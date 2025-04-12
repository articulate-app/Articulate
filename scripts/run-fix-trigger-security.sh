#!/bin/bash

# Load environment variables from .env or .env.local
if [ -f .env.local ]; then
  source .env.local
elif [ -f .env ]; then
  source .env
fi

# Check if DATABASE_URL is set
if [ -z "$DATABASE_URL" ]; then
  echo "Error: DATABASE_URL environment variable is not set."
  echo "Please make sure your .env or .env.local file contains the DATABASE_URL variable."
  exit 1
fi

echo "Running fix-trigger-security.sql script..."
psql "$DATABASE_URL" -f scripts/fix-trigger-security.sql

echo "Done!" 