# Keyword Planner Setup Guide

## Overview
The Keyword Planner feature allows users to get keyword ideas from Google Ads API with real search volume and competition data.

## Required Environment Variables

Add these to your `.env.local` file:

```bash
# Google Ads API Configuration
GOOGLE_ADS_CUSTOMER_ID=your_customer_id_here
GOOGLE_ADS_DEVELOPER_TOKEN=your_developer_token_here
GOOGLE_ADS_CLIENT_ID=your_client_id_here
GOOGLE_ADS_CLIENT_SECRET=your_client_secret_here
GOOGLE_ADS_REFRESH_TOKEN=your_refresh_token_here
```

**Note**: The system automatically exchanges your refresh token for fresh access tokens, so you only need to provide the refresh token once.

## Setup Instructions

### 1. Google Ads API Setup
1. Go to [Google Ads API Documentation](https://developers.google.com/google-ads/api/docs/first-call/dev-token)
2. Create a Google Ads API application
3. Get your developer token
4. Set up OAuth 2.0 credentials

### 2. Get Your Customer ID
1. Log into your Google Ads account
2. Your customer ID is displayed in the top right corner
3. It's a 10-digit number (e.g., 1234567890)

### 3. Generate Refresh Token
1. Use the Google OAuth 2.0 playground or your own OAuth flow
2. Request the following scopes:
   - `https://www.googleapis.com/auth/adwords`
3. Exchange the authorization code for a refresh token
4. The system will automatically refresh this token as needed

### 4. Test the Setup
1. Start your development server
2. Navigate to the Tasks page
3. Click the Keyword Planner icon in the header
4. Enter a keyword and test the search

## Features

- **Real-time data**: Uses Google Ads API for accurate search volume and competition data
- **Caching**: 2-minute cache to improve performance and reduce API calls
- **Rate limiting**: 3 requests per 5 seconds per IP to respect API limits
- **Error handling**: Graceful error states with retry functionality
- **Export**: CSV export of keyword ideas
- **Sorting**: Sort by search volume or competition level
- **Filtering**: Filter by region and language

## API Endpoints

- `POST /api/keyword-ideas` - Get keyword ideas from Google Ads API

## Security Notes

- All Google Ads API calls happen server-side
- Credentials are never exposed to the client
- Fresh access tokens are automatically generated from refresh tokens
- Rate limiting prevents abuse
- Request timeouts prevent hanging requests

## Troubleshooting

### Common Issues

1. **401 Unauthorized**: Check your OAuth credentials and refresh token
2. **403 Forbidden**: Verify your developer token and customer ID
3. **429 Rate Limited**: Wait a few seconds and try again
4. **500 Internal Server Error**: Check server logs for detailed error messages

### Debug Mode

Enable debug logging by checking the browser console and server logs for detailed error information. 