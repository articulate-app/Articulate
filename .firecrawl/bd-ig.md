> ## Documentation Index
>
> Fetch the complete documentation index at: [/llms.txt](https://docs.brightdata.com/llms.txt)
>
> Use this file to discover all available pages before exploring further.

[Skip to main content](https://docs.brightdata.com/datasets/scrapers/instagram/send-first-request#content-area)

[Bright Data Docs home page![light logo](https://mintcdn.com/brightdata/FreEYbEGZchU-2Iw/logo/light.svg?fit=max&auto=format&n=FreEYbEGZchU-2Iw&q=85&s=fa5461a75d0b4cf2e744c89d4b67afac)![dark logo](https://mintcdn.com/brightdata/FreEYbEGZchU-2Iw/logo/dark.svg?fit=max&auto=format&n=FreEYbEGZchU-2Iw&q=85&s=43d5b51e1516be57edb429337abdc90f)](https://brightdata.com/)

English

Search...

Ctrl K

- [Support](https://brightdata.zendesk.com/hc/en-us/requests/new)
- [Sign up](https://brightdata.com/?hs_signup=1&utm_source=docs)
- [Sign up](https://brightdata.com/?hs_signup=1&utm_source=docs)

Search...

Navigation

Instagram Scraper API

Send your first Instagram API request

[Welcome](https://docs.brightdata.com/introduction) [Proxy Infrastructure](https://docs.brightdata.com/proxy-networks/introduction) [Web Access APIs](https://docs.brightdata.com/scraping-automation/introduction) [Data Feeds](https://docs.brightdata.com/datasets/introduction) [AI](https://docs.brightdata.com/ai/introduction) [API Reference](https://docs.brightdata.com/api-reference/authentication) [General](https://docs.brightdata.com/general/account/overview) [Integrations](https://docs.brightdata.com/integrations/introduction)

### Introduction

- [Overview](https://docs.brightdata.com/datasets/introduction)

### Product Guides

- Scraper API



  - [Overview](https://docs.brightdata.com/datasets/scrapers/overview)
  - Scrapers Library

  - LinkedIn Scraper API

  - Instagram Scraper API



    - [Introduction](https://docs.brightdata.com/datasets/scrapers/instagram/introduction)
    - [Quickstart](https://docs.brightdata.com/datasets/scrapers/instagram/quickstart)
    - [Send your first request](https://docs.brightdata.com/datasets/scrapers/instagram/send-first-request)
    - [Async requests](https://docs.brightdata.com/datasets/scrapers/instagram/async-requests)
    - Data delivery
  - TikTok Scraper API

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

- [Prerequisites](https://docs.brightdata.com/datasets/scrapers/instagram/send-first-request#prerequisites)
- [Request structure](https://docs.brightdata.com/datasets/scrapers/instagram/send-first-request#request-structure)
- [How to scrape Instagram profiles](https://docs.brightdata.com/datasets/scrapers/instagram/send-first-request#how-to-scrape-instagram-profiles)
- [How to scrape Instagram posts](https://docs.brightdata.com/datasets/scrapers/instagram/send-first-request#how-to-scrape-instagram-posts)
- [How to scrape Instagram reels](https://docs.brightdata.com/datasets/scrapers/instagram/send-first-request#how-to-scrape-instagram-reels)
- [How to scrape Instagram comments](https://docs.brightdata.com/datasets/scrapers/instagram/send-first-request#how-to-scrape-instagram-comments)
- [Quick reference: dataset IDs](https://docs.brightdata.com/datasets/scrapers/instagram/send-first-request#quick-reference-dataset-ids)
- [Output formats](https://docs.brightdata.com/datasets/scrapers/instagram/send-first-request#output-formats)
- [Next steps](https://docs.brightdata.com/datasets/scrapers/instagram/send-first-request#next-steps)

Instagram Scraper API

# Send your first Instagram API request

Copy pageCopy page

Send synchronous requests to all 4 Bright Data Instagram Scraper API endpoints with copy-paste examples for profiles, posts, reels and comments.

Copy pageCopy page

This tutorial walks you through sending a synchronous request to each Bright Data Instagram Scraper API endpoint. By the end, you’ll have working examples for profiles, posts, reels, and comments.

## [​](https://docs.brightdata.com/datasets/scrapers/instagram/send-first-request\#prerequisites)  Prerequisites

- A [Bright Data account](https://brightdata.com/cp/start) with an active API key
- Completed the [Quickstart](https://docs.brightdata.com/datasets/scrapers/instagram/quickstart)

## [​](https://docs.brightdata.com/datasets/scrapers/instagram/send-first-request\#request-structure)  Request structure

Every synchronous request follows the same pattern:

```
POST https://api.brightdata.com/datasets/v3/scrape?dataset_id={DATASET_ID}&format=json
Authorization: Bearer YOUR_API_KEY
Content-Type: application/json

[{"url": "https://www.instagram.com/..."}]
```

The only thing that changes between endpoints is the `dataset_id` and the input URL format.

Synchronous requests support up to 20 URLs and have a 1-minute timeout. If the request takes longer, the API automatically returns a `snapshot_id` instead. See [async requests](https://docs.brightdata.com/datasets/scrapers/instagram/async-requests).

## [​](https://docs.brightdata.com/datasets/scrapers/instagram/send-first-request\#how-to-scrape-instagram-profiles)  How to scrape Instagram profiles

**Dataset ID:**`gd_l1vikfch901nx3by4`

```
curl -X POST \
  "https://api.brightdata.com/datasets/v3/scrape?dataset_id=gd_l1vikfch901nx3by4&format=json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '[{"url": "https://www.instagram.com/instagram"}]'
```

You should see a `200` response. This takes 10-30 seconds.

Example response

```
[\
  {\
    "user_name": "instagram",\
    "full_name": "Instagram",\
    "biography": "Discover what's next. ✨",\
    "followers": 676000000,\
    "following": 500,\
    "posts_count": 7800,\
    "is_verified": true,\
    "profile_pic_url": "https://..."\
  }\
]
```

[Full Profiles response schema](https://docs.brightdata.com/api-reference/scrapers/social-media-apis/instagram-profiles-collect-by-url)

## [​](https://docs.brightdata.com/datasets/scrapers/instagram/send-first-request\#how-to-scrape-instagram-posts)  How to scrape Instagram posts

**Dataset ID:**`gd_lk5ns7kz21pck8jpis`

```
curl -X POST \
  "https://api.brightdata.com/datasets/v3/scrape?dataset_id=gd_lk5ns7kz21pck8jpis&format=json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '[{"url": "https://www.instagram.com/p/Cuf4s0MNqNr"}]'
```

Example response

```
[\
  {\
    "url": "https://www.instagram.com/p/Cuf4s0MNqNr",\
    "user_posted": "instagram",\
    "description": "Sharing moments that matter...",\
    "num_comments": 1250,\
    "date_posted": "2024-04-03T14:30:00.000Z",\
    "likes": 45230,\
    "hashtags": ["photography", "moments"],\
    "content_type": "Photo",\
    "shortcode": "Cuf4s0MNqNr"\
  }\
]
```

[Full Posts response schema](https://docs.brightdata.com/api-reference/scrapers/social-media-apis/instagram-posts-collect-by-url)

## [​](https://docs.brightdata.com/datasets/scrapers/instagram/send-first-request\#how-to-scrape-instagram-reels)  How to scrape Instagram reels

**Dataset ID:**`gd_lyclm20il4r5helnj`

```
curl -X POST \
  "https://api.brightdata.com/datasets/v3/scrape?dataset_id=gd_lyclm20il4r5helnj&format=json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '[{"url": "https://www.instagram.com/reel/C5Rdyj_q7YN/"}]'
```

Example response

```
[\
  {\
    "url": "https://www.instagram.com/reel/C5Rdyj_q7YN/",\
    "user_posted": "instagram",\
    "description": "Watch this reel...",\
    "num_comments": 320,\
    "date_posted": "2024-03-15T10:00:00.000Z",\
    "likes": 15000,\
    "views": 250000,\
    "video_play_count": 500000,\
    "length": "15.033",\
    "shortcode": "C5Rdyj_q7YN"\
  }\
]
```

[Full Reels response schema](https://docs.brightdata.com/api-reference/scrapers/social-media-apis/instagram-reels-collect-by-url)

## [​](https://docs.brightdata.com/datasets/scrapers/instagram/send-first-request\#how-to-scrape-instagram-comments)  How to scrape Instagram comments

**Dataset ID:**`gd_ltppn085pokosxh13`

```
curl -X POST \
  "https://api.brightdata.com/datasets/v3/scrape?dataset_id=gd_ltppn085pokosxh13&format=json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '[{"url": "https://www.instagram.com/p/Cuf4s0MNqNr"}]'
```

Example response

```
[\
  {\
    "url": "https://www.instagram.com/p/Cuf4s0MNqNr",\
    "comment_user": "user123",\
    "comment_user_url": "https://www.instagram.com/user123",\
    "comment_date": "2024-04-05T12:30:00.000Z",\
    "comment": "Amazing post!",\
    "likes_number": 5,\
    "replies_number": 2,\
    "comment_id": "18168596065410257",\
    "post_id": "3851148751604100411"\
  }\
]
```

[Full Comments response schema](https://docs.brightdata.com/api-reference/scrapers/social-media-apis/instagram-comments-collect-by-url)

## [​](https://docs.brightdata.com/datasets/scrapers/instagram/send-first-request\#quick-reference-dataset-ids)  Quick reference: dataset IDs

| Endpoint | Dataset ID | URL pattern |
| --- | --- | --- |
| Profiles | `gd_l1vikfch901nx3by4` | `instagram.com/{username}` |
| Posts | `gd_lk5ns7kz21pck8jpis` | `instagram.com/p/{shortcode}` |
| Reels | `gd_lyclm20il4r5helnj` | `instagram.com/reel/{shortcode}` |
| Comments | `gd_ltppn085pokosxh13` | `instagram.com/p/{shortcode}` or `instagram.com/reel/{shortcode}` |

## [​](https://docs.brightdata.com/datasets/scrapers/instagram/send-first-request\#output-formats)  Output formats

Control the response format with the `format` query parameter:

| Value | Description |
| --- | --- |
| `json` | JSON array (default) |
| `ndjson` | Newline-delimited JSON, one record per line |
| `csv` | Comma-separated values |

## [​](https://docs.brightdata.com/datasets/scrapers/instagram/send-first-request\#next-steps)  Next steps

[**Async batch requests** \\
\\
Scrape hundreds of URLs in a single batch job.](https://docs.brightdata.com/datasets/scrapers/instagram/async-requests)

[**API reference** \\
\\
Full parameter and response field reference.](https://docs.brightdata.com/api-reference/scrapers/social-media-apis/instagram-profiles-collect-by-url)

Was this page helpful?

YesNo

[Quickstart](https://docs.brightdata.com/datasets/scrapers/instagram/quickstart) [Async requests](https://docs.brightdata.com/datasets/scrapers/instagram/async-requests)

Ctrl+I

[linkedin](https://il.linkedin.com/company/bright-data) [youtube](https://www.youtube.com/channel/UCM_0cG1ljAoEUcZIyoUIq6g) [github](https://github.com/luminati-io)