> ## Documentation Index
>
> Fetch the complete documentation index at: [/llms.txt](https://docs.brightdata.com/llms.txt)
>
> Use this file to discover all available pages before exploring further.

[Skip to main content](https://docs.brightdata.com/datasets/scrapers/tiktok/send-first-request#content-area)

[Bright Data Docs home page![light logo](https://mintcdn.com/brightdata/FreEYbEGZchU-2Iw/logo/light.svg?fit=max&auto=format&n=FreEYbEGZchU-2Iw&q=85&s=fa5461a75d0b4cf2e744c89d4b67afac)![dark logo](https://mintcdn.com/brightdata/FreEYbEGZchU-2Iw/logo/dark.svg?fit=max&auto=format&n=FreEYbEGZchU-2Iw&q=85&s=43d5b51e1516be57edb429337abdc90f)](https://brightdata.com/)

English

Search...

Ctrl K

- [Support](https://brightdata.zendesk.com/hc/en-us/requests/new)
- [Sign up](https://brightdata.com/?hs_signup=1&utm_source=docs)
- [Sign up](https://brightdata.com/?hs_signup=1&utm_source=docs)

Search...

Navigation

TikTok Scraper API

Send your first TikTok API request

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



    - [Introduction](https://docs.brightdata.com/datasets/scrapers/tiktok/introduction)
    - [Quickstart](https://docs.brightdata.com/datasets/scrapers/tiktok/quickstart)
    - [Send your first request](https://docs.brightdata.com/datasets/scrapers/tiktok/send-first-request)
    - [Async requests](https://docs.brightdata.com/datasets/scrapers/tiktok/async-requests)
    - Data delivery
  - Amazon Scraper API

  - ChatGPT Scraper API

  - Facebook Scraper API

  - X (Twitter) Scraper API

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

- [Prerequisites](https://docs.brightdata.com/datasets/scrapers/tiktok/send-first-request#prerequisites)
- [Request structure](https://docs.brightdata.com/datasets/scrapers/tiktok/send-first-request#request-structure)
- [How to scrape TikTok profiles](https://docs.brightdata.com/datasets/scrapers/tiktok/send-first-request#how-to-scrape-tiktok-profiles)
- [How to scrape TikTok posts](https://docs.brightdata.com/datasets/scrapers/tiktok/send-first-request#how-to-scrape-tiktok-posts)
- [How to scrape TikTok Shop](https://docs.brightdata.com/datasets/scrapers/tiktok/send-first-request#how-to-scrape-tiktok-shop)
- [How to scrape TikTok comments](https://docs.brightdata.com/datasets/scrapers/tiktok/send-first-request#how-to-scrape-tiktok-comments)
- [Posts by Profile Fast API](https://docs.brightdata.com/datasets/scrapers/tiktok/send-first-request#posts-by-profile-fast-api)
- [Quick reference: dataset IDs](https://docs.brightdata.com/datasets/scrapers/tiktok/send-first-request#quick-reference-dataset-ids)
- [Output formats](https://docs.brightdata.com/datasets/scrapers/tiktok/send-first-request#output-formats)
- [Next steps](https://docs.brightdata.com/datasets/scrapers/tiktok/send-first-request#next-steps)

TikTok Scraper API

# Send your first TikTok API request

Copy pageCopy page

Send synchronous requests to all 5 Bright Data TikTok Scraper API endpoints with copy-paste examples for profiles, posts, comments and shop data.

Copy pageCopy page

This tutorial walks you through sending a synchronous request to each Bright Data TikTok Scraper API endpoint. By the end, you’ll have working examples for profiles, posts, TikTok Shop, comments, and posts by profile.

## [​](https://docs.brightdata.com/datasets/scrapers/tiktok/send-first-request\#prerequisites)  Prerequisites

- A [Bright Data account](https://brightdata.com/cp/start) with an active API key
- Completed the [Quickstart](https://docs.brightdata.com/datasets/scrapers/tiktok/quickstart)

## [​](https://docs.brightdata.com/datasets/scrapers/tiktok/send-first-request\#request-structure)  Request structure

Every synchronous request follows the same pattern:

```
POST https://api.brightdata.com/datasets/v3/scrape?dataset_id={DATASET_ID}&format=json
Authorization: Bearer YOUR_API_KEY
Content-Type: application/json

[{"url": "https://www.tiktok.com/..."}]
```

The only thing that changes between endpoints is the `dataset_id` and the input URL format.

Synchronous requests support up to 20 URLs and have a 1-minute timeout. If the request takes longer, the API automatically returns a `snapshot_id` instead. See [async requests](https://docs.brightdata.com/datasets/scrapers/tiktok/async-requests).

## [​](https://docs.brightdata.com/datasets/scrapers/tiktok/send-first-request\#how-to-scrape-tiktok-profiles)  How to scrape TikTok profiles

**Dataset ID:**`gd_l1villgoiiidt09ci`

```
curl -X POST \
  "https://api.brightdata.com/datasets/v3/scrape?dataset_id=gd_l1villgoiiidt09ci&format=json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '[{"url": "https://www.tiktok.com/@tiktok"}]'
```

You should see a `200` response. This takes 10-30 seconds.

Example response

```
[\
  {\
    "nickname": "TikTok",\
    "account_id": "tiktok",\
    "biography": "Make your day.",\
    "followers": 85600000,\
    "following": 580,\
    "likes": 520000000,\
    "videos_count": 1250,\
    "is_verified": true,\
    "url": "https://www.tiktok.com/@tiktok",\
    "profile_pic_url": "https://..."\
  }\
]
```

[Full Profiles response schema](https://docs.brightdata.com/api-reference/scrapers/social-media-apis/tiktok-profiles-collect-by-url)

## [​](https://docs.brightdata.com/datasets/scrapers/tiktok/send-first-request\#how-to-scrape-tiktok-posts)  How to scrape TikTok posts

**Dataset ID:**`gd_lu702nij2f790tmv9h`

```
curl -X POST \
  "https://api.brightdata.com/datasets/v3/scrape?dataset_id=gd_lu702nij2f790tmv9h&format=json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '[{"url": "https://www.tiktok.com/@tiktok/video/7345678901234567890"}]'
```

Example response

```
[\
  {\
    "url": "https://www.tiktok.com/@tiktok/video/7345678901234567890",\
    "author": "tiktok",\
    "description": "Making every moment count #fyp #trending",\
    "likes": 245000,\
    "comments": 3200,\
    "shares": 18500,\
    "views": 5200000,\
    "date_posted": "2024-04-10T15:30:00.000Z",\
    "hashtags": ["fyp", "trending"],\
    "video_url": "https://..."\
  }\
]
```

[Full Posts response schema](https://docs.brightdata.com/api-reference/scrapers/social-media-apis/tiktok-posts-collect-by-url)

## [​](https://docs.brightdata.com/datasets/scrapers/tiktok/send-first-request\#how-to-scrape-tiktok-shop)  How to scrape TikTok Shop

**Dataset ID:**`gd_m45m1u911dsa4274pi`

```
curl -X POST \
  "https://api.brightdata.com/datasets/v3/scrape?dataset_id=gd_m45m1u911dsa4274pi&format=json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '[{"url": "https://www.tiktok.com/@shop/product/1234567890"}]'
```

Example response

```
[\
  {\
    "url": "https://www.tiktok.com/@shop/product/1234567890",\
    "product_name": "Wireless Bluetooth Earbuds",\
    "price": 29.99,\
    "currency": "USD",\
    "rating": 4.7,\
    "reviews_count": 1850,\
    "seller_name": "TechStore Official",\
    "category": "Electronics"\
  }\
]
```

[Full TikTok Shop response schema](https://docs.brightdata.com/api-reference/scrapers/social-media-apis/tiktok-shop-collect-by-url)

## [​](https://docs.brightdata.com/datasets/scrapers/tiktok/send-first-request\#how-to-scrape-tiktok-comments)  How to scrape TikTok comments

**Dataset ID:**`gd_lkf2st302ap89utw5k`

```
curl -X POST \
  "https://api.brightdata.com/datasets/v3/scrape?dataset_id=gd_lkf2st302ap89utw5k&format=json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '[{"url": "https://www.tiktok.com/@tiktok/video/7345678901234567890"}]'
```

Example response

```
[\
  {\
    "url": "https://www.tiktok.com/@tiktok/video/7345678901234567890",\
    "comment_user": "creator_fan",\
    "comment_user_url": "https://www.tiktok.com/@creator_fan",\
    "comment_date": "2024-04-11T08:15:00.000Z",\
    "comment": "This is amazing content!",\
    "likes": 42,\
    "replies": 3\
  }\
]
```

[Full Comments response schema](https://docs.brightdata.com/api-reference/scrapers/social-media-apis/tiktok-comments-collect-by-url)

## [​](https://docs.brightdata.com/datasets/scrapers/tiktok/send-first-request\#posts-by-profile-fast-api)  Posts by Profile Fast API

**Dataset ID:**`gd_m7n5v2gq296pex2f5m`

```
curl -X POST \
  "https://api.brightdata.com/datasets/v3/scrape?dataset_id=gd_m7n5v2gq296pex2f5m&format=json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '[{"url": "https://www.tiktok.com/@tiktok"}]'
```

Example response

```
[\
  {\
    "url": "https://www.tiktok.com/@tiktok/video/7345678901234567890",\
    "author": "tiktok",\
    "description": "Making every moment count #fyp",\
    "likes": 245000,\
    "comments": 3200,\
    "shares": 18500,\
    "views": 5200000,\
    "date_posted": "2024-04-10T15:30:00.000Z"\
  },\
  {\
    "url": "https://www.tiktok.com/@tiktok/video/7345678901234567891",\
    "author": "tiktok",\
    "description": "New feature alert! #tiktok #newfeature",\
    "likes": 180000,\
    "comments": 2100,\
    "shares": 9500,\
    "views": 3800000,\
    "date_posted": "2024-04-08T12:00:00.000Z"\
  }\
]
```

[Full Posts by Profile Fast API response schema](https://docs.brightdata.com/api-reference/scrapers/social-media-apis/tiktok-posts-by-profile-fast-api-collect-by-url)

## [​](https://docs.brightdata.com/datasets/scrapers/tiktok/send-first-request\#quick-reference-dataset-ids)  Quick reference: dataset IDs

| Endpoint | Dataset ID | URL pattern |
| --- | --- | --- |
| Profiles | `gd_l1villgoiiidt09ci` | `tiktok.com/@{username}` |
| Posts | `gd_lu702nij2f790tmv9h` | `tiktok.com/@{username}/video/{id}` |
| TikTok Shop | `gd_m45m1u911dsa4274pi` | `tiktok.com/@shop/product/{id}` |
| Comments | `gd_lkf2st302ap89utw5k` | `tiktok.com/@{username}/video/{id}` |
| Posts by Profile Fast API | `gd_m7n5v2gq296pex2f5m` | `tiktok.com/@{username}` |

## [​](https://docs.brightdata.com/datasets/scrapers/tiktok/send-first-request\#output-formats)  Output formats

Control the response format with the `format` query parameter:

| Value | Description |
| --- | --- |
| `json` | JSON array (default) |
| `ndjson` | Newline-delimited JSON, one record per line |
| `csv` | Comma-separated values |

## [​](https://docs.brightdata.com/datasets/scrapers/tiktok/send-first-request\#next-steps)  Next steps

[**Async batch requests** \\
\\
Scrape hundreds of URLs in a single batch job.](https://docs.brightdata.com/datasets/scrapers/tiktok/async-requests)

[**API reference** \\
\\
Full parameter and response field reference.](https://docs.brightdata.com/api-reference/scrapers/social-media-apis/tiktok-profiles-collect-by-url)

Was this page helpful?

YesNo

[Quickstart](https://docs.brightdata.com/datasets/scrapers/tiktok/quickstart) [Async requests](https://docs.brightdata.com/datasets/scrapers/tiktok/async-requests)

Ctrl+I

[linkedin](https://il.linkedin.com/company/bright-data) [youtube](https://www.youtube.com/channel/UCM_0cG1ljAoEUcZIyoUIq6g) [github](https://github.com/luminati-io)