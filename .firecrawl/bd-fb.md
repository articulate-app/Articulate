> ## Documentation Index
>
> Fetch the complete documentation index at: [/llms.txt](https://docs.brightdata.com/llms.txt)
>
> Use this file to discover all available pages before exploring further.

[Skip to main content](https://docs.brightdata.com/datasets/scrapers/facebook/send-first-request#content-area)

[Bright Data Docs home page![light logo](https://mintcdn.com/brightdata/FreEYbEGZchU-2Iw/logo/light.svg?fit=max&auto=format&n=FreEYbEGZchU-2Iw&q=85&s=fa5461a75d0b4cf2e744c89d4b67afac)![dark logo](https://mintcdn.com/brightdata/FreEYbEGZchU-2Iw/logo/dark.svg?fit=max&auto=format&n=FreEYbEGZchU-2Iw&q=85&s=43d5b51e1516be57edb429337abdc90f)](https://brightdata.com/)

English

Search...

Ctrl K

- [Support](https://brightdata.zendesk.com/hc/en-us/requests/new)
- [Sign up](https://brightdata.com/?hs_signup=1&utm_source=docs)
- [Sign up](https://brightdata.com/?hs_signup=1&utm_source=docs)

Search...

Navigation

Facebook Scraper API

Send your first Facebook API request

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



    - [Introduction](https://docs.brightdata.com/datasets/scrapers/facebook/introduction)
    - [Quickstart](https://docs.brightdata.com/datasets/scrapers/facebook/quickstart)
    - [Send your first request](https://docs.brightdata.com/datasets/scrapers/facebook/send-first-request)
    - [Async requests](https://docs.brightdata.com/datasets/scrapers/facebook/async-requests)
    - Data delivery
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

- [Prerequisites](https://docs.brightdata.com/datasets/scrapers/facebook/send-first-request#prerequisites)
- [Request structure](https://docs.brightdata.com/datasets/scrapers/facebook/send-first-request#request-structure)
- [How to scrape Facebook profiles](https://docs.brightdata.com/datasets/scrapers/facebook/send-first-request#how-to-scrape-facebook-profiles)
- [How to scrape Facebook page posts](https://docs.brightdata.com/datasets/scrapers/facebook/send-first-request#how-to-scrape-facebook-page-posts)
- [Posts by post URL](https://docs.brightdata.com/datasets/scrapers/facebook/send-first-request#posts-by-post-url)
- [How to scrape Facebook Marketplace](https://docs.brightdata.com/datasets/scrapers/facebook/send-first-request#how-to-scrape-facebook-marketplace)
- [How to scrape Facebook comments](https://docs.brightdata.com/datasets/scrapers/facebook/send-first-request#how-to-scrape-facebook-comments)
- [Quick reference: dataset IDs](https://docs.brightdata.com/datasets/scrapers/facebook/send-first-request#quick-reference-dataset-ids)
- [Output formats](https://docs.brightdata.com/datasets/scrapers/facebook/send-first-request#output-formats)
- [Next steps](https://docs.brightdata.com/datasets/scrapers/facebook/send-first-request#next-steps)

Facebook Scraper API

# Send your first Facebook API request

Copy pageCopy page

Send synchronous requests to the Bright Data Facebook Scraper API across 9 endpoints with examples for profiles, page posts, marketplace and comments.

Copy pageCopy page

This tutorial walks you through sending a synchronous request to each Bright Data Facebook Scraper API endpoint. By the end, you’ll have working examples for profiles, page posts, posts, marketplace listings, and comments.

## [​](https://docs.brightdata.com/datasets/scrapers/facebook/send-first-request\#prerequisites)  Prerequisites

- A [Bright Data account](https://brightdata.com/cp/start) with an active API key
- Completed the [Quickstart](https://docs.brightdata.com/datasets/scrapers/facebook/quickstart)

## [​](https://docs.brightdata.com/datasets/scrapers/facebook/send-first-request\#request-structure)  Request structure

Every synchronous request follows the same pattern:

```
POST https://api.brightdata.com/datasets/v3/scrape?dataset_id={DATASET_ID}&format=json
Authorization: Bearer YOUR_API_KEY
Content-Type: application/json

[{"url": "https://www.facebook.com/..."}]
```

The only thing that changes between endpoints is the `dataset_id` and the input URL format.

Synchronous requests support up to 20 URLs and have a 1-minute timeout. If the request takes longer, the API automatically returns a `snapshot_id` instead. See [async requests](https://docs.brightdata.com/datasets/scrapers/facebook/async-requests).

## [​](https://docs.brightdata.com/datasets/scrapers/facebook/send-first-request\#how-to-scrape-facebook-profiles)  How to scrape Facebook profiles

**Dataset ID:**`gd_mf0urb782734ik94dz`

```
curl -X POST \
  "https://api.brightdata.com/datasets/v3/scrape?dataset_id=gd_mf0urb782734ik94dz&format=json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '[{"url": "https://www.facebook.com/zuck"}]'
```

You should see a `200` response. This takes 10-30 seconds.

Example response

```
[\
  {\
    "name": "Mark Zuckerberg",\
    "url": "https://www.facebook.com/zuck",\
    "followers": 120000000,\
    "bio": "Building the future...",\
    "profile_type": "public_figure",\
    "is_verified": true\
  }\
]
```

[Full Profiles response schema](https://docs.brightdata.com/api-reference/scrapers/social-media-apis/facebook-profiles-collect-by-url)

## [​](https://docs.brightdata.com/datasets/scrapers/facebook/send-first-request\#how-to-scrape-facebook-page-posts)  How to scrape Facebook page posts

**Dataset ID:**`gd_lkaxegm826bjpoo9m5`

```
curl -X POST \
  "https://api.brightdata.com/datasets/v3/scrape?dataset_id=gd_lkaxegm826bjpoo9m5&format=json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '[{"url": "https://www.facebook.com/NASA"}]'
```

Example response

```
[\
  {\
    "url": "https://www.facebook.com/NASA",\
    "post_text": "Exploring the cosmos...",\
    "num_comments": 450,\
    "date_posted": "2024-04-10T14:30:00.000Z",\
    "reactions": 12500,\
    "content_type": "Photo"\
  }\
]
```

[Full Page Posts response schema](https://docs.brightdata.com/api-reference/scrapers/social-media-apis/facebook-pages-posts-collect-by-url)

## [​](https://docs.brightdata.com/datasets/scrapers/facebook/send-first-request\#posts-by-post-url)  Posts by post URL

**Dataset ID:**`gd_lyclm1571iy3mv57zw`

```
curl -X POST \
  "https://api.brightdata.com/datasets/v3/scrape?dataset_id=gd_lyclm1571iy3mv57zw&format=json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '[{"url": "https://www.facebook.com/zuck/posts/example123"}]'
```

Example response

```
[\
  {\
    "url": "https://www.facebook.com/zuck/posts/example123",\
    "post_text": "Excited to share...",\
    "num_comments": 320,\
    "date_posted": "2024-05-01T09:00:00.000Z",\
    "reactions": 8500,\
    "shares": 1200\
  }\
]
```

[Full Posts response schema](https://docs.brightdata.com/api-reference/scrapers/social-media-apis/facebook-posts-collect-by-url)

## [​](https://docs.brightdata.com/datasets/scrapers/facebook/send-first-request\#how-to-scrape-facebook-marketplace)  How to scrape Facebook Marketplace

**Dataset ID:**`gd_lvt9iwuh6fbcwmx1a`

```
curl -X POST \
  "https://api.brightdata.com/datasets/v3/scrape?dataset_id=gd_lvt9iwuh6fbcwmx1a&format=json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '[{"url": "https://www.facebook.com/marketplace/item/123456789"}]'
```

Example response

```
[\
  {\
    "url": "https://www.facebook.com/marketplace/item/123456789",\
    "title": "Vintage Coffee Table",\
    "price": "$150",\
    "location": "San Francisco, CA",\
    "seller_name": "John Doe",\
    "description": "Beautiful mid-century modern coffee table..."\
  }\
]
```

[Full Marketplace response schema](https://docs.brightdata.com/api-reference/scrapers/social-media-apis/facebook-marketplace-collect-by-url)

## [​](https://docs.brightdata.com/datasets/scrapers/facebook/send-first-request\#how-to-scrape-facebook-comments)  How to scrape Facebook comments

**Dataset ID:**`gd_lkay758p1eanlolqw8`

```
curl -X POST \
  "https://api.brightdata.com/datasets/v3/scrape?dataset_id=gd_lkay758p1eanlolqw8&format=json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '[{"url": "https://www.facebook.com/zuck/posts/example123"}]'
```

Example response

```
[\
  {\
    "url": "https://www.facebook.com/zuck/posts/example123",\
    "comment_user": "Jane Smith",\
    "comment_date": "2024-05-02T10:15:00.000Z",\
    "comment_text": "Great update!",\
    "reactions": 12,\
    "replies_count": 3\
  }\
]
```

[Full Comments response schema](https://docs.brightdata.com/api-reference/scrapers/social-media-apis/facebook-comments-collect-by-url)

## [​](https://docs.brightdata.com/datasets/scrapers/facebook/send-first-request\#quick-reference-dataset-ids)  Quick reference: dataset IDs

| Endpoint | Dataset ID | URL pattern |
| --- | --- | --- |
| Pages Posts by Profile URL | `gd_lkaxegm826bjpoo9m5` | `facebook.com/{page_name}` |
| Comments | `gd_lkay758p1eanlolqw8` | `facebook.com/{user}/posts/{post_id}` |
| Posts by group URL | `gd_lz11l67o2cb3r0lkj3` | `facebook.com/groups/{group_id}` |
| Posts by post URL | `gd_lyclm1571iy3mv57zw` | `facebook.com/{user}/posts/{post_id}` |
| Marketplace | `gd_lvt9iwuh6fbcwmx1a` | `facebook.com/marketplace/item/{item_id}` |
| Profiles | `gd_mf0urb782734ik94dz` | `facebook.com/{username}` |
| Pages and Profiles | `gd_mf124a0511bauquyow` | `facebook.com/{page_or_profile}` |
| Events | `gd_m14sd0to1jz48ppm51` | `facebook.com/events/{event_id}` |
| Reels by profile URL | `gd_lyclm3ey2q6rww027t` | `facebook.com/{username}` |
| Company Reviews | `gd_m0dtqpiu1mbcyc2g86` | `facebook.com/{company_page}` |

## [​](https://docs.brightdata.com/datasets/scrapers/facebook/send-first-request\#output-formats)  Output formats

Control the response format with the `format` query parameter:

| Value | Description |
| --- | --- |
| `json` | JSON array (default) |
| `ndjson` | Newline-delimited JSON, one record per line |
| `csv` | Comma-separated values |

## [​](https://docs.brightdata.com/datasets/scrapers/facebook/send-first-request\#next-steps)  Next steps

[**Async batch requests** \\
\\
Scrape hundreds of URLs in a single batch job.](https://docs.brightdata.com/datasets/scrapers/facebook/async-requests)

[**API reference** \\
\\
Full parameter and response field reference.](https://docs.brightdata.com/api-reference/scrapers/social-media-apis/facebook-profiles-collect-by-url)

Was this page helpful?

YesNo

[Quickstart](https://docs.brightdata.com/datasets/scrapers/facebook/quickstart) [Async requests](https://docs.brightdata.com/datasets/scrapers/facebook/async-requests)

Ctrl+I

[linkedin](https://il.linkedin.com/company/bright-data) [youtube](https://www.youtube.com/channel/UCM_0cG1ljAoEUcZIyoUIq6g) [github](https://github.com/luminati-io)