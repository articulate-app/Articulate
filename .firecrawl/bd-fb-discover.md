> ## Documentation Index
>
> Fetch the complete documentation index at: [/llms.txt](https://docs.brightdata.com/llms.txt)
>
> Use this file to discover all available pages before exploring further.

[Skip to main content](https://docs.brightdata.com/api-reference/scrapers/social-media-apis/facebook-pages-posts-discover-by-username#content-area)

[Bright Data Docs home page![light logo](https://mintcdn.com/brightdata/FreEYbEGZchU-2Iw/logo/light.svg?fit=max&auto=format&n=FreEYbEGZchU-2Iw&q=85&s=fa5461a75d0b4cf2e744c89d4b67afac)![dark logo](https://mintcdn.com/brightdata/FreEYbEGZchU-2Iw/logo/dark.svg?fit=max&auto=format&n=FreEYbEGZchU-2Iw&q=85&s=43d5b51e1516be57edb429337abdc90f)](https://brightdata.com/)

English

Search...

Ctrl K

- [Support](https://help.brightdata.com/hc/en-us/requests/new)
- [Sign up](https://brightdata.com/?hs_signup=1&utm_source=docs)
- [Sign up](https://brightdata.com/?hs_signup=1&utm_source=docs)

Search...

Navigation

Facebook

Discover page posts by username

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



      - [POST\\
        \\
        Page Posts - Collect by URL](https://docs.brightdata.com/api-reference/scrapers/social-media-apis/facebook-pages-posts-collect-by-url)
      - [POST\\
        \\
        Page Posts - Discover by Username](https://docs.brightdata.com/api-reference/scrapers/social-media-apis/facebook-pages-posts-discover-by-username)
      - [POST\\
        \\
        Comments - Collect by URL](https://docs.brightdata.com/api-reference/scrapers/social-media-apis/facebook-comments-collect-by-url)
      - [POST\\
        \\
        Posts by Group - Collect by URL](https://docs.brightdata.com/api-reference/scrapers/social-media-apis/facebook-posts-by-group-collect-by-url)
      - [POST\\
        \\
        Posts - Collect by URL](https://docs.brightdata.com/api-reference/scrapers/social-media-apis/facebook-posts-collect-by-url)
      - [POST\\
        \\
        Marketplace - Collect by URL](https://docs.brightdata.com/api-reference/scrapers/social-media-apis/facebook-marketplace-collect-by-url)
      - [POST\\
        \\
        Marketplace - Discover by Keyword](https://docs.brightdata.com/api-reference/scrapers/social-media-apis/facebook-marketplace-discover-by-keyword)
      - [POST\\
        \\
        Marketplace - Discover by URL](https://docs.brightdata.com/api-reference/scrapers/social-media-apis/facebook-marketplace-discover-by-url)
      - [POST\\
        \\
        Profiles - Collect by URL](https://docs.brightdata.com/api-reference/scrapers/social-media-apis/facebook-profiles-collect-by-url)
      - [POST\\
        \\
        Pages and Profiles - Collect by URL](https://docs.brightdata.com/api-reference/scrapers/social-media-apis/facebook-pages-and-profiles-collect-by-url)
      - [POST\\
        \\
        Events - Collect by URL](https://docs.brightdata.com/api-reference/scrapers/social-media-apis/facebook-events-collect-by-url)
      - [POST\\
        \\
        Events - Discover by URL](https://docs.brightdata.com/api-reference/scrapers/social-media-apis/facebook-events-discover-by-url)
      - [POST\\
        \\
        Events - Discover by Venue](https://docs.brightdata.com/api-reference/scrapers/social-media-apis/facebook-events-discover-by-venue)
      - [POST\\
        \\
        Reels - Collect by URL](https://docs.brightdata.com/api-reference/scrapers/social-media-apis/facebook-reels-collect-by-url)
      - [POST\\
        \\
        Company Reviews - Collect by URL](https://docs.brightdata.com/api-reference/scrapers/social-media-apis/facebook-company-reviews-collect-by-url)
    - Instagram

    - LinkedIn

    - TikTok

    - Reddit

    - X (Twitter)

    - [Pinterest](https://docs.brightdata.com/api-reference/scrapers/social-media-apis/pinterest)
    - [Quora](https://docs.brightdata.com/api-reference/scrapers/social-media-apis/quora)
    - [Vimeo](https://docs.brightdata.com/api-reference/scrapers/social-media-apis/vimeo)
    - YouTube
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


Discover Page Posts by Username

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
      "user_name": "<string>"\
    }\
  ]
}
'
```

```
import requests

url = "https://api.brightdata.com/datasets/v3/scrape"

payload = { "input": [{ "user_name": "<string>" }] }
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
  body: JSON.stringify({input: [{user_name: '<string>'}]})
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
                'user_name' => '<string>'\
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

	payload := strings.NewReader("{\n  \"input\": [\n    {\n      \"user_name\": \"<string>\"\n    }\n  ]\n}")

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
  .body("{\n  \"input\": [\n    {\n      \"user_name\": \"<string>\"\n    }\n  ]\n}")
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
request.body = "{\n  \"input\": [\n    {\n      \"user_name\": \"<string>\"\n    }\n  ]\n}"

response = http.request(request)
puts response.read_body
```

200

```
[\
  {\
    "url": "https://www.facebook.com/reel/1417029756382510/",\
    "post_id": "1325707186087218",\
    "user_url": "https://www.facebook.com/delish",\
    "user_username_raw": "delish",\
    "content": "Sweet niblets! This just unlocked a childhood memory",\
    "date_posted": "2026-03-21T19:01:34.000Z",\
    "hashtags": null,\
    "num_comments": 1,\
    "num_shares": 2,\
    "num_likes_type": { "num": 34, "type": "Like" },\
    "page_name": "Delish",\
    "profile_id": "100059438474191",\
    "page_intro": "Fun eats every day of the week.",\
    "page_category": "News & media website",\
    "page_logo": "https://...",\
    "page_external_website": "likeshop.me/delish",\
    "page_likes": null,\
    "page_followers": 21000000,\
    "page_is_verified": true,\
    "original_post": { "user_avatar_image": null },\
    "attachments": [\
      {\
        "attachment_url": "https://...",\
        "id": "1417029756382510",\
        "thumbnail_url": "https://...",\
        "type": "Video",\
        "url": "https://...",\
        "video_length": "15509",\
        "video_url": "https://..."\
      }\
    ],\
    "page_url": "https://www.facebook.com/delish",\
    "header_image": "https://...",\
    "avatar_image_url": "https://...",\
    "profile_handle": "delish",\
    "is_sponsored": false,\
    "shortcode": "1325707186087218",\
    "video_view_count": 24093,\
    "likes": 39,\
    "post_type": "Reel",\
    "following": 19,\
    "count_reactions_type": [\
      { "reaction_count": 34, "type": "Like" },\
      { "reaction_count": 4, "type": "Haha" }\
    ],\
    "is_page": true,\
    "play_count": 45717\
  }\
]
```

Facebook

# Discover page posts by username

Copy pageCopy page

Use the Bright Data Web Scraper API to discover Page Posts by Username. Calls the POST /datasets/v3/scrape endpoint and returns a snapshot ID.

Copy pageCopy page

POST

/

datasets

/

v3

/

scrape

Try it

Discover Page Posts by Username

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
      "user_name": "<string>"\
    }\
  ]
}
'
```

```
import requests

url = "https://api.brightdata.com/datasets/v3/scrape"

payload = { "input": [{ "user_name": "<string>" }] }
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
  body: JSON.stringify({input: [{user_name: '<string>'}]})
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
                'user_name' => '<string>'\
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

	payload := strings.NewReader("{\n  \"input\": [\n    {\n      \"user_name\": \"<string>\"\n    }\n  ]\n}")

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
  .body("{\n  \"input\": [\n    {\n      \"user_name\": \"<string>\"\n    }\n  ]\n}")
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
request.body = "{\n  \"input\": [\n    {\n      \"user_name\": \"<string>\"\n    }\n  ]\n}"

response = http.request(request)
puts response.read_body
```

200

```
[\
  {\
    "url": "https://www.facebook.com/reel/1417029756382510/",\
    "post_id": "1325707186087218",\
    "user_url": "https://www.facebook.com/delish",\
    "user_username_raw": "delish",\
    "content": "Sweet niblets! This just unlocked a childhood memory",\
    "date_posted": "2026-03-21T19:01:34.000Z",\
    "hashtags": null,\
    "num_comments": 1,\
    "num_shares": 2,\
    "num_likes_type": { "num": 34, "type": "Like" },\
    "page_name": "Delish",\
    "profile_id": "100059438474191",\
    "page_intro": "Fun eats every day of the week.",\
    "page_category": "News & media website",\
    "page_logo": "https://...",\
    "page_external_website": "likeshop.me/delish",\
    "page_likes": null,\
    "page_followers": 21000000,\
    "page_is_verified": true,\
    "original_post": { "user_avatar_image": null },\
    "attachments": [\
      {\
        "attachment_url": "https://...",\
        "id": "1417029756382510",\
        "thumbnail_url": "https://...",\
        "type": "Video",\
        "url": "https://...",\
        "video_length": "15509",\
        "video_url": "https://..."\
      }\
    ],\
    "page_url": "https://www.facebook.com/delish",\
    "header_image": "https://...",\
    "avatar_image_url": "https://...",\
    "profile_handle": "delish",\
    "is_sponsored": false,\
    "shortcode": "1325707186087218",\
    "video_view_count": 24093,\
    "likes": 39,\
    "post_type": "Reel",\
    "following": 19,\
    "count_reactions_type": [\
      { "reaction_count": 34, "type": "Like" },\
      { "reaction_count": 4, "type": "Haha" }\
    ],\
    "is_page": true,\
    "play_count": 45717\
  }\
]
```

## [​](https://docs.brightdata.com/api-reference/scrapers/social-media-apis/facebook-pages-posts-discover-by-username\#query-parameters)  Query Parameters

[​](https://docs.brightdata.com/api-reference/scrapers/social-media-apis/facebook-pages-posts-discover-by-username#param-dataset-id)

dataset\_id

string

default:"gd\_lkaxegm826bjpoo9m5"

required

The dataset ID used for this request.

Must be set to `gd_lkaxegm826bjpoo9m5` to collect **Facebook page posts** data.

[​](https://docs.brightdata.com/api-reference/scrapers/social-media-apis/facebook-pages-posts-discover-by-username#param-notify)

notify

boolean

default:false

Whether to send notifications when the request is completed.

[​](https://docs.brightdata.com/api-reference/scrapers/social-media-apis/facebook-pages-posts-discover-by-username#param-include-errors)

include\_errors

boolean

default:true

Whether to include errors in the response.

## [​](https://docs.brightdata.com/api-reference/scrapers/social-media-apis/facebook-pages-posts-discover-by-username\#request-body)  Request Body

[​](https://docs.brightdata.com/api-reference/scrapers/social-media-apis/facebook-pages-posts-discover-by-username#param-input)

input

object\[\]

required

An array of input objects.

Show properties

[​](https://docs.brightdata.com/api-reference/scrapers/social-media-apis/facebook-pages-posts-discover-by-username#param-user-name)

user\_name

string

required

The Facebook page username.

#### [​](https://docs.brightdata.com/api-reference/scrapers/social-media-apis/facebook-pages-posts-discover-by-username\#example)  Example

```
{
  "input": [\
    {"user_name": "NASA"},\
    {"user_name": "Meta"}\
  ]
}
```

Was this page helpful?

YesNo

[Page Posts - Collect by URL](https://docs.brightdata.com/api-reference/scrapers/social-media-apis/facebook-pages-posts-collect-by-url) [Comments - Collect by URL](https://docs.brightdata.com/api-reference/scrapers/social-media-apis/facebook-comments-collect-by-url)

Ctrl+I

[linkedin](https://il.linkedin.com/company/bright-data) [youtube](https://www.youtube.com/channel/UCM_0cG1ljAoEUcZIyoUIq6g) [github](https://github.com/luminati-io)