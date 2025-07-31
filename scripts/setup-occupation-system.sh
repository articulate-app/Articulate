#!/bin/bash

# Setup script for the Real-Time Occupation Awareness System
# This script will create the necessary database tables and functions

echo "🚀 Setting up Real-Time Occupation Awareness System..."

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo "❌ Error: Please run this script from the project root directory"
    exit 1
fi

# Check if the SQL script exists
if [ ! -f "scripts/create_occupation_tables.sql" ]; then
    echo "❌ Error: SQL script not found at scripts/create_occupation_tables.sql"
    exit 1
fi

echo "📋 Creating database tables and functions..."

# Check if Supabase CLI is available
if command -v supabase &> /dev/null; then
    echo "✅ Supabase CLI found"
    
    # Get the database URL from environment or prompt user
    if [ -z "$DATABASE_URL" ]; then
        echo "📝 Please enter your Supabase database URL:"
        read -r DATABASE_URL
    fi
    
    # Run the SQL script
    echo "🔧 Executing SQL script..."
    psql "$DATABASE_URL" -f scripts/create_occupation_tables.sql
    
    if [ $? -eq 0 ]; then
        echo "✅ Database setup completed successfully!"
    else
        echo "❌ Error: Failed to execute SQL script"
        exit 1
    fi
else
    echo "⚠️  Supabase CLI not found. Please install it or run the SQL script manually:"
    echo "   psql YOUR_DATABASE_URL -f scripts/create_occupation_tables.sql"
    echo ""
    echo "📖 You can install Supabase CLI with:"
    echo "   npm install -g supabase"
fi

echo ""
echo "🎉 Setup complete! The occupation awareness system is now ready to use."
echo ""
echo "📚 Next steps:"
echo "   1. Start your development server: npm run dev"
echo "   2. Open the Add Task form"
echo "   3. Select a user, content type, production type, and delivery date"
echo "   4. Watch the real-time occupation awareness in action!"
echo ""
echo "📖 For more information, see docs/occupation-awareness-system.md" 