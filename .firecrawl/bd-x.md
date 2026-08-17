> ## Documentation Index
>
> Fetch the complete documentation index at: [/llms.txt](https://docs.brightdata.com/llms.txt)
>
> Use this file to discover all available pages before exploring further.

[Skip to main content](https://docs.brightdata.com/datasets/scrapers/twitter/send-first-request#content-area)

[Bright Data Docs home page![light logo](https://mintcdn.com/brightdata/FreEYbEGZchU-2Iw/logo/light.svg?fit=max&auto=format&n=FreEYbEGZchU-2Iw&q=85&s=fa5461a75d0b4cf2e744c89d4b67afac)![dark logo](https://mintcdn.com/brightdata/FreEYbEGZchU-2Iw/logo/dark.svg?fit=max&auto=format&n=FreEYbEGZchU-2Iw&q=85&s=43d5b51e1516be57edb429337abdc90f)](https://brightdata.com/)

English

Search...

Ctrl K

- [Support](https://brightdata.zendesk.com/hc/en-us/requests/new)
- [Sign up](https://brightdata.com/?hs_signup=1&utm_source=docs)
- [Sign up](https://brightdata.com/?hs_signup=1&utm_source=docs)

Search...

Navigation

X (Twitter) Scraper API

Send your first X (Twitter) API request

[Welcome](https://docs.brightdata.com/introduction) [Proxy Infrastructure](https://docs.brightdata.com/proxy-networks/introduction) [Web Access APIs](https://docs.brightdata.com/scraping-automation/introduction) [Data Feeds](https://docs.brightdata.com/datasets/introduction) [AI](https://docs.brightdata.com/ai/introduction) [API Reference](https://docs.brightdata.com/api-reference/authentication) [General](https://docs.brightdata.com/general/account/overview) [Integrations](https://docs.brightdata.com/integrations/introduction)

### Introduction

- [Overview](https://docs.brightdata.com/datasets/introduction)

### Product Guides

- Scraper API



  - [Overview](https://docs.brightdata.com/datasets/scrapers/overview)
  - Scrapers Library

  - LinkedIn Scraper API

  - Instagram Scraper API

  - TikTok Scraper API

  - Amazon Scraper API

  - ChatGPT Scraper API

  - Facebook Scraper API

  - X (Twitter) Scraper API



    - [Introduction](https://docs.brightdata.com/datasets/scrapers/twitter/introduction)
    - [Quickstart](https://docs.brightdata.com/datasets/scrapers/twitter/quickstart)
    - [Send your first request](https://docs.brightdata.com/datasets/scrapers/twitter/send-first-request)
    - [Async requests](https://docs.brightdata.com/datasets/scrapers/twitter/async-requests)
    - Data delivery
  - YouTube Scraper API

  - Reddit Scraper API

  - Google Scraper API

  - Tutorials

  - Concepts

  - [Managed services](https://docs.brightdata.com/datasets/scrapers/managed-services)
- Scraper Studio

- Marketplace

- Archive

- Data Validation

- Deep Lookup


## On this page

- [Prerequisites](https://docs.brightdata.com/datasets/scrapers/twitter/send-first-request#prerequisites)
- [Request structure](https://docs.brightdata.com/datasets/scrapers/twitter/send-first-request#request-structure)
- [How to scrape X (Twitter) profiles](https://docs.brightdata.com/datasets/scrapers/twitter/send-first-request#how-to-scrape-x-twitter-profiles)
- [How to scrape X (Twitter) posts](https://docs.brightdata.com/datasets/scrapers/twitter/send-first-request#how-to-scrape-x-twitter-posts)
- [Quick reference: dataset IDs](https://docs.brightdata.com/datasets/scrapers/twitter/send-first-request#quick-reference-dataset-ids)
- [Output formats](https://docs.brightdata.com/datasets/scrapers/twitter/send-first-request#output-formats)
- [Next steps](https://docs.brightdata.com/datasets/scrapers/twitter/send-first-request#next-steps)

X (Twitter) Scraper API

# Send your first X (Twitter) API request

Copy pageCopy page

Send synchronous requests to all 2 Bright Data X (Twitter) Scraper API endpoints with copy-paste examples for profiles and posts collection.

Copy pageCopy page

This tutorial walks you through sending a synchronous request to each Bright Data X Scraper API endpoint. By the end, you’ll have working examples for profiles and posts.

## [​](https://docs.brightdata.com/datasets/scrapers/twitter/send-first-request\#prerequisites)  Prerequisites

- A [Bright Data account](https://brightdata.com/cp/start) with an active API key
- Completed the [Quickstart](https://docs.brightdata.com/datasets/scrapers/twitter/quickstart)

## [​](https://docs.brightdata.com/datasets/scrapers/twitter/send-first-request\#request-structure)  Request structure

Every synchronous request follows the same pattern:

```
POST https://api.brightdata.com/datasets/v3/scrape?dataset_id={DATASET_ID}&format=json
Authorization: Bearer YOUR_API_KEY
Content-Type: application/json

[{"url": "https://x.com/..."}]
```

The only thing that changes between endpoints is the `dataset_id` and the input URL format.

Synchronous requests support up to 20 URLs and have a 1-minute timeout. If the request takes longer, the API automatically returns a `snapshot_id` instead. See [async requests](https://docs.brightdata.com/datasets/scrapers/twitter/async-requests).

## [​](https://docs.brightdata.com/datasets/scrapers/twitter/send-first-request\#how-to-scrape-x-twitter-profiles)  How to scrape X (Twitter) profiles

**Dataset ID:**`gd_lwxmeb2u1cniijd7t4`

```
curl -X POST \
  "https://api.brightdata.com/datasets/v3/scrape?dataset_id=gd_lwxmeb2u1cniijd7t4&format=json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '[{"url": "https://x.com/elonmusk"}]'
```

You should see a `200` response. This takes 10-30 seconds.

Example response

```
[\
  {\
    "user_name": "elonmusk",\
    "name": "Elon Musk",\
    "description": "Read @WallStreetSilv",\
    "followers": 214000000,\
    "following": 870,\
    "number_of_tweets": 52000,\
    "is_verified": true,\
    "profile_image_link": "https://..."\
  }\
]
```

[Full Profiles response schema](https://docs.brightdata.com/api-reference/scrapers/social-media-apis/twitter-profiles-collect-by-url)

## [​](https://docs.brightdata.com/datasets/scrapers/twitter/send-first-request\#how-to-scrape-x-twitter-posts)  How to scrape X (Twitter) posts

**Dataset ID:**`gd_lwxkxvnf1cynvib9co`

```
curl -X POST \
  "https://api.brightdata.com/datasets/v3/scrape?dataset_id=gd_lwxkxvnf1cynvib9co&format=json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '[{"url": "https://x.com/elonmusk/status/1234567890123456789"}]'
```

Example response

```
[\
  {\
    "url": "https://x.com/elonmusk/status/1234567890123456789",\
    "user_posted": "elonmusk",\
    "description": "Exciting times ahead...",\
    "date_posted": "2024-04-03T14:30:00.000Z",\
    "likes": 125000,\
    "retweets": 18000,\
    "replies": 5200,\
    "hashtags": ["technology", "innovation"]\
  }\
]
```

[Full Posts response schema](https://docs.brightdata.com/api-reference/scrapers/social-media-apis/twitter-posts-collect-by-url)

## [​](https://docs.brightdata.com/datasets/scrapers/twitter/send-first-request\#quick-reference-dataset-ids)  Quick reference: dataset IDs

| Endpoint | Dataset ID | URL pattern |
| --- | --- | --- |
| Profiles | `gd_lwxmeb2u1cniijd7t4` | `x.com/{username}` |
| Posts | `gd_lwxkxvnf1cynvib9co` | `x.com/{username}/status/{id}` |

## [​](https://docs.brightdata.com/datasets/scrapers/twitter/send-first-request\#output-formats)  Output formats

Control the response format with the `format` query parameter:

| Value | Description |
| --- | --- |
| `json` | JSON array (default) |
| `ndjson` | Newline-delimited JSON, one record per line |
| `csv` | Comma-separated values |

## [​](https://docs.brightdata.com/datasets/scrapers/twitter/send-first-request\#next-steps)  Next steps

[**Async batch requests** \\
\\
Scrape hundreds of URLs in a single batch job.](https://docs.brightdata.com/datasets/scrapers/twitter/async-requests)

[**API reference** \\
\\
Full parameter and response field reference.](https://docs.brightdata.com/api-reference/scrapers/social-media-apis/twitter-profiles-collect-by-url)

Was this page helpful?

YesNo

[Quickstart](https://docs.brightdata.com/datasets/scrapers/twitter/quickstart) [Async requests](https://docs.brightdata.com/datasets/scrapers/twitter/async-requests)

Ctrl+I

[linkedin](https://il.linkedin.com/company/bright-data) [youtube](https://www.youtube.com/channel/UCM_0cG1ljAoEUcZIyoUIq6g) [github](https://github.com/luminati-io)