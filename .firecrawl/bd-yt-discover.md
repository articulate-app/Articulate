> ## Documentation Index
>
> Fetch the complete documentation index at: [/llms.txt](https://docs.brightdata.com/llms.txt)
>
> Use this file to discover all available pages before exploring further.

[Skip to main content](https://docs.brightdata.com/api-reference/scrapers/social-media-apis/youtube-videos-discover-by-url#content-area)

[Bright Data Docs home page![light logo](https://mintcdn.com/brightdata/FreEYbEGZchU-2Iw/logo/light.svg?fit=max&auto=format&n=FreEYbEGZchU-2Iw&q=85&s=fa5461a75d0b4cf2e744c89d4b67afac)![dark logo](https://mintcdn.com/brightdata/FreEYbEGZchU-2Iw/logo/dark.svg?fit=max&auto=format&n=FreEYbEGZchU-2Iw&q=85&s=43d5b51e1516be57edb429337abdc90f)](https://brightdata.com/)

English

Search...

Ctrl K

- [Support](https://help.brightdata.com/hc/en-us/requests/new)
- [Sign up](https://brightdata.com/?hs_signup=1&utm_source=docs)
- [Sign up](https://brightdata.com/?hs_signup=1&utm_source=docs)

Search...

Navigation

YouTube

Discover videos by URL

[Welcome](https://docs.brightdata.com/introduction) [Proxy Infrastructure](https://docs.brightdata.com/proxy-networks/introduction) [Web Access APIs](https://docs.brightdata.com/scraping-automation/introduction) [Data Feeds](https://docs.brightdata.com/datasets/introduction) [AI](https://docs.brightdata.com/ai/introduction) [API Reference](https://docs.brightdata.com/api-reference/authentication) [General](https://docs.brightdata.com/general/account/overview) [Integrations](https://docs.brightdata.com/integrations/introduction)

### Overview

- [Authentication](https://docs.brightdata.com/api-reference/authentication)
- [Terminology](https://docs.brightdata.com/api-reference/terminology)
- [Postman collection](https://docs.brightdata.com/api-reference/postman-collection)
- [Python SDK](https://docs.brightdata.com/api-reference/SDK)
- [JavaScript SDK](https://docs.brightdata.com/api-reference/SDK-JS)
- CLI


### Products

- Web Unlocker API

- SERP API

- Discover APIBeta

- Browser API

- Marketplace Dataset API

- Scraper API



  - [POST\\
    \\
    Asynchronous Requests](https://docs.brightdata.com/api-reference/rest-api/scraper/asynchronous-requests)
  - [POST\\
    \\
    Synchronous Requests](https://docs.brightdata.com/api-reference/scrapers/synchronous-requests)
  - [POST\\
    \\
    Crawl API](https://docs.brightdata.com/api-reference/rest-api/scraper/crawl-api)
  - Delivery APIs

  - Management APIs

  - Social Media APIs



    - [Overview](https://docs.brightdata.com/api-reference/scrapers/social-media-apis/overview)
    - Facebook

    - Instagram

    - LinkedIn

    - TikTok

    - Reddit

    - X (Twitter)

    - [Pinterest](https://docs.brightdata.com/api-reference/scrapers/social-media-apis/pinterest)
    - [Quora](https://docs.brightdata.com/api-reference/scrapers/social-media-apis/quora)
    - [Vimeo](https://docs.brightdata.com/api-reference/scrapers/social-media-apis/vimeo)
    - YouTube



      - [POST\\
        \\
        Videos - Collect by URL](https://docs.brightdata.com/api-reference/scrapers/social-media-apis/youtube-videos-collect-by-url)
      - [POST\\
        \\
        Videos - Discover by Explore](https://docs.brightdata.com/api-reference/scrapers/social-media-apis/youtube-videos-discover-by-explore)
      - [POST\\
        \\
        Videos - Discover by Hashtag](https://docs.brightdata.com/api-reference/scrapers/social-media-apis/youtube-videos-discover-by-hashtag)
      - [POST\\
        \\
        Videos - Discover by Keyword](https://docs.brightdata.com/api-reference/scrapers/social-media-apis/youtube-videos-discover-by-keyword)
      - [POST\\
        \\
        Videos - Discover by Podcast URL](https://docs.brightdata.com/api-reference/scrapers/social-media-apis/youtube-videos-discover-by-podcast-url)
      - [POST\\
        \\
        Videos - Discover by Search Filters](https://docs.brightdata.com/api-reference/scrapers/social-media-apis/youtube-videos-discover-by-search-filters)
      - [POST\\
        \\
        Videos - Discover by URL](https://docs.brightdata.com/api-reference/scrapers/social-media-apis/youtube-videos-discover-by-url)
      - [POST\\
        \\
        Channels - Collect by URL](https://docs.brightdata.com/api-reference/scrapers/social-media-apis/youtube-channels-collect-by-url)
      - [POST\\
        \\
        Channels - Discover by Keyword](https://docs.brightdata.com/api-reference/scrapers/social-media-apis/youtube-channels-discover-by-keyword)
      - [POST\\
        \\
        Comments - Collect by URL](https://docs.brightdata.com/api-reference/scrapers/social-media-apis/youtube-comments-collect-by-url)
  - E-Commerce APIs

  - Search Engine APIs

  - AI Search APIs
- Scraper Studio API

- Scraping Shield

- Proxy Networks

- Proxy Manager

- Unlocker & SERP API

- Archive API

- Deep Lookup API (Beta)


### Administrative API

- Account Management API


Discover Videos by URL

cURL

```
curl --request POST \
  --url https://api.brightdata.com/datasets/v3/scrape \
  --header 'Authorization: Bearer <token>' \
  --header 'Content-Type: application/json' \
  --data '
{
  "input": [\
    {\
      "url": "<string>"\
    }\
  ]
}
'
```

```
import requests

url = "https://api.brightdata.com/datasets/v3/scrape"

payload = { "input": [{ "url": "<string>" }] }
headers = {
    "Authorization": "Bearer <token>",
    "Content-Type": "application/json"
}

response = requests.post(url, json=payload, headers=headers)

print(response.text)
```

```
const options = {
  method: 'POST',
  headers: {Authorization: 'Bearer <token>', 'Content-Type': 'application/json'},
  body: JSON.stringify({input: [{url: '<string>'}]})
};

fetch('https://api.brightdata.com/datasets/v3/scrape', options)
  .then(res => res.json())
  .then(res => console.log(res))
  .catch(err => console.error(err));
```

```
<?php

$curl = curl_init();

curl_setopt_array($curl, [\
  CURLOPT_URL => "https://api.brightdata.com/datasets/v3/scrape",\
  CURLOPT_RETURNTRANSFER => true,\
  CURLOPT_ENCODING => "",\
  CURLOPT_MAXREDIRS => 10,\
  CURLOPT_TIMEOUT => 30,\
  CURLOPT_HTTP_VERSION => CURL_HTTP_VERSION_1_1,\
  CURLOPT_CUSTOMREQUEST => "POST",\
  CURLOPT_POSTFIELDS => json_encode([\
    'input' => [\
        [\
                'url' => '<string>'\
        ]\
    ]\
  ]),\
  CURLOPT_HTTPHEADER => [\
    "Authorization: Bearer <token>",\
    "Content-Type: application/json"\
  ],\
]);

$response = curl_exec($curl);
$err = curl_error($curl);

curl_close($curl);

if ($err) {
  echo "cURL Error #:" . $err;
} else {
  echo $response;
}
```

```
package main

import (
	"fmt"
	"strings"
	"net/http"
	"io"
)

func main() {

	url := "https://api.brightdata.com/datasets/v3/scrape"

	payload := strings.NewReader("{\n  \"input\": [\n    {\n      \"url\": \"<string>\"\n    }\n  ]\n}")

	req, _ := http.NewRequest("POST", url, payload)

	req.Header.Add("Authorization", "Bearer <token>")
	req.Header.Add("Content-Type", "application/json")

	res, _ := http.DefaultClient.Do(req)

	defer res.Body.Close()
	body, _ := io.ReadAll(res.Body)

	fmt.Println(string(body))

}
```

```
HttpResponse<String> response = Unirest.post("https://api.brightdata.com/datasets/v3/scrape")
  .header("Authorization", "Bearer <token>")
  .header("Content-Type", "application/json")
  .body("{\n  \"input\": [\n    {\n      \"url\": \"<string>\"\n    }\n  ]\n}")
  .asString();
```

```
require 'uri'
require 'net/http'

url = URI("https://api.brightdata.com/datasets/v3/scrape")

http = Net::HTTP.new(url.host, url.port)
http.use_ssl = true

request = Net::HTTP::Post.new(url)
request["Authorization"] = 'Bearer <token>'
request["Content-Type"] = 'application/json'
request.body = "{\n  \"input\": [\n    {\n      \"url\": \"<string>\"\n    }\n  ]\n}"

response = http.request(request)
puts response.read_body
```

200

```
[\
  {\
    "url": "https://www.youtube.com/watch?v=4L_m0m3bEtE",\
    "title": "Video Title Here",\
    "youtuber": "@channelname",\
    "video_url": "https://...",\
    "video_length": 96,\
    "likes": 18,\
    "views": 1648,\
    "date_posted": "2025-04-18T05:26:16.000Z",\
    "description": "Video description...",\
    "num_comments": 0,\
    "subscribers": 4810000,\
    "video_id": "4L_m0m3bEtE",\
    "channel_url": "https://www.youtube.com/@channelname",\
    "preview_image": "https://i.ytimg.com/vi/4L_m0m3bEtE/maxresdefault.jpg",\
    "shortcode": "4L_m0m3bEtE",\
    "verified": true,\
    "handle_name": "Channel Name",\
    "is_sponsored": false,\
    "quality": "hd1080",\
    "transcript": "...",\
    "tags": ["tag1", "tag2"],\
    "is_age_restricted": false\
  }\
]
```

YouTube

# Discover videos by URL

Copy pageCopy page

Use the Bright Data Web Scraper API to discover Videos by URL. POST /datasets/v3/scrape starts a scraping job that returns the data as structured JSON records.

Copy pageCopy page

POST

/

datasets

/

v3

/

scrape

Try it

Discover Videos by URL

cURL

```
curl --request POST \
  --url https://api.brightdata.com/datasets/v3/scrape \
  --header 'Authorization: Bearer <token>' \
  --header 'Content-Type: application/json' \
  --data '
{
  "input": [\
    {\
      "url": "<string>"\
    }\
  ]
}
'
```

```
import requests

url = "https://api.brightdata.com/datasets/v3/scrape"

payload = { "input": [{ "url": "<string>" }] }
headers = {
    "Authorization": "Bearer <token>",
    "Content-Type": "application/json"
}

response = requests.post(url, json=payload, headers=headers)

print(response.text)
```

```
const options = {
  method: 'POST',
  headers: {Authorization: 'Bearer <token>', 'Content-Type': 'application/json'},
  body: JSON.stringify({input: [{url: '<string>'}]})
};

fetch('https://api.brightdata.com/datasets/v3/scrape', options)
  .then(res => res.json())
  .then(res => console.log(res))
  .catch(err => console.error(err));
```

```
<?php

$curl = curl_init();

curl_setopt_array($curl, [\
  CURLOPT_URL => "https://api.brightdata.com/datasets/v3/scrape",\
  CURLOPT_RETURNTRANSFER => true,\
  CURLOPT_ENCODING => "",\
  CURLOPT_MAXREDIRS => 10,\
  CURLOPT_TIMEOUT => 30,\
  CURLOPT_HTTP_VERSION => CURL_HTTP_VERSION_1_1,\
  CURLOPT_CUSTOMREQUEST => "POST",\
  CURLOPT_POSTFIELDS => json_encode([\
    'input' => [\
        [\
                'url' => '<string>'\
        ]\
    ]\
  ]),\
  CURLOPT_HTTPHEADER => [\
    "Authorization: Bearer <token>",\
    "Content-Type: application/json"\
  ],\
]);

$response = curl_exec($curl);
$err = curl_error($curl);

curl_close($curl);

if ($err) {
  echo "cURL Error #:" . $err;
} else {
  echo $response;
}
```

```
package main

import (
	"fmt"
	"strings"
	"net/http"
	"io"
)

func main() {

	url := "https://api.brightdata.com/datasets/v3/scrape"

	payload := strings.NewReader("{\n  \"input\": [\n    {\n      \"url\": \"<string>\"\n    }\n  ]\n}")

	req, _ := http.NewRequest("POST", url, payload)

	req.Header.Add("Authorization", "Bearer <token>")
	req.Header.Add("Content-Type", "application/json")

	res, _ := http.DefaultClient.Do(req)

	defer res.Body.Close()
	body, _ := io.ReadAll(res.Body)

	fmt.Println(string(body))

}
```

```
HttpResponse<String> response = Unirest.post("https://api.brightdata.com/datasets/v3/scrape")
  .header("Authorization", "Bearer <token>")
  .header("Content-Type", "application/json")
  .body("{\n  \"input\": [\n    {\n      \"url\": \"<string>\"\n    }\n  ]\n}")
  .asString();
```

```
require 'uri'
require 'net/http'

url = URI("https://api.brightdata.com/datasets/v3/scrape")

http = Net::HTTP.new(url.host, url.port)
http.use_ssl = true

request = Net::HTTP::Post.new(url)
request["Authorization"] = 'Bearer <token>'
request["Content-Type"] = 'application/json'
request.body = "{\n  \"input\": [\n    {\n      \"url\": \"<string>\"\n    }\n  ]\n}"

response = http.request(request)
puts response.read_body
```

200

```
[\
  {\
    "url": "https://www.youtube.com/watch?v=4L_m0m3bEtE",\
    "title": "Video Title Here",\
    "youtuber": "@channelname",\
    "video_url": "https://...",\
    "video_length": 96,\
    "likes": 18,\
    "views": 1648,\
    "date_posted": "2025-04-18T05:26:16.000Z",\
    "description": "Video description...",\
    "num_comments": 0,\
    "subscribers": 4810000,\
    "video_id": "4L_m0m3bEtE",\
    "channel_url": "https://www.youtube.com/@channelname",\
    "preview_image": "https://i.ytimg.com/vi/4L_m0m3bEtE/maxresdefault.jpg",\
    "shortcode": "4L_m0m3bEtE",\
    "verified": true,\
    "handle_name": "Channel Name",\
    "is_sponsored": false,\
    "quality": "hd1080",\
    "transcript": "...",\
    "tags": ["tag1", "tag2"],\
    "is_age_restricted": false\
  }\
]
```

## [​](https://docs.brightdata.com/api-reference/scrapers/social-media-apis/youtube-videos-discover-by-url\#query-parameters)  Query Parameters

[​](https://docs.brightdata.com/api-reference/scrapers/social-media-apis/youtube-videos-discover-by-url#param-dataset-id)

dataset\_id

string

default:"gd\_lk56epmy2i5g7lzu0k"

required

The dataset ID used for this request.

Must be set to `gd_lk56epmy2i5g7lzu0k` to collect **Discover Videos by URL** data.

[​](https://docs.brightdata.com/api-reference/scrapers/social-media-apis/youtube-videos-discover-by-url#param-type)

type

string

default:"discover\_new"

Must be set to `discover_new`.

[​](https://docs.brightdata.com/api-reference/scrapers/social-media-apis/youtube-videos-discover-by-url#param-discover-by)

discover\_by

string

default:"url"

Must be set to `url`.

[​](https://docs.brightdata.com/api-reference/scrapers/social-media-apis/youtube-videos-discover-by-url#param-notify)

notify

boolean

default:false

Whether to send notifications when the request is completed.

[​](https://docs.brightdata.com/api-reference/scrapers/social-media-apis/youtube-videos-discover-by-url#param-include-errors)

include\_errors

boolean

default:true

Whether to include errors in the response.

## [​](https://docs.brightdata.com/api-reference/scrapers/social-media-apis/youtube-videos-discover-by-url\#request-body)  Request Body

[​](https://docs.brightdata.com/api-reference/scrapers/social-media-apis/youtube-videos-discover-by-url#param-input)

input

object\[\]

required

An array of input objects.

Show properties

[​](https://docs.brightdata.com/api-reference/scrapers/social-media-apis/youtube-videos-discover-by-url#param-url)

url

string

required

The YouTube channel or playlist URL to discover videos from.

#### [​](https://docs.brightdata.com/api-reference/scrapers/social-media-apis/youtube-videos-discover-by-url\#example)  Example

```
{
  "input": [\
    {"url": "https://www.youtube.com/@MrBeast"}\
  ]
}
```

Was this page helpful?

YesNo

[Videos - Discover by Search Filters](https://docs.brightdata.com/api-reference/scrapers/social-media-apis/youtube-videos-discover-by-search-filters) [Channels - Collect by URL](https://docs.brightdata.com/api-reference/scrapers/social-media-apis/youtube-channels-collect-by-url)

Ctrl+I

[linkedin](https://il.linkedin.com/company/bright-data) [youtube](https://www.youtube.com/channel/UCM_0cG1ljAoEUcZIyoUIq6g) [github](https://github.com/luminati-io)