interface GoogleAdsAuthResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope: string;
}

interface GoogleAdsAuthError {
  error: string;
  error_description: string;
}

/**
 * Exchanges a refresh token for a fresh access token using Google's OAuth2 endpoint
 * @returns Promise<string> - The fresh access token
 */
export async function getFreshAccessToken(): Promise<string> {
  const refreshToken = process.env.GOOGLE_ADS_REFRESH_TOKEN;
  const clientId = process.env.GOOGLE_ADS_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_ADS_CLIENT_SECRET;

  if (!refreshToken || !clientId || !clientSecret) {
    throw new Error('Missing required Google Ads OAuth credentials');
  }

  const tokenUrl = 'https://oauth2.googleapis.com/token';
  const params = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  });

  try {
    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    if (!response.ok) {
      const errorData: GoogleAdsAuthError = await response.json();
      throw new Error(`OAuth token refresh failed: ${errorData.error} - ${errorData.error_description}`);
    }

    const data: GoogleAdsAuthResponse = await response.json();
    
    if (!data.access_token) {
      throw new Error('No access token received from Google OAuth');
    }

    return data.access_token;
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to refresh Google Ads access token: ${error.message}`);
    }
    throw new Error('Failed to refresh Google Ads access token: Unknown error');
  }
}

/**
 * Validates that all required Google Ads environment variables are present
 * @returns boolean - True if all required variables are present
 */
export function validateGoogleAdsConfig(): boolean {
  const requiredVars = [
    'GOOGLE_ADS_CUSTOMER_ID',
    'GOOGLE_ADS_DEVELOPER_TOKEN',
    'GOOGLE_ADS_CLIENT_ID',
    'GOOGLE_ADS_CLIENT_SECRET',
    'GOOGLE_ADS_REFRESH_TOKEN',
  ];

  const missingVars = requiredVars.filter(varName => !process.env[varName]);
  
  if (missingVars.length > 0) {
    console.error('Missing Google Ads environment variables:', missingVars);
    return false;
  }

  return true;
} 