// Script to list Google Ads customers
// Run with: node scripts/list-google-ads-customers.js

require('dotenv').config({ path: '.env.local' });

async function listGoogleAdsCustomers() {
  console.log('Listing Google Ads Customers...\n');

  const clientId = process.env.GOOGLE_ADS_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_ADS_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_ADS_REFRESH_TOKEN;
  const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;

  // Get fresh access token
  console.log('Getting fresh access token...');
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

    // Try to get customer list using the Google Ads API
    console.log('\nTrying to get customer list...');
    
    // First, let's try the customer service
    const customerServiceUrl = 'https://googleads.googleapis.com/v19/customers';
    
    const headers = {
      'Authorization': `Bearer ${accessToken}`,
      'developer-token': developerToken,
    };

    const customerResponse = await fetch(customerServiceUrl, {
      method: 'GET',
      headers,
    });

    if (customerResponse.ok) {
      const customerData = await customerResponse.json();
      console.log('✅ Customer list retrieved successfully');
      console.log('Available customers:');
      customerData.results?.forEach((customer, index) => {
        console.log(`  ${index + 1}. Customer ID: ${customer.id}`);
        console.log(`     Name: ${customer.descriptiveName}`);
        console.log(`     Currency: ${customer.currencyCode}`);
        console.log(`     Time Zone: ${customer.timeZone}`);
        console.log(`     Manager: ${customer.manager}`);
        console.log('');
      });
    } else {
      const errorText = await customerResponse.text();
      console.log(`❌ Customer list failed: ${customerResponse.status} ${customerResponse.statusText}`);
      console.log(`Error: ${errorText}`);
      
      // Try alternative approach - test with common customer ID patterns
      console.log('\nTrying alternative approach...');
      await testCommonCustomerIds(accessToken, developerToken);
    }

  } catch (error) {
    console.log('❌ Failed with error:', error.message);
  }
}

async function testCommonCustomerIds(accessToken, developerToken) {
  console.log('Testing common customer ID patterns...');
  
  // Test a few common patterns
  const testIds = [
    '4829716452', // Your current ID
    '482-971-6452', // With dashes
    '482971645', // Missing last digit
    '48297164520', // Extra digit
  ];

  for (const testId of testIds) {
    console.log(`\nTesting customer ID: ${testId}`);
    
    const testUrl = `https://googleads.googleapis.com/v19/customers/${testId}`;
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
        const data = await response.json();
        console.log(`✅ SUCCESS! Found customer: ${data.descriptiveName}`);
        console.log(`   Customer ID: ${data.id}`);
        console.log(`   Currency: ${data.currencyCode}`);
        console.log(`   Manager: ${data.manager}`);
        return data.id; // Return the working customer ID
      } else {
        const errorText = await response.text();
        console.log(`❌ Failed: ${response.status} ${response.statusText}`);
      }
    } catch (error) {
      console.log(`❌ Error: ${error.message}`);
    }
  }
  
  console.log('\n❌ No working customer IDs found');
  console.log('\nNext steps:');
  console.log('1. Check your Google Ads account for the correct customer ID');
  console.log('2. Make sure you have the correct permissions');
  console.log('3. Verify you\'re using the right account (manager vs client)');
}

// Run the script
listGoogleAdsCustomers().catch(console.error); 