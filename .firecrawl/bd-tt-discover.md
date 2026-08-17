> ## Documentation Index
>
> Fetch the complete documentation index at: [/llms.txt](https://docs.brightdata.com/llms.txt)
>
> Use this file to discover all available pages before exploring further.

[Skip to main content](https://docs.brightdata.com/api-reference/scrapers/social-media-apis/tiktok-posts-discover-by-profile-url#content-area)

[Bright Data Docs home page![light logo](https://mintcdn.com/brightdata/FreEYbEGZchU-2Iw/logo/light.svg?fit=max&auto=format&n=FreEYbEGZchU-2Iw&q=85&s=fa5461a75d0b4cf2e744c89d4b67afac)![dark logo](https://mintcdn.com/brightdata/FreEYbEGZchU-2Iw/logo/dark.svg?fit=max&auto=format&n=FreEYbEGZchU-2Iw&q=85&s=43d5b51e1516be57edb429337abdc90f)](https://brightdata.com/)

English

Search...

Ctrl K

- [Support](https://brightdata.zendesk.com/hc/en-us/requests/new)
- [Sign up](https://brightdata.com/?hs_signup=1&utm_source=docs)
- [Sign up](https://brightdata.com/?hs_signup=1&utm_source=docs)

Search...

Navigation

TikTok

Discover by profile URL

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



      - [POST\\
        \\
        Profiles - Collect by URL](https://docs.brightdata.com/api-reference/scrapers/social-media-apis/tiktok-profiles-collect-by-url)
      - [POST\\
        \\
        Profiles - Discover by Search URL](https://docs.brightdata.com/api-reference/scrapers/social-media-apis/tiktok-profiles-discover-by-search-url)
      - [POST\\
        \\
        Posts - Collect by URL](https://docs.brightdata.com/api-reference/scrapers/social-media-apis/tiktok-posts-collect-by-url)
      - [POST\\
        \\
        Posts - Discover by Keyword](https://docs.brightdata.com/api-reference/scrapers/social-media-apis/tiktok-posts-discover-by-keyword)
      - [POST\\
        \\
        Posts - Discover by Profile URL](https://docs.brightdata.com/api-reference/scrapers/social-media-apis/tiktok-posts-discover-by-profile-url)
      - [POST\\
        \\
        Posts - Discover by URL](https://docs.brightdata.com/api-reference/scrapers/social-media-apis/tiktok-posts-discover-by-url)
      - [POST\\
        \\
        Shop - Collect by URL](https://docs.brightdata.com/api-reference/scrapers/social-media-apis/tiktok-shop-collect-by-url)
      - [POST\\
        \\
        Shop - Discover by Category](https://docs.brightdata.com/api-reference/scrapers/social-media-apis/tiktok-shop-discover-by-category)
      - [POST\\
        \\
        Shop - Discover by Keyword](https://docs.brightdata.com/api-reference/scrapers/social-media-apis/tiktok-shop-discover-by-keyword)
      - [POST\\
        \\
        Shop - Discover by Shop](https://docs.brightdata.com/api-reference/scrapers/social-media-apis/tiktok-shop-discover-by-shop)
      - [POST\\
        \\
        Comments - Collect by URL](https://docs.brightdata.com/api-reference/scrapers/social-media-apis/tiktok-comments-collect-by-url)
      - [POST\\
        \\
        Posts by Profile Fast API - Collect by URL](https://docs.brightdata.com/api-reference/scrapers/social-media-apis/tiktok-posts-by-profile-fast-api-collect-by-url)
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


Discover by Profile URL

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
      "url": "<string>",\
      "num_of_posts": 123,\
      "start_date": "<string>",\
      "end_date": "<string>",\
      "posts_to_not_include": [\
        "<string>"\
      ],\
      "what_to_collect": "<string>"\
    }\
  ]
}
'
```

```
import requests

url = "https://api.brightdata.com/datasets/v3/scrape"

payload = { "input": [\
        {\
            "url": "<string>",\
            "num_of_posts": 123,\
            "start_date": "<string>",\
            "end_date": "<string>",\
            "posts_to_not_include": ["<string>"],\
            "what_to_collect": "<string>"\
        }\
    ] }
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
  body: JSON.stringify({
    input: [\
      {\
        url: '<string>',\
        num_of_posts: 123,\
        start_date: '<string>',\
        end_date: '<string>',\
        posts_to_not_include: ['<string>'],\
        what_to_collect: '<string>'\
      }\
    ]
  })
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
                'url' => '<string>',\
                'num_of_posts' => 123,\
                'start_date' => '<string>',\
                'end_date' => '<string>',\
                'posts_to_not_include' => [\
                                '<string>'\
                ],\
                'what_to_collect' => '<string>'\
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

	payload := strings.NewReader("{\n  \"input\": [\n    {\n      \"url\": \"<string>\",\n      \"num_of_posts\": 123,\n      \"start_date\": \"<string>\",\n      \"end_date\": \"<string>\",\n      \"posts_to_not_include\": [\n        \"<string>\"\n      ],\n      \"what_to_collect\": \"<string>\"\n    }\n  ]\n}")

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
  .body("{\n  \"input\": [\n    {\n      \"url\": \"<string>\",\n      \"num_of_posts\": 123,\n      \"start_date\": \"<string>\",\n      \"end_date\": \"<string>\",\n      \"posts_to_not_include\": [\n        \"<string>\"\n      ],\n      \"what_to_collect\": \"<string>\"\n    }\n  ]\n}")
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
request.body = "{\n  \"input\": [\n    {\n      \"url\": \"<string>\",\n      \"num_of_posts\": 123,\n      \"start_date\": \"<string>\",\n      \"end_date\": \"<string>\",\n      \"posts_to_not_include\": [\n        \"<string>\"\n      ],\n      \"what_to_collect\": \"<string>\"\n    }\n  ]\n}"

response = http.request(request)
puts response.read_body
```

200

```
[\
  {\
    "post_id": "7553300000000000000",\
    "description": "You won't believe what happened next #challenge",\
    "create_time": "2025-01-20T18:00:00.000Z",\
    "share_count": 120000,\
    "collect_count": 45000,\
    "comment_count": 32000,\
    "play_count": 85000000,\
    "video_duration": 120,\
    "hashtags": [\
      "#challenge"\
    ],\
    "video_url": "https://v16-webapp-prime.tiktok.com/video/example.mp4",\
    "profile_username": "examplecreator",\
    "profile_url": "https://www.tiktok.com/@examplecreator",\
    "is_verified": true\
  }\
]
```

TikTok

# Discover by profile URL

Copy pageCopy page

Use the Bright Data Web Scraper API to discover by Profile URL. POST /datasets/v3/scrape starts a scraping job that returns the data as structured JSON records.

Copy pageCopy page

POST

/

datasets

/

v3

/

scrape

Try it

Discover by Profile URL

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
      "url": "<string>",\
      "num_of_posts": 123,\
      "start_date": "<string>",\
      "end_date": "<string>",\
      "posts_to_not_include": [\
        "<string>"\
      ],\
      "what_to_collect": "<string>"\
    }\
  ]
}
'
```

```
import requests

url = "https://api.brightdata.com/datasets/v3/scrape"

payload = { "input": [\
        {\
            "url": "<string>",\
            "num_of_posts": 123,\
            "start_date": "<string>",\
            "end_date": "<string>",\
            "posts_to_not_include": ["<string>"],\
            "what_to_collect": "<string>"\
        }\
    ] }
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
  body: JSON.stringify({
    input: [\
      {\
        url: '<string>',\
        num_of_posts: 123,\
        start_date: '<string>',\
        end_date: '<string>',\
        posts_to_not_include: ['<string>'],\
        what_to_collect: '<string>'\
      }\
    ]
  })
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
                'url' => '<string>',\
                'num_of_posts' => 123,\
                'start_date' => '<string>',\
                'end_date' => '<string>',\
                'posts_to_not_include' => [\
                                '<string>'\
                ],\
                'what_to_collect' => '<string>'\
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

	payload := strings.NewReader("{\n  \"input\": [\n    {\n      \"url\": \"<string>\",\n      \"num_of_posts\": 123,\n      \"start_date\": \"<string>\",\n      \"end_date\": \"<string>\",\n      \"posts_to_not_include\": [\n        \"<string>\"\n      ],\n      \"what_to_collect\": \"<string>\"\n    }\n  ]\n}")

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
  .body("{\n  \"input\": [\n    {\n      \"url\": \"<string>\",\n      \"num_of_posts\": 123,\n      \"start_date\": \"<string>\",\n      \"end_date\": \"<string>\",\n      \"posts_to_not_include\": [\n        \"<string>\"\n      ],\n      \"what_to_collect\": \"<string>\"\n    }\n  ]\n}")
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
request.body = "{\n  \"input\": [\n    {\n      \"url\": \"<string>\",\n      \"num_of_posts\": 123,\n      \"start_date\": \"<string>\",\n      \"end_date\": \"<string>\",\n      \"posts_to_not_include\": [\n        \"<string>\"\n      ],\n      \"what_to_collect\": \"<string>\"\n    }\n  ]\n}"

response = http.request(request)
puts response.read_body
```

200

```
[\
  {\
    "post_id": "7553300000000000000",\
    "description": "You won't believe what happened next #challenge",\
    "create_time": "2025-01-20T18:00:00.000Z",\
    "share_count": 120000,\
    "collect_count": 45000,\
    "comment_count": 32000,\
    "play_count": 85000000,\
    "video_duration": 120,\
    "hashtags": [\
      "#challenge"\
    ],\
    "video_url": "https://v16-webapp-prime.tiktok.com/video/example.mp4",\
    "profile_username": "examplecreator",\
    "profile_url": "https://www.tiktok.com/@examplecreator",\
    "is_verified": true\
  }\
]
```

## [​](https://docs.brightdata.com/api-reference/scrapers/social-media-apis/tiktok-posts-discover-by-profile-url\#query-parameters)  Query Parameters

[​](https://docs.brightdata.com/api-reference/scrapers/social-media-apis/tiktok-posts-discover-by-profile-url#param-dataset-id)

dataset\_id

string

default:"gd\_lu702nij2f790tmv9h"

required

The dataset ID used for this request.

Must be set to `gd_lu702nij2f790tmv9h` to collect **Discover by Profile URL** data.

[​](https://docs.brightdata.com/api-reference/scrapers/social-media-apis/tiktok-posts-discover-by-profile-url#param-type)

type

string

default:"discover\_new"

Must be set to `discover_new`.

[​](https://docs.brightdata.com/api-reference/scrapers/social-media-apis/tiktok-posts-discover-by-profile-url#param-discover-by)

discover\_by

string

default:"profile\_url"

Must be set to `profile_url`.

[​](https://docs.brightdata.com/api-reference/scrapers/social-media-apis/tiktok-posts-discover-by-profile-url#param-notify)

notify

boolean

default:false

Whether to send notifications when the request is completed.

[​](https://docs.brightdata.com/api-reference/scrapers/social-media-apis/tiktok-posts-discover-by-profile-url#param-include-errors)

include\_errors

boolean

default:true

Whether to include errors in the response.

## [​](https://docs.brightdata.com/api-reference/scrapers/social-media-apis/tiktok-posts-discover-by-profile-url\#request-body)  Request Body

[​](https://docs.brightdata.com/api-reference/scrapers/social-media-apis/tiktok-posts-discover-by-profile-url#param-input)

input

object\[\]

required

An array of input objects.

Show properties

[​](https://docs.brightdata.com/api-reference/scrapers/social-media-apis/tiktok-posts-discover-by-profile-url#param-url)

url

string

required

The URL of the TikTok profile to discover posts from.

[​](https://docs.brightdata.com/api-reference/scrapers/social-media-apis/tiktok-posts-discover-by-profile-url#param-num-of-posts)

num\_of\_posts

number

The number of recent posts to collect. Missing value indicates no limit.

[​](https://docs.brightdata.com/api-reference/scrapers/social-media-apis/tiktok-posts-discover-by-profile-url#param-start-date)

start\_date

string

Start date filter in `MM-DD-YYYY` format (should be earlier than `end_date`).

[​](https://docs.brightdata.com/api-reference/scrapers/social-media-apis/tiktok-posts-discover-by-profile-url#param-end-date)

end\_date

string

End date filter in `MM-DD-YYYY` format (should be later than `start_date`).

[​](https://docs.brightdata.com/api-reference/scrapers/social-media-apis/tiktok-posts-discover-by-profile-url#param-posts-to-not-include)

posts\_to\_not\_include

string\[\]

Post IDs to exclude from the results.

[​](https://docs.brightdata.com/api-reference/scrapers/social-media-apis/tiktok-posts-discover-by-profile-url#param-what-to-collect)

what\_to\_collect

string

Specifies what data to collect from each post.

#### [​](https://docs.brightdata.com/api-reference/scrapers/social-media-apis/tiktok-posts-discover-by-profile-url\#example)  Example

```
{
  "input": [\
    {\
      "url": "https://www.tiktok.com/@mrbeast",\
      "num_of_posts": 10,\
      "start_date": "01-01-2025",\
      "end_date": "03-01-2025"\
    }\
  ]
}
```

Was this page helpful?

YesNo

[Posts - Discover by Keyword](https://docs.brightdata.com/api-reference/scrapers/social-media-apis/tiktok-posts-discover-by-keyword) [Posts - Discover by URL](https://docs.brightdata.com/api-reference/scrapers/social-media-apis/tiktok-posts-discover-by-url)

Ctrl+I

[linkedin](https://il.linkedin.com/company/bright-data) [youtube](https://www.youtube.com/channel/UCM_0cG1ljAoEUcZIyoUIq6g) [github](https://github.com/luminati-io)