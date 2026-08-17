> ## Documentation Index
>
> Fetch the complete documentation index at: [/llms.txt](https://docs.brightdata.com/llms.txt)
>
> Use this file to discover all available pages before exploring further.

[Skip to main content](https://docs.brightdata.com/datasets/scrapers/youtube/send-first-request#content-area)

[Bright Data Docs home page![light logo](https://mintcdn.com/brightdata/FreEYbEGZchU-2Iw/logo/light.svg?fit=max&auto=format&n=FreEYbEGZchU-2Iw&q=85&s=fa5461a75d0b4cf2e744c89d4b67afac)![dark logo](https://mintcdn.com/brightdata/FreEYbEGZchU-2Iw/logo/dark.svg?fit=max&auto=format&n=FreEYbEGZchU-2Iw&q=85&s=43d5b51e1516be57edb429337abdc90f)](https://brightdata.com/)

English

Search...

Ctrl K

- [Support](https://brightdata.zendesk.com/hc/en-us/requests/new)
- [Sign up](https://brightdata.com/?hs_signup=1&utm_source=docs)
- [Sign up](https://brightdata.com/?hs_signup=1&utm_source=docs)

Search...

Navigation

YouTube Scraper API

Send your first YouTube API request

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

  - YouTube Scraper API



    - [Introduction](https://docs.brightdata.com/datasets/scrapers/youtube/introduction)
    - [Quickstart](https://docs.brightdata.com/datasets/scrapers/youtube/quickstart)
    - [Send your first request](https://docs.brightdata.com/datasets/scrapers/youtube/send-first-request)
    - [Async requests](https://docs.brightdata.com/datasets/scrapers/youtube/async-requests)
    - Data delivery
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

- [Prerequisites](https://docs.brightdata.com/datasets/scrapers/youtube/send-first-request#prerequisites)
- [Request structure](https://docs.brightdata.com/datasets/scrapers/youtube/send-first-request#request-structure)
- [How to scrape YouTube channels](https://docs.brightdata.com/datasets/scrapers/youtube/send-first-request#how-to-scrape-youtube-channels)
- [How to scrape YouTube videos](https://docs.brightdata.com/datasets/scrapers/youtube/send-first-request#how-to-scrape-youtube-videos)
- [How to scrape YouTube comments](https://docs.brightdata.com/datasets/scrapers/youtube/send-first-request#how-to-scrape-youtube-comments)
- [Quick reference: dataset IDs](https://docs.brightdata.com/datasets/scrapers/youtube/send-first-request#quick-reference-dataset-ids)
- [Output formats](https://docs.brightdata.com/datasets/scrapers/youtube/send-first-request#output-formats)
- [Next steps](https://docs.brightdata.com/datasets/scrapers/youtube/send-first-request#next-steps)

YouTube Scraper API

# Send your first YouTube API request

Copy pageCopy page

Send synchronous requests to all 3 Bright Data YouTube Scraper API endpoints with copy-paste examples for channels, videos and comments collection.

Copy pageCopy page

This tutorial walks you through sending a synchronous request to each Bright Data YouTube Scraper API endpoint. By the end, you’ll have working examples for channels, videos, and comments.

## [​](https://docs.brightdata.com/datasets/scrapers/youtube/send-first-request\#prerequisites)  Prerequisites

- A [Bright Data account](https://brightdata.com/cp/start) with an active API key
- Completed the [Quickstart](https://docs.brightdata.com/datasets/scrapers/youtube/quickstart)

## [​](https://docs.brightdata.com/datasets/scrapers/youtube/send-first-request\#request-structure)  Request structure

Every synchronous request follows the same pattern:

```
POST https://api.brightdata.com/datasets/v3/scrape?dataset_id={DATASET_ID}&format=json
Authorization: Bearer YOUR_API_KEY
Content-Type: application/json

[{"url": "https://www.youtube.com/..."}]
```

The only thing that changes between endpoints is the `dataset_id` and the input URL format.

Synchronous requests support up to 20 URLs and have a 1-minute timeout. If the request takes longer, the API automatically returns a `snapshot_id` instead. See [async requests](https://docs.brightdata.com/datasets/scrapers/youtube/async-requests).

## [​](https://docs.brightdata.com/datasets/scrapers/youtube/send-first-request\#how-to-scrape-youtube-channels)  How to scrape YouTube channels

**Dataset ID:**`gd_lk538t2k2p1k3oos71`

```
curl -X POST \
  "https://api.brightdata.com/datasets/v3/scrape?dataset_id=gd_lk538t2k2p1k3oos71&format=json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '[{"url": "https://www.youtube.com/@MrBeast"}]'
```

You should see a `200` response. This takes 10-30 seconds.

Example response

```
[\
  {\
    "channel_name": "MrBeast",\
    "channel_url": "https://www.youtube.com/@MrBeast",\
    "subscribers": 358000000,\
    "total_videos": 850,\
    "total_views": 50000000000,\
    "description": "...",\
    "is_verified": true\
  }\
]
```

[Full Channels response schema](https://docs.brightdata.com/api-reference/scrapers/social-media-apis/youtube-channels-collect-by-url)

## [​](https://docs.brightdata.com/datasets/scrapers/youtube/send-first-request\#how-to-scrape-youtube-videos)  How to scrape YouTube videos

**Dataset ID:**`gd_lk56epmy2i5g7lzu0k`

```
curl -X POST \
  "https://api.brightdata.com/datasets/v3/scrape?dataset_id=gd_lk56epmy2i5g7lzu0k&format=json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '[{"url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ"}]'
```

Example response

```
[\
  {\
    "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",\
    "title": "Rick Astley - Never Gonna Give You Up",\
    "channel_name": "Rick Astley",\
    "views": 1500000000,\
    "likes": 16000000,\
    "date_posted": "2009-10-25T00:00:00.000Z",\
    "duration": "3:33",\
    "description": "...",\
    "num_comments": 2700000\
  }\
]
```

[Full Videos response schema](https://docs.brightdata.com/api-reference/scrapers/social-media-apis/youtube-videos-collect-by-url)

## [​](https://docs.brightdata.com/datasets/scrapers/youtube/send-first-request\#how-to-scrape-youtube-comments)  How to scrape YouTube comments

**Dataset ID:**`gd_lk9q0ew71spt1mxywf`

```
curl -X POST \
  "https://api.brightdata.com/datasets/v3/scrape?dataset_id=gd_lk9q0ew71spt1mxywf&format=json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '[{"url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ"}]'
```

Example response

```
[\
  {\
    "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",\
    "comment_user": "user123",\
    "comment_user_url": "https://www.youtube.com/@user123",\
    "comment_date": "2024-04-05T12:30:00.000Z",\
    "comment": "This song never gets old!",\
    "likes": 250,\
    "replies": 12,\
    "comment_id": "UgyKz0..."\
  }\
]
```

[Full Comments response schema](https://docs.brightdata.com/api-reference/scrapers/social-media-apis/youtube-comments-collect-by-url)

## [​](https://docs.brightdata.com/datasets/scrapers/youtube/send-first-request\#quick-reference-dataset-ids)  Quick reference: dataset IDs

| Endpoint | Dataset ID | URL pattern |
| --- | --- | --- |
| Videos | `gd_lk56epmy2i5g7lzu0k` | `youtube.com/watch?v={video_id}` |
| Channels | `gd_lk538t2k2p1k3oos71` | `youtube.com/@{handle}` |
| Comments | `gd_lk9q0ew71spt1mxywf` | `youtube.com/watch?v={video_id}` |

## [​](https://docs.brightdata.com/datasets/scrapers/youtube/send-first-request\#output-formats)  Output formats

Control the response format with the `format` query parameter:

| Value | Description |
| --- | --- |
| `json` | JSON array (default) |
| `ndjson` | Newline-delimited JSON, one record per line |
| `csv` | Comma-separated values |

## [​](https://docs.brightdata.com/datasets/scrapers/youtube/send-first-request\#next-steps)  Next steps

[**Async batch requests** \\
\\
Scrape hundreds of URLs in a single batch job.](https://docs.brightdata.com/datasets/scrapers/youtube/async-requests)

[**API reference** \\
\\
Full parameter and response field reference.](https://docs.brightdata.com/api-reference/scrapers/social-media-apis/youtube-channels-collect-by-url)

Was this page helpful?

YesNo

[Quickstart](https://docs.brightdata.com/datasets/scrapers/youtube/quickstart) [Async requests](https://docs.brightdata.com/datasets/scrapers/youtube/async-requests)

Ctrl+I

[linkedin](https://il.linkedin.com/company/bright-data) [youtube](https://www.youtube.com/channel/UCM_0cG1ljAoEUcZIyoUIq6g) [github](https://github.com/luminati-io)