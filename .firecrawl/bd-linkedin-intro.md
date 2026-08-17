> ## Documentation Index
>
> Fetch the complete documentation index at: [/llms.txt](https://docs.brightdata.com/llms.txt)
>
> Use this file to discover all available pages before exploring further.

[Skip to main content](https://docs.brightdata.com/datasets/scrapers/linkedin/introduction#content-area)

[Bright Data Docs home page![light logo](https://mintcdn.com/brightdata/FreEYbEGZchU-2Iw/logo/light.svg?fit=max&auto=format&n=FreEYbEGZchU-2Iw&q=85&s=fa5461a75d0b4cf2e744c89d4b67afac)![dark logo](https://mintcdn.com/brightdata/FreEYbEGZchU-2Iw/logo/dark.svg?fit=max&auto=format&n=FreEYbEGZchU-2Iw&q=85&s=43d5b51e1516be57edb429337abdc90f)](https://brightdata.com/)

English

Search...

Ctrl K

- [Support](https://brightdata.zendesk.com/hc/en-us/requests/new)
- [Sign up](https://brightdata.com/?hs_signup=1&utm_source=docs)
- [Sign up](https://brightdata.com/?hs_signup=1&utm_source=docs)

Search...

Navigation

LinkedIn Scraper API

LinkedIn Scraper API

[Welcome](https://docs.brightdata.com/introduction) [Proxy Infrastructure](https://docs.brightdata.com/proxy-networks/introduction) [Web Access APIs](https://docs.brightdata.com/scraping-automation/introduction) [Data Feeds](https://docs.brightdata.com/datasets/introduction) [AI](https://docs.brightdata.com/ai/introduction) [API Reference](https://docs.brightdata.com/api-reference/authentication) [General](https://docs.brightdata.com/general/account/overview) [Integrations](https://docs.brightdata.com/integrations/introduction)

### Introduction

- [Overview](https://docs.brightdata.com/datasets/introduction)

### Product Guides

- Scraper API



  - [Overview](https://docs.brightdata.com/datasets/scrapers/overview)
  - Scrapers Library

  - LinkedIn Scraper API



    - [Introduction](https://docs.brightdata.com/datasets/scrapers/linkedin/introduction)
    - [Quickstart](https://docs.brightdata.com/datasets/scrapers/linkedin/quickstart)
    - [Send your first request](https://docs.brightdata.com/datasets/scrapers/linkedin/send-first-request)
    - [Async requests](https://docs.brightdata.com/datasets/scrapers/linkedin/async-requests)
    - Data delivery
  - Instagram Scraper API

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

- [How it works](https://docs.brightdata.com/datasets/scrapers/linkedin/introduction#how-it-works)
- [What the response looks like](https://docs.brightdata.com/datasets/scrapers/linkedin/introduction#what-the-response-looks-like)
- [Supported data types](https://docs.brightdata.com/datasets/scrapers/linkedin/introduction#supported-data-types)
- [Request methods](https://docs.brightdata.com/datasets/scrapers/linkedin/introduction#request-methods)
- [Capabilities and limits](https://docs.brightdata.com/datasets/scrapers/linkedin/introduction#capabilities-and-limits)
- [Common questions](https://docs.brightdata.com/datasets/scrapers/linkedin/introduction#common-questions)
- [Next steps](https://docs.brightdata.com/datasets/scrapers/linkedin/introduction#next-steps)

LinkedIn Scraper API

# LinkedIn Scraper API

Copy pageCopy page

Use the Bright Data [LinkedIn Scraper API](https://brightdata.com/products/web-scraper/linkedin) to extract structured data from profiles, companies, jobs and posts. Handles up to 20 URLs per request.

Copy pageCopy page

Send a LinkedIn URL, get structured JSON back. The Bright Data LinkedIn Scraper API handles proxies, CAPTCHAs, and parsing so you can focus on your data pipeline.

New to Bright Data? [Create a free account](https://brightdata.com/cp/start) and get $2 credit to start scraping.

## [​](https://docs.brightdata.com/datasets/scrapers/linkedin/introduction\#how-it-works)  How it works

You send one or more LinkedIn URLs to the Bright Data LinkedIn Scraper API. Bright Data handles the scraping infrastructure and returns clean, structured JSON.

```
Your app  -->  Bright Data API  -->  Structured JSON
           POST /datasets/v3/scrape
           Authorization: Bearer YOUR_API_KEY
```

All requests use a `dataset_id` to specify the data type (profiles, companies, jobs, or posts) and return results in JSON, NDJSON, or CSV.

## [​](https://docs.brightdata.com/datasets/scrapers/linkedin/introduction\#what-the-response-looks-like)  What the response looks like

```
curl -X POST "https://api.brightdata.com/datasets/v3/scrape?dataset_id=gd_l1viktl72bvl7bjuj0&format=json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '[{"url": "https://www.linkedin.com/in/satyanadella"}]'
```

```
{
  "name": "Satya Nadella",
  "city": "Redmond",
  "country_code": "US",
  "current_company": { "name": "Microsoft" },
  "followers": 10842560,
  "about": "Chairman and CEO at Microsoft..."
}
```

## [​](https://docs.brightdata.com/datasets/scrapers/linkedin/introduction\#supported-data-types)  Supported data types

[**Profiles** \\
\\
Work history, education, skills, connections. Discover profiles by name or keyword.](https://docs.brightdata.com/api-reference/scrapers/social-media-apis/linkedin-profiles-collect-by-url)

[**Companies** \\
\\
Employee counts, funding data, specialties, affiliated organizations.](https://docs.brightdata.com/api-reference/scrapers/social-media-apis/linkedin-companies-collect-by-url)

[**Jobs** \\
\\
Salary data, requirements, application links. Discover jobs by keyword or search URL.](https://docs.brightdata.com/api-reference/scrapers/social-media-apis/linkedin-jobs-collect-by-url)

[**Posts** \\
\\
Post content, engagement metrics, hashtags, comments. Discover posts by company or profile.](https://docs.brightdata.com/api-reference/scrapers/social-media-apis/linkedin-posts-collect-by-url)

## [​](https://docs.brightdata.com/datasets/scrapers/linkedin/introduction\#request-methods)  Request methods

The Bright Data LinkedIn Scraper API supports two request methods. Choose based on your volume and latency needs.

| Method | Endpoint | Best for |
| --- | --- | --- |
| **Synchronous** | [`/scrape`](https://docs.brightdata.com/datasets/scrapers/linkedin/send-first-request) | Real-time lookups, up to 20 URLs |
| **Asynchronous** | [`/trigger`](https://docs.brightdata.com/datasets/scrapers/linkedin/async-requests) | Batch jobs, 20+ URLs, production pipelines |

Learn more in [Understanding sync vs. async requests](https://docs.brightdata.com/datasets/scrapers/concepts/sync-vs-async).

## [​](https://docs.brightdata.com/datasets/scrapers/linkedin/introduction\#capabilities-and-limits)  Capabilities and limits

| Capability | Detail |
| --- | --- |
| **Output formats** | JSON, NDJSON, CSV |
| **Max URLs per sync request** | 20 |
| **Max URLs per async request** | 5,000 |
| **Data freshness** | Real-time (scraped on demand) |
| **Delivery options** | API download, [Webhook](https://docs.brightdata.com/datasets/scrapers/linkedin/data-delivery/webhooks), [Amazon S3](https://docs.brightdata.com/datasets/scrapers/linkedin/data-delivery/amazon-s3), Snowflake, Azure, GCS ( [all options](https://docs.brightdata.com/datasets/scrapers/scrapers-library/delivery-options)) |
| **Pricing** | Pay per successful record ( [see pricing](https://brightdata.com/pricing/web-scraper)) |

## [​](https://docs.brightdata.com/datasets/scrapers/linkedin/introduction\#common-questions)  Common questions

Is the data scraped in real time?

Yes. Each request triggers a live scrape. There is no cached or stale data. Response times vary by endpoint: profiles typically return in 10-30 seconds (sync), while discovery requests may take longer depending on result volume.

What is the difference between URL collection and discovery?

**URL collection** scrapes a specific LinkedIn page you provide (e.g., a profile URL). **Discovery** finds LinkedIn pages matching search criteria (e.g., “software engineers in San Francisco”) and scrapes the results. Discovery is only available via async requests.

How is this different from scraping using proxies or Web Unlocker?

When scraping using proxies or Web Unlocker, you still need to write and maintain
your own parsing logic and update it whenever LinkedIn changes its page structure.
The LinkedIn Scraper API handles the entire stack: proxy rotation, anti-bot bypassing
and parsing. You simply send a LinkedIn URL and get clean, structured JSON back with
no scraping infrastructure or parser maintenance required on your end.

## [​](https://docs.brightdata.com/datasets/scrapers/linkedin/introduction\#next-steps)  Next steps

[**Quickstart** \\
\\
Scrape your first LinkedIn profile in 5 minutes.](https://docs.brightdata.com/datasets/scrapers/linkedin/quickstart)

[**Send your first request** \\
\\
Full code examples in cURL, Python, and Node.js.](https://docs.brightdata.com/datasets/scrapers/linkedin/send-first-request)

[**API reference** \\
\\
Endpoint specs, parameters, and response schemas.](https://docs.brightdata.com/api-reference/scrapers/social-media-apis/linkedin-profiles-collect-by-url)

Was this page helpful?

YesNo

[FAQs](https://docs.brightdata.com/datasets/scrapers/scrapers-library/faqs) [Quickstart](https://docs.brightdata.com/datasets/scrapers/linkedin/quickstart)

Ctrl+I

[linkedin](https://il.linkedin.com/company/bright-data) [youtube](https://www.youtube.com/channel/UCM_0cG1ljAoEUcZIyoUIq6g) [github](https://github.com/luminati-io)