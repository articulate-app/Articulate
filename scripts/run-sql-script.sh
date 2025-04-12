#!/bin/bash

# Load environment variables
if [ -f .env ]; then
  source .env
elif [ -f .env.local ]; then
  source .env.local
fi

# Check if DATABASE_URL is set
if [ -z "$DATABASE_URL" ]; then
  echo "Error: DATABASE_URL environment variable is not set."
  echo "Please set it in your .env or .env.local file."
  exit 1
fi

# Run the SQL script
echo "Running SQL script to fix trigger permissions..."
psql "$DATABASE_URL" -f scripts/fix-trigger-permissions-simple.sql

echo "SQL script execution completed." 