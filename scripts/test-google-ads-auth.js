// Test script for Google Ads authentication
// Run with: node scripts/test-google-ads-auth.js

require('dotenv').config({ path: '.env.local' });

async function testGoogleAdsAuth() {
  console.log('Testing Google Ads Authentication...\n');

  // Check environment variables
  const requiredVars = [
    'GOOGLE_ADS_CUSTOMER_ID',
    'GOOGLE_ADS_DEVELOPER_TOKEN',
    'GOOGLE_ADS_CLIENT_ID',
    'GOOGLE_ADS_CLIENT_SECRET',
    'GOOGLE_ADS_REFRESH_TOKEN',
  ];

  console.log('Environment Variables Check:');
  const missingVars = [];
  requiredVars.forEach(varName => {
    const value = process.env[varName];
    if (value) {
      console.log(`✅ ${varName}: ${varName.includes('TOKEN') || varName.includes('SECRET') ? '***' + value.slice(-4) : value}`);
    } else {
      console.log(`❌ ${varName}: MISSING`);
      missingVars.push(varName);
    }
  });

  if (missingVars.length > 0) {
    console.log(`\n❌ Missing required environment variables: ${missingVars.join(', ')}`);
    console.log('Please add them to your .env.local file');
    return;
  }

  console.log('\n✅ All environment variables are present');

  // Test OAuth token refresh
  console.log('\nTesting OAuth Token Refresh...');
  try {
    const tokenUrl = 'https://oauth2.googleapis.com/token';
    const params = new URLSearchParams({
      client_id: process.env.GOOGLE_ADS_CLIENT_ID,
      client_secret: process.env.GOOGLE_ADS_CLIENT_SECRET,
      refresh_token: process.env.GOOGLE_ADS_REFRESH_TOKEN,
      grant_type: 'refresh_token',
    });

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
    console.log('✅ OAuth token refresh successful');
    console.log(`   Access token: ***${data.access_token.slice(-8)}`);
    console.log(`   Expires in: ${data.expires_in} seconds`);
    console.log(`   Token type: ${data.token_type}`);

    // Test Google Ads API connection
    console.log('\nTesting Google Ads API Connection...');
    const customerId = process.env.GOOGLE_ADS_CUSTOMER_ID;
    const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
    const googleAdsUrl = `https://googleads.googleapis.com/v19/customers/${customerId}:generateKeywordIdeas`;

    const testPayload = {
      keywordSeed: { keywords: ["test"] },
      keywordPlanNetwork: "GOOGLE_SEARCH",
      pageSize: 1,
    };

    const adsResponse = await fetch(googleAdsUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${data.access_token}`,
        'developer-token': developerToken,
        'login-customer-id': customerId,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(testPayload),
    });

    if (!adsResponse.ok) {
      const errorText = await adsResponse.text();
      console.log(`❌ Google Ads API test failed: ${adsResponse.status} ${adsResponse.statusText}`);
      console.log('Error details:', errorText);
      return;
    }

    const adsData = await adsResponse.json();
    console.log('✅ Google Ads API connection successful');
    console.log(`   Results count: ${adsData.results?.length || 0}`);
    console.log(`   Next page token: ${adsData.nextPageToken ? 'Present' : 'None'}`);

  } catch (error) {
    console.log('❌ Test failed with error:', error.message);
  }
}

// Run the test
testGoogleAdsAuth().catch(console.error); 