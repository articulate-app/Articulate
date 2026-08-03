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

type CachedAccessToken = {
  accessToken: string;
  /** Epoch ms when the cached token should be considered expired. */
  expiresAtMs: number;
};

/** In-memory cache — refresh tokens are long-lived; access tokens ~1h. */
let cachedToken: CachedAccessToken | null = null;
let inflightRefresh: Promise<string> | null = null;

/** Refresh 60s before Google's expiry to avoid edge-of-expiry 401s. */
const EXPIRY_SKEW_MS = 60_000;

/**
 * Exchanges a refresh token for a fresh access token using Google's OAuth2 endpoint.
 * Caches the access token in-process so keyword research doesn't pay an OAuth RTT
 * on every request (often 200–500ms).
 */
export async function getFreshAccessToken(): Promise<string> {
  const now = Date.now();
  if (cachedToken && cachedToken.expiresAtMs > now) {
    return cachedToken.accessToken;
  }

  // Coalesce concurrent refreshes (primary + full phases starting together).
  if (inflightRefresh) {
    return inflightRefresh;
  }

  inflightRefresh = refreshAccessToken().finally(() => {
    inflightRefresh = null;
  });

  return inflightRefresh;
}

async function refreshAccessToken(): Promise<string> {
  const refreshToken = process.env.GOOGLE_ADS_REFRESH_TOKEN;
  const clientId = process.env.GOOGLE_ADS_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_ADS_CLIENT_SECRET;

  if (!refreshToken || !clientId || !clientSecret) {
    throw new Error("Missing required Google Ads OAuth credentials");
  }

  const tokenUrl = "https://oauth2.googleapis.com/token";
  const params = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });

  try {
    const response = await fetch(tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) {
      const errorData: GoogleAdsAuthError = await response.json();
      cachedToken = null;
      throw new Error(
        `OAuth token refresh failed: ${errorData.error} - ${errorData.error_description}`,
      );
    }

    const data: GoogleAdsAuthResponse = await response.json();

    if (!data.access_token) {
      throw new Error("No access token received from Google OAuth");
    }

    const expiresInSec =
      typeof data.expires_in === "number" && data.expires_in > 0
        ? data.expires_in
        : 3500;

    cachedToken = {
      accessToken: data.access_token,
      expiresAtMs: Date.now() + expiresInSec * 1000 - EXPIRY_SKEW_MS,
    };

    return data.access_token;
  } catch (error) {
    cachedToken = null;
    if (error instanceof Error) {
      throw new Error(`Failed to refresh Google Ads access token: ${error.message}`);
    }
    throw new Error("Failed to refresh Google Ads access token: Unknown error");
  }
}

/**
 * Warm the in-memory OAuth cache so the next keyword search skips the token RTT.
 */
export async function warmGoogleAdsAccessToken(): Promise<boolean> {
  try {
    if (!validateGoogleAdsConfig()) return false;
    await getFreshAccessToken();
    return true;
  } catch (error) {
    console.warn("Failed to warm Google Ads access token:", error);
    return false;
  }
}

/**
 * Validates that all required Google Ads environment variables are present
 * @returns boolean - True if all required variables are present
 */
export function validateGoogleAdsConfig(): boolean {
  const requiredVars = [
    "GOOGLE_ADS_CUSTOMER_ID",
    "GOOGLE_ADS_DEVELOPER_TOKEN",
    "GOOGLE_ADS_CLIENT_ID",
    "GOOGLE_ADS_CLIENT_SECRET",
    "GOOGLE_ADS_REFRESH_TOKEN",
  ];

  const missingVars = requiredVars.filter((varName) => !process.env[varName]);

  if (missingVars.length > 0) {
    console.error("Missing Google Ads environment variables:", missingVars);
    return false;
  }

  return true;
}
