import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.local' });

// Parse DATABASE_URL to extract connection details
const parseDatabaseUrl = (url: string) => {
  try {
    const urlObj = new URL(url);
    return {
      host: urlObj.hostname,
      port: parseInt(urlObj.port) || 5432,
      database: urlObj.pathname.slice(1), // Remove leading slash
      user: urlObj.username,
      password: urlObj.password,
      ssl: {
        rejectUnauthorized: false
      }
    };
  } catch (error) {
    throw new Error(`Invalid DATABASE_URL format: ${error}`);
  }
};

// Database connection configuration - lazy loaded to avoid build-time errors
export const getDbConfig = () => {
  const databaseUrl = process.env.DATABASE_URL;
  
  if (!databaseUrl) {
    throw new Error('DATABASE_URL environment variable is required');
  }
  
  return parseDatabaseUrl(databaseUrl);
};

// For backward compatibility, export a function that returns the config
export const dbConfig = getDbConfig; 