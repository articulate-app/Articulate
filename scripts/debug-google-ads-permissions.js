// Debug script for Google Ads permissions
// Run with: node scripts/debug-google-ads-permissions.js

require('dotenv').config({ path: '.env.local' });

async function debugGoogleAdsPermissions() {
  console.log('Debugging Google Ads Permissions...\n');

  const customerId = process.env.GOOGLE_ADS_CUSTOMER_ID;
  const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
  const clientId = process.env.GOOGLE_ADS_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_ADS_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_ADS_REFRESH_TOKEN;

  console.log('Current Configuration:');
  console.log(`Customer ID: ${customerId}`);
  console.log(`Developer Token: ***${developerToken?.slice(-4)}`);
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

    // Test different customer ID configurations
    console.log('\nTesting different customer ID configurations...');

    // Test 1: Use customer ID as both path and login-customer-id
    console.log('\nTest 1: Using customer ID as both path and login-customer-id');
    await testConfiguration(accessToken, customerId, customerId);

    // Test 2: Try without login-customer-id header
    console.log('\nTest 2: Without login-customer-id header');
    await testConfiguration(accessToken, customerId, null);

    // Test 3: Try with a different customer ID format (add dashes)
    console.log('\nTest 3: With customer ID formatted with dashes');
    const formattedCustomerId = customerId.replace(/(\d{3})(\d{3})(\d{4})/, '$1-$2-$3');
    await testConfiguration(accessToken, customerId, formattedCustomerId);

    // Test 4: Try accessing the customer info endpoint
    console.log('\nTest 4: Testing customer info endpoint');
    await testCustomerInfo(accessToken, customerId);

  } catch (error) {
    console.log('❌ Debug failed with error:', error.message);
  }
}

async function testConfiguration(accessToken, customerId, loginCustomerId) {
  const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
  const googleAdsUrl = `https://googleads.googleapis.com/v19/customers/${customerId}:generateKeywordIdeas`;

  const testPayload = {
    keywordSeed: { keywords: ["test"] },
    keywordPlanNetwork: "GOOGLE_SEARCH",
    pageSize: 1,
  };

  const headers = {
    'Authorization': `Bearer ${accessToken}`,
    'developer-token': developerToken,
    'Content-Type': 'application/json',
  };

  if (loginCustomerId) {
    headers['login-customer-id'] = loginCustomerId;
  }

  try {
    const response = await fetch(googleAdsUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(testPayload),
    });

    if (response.ok) {
      const data = await response.json();
      console.log(`✅ SUCCESS! Results: ${data.results?.length || 0}`);
      return true;
    } else {
      const errorText = await response.text();
      console.log(`❌ FAILED: ${response.status} ${response.statusText}`);
      console.log(`   Error: ${errorText}`);
      return false;
    }
  } catch (error) {
    console.log(`❌ ERROR: ${error.message}`);
    return false;
  }
}

async function testCustomerInfo(accessToken, customerId) {
  const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
  const customerInfoUrl = `https://googleads.googleapis.com/v19/customers/${customerId}`;

  const headers = {
    'Authorization': `Bearer ${accessToken}`,
    'developer-token': developerToken,
  };

  try {
    const response = await fetch(customerInfoUrl, {
      method: 'GET',
      headers,
    });

    if (response.ok) {
      const data = await response.json();
      console.log('✅ Customer info retrieved successfully');
      console.log(`   Customer ID: ${data.id}`);
      console.log(`   Customer Name: ${data.descriptiveName}`);
      console.log(`   Currency Code: ${data.currencyCode}`);
      console.log(`   Time Zone: ${data.timeZone}`);
      console.log(`   Manager: ${data.manager}`);
      return true;
    } else {
      const errorText = await response.text();
      console.log(`❌ Customer info failed: ${response.status} ${response.statusText}`);
      console.log(`   Error: ${errorText}`);
      return false;
    }
  } catch (error) {
    console.log(`❌ Customer info error: ${error.message}`);
    return false;
  }
}

// Run the debug
debugGoogleAdsPermissions().catch(console.error); 