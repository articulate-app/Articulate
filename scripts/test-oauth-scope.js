// Test OAuth scope and help find correct customer ID
// Run with: node scripts/test-oauth-scope.js

require('dotenv').config({ path: '.env.local' });

async function testOAuthScope() {
  console.log('Testing OAuth Scope and Permissions...\n');

  const clientId = process.env.GOOGLE_ADS_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_ADS_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_ADS_REFRESH_TOKEN;

  console.log('OAuth Configuration:');
  console.log(`Client ID: ${clientId}`);
  console.log(`Client Secret: ***${clientSecret?.slice(-4)}`);
  console.log(`Refresh Token: ***${refreshToken?.slice(-4)}`);

  // Get fresh access token
  console.log('\nGetting fresh access token...');
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
      const errorData = await response.json();
      console.log(`❌ OAuth token refresh failed: ${response.status} ${response.statusText}`);
      console.log('Error details:', errorData);
      return;
    }

    const data = await response.json();
    const accessToken = data.access_token;
    console.log('✅ OAuth token refresh successful');
    console.log(`Access Token: ***${accessToken.slice(-8)}`);
    console.log(`Expires in: ${data.expires_in} seconds`);
    console.log(`Scope: ${data.scope}`);

    // Test if the scope includes Google Ads
    if (data.scope && data.scope.includes('adwords')) {
      console.log('✅ OAuth scope includes Google Ads access');
    } else {
      console.log('❌ OAuth scope does not include Google Ads access');
      console.log('Required scope: https://www.googleapis.com/auth/adwords');
      console.log('Current scope:', data.scope);
    }

    // Test Google Ads API access with a simple endpoint
    console.log('\nTesting Google Ads API access...');
    await testGoogleAdsAccess(accessToken);

  } catch (error) {
    console.log('❌ Failed with error:', error.message);
  }
}

async function testGoogleAdsAccess(accessToken) {
  const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
  
  if (!developerToken) {
    console.log('❌ Developer token is missing');
    return;
  }

  console.log(`Developer Token: ***${developerToken.slice(-4)}`);

  // Try to access the Google Ads API root endpoint
  const testUrl = 'https://googleads.googleapis.com/v19';
  const headers = {
    'Authorization': `Bearer ${accessToken}`,
    'developer-token': developerToken,
  };

  try {
    const response = await fetch(testUrl, {
      method: 'GET',
      headers,
    });

    if (response.ok) {
      console.log('✅ Google Ads API is accessible');
      const data = await response.json();
      console.log('API Info:', data);
    } else {
      const errorText = await response.text();
      console.log(`❌ Google Ads API access failed: ${response.status} ${response.statusText}`);
      console.log('Error:', errorText);
    }
  } catch (error) {
    console.log(`❌ Google Ads API error: ${error.message}`);
  }
}

// Run the test
testOAuthScope().catch(console.error); 