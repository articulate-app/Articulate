> ## Documentation Index
>
> Fetch the complete documentation index at: [/llms.txt](https://docs.brightdata.com/llms.txt)
>
> Use this file to discover all available pages before exploring further.

[Skip to main content](https://docs.brightdata.com/api-reference/scrapers/social-media-apis/instagram-posts-discover-by-url#content-area)

[Bright Data Docs home page![light logo](https://mintcdn.com/brightdata/FreEYbEGZchU-2Iw/logo/light.svg?fit=max&auto=format&n=FreEYbEGZchU-2Iw&q=85&s=fa5461a75d0b4cf2e744c89d4b67afac)![dark logo](https://mintcdn.com/brightdata/FreEYbEGZchU-2Iw/logo/dark.svg?fit=max&auto=format&n=FreEYbEGZchU-2Iw&q=85&s=43d5b51e1516be57edb429337abdc90f)](https://brightdata.com/)

English

Search...

Ctrl K

- [Support](https://brightdata.zendesk.com/hc/en-us/requests/new)
- [Sign up](https://brightdata.com/?hs_signup=1&utm_source=docs)
- [Sign up](https://brightdata.com/?hs_signup=1&utm_source=docs)

Search...

Navigation

Instagram

Discover Instagram posts by URL

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



      - [POST\\
        \\
        Profiles - Collect by URL](https://docs.brightdata.com/api-reference/scrapers/social-media-apis/instagram-profiles-collect-by-url)
      - [POST\\
        \\
        Profiles - Discover by Username](https://docs.brightdata.com/api-reference/scrapers/social-media-apis/instagram-profiles-discover-by-username)
      - [POST\\
        \\
        Posts - Collect by URL](https://docs.brightdata.com/api-reference/scrapers/social-media-apis/instagram-posts-collect-by-url)
      - [POST\\
        \\
        Posts - Discover by URL](https://docs.brightdata.com/api-reference/scrapers/social-media-apis/instagram-posts-discover-by-url)
      - [POST\\
        \\
        Reels - Collect by URL](https://docs.brightdata.com/api-reference/scrapers/social-media-apis/instagram-reels-collect-by-url)
      - [POST\\
        \\
        Reels - Discover by URL](https://docs.brightdata.com/api-reference/scrapers/social-media-apis/instagram-reels-discover-by-url)
      - [POST\\
        \\
        Reels - Collect All](https://docs.brightdata.com/api-reference/scrapers/social-media-apis/instagram-reels-collect-all)
      - [POST\\
        \\
        Comments - Collect by URL](https://docs.brightdata.com/api-reference/scrapers/social-media-apis/instagram-comments-collect-by-url)
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


Discover Instagram posts by URL

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
      "posts_to_not_include": [\
        "<string>"\
      ],\
      "start_date": 123,\
      "end_date": 123,\
      "post_type": "<string>"\
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
            "posts_to_not_include": ["<string>"],\
            "start_date": 123,\
            "end_date": 123,\
            "post_type": "<string>"\
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
        posts_to_not_include: ['<string>'],\
        start_date: 123,\
        end_date: 123,\
        post_type: '<string>'\
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
                'posts_to_not_include' => [\
                                '<string>'\
                ],\
                'start_date' => 123,\
                'end_date' => 123,\
                'post_type' => '<string>'\
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

	payload := strings.NewReader("{\n  \"input\": [\n    {\n      \"url\": \"<string>\",\n      \"num_of_posts\": 123,\n      \"posts_to_not_include\": [\n        \"<string>\"\n      ],\n      \"start_date\": 123,\n      \"end_date\": 123,\n      \"post_type\": \"<string>\"\n    }\n  ]\n}")

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
  .body("{\n  \"input\": [\n    {\n      \"url\": \"<string>\",\n      \"num_of_posts\": 123,\n      \"posts_to_not_include\": [\n        \"<string>\"\n      ],\n      \"start_date\": 123,\n      \"end_date\": 123,\n      \"post_type\": \"<string>\"\n    }\n  ]\n}")
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
request.body = "{\n  \"input\": [\n    {\n      \"url\": \"<string>\",\n      \"num_of_posts\": 123,\n      \"posts_to_not_include\": [\n        \"<string>\"\n      ],\n      \"start_date\": 123,\n      \"end_date\": 123,\n      \"post_type\": \"<string>\"\n    }\n  ]\n}"

response = http.request(request)
puts response.read_body
```

200

```
[\
  {\
    "account": "jen***ell***72",\
    "fbid": "17841405188025881",\
    "id": "5087052934",\
    "followers": 7938,\
    "posts_count": 835,\
    "is_business_account": false,\
    "is_professional_account": false,\
    "is_verified": false,\
    "avg_engagement": 0.0582,\
    "external_url": null,\
    "biography": "Pod: @raydarcydaily \nemail: jenny@darcydaily.com",\
    "business_category_name": null,\
    "category_name": null,\
    "post_hashtags": null,\
    "following": 2520,\
    "posts": [\
      {\
        "caption": "BEING HUMAN - A six part series where Ray chats to 6 well known Irish people about what it means to be human. \n\nFirst episode Wednesday 18th March, and every Wednesday after.\n\nA What Next Production\nPresented by Ray D’Arcy\nProduced by Jenny Kelly\n\n#beinghuman \n#podcast \n#irishpodcast",\
        "comments": 2,\
        "content_type": "Video",\
        "datetime": "2026-03-12T11:52:08.000Z",\
        "id": "3851176228498036124",\
        "image_url": "https://scontent-dfw5-2.cdninstagram.com/v/t51.82787-15/651142041_18334056292172935_8112879477358850984_n.jpg?stp=dst-jpg_e15_tt6&_nc_ht=scontent-dfw5-2.cdninstagram.com&_nc_cat=107&_nc_oc=Q6cZ2QH-MUSe6C4PkyFc8saG_6IRC_V3hZ9c7StCViUw-zl5K7a2Qh7u0q29i7etbbV1SI4&_nc_ohc=W4Jy7OhEd8MQ7kNvwFBSQNv&_nc_gid=f8NLMHfSvJHjKW7CNjdR5w&edm=AOQ1c0wBAAAA&ccb=7-5&oh=00_Afwe_S8Bh8FtoL_RtvxoQ6RF2c20beQzWeLfJfizNBlciQ&oe=69BCEC94&_nc_sid=8b3546",\
        "is_pinned": false,\
        "likes": 36,\
        "location": {\
          "has_public_page": null,\
          "id": null,\
          "name": null,\
          "slug": null\
        },\
        "post_hashtags": [\
          "beinghuman",\
          "podcast",\
          "irishpodcast"\
        ],\
        "url": "https://www.instagram.com/p/DVyIGAbDdWc",\
        "video_url": "https://scontent-dfw6-1.cdninstagram.com/o1/v/t16/f2/m69/AQMSgH9bCDeY_VmVFTYEzrv9RMglEw0prtVd_QFRgC21aFXJ10hPg07pPxQ6VZdxe1vFeVnYABQlz2zcpXVrQqfV.mp4?strext=1&_nc_cat=103&_nc_sid=5e9851&_nc_ht=scontent-dfw6-1.cdninstagram.com&_nc_ohc=F9Tybdk82ZQQ7kNvwGJ2sbT&efg=eyJ2ZW5jb2RlX3RhZyI6Inhwdl9wcm9ncmVzc2l2ZS5JTlNUQUdSQU0uQ0xJUFMuQzMuNDgwLmRhc2hfYmFzZWxpbmVfMV92MSIsInhwdl9hc3NldF9pZCI6MTgzMzQwNTU2MDgxNzI5MzUsImFzc2V0X2FnZV9kYXlzIjozLCJ2aV91c2VjYXNlX2lkIjoxMDA5OSwiZHVyYXRpb25fcyI6MTE3LCJ1cmxnZW5fc291cmNlIjoid3d3In0%3D&ccb=17-1&_nc_gid=f8NLMHfSvJHjKW7CNjdR5w&_nc_ss=8&_nc_zt=28&vs=672fccf82fe0dcbe&_nc_vs=HBksFQIYOnBhc3N0aHJvdWdoX2V2ZXJzdG9yZS9HUGlMdHlhY29GUzFoRFFEQU9udTlRZ1ByVDFKYnNwVEFRQUYVAALIARIAFQIYUWlnX3hwdl9wbGFjZW1lbnRfcGVybWFuZW50X3YyL0E5NEZGMjZCMjU0OTFERkZBNzYzQjU2NDhBOUM5QThGX2F1ZGlvX2Rhc2hpbml0Lm1wNBUCAsgBEgAoABgAGwKIB3VzZV9vaWwBMRJwcm9ncmVzc2l2ZV9yZWNpcGUBMRUAACaOhor9vq6RQRUCKAJDMywXQF1AAAAAAAAYEmRhc2hfYmFzZWxpbmVfMV92MREAdf4HZeadAQA&oh=00_AfyDY32lp2KMgYLDKEK7Wx7ocPFPwwhGkiuWvBKwB_joLg&oe=69BCCEE9"\
      },\
      {\
        "caption": "Our brand new daily podcast is starting tomorrow \n\nRay D’Arcy Daily \n\nWherever you get your podcasts.\n\nEmail us ray@darcydaily.com\n#podcast #irishpodcast",\
        "comments": 86,\
        "content_type": "Video",\
        "datetime": "2026-03-08T16:21:04.000Z",\
        "id": "3848412628930911784",\
        "image_url": "https://scontent-dfw5-1.cdninstagram.com/v/t51.71878-15/649327000_1860456074651243_3014167701283875235_n.jpg?stp=dst-jpg_e15_tt6&_nc_ht=scontent-dfw5-1.cdninstagram.com&_nc_cat=111&_nc_oc=Q6cZ2QH-MUSe6C4PkyFc8saG_6IRC_V3hZ9c7StCViUw-zl5K7a2Qh7u0q29i7etbbV1SI4&_nc_ohc=b0EoQkmauKkQ7kNvwGZzfjq&_nc_gid=f8NLMHfSvJHjKW7CNjdR5w&edm=AOQ1c0wBAAAA&ccb=7-5&oh=00_AfxQfU7Ocg9M26vOgYlA3m4oy4cpmvDY9859u4P35lUqng&oe=69BCEFC3&_nc_sid=8b3546",\
        "is_pinned": false,\
        "likes": 992,\
        "location": {\
          "has_public_page": null,\
          "id": null,\
          "name": null,\
          "slug": null\
        },\
        "post_hashtags": [\
          "podcast",\
          "irishpodcast"\
        ],\
        "url": "https://www.instagram.com/p/DVoTuVwjd4o",\
        "video_url": "https://scontent-dfw5-2.cdninstagram.com/o1/v/t16/f2/m69/AQNqwbuRAKLUvBo_BRm3bnGbIV2EPYfXffZLw2f3swiqVgfVNN31xLUjJYzBUmk31ks69X_8_c7EKmCelHv_buYH.mp4?strext=1&_nc_cat=104&_nc_sid=5e9851&_nc_ht=scontent-dfw5-2.cdninstagram.com&_nc_ohc=iuf2XH_4eaAQ7kNvwGQqv3J&efg=eyJ2ZW5jb2RlX3RhZyI6Inhwdl9wcm9ncmVzc2l2ZS5JTlNUQUdSQU0uQ0xJUFMuQzMuNzIwLmRhc2hfYmFzZWxpbmVfMV92MSIsInhwdl9hc3NldF9pZCI6MTgzMzM2MzkxNzIxNzI5MzUsImFzc2V0X2FnZV9kYXlzIjo3LCJ2aV91c2VjYXNlX2lkIjoxMDA5OSwiZHVyYXRpb25fcyI6NjAsInVybGdlbl9zb3VyY2UiOiJ3d3cifQ%3D%3D&ccb=17-1&_nc_gid=f8NLMHfSvJHjKW7CNjdR5w&_nc_ss=8&_nc_zt=28&vs=ce88cc19b1c12270&_nc_vs=HBksFQIYOnBhc3N0aHJvdWdoX2V2ZXJzdG9yZS9HSVhrcWlhdEZTUTBGLTBFQUNGU2oydVRFWlZ4YnNwVEFRQUYVAALIARIAFQIYUWlnX3hwdl9wbGFjZW1lbnRfcGVybWFuZW50X3YyLzIwNEVCQTgxMTJEMkM2ODRBNzFEREU0RTQwNTBFQThDX2F1ZGlvX2Rhc2hpbml0Lm1wNBUCAsgBEgAoABgAGwKIB3VzZV9vaWwBMRJwcm9ncmVzc2l2ZV9yZWNpcGUBMRUAACaOsuGkoJaRQRUCKAJDMywXQE464UeuFHsYEmRhc2hfYmFzZWxpbmVfMV92MREAdf4HZeadAQA&oh=00_AfzE-98jZ3zhfaRZuLxlWwz5GmrjBpxgERbFaOjPj7UIrw&oe=69BCCCA4"\
      },\
      {\
        "caption": "We have some news! \n\nRAY D’ARCY DAILY - your daily podcast. \n\nThis five day a week show is nothing new, and yet ALL NEW. It’s Monday to Friday with Ray giving his own world view while surrounded by friends of the show, Jenny Kelly (that’s me 🤪), Mairead Ronan and Bernard O’Shea to name a few. \n\nWe hope you’ll join us. \nStarting Monday 9th. \n\nFollow the show now to make sure you never miss an episode. \n\nListen wherever you get your Podcasts #irishpodcast #podcast \n@cocomairead @bernardo.oshea @acast",\
        "comments": 166,\
        "content_type": "Video",\
        "datetime": "2026-03-02T13:25:41.000Z",\
        "id": "3843977898726623596",\
        "image_url": "https://scontent-dfw5-1.cdninstagram.com/v/t51.71878-15/641425914_1446430403853586_8943556578413069821_n.jpg?stp=dst-jpg_e15_tt6&_nc_ht=scontent-dfw5-1.cdninstagram.com&_nc_cat=110&_nc_oc=Q6cZ2QH-MUSe6C4PkyFc8saG_6IRC_V3hZ9c7StCViUw-zl5K7a2Qh7u0q29i7etbbV1SI4&_nc_ohc=j-4QNAsV4yEQ7kNvwEWKOeO&_nc_gid=f8NLMHfSvJHjKW7CNjdR5w&edm=AOQ1c0wBAAAA&ccb=7-5&oh=00_Afy2MQCg7ccEpt8gZNJowsCxi2k7fkX141C5dFU-dvfEfg&oe=69BCC84E&_nc_sid=8b3546",\
        "is_pinned": false,\
        "likes": 1158,\
        "location": {\
          "has_public_page": null,\
          "id": null,\
          "name": null,\
          "slug": null\
        },\
        "post_hashtags": [\
          "irishpodcast",\
          "podcast"\
        ],\
        "url": "https://www.instagram.com/p/DVYjYhaDYls",\
        "video_url": "https://scontent-dfw6-1.cdninstagram.com/o1/v/t16/f2/m69/AQM_D-LpDwCPxPZrnXzoyfkknE8jP_GwRpGwtEvjefP4KUFo7dAEFZ51YD7Nn6-NLnnVLm3sIF5e7jbT_ImFtRri.mp4?strext=1&_nc_cat=103&_nc_sid=5e9851&_nc_ht=scontent-dfw6-1.cdninstagram.com&_nc_ohc=-FdPzVISP18Q7kNvwEcVVkv&efg=eyJ2ZW5jb2RlX3RhZyI6Inhwdl9wcm9ncmVzc2l2ZS5JTlNUQUdSQU0uQ0xJUFMuQzMuNzIwLmRhc2hfYmFzZWxpbmVfMV92MSIsInhwdl9hc3NldF9pZCI6MTgzMzMwNTA3OTExNzI5MzUsImFzc2V0X2FnZV9kYXlzIjoxMywidmlfdXNlY2FzZV9pZCI6MTAwOTksImR1cmF0aW9uX3MiOjE0MSwidXJsZ2VuX3NvdXJjZSI6Ind3dyJ9&ccb=17-1&_nc_gid=f8NLMHfSvJHjKW7CNjdR5w&_nc_ss=8&_nc_zt=28&vs=54251b7443d07334&_nc_vs=HBksFQIYOnBhc3N0aHJvdWdoX2V2ZXJzdG9yZS9HSnlFZHlhaTdRb2U1SmtFQURXYkJFSjd5XzEwYnNwVEFRQUYVAALIARIAFQIYUWlnX3hwdl9wbGFjZW1lbnRfcGVybWFuZW50X3YyLzEyNEU2RjhEQkU4M0NCQ0Y3NEU5Njk2Q0I0NTJDRkIxX2F1ZGlvX2Rhc2hpbml0Lm1wNBUCAsgBEgAoABgAGwKIB3VzZV9vaWwBMRJwcm9ncmVzc2l2ZV9yZWNpcGUBMRUAACaO7fTAgPSQQRUCKAJDMywXQGGqp--dsi0YEmRhc2hfYmFzZWxpbmVfMV92MREAdf4HZeadAQA&oh=00_AfxknzHbQifAj5YoGVzxwXn2cPKeVRcRrdXbooIhlD8ZBQ&oe=69BCDC41"\
      },\
      {\
        "caption": "PODCAST NEWS 📢\n\nAfter 3 years we have made the decision to hang up our ‘Jenny and Mairéad NOW' mics. \n\nWe have LOVED doing it. 💕\n\nWe re-connected with so many listeners from our radio days and got lots of new listeners along the way. We want to thank you for all the laughs and life stories you’ve shared with us. \n\nWe both have new commitments that we are diving into, so for today, we'll say ‘so long for now’ 💫 \n\nLots of love, \nJenny and Mairéad \nXx \n\nPS..leave your lips alone, buy a spray mop and remember… \"you’ll be dead forever”",\
        "comments": 158,\
        "content_type": "Image",\
        "datetime": "2025-09-24T17:50:53.000Z",\
        "id": "3728872417469969396",\
        "image_url": "https://scontent-dfw5-2.cdninstagram.com/v/t51.82787-15/553161422_17973649637947844_5055340064665934469_n.webp?stp=dst-jpg_e35_s1080x1080_sh0.08_tt6&_nc_ht=scontent-dfw5-2.cdninstagram.com&_nc_cat=108&_nc_oc=Q6cZ2QH-MUSe6C4PkyFc8saG_6IRC_V3hZ9c7StCViUw-zl5K7a2Qh7u0q29i7etbbV1SI4&_nc_ohc=0IDMJZLADZgQ7kNvwGBZl2R&_nc_gid=f8NLMHfSvJHjKW7CNjdR5w&edm=AOQ1c0wBAAAA&ccb=7-5&oh=00_AfxVGERnGo1gjS9N7F4Hvi14Ek0zIbXq_m_2vnk8p1c0mQ&oe=69BCDBC8&_nc_sid=8b3546",\
        "is_pinned": false,\
        "likes": 1572,\
        "location": {\
          "has_public_page": null,\
          "id": null,\
          "name": null,\
          "slug": null\
        },\
        "post_hashtags": null,\
        "url": "https://www.instagram.com/p/DO_nbUQDLP0",\
        "video_url": null\
      },\
      {\
        "caption": "I COULD have been a camogie player (never played in my life 🤣), and @cocomairead COULD have been a pop star … what COULD you have been? \n\nPodcast out tomorrow 6am #irishpodcast #podcast #jennyandmaireadnow",\
        "comments": null,\
        "content_type": "Video",\
        "datetime": "2025-04-29T21:44:06.000Z",\
        "id": "3621719997521697568",\
        "image_url": "https://scontent-dfw6-1.cdninstagram.com/v/t51.71878-15/491461907_976222424658362_5118993394906495251_n.jpg?stp=dst-jpg_e15_tt6&_nc_ht=scontent-dfw6-1.cdninstagram.com&_nc_cat=102&_nc_oc=Q6cZ2QH-MUSe6C4PkyFc8saG_6IRC_V3hZ9c7StCViUw-zl5K7a2Qh7u0q29i7etbbV1SI4&_nc_ohc=fdEBmapVjIYQ7kNvwH9d2ns&_nc_gid=f8NLMHfSvJHjKW7CNjdR5w&edm=AOQ1c0wBAAAA&ccb=7-5&oh=00_Afz4h2HLZTuYioO61W7aDIMzXCHL34Tv_SD_q5TYfJ99iA&oe=69BCBEDC&_nc_sid=8b3546",\
        "is_pinned": false,\
        "likes": 62,\
        "location": {\
          "has_public_page": null,\
          "id": null,\
          "name": null,\
          "slug": null\
        },\
        "post_hashtags": [\
          "irishpodcast",\
          "podcast",\
          "jennyandmaireadnow"\
        ],\
        "url": "https://www.instagram.com/p/DJC7yYoNZsg",\
        "video_url": "https://scontent-dfw5-2.cdninstagram.com/o1/v/t2/f2/m367/AQNdTe3n8U7HJAUZPYQ2IKytrTScEjIa2LVv7p-gcs7bfH2WDHkU1GuQ63tg4BxPEIFCVKgn-k9soAiz09MH_R_ORdQFWDf5N2MPRLY.mp4?_nc_cat=104&_nc_sid=5e9851&_nc_ht=scontent-dfw5-2.cdninstagram.com&_nc_ohc=Syer777RuQMQ7kNvwEmKdhm&efg=eyJ2ZW5jb2RlX3RhZyI6Inhwdl9wcm9ncmVzc2l2ZS5JTlNUQUdSQU0uQ0xJUFMuQzMuNDgwLmRhc2hfYmFzZWxpbmVfMV92MSIsInhwdl9hc3NldF9pZCI6MTU5NDc3ODcyNzg2ODYyNywiYXNzZXRfYWdlX2RheXMiOjMxOSwidmlfdXNlY2FzZV9pZCI6MTAwOTksImR1cmF0aW9uX3MiOjY5LCJ1cmxnZW5fc291cmNlIjoid3d3In0%3D&ccb=17-1&_nc_gid=f8NLMHfSvJHjKW7CNjdR5w&_nc_ss=8&_nc_zt=28&vs=1d3eb966c62b0ed0&_nc_vs=HBksFQIYQGlnX2VwaGVtZXJhbC8zMTRBRkNEOTM4NTM5NjI2MzhBMUQwQ0QxNDk2QzE4QV92aWRlb19kYXNoaW5pdC5tcDQVAALIARIAFQIYRmlnX3hwdl9yZWVsc19wZXJtYW5lbnRfc3JfcHJvZC8xMjE3ODU0OTYzMjg1ODY0Xzk0ODMzNjE1ODI3NjU5Njg3OC5tcDQVAgLIARIAKAAYABsCiAd1c2Vfb2lsATEScHJvZ3Jlc3NpdmVfcmVjaXBlATEVAAAmpqOPuauc1QUVAigCQzMsF0BRUQYk3S8bGBJkYXNoX2Jhc2VsaW5lXzFfdjERAHX-B2XmnQEA&oh=00_AfxYnVqq-YPFAKEW8CVj-CJBIvyL0qQSOxuzTNCksnr_Sg&oe=69BCE24D"\
      },\
      {\
        "caption": "Podcast @jennyandmaireadnow out tomorrow 6am \n\n✨Mairead needs help\n✨Netflix Doc: Buy Now!\n✨2025 Manifesto\n✨Colour and word of the year \n✨Debutant Balls and Feis\n\nThanks to our sponsor @vhi_ie \n#irishpodcast #podcast #friendship",\
        "comments": null,\
        "content_type": "Video",\
        "datetime": "2024-12-10T21:36:11.000Z",\
        "id": "3520245279648780747",\
        "image_url": "https://scontent-dfw5-2.cdninstagram.com/v/t51.2885-15/469729187_18286176577172935_8198072792922023263_n.jpg?stp=dst-jpg_e15_tt6&_nc_ht=scontent-dfw5-2.cdninstagram.com&_nc_cat=107&_nc_oc=Q6cZ2QH-MUSe6C4PkyFc8saG_6IRC_V3hZ9c7StCViUw-zl5K7a2Qh7u0q29i7etbbV1SI4&_nc_ohc=skhiJmD75-kQ7kNvwEeKZA6&_nc_gid=f8NLMHfSvJHjKW7CNjdR5w&edm=AOQ1c0wBAAAA&ccb=7-5&oh=00_AfzWsdPI0aqqm2_IHDtzlIqHu2mL76RyRwvUBMetthP-hg&oe=69BCCDF6&_nc_sid=8b3546",\
        "is_pinned": false,\
        "likes": 64,\
        "location": {\
          "has_public_page": null,\
          "id": null,\
          "name": null,\
          "slug": null\
        },\
        "post_hashtags": [\
          "irishpodcast",\
          "podcast",\
          "friendship"\
        ],\
        "url": "https://www.instagram.com/p/DDabG5HthHL",\
        "video_url": "https://scontent-dfw5-1.cdninstagram.com/o1/v/t2/f2/m367/AQMy1Odi0RhpjgXggsSeeNNxmcDcNt0_X6IYxlCD21k4z4h46ndGKxoNjJIRjVg94CuujC1j-CiG89HT8-O9C-XPAl_3C_7p3GqzZ5M.mp4?_nc_cat=109&_nc_sid=5e9851&_nc_ht=scontent-dfw5-1.cdninstagram.com&_nc_ohc=zEKeRBdP2mAQ7kNvwENzKpk&efg=eyJ2ZW5jb2RlX3RhZyI6Inhwdl9wcm9ncmVzc2l2ZS5JTlNUQUdSQU0uQ0xJUFMuQzMuNzIwLmRhc2hfYmFzZWxpbmVfMV92MSIsInhwdl9hc3NldF9pZCI6MTIzMzY5MjkwNzcxNjE1MSwiYXNzZXRfYWdlX2RheXMiOjQ1OSwidmlfdXNlY2FzZV9pZCI6MTAwOTksImR1cmF0aW9uX3MiOjUxLCJ1cmxnZW5fc291cmNlIjoid3d3In0%3D&ccb=17-1&_nc_gid=f8NLMHfSvJHjKW7CNjdR5w&_nc_ss=8&_nc_zt=28&vs=be7ed278cb04ea95&_nc_vs=HBksFQIYQGlnX2VwaGVtZXJhbC9BQjQyNThCNTU0QTJGNEIxODg3NjlBQUJFMDNDMzU4Q192aWRlb19kYXNoaW5pdC5tcDQVAALIARIAFQIYRmlnX3hwdl9yZWVsc19wZXJtYW5lbnRfc3JfcHJvZC8xNTAyMTIxNTUwNzQwNjE0Xzc5ODkxODI2NzE3NDU1MDEwNy5tcDQVAgLIARIAKAAYABsCiAd1c2Vfb2lsATEScHJvZ3Jlc3NpdmVfcmVjaXBlATEVAAAm7vi1uLCCsQQVAigCQzMsF0BJmZmZmZmaGBJkYXNoX2Jhc2VsaW5lXzFfdjERAHX-B2XmnQEA&oh=00_Afzvy10txzkdt9h08tJs_9VMlJicQjSggsPEZ61LEdGYmA&oe=69BCC63E"\
      },\
      {\
        "caption": "This book took me a few weeks to read and it’s only 136 pages long. I could quite easily go back now and start it all over again. One of the most beautiful books I’ve read. It tells the story of 24 hours in the lives of 6 astronauts on the international space station. Each of the 16 chapters takes in one orbit of earth. It’s difficult to describe just how profound and touching this small book is. A love letter to Earth. It made me feel both sad and hopeful at the same time. I read that the author Samantha Harvey stopped writing half way through because she felt she didn’t have the right to write a book like this, so removed was it from her real life. I’m so glad she ignored that voice in her head because this book is something we will read for years and years to come. Stunning.",\
        "comments": 6,\
        "content_type": "Image",\
        "datetime": "2024-12-04T19:34:23.000Z",\
        "id": "3515840447256809542",\
        "image_url": "https://scontent-dfw6-1.cdninstagram.com/v/t51.82787-15/623407206_17991231980916798_8528601805505725054_n.jpg?stp=dst-jpg_e35_p1080x1080_sh0.08_tt6&_nc_ht=scontent-dfw6-1.cdninstagram.com&_nc_cat=106&_nc_oc=Q6cZ2QH-MUSe6C4PkyFc8saG_6IRC_V3hZ9c7StCViUw-zl5K7a2Qh7u0q29i7etbbV1SI4&_nc_ohc=1jkbYPze7PIQ7kNvwFhqTAc&_nc_gid=f8NLMHfSvJHjKW7CNjdR5w&edm=AOQ1c0wBAAAA&ccb=7-5&oh=00_Afzg1e_fEK30evjHAzSP597UW_USGzLTBIj1k-EIjQQMfA&oe=69BCCA41&_nc_sid=8b3546",\
        "is_pinned": false,\
        "likes": 109,\
        "location": {\
          "has_public_page": null,\
          "id": null,\
          "name": null,\
          "slug": null\
        },\
        "post_hashtags": null,\
        "url": "https://www.instagram.com/p/DDKxkJRsVBG",\
        "video_url": null\
      },\
      {\
        "caption": "Pod out Wednesday 6am\n\n✨Kissing 💋\n✨Christmas Movies 🎬\n✨family traditions 🏡\n✨Nits 🦗\n\nThanks to our sponsor @vhi_ie",\
        "comments": 1,\
        "content_type": "Video",\
        "datetime": "2024-12-03T21:00:59.000Z",\
        "id": "3515158122554635287",\
        "image_url": "https://scontent-dfw5-2.cdninstagram.com/v/t51.71878-15/503975082_1908008223345944_5512368651421990898_n.jpg?stp=dst-jpg_e15_tt6&_nc_ht=scontent-dfw5-2.cdninstagram.com&_nc_cat=108&_nc_oc=Q6cZ2QH-MUSe6C4PkyFc8saG_6IRC_V3hZ9c7StCViUw-zl5K7a2Qh7u0q29i7etbbV1SI4&_nc_ohc=LBreF5ALN2IQ7kNvwE_RtAb&_nc_gid=f8NLMHfSvJHjKW7CNjdR5w&edm=AOQ1c0wBAAAA&ccb=7-5&oh=00_AfzmTzT-OfgwVOhOYS62CUgEdWcUX2YsW20KyaTEXiv3Gg&oe=69BCD350&_nc_sid=8b3546",\
        "is_pinned": false,\
        "likes": 27,\
        "location": {\
          "has_public_page": null,\
          "id": null,\
          "name": null,\
          "slug": null\
        },\
        "post_hashtags": null,\
        "url": "https://www.instagram.com/p/DDIWbA4MrQX",\
        "video_url": "https://scontent-dfw5-2.cdninstagram.com/o1/v/t2/f2/m367/AQNO52R4NspLq6_HyhxNcCLUQtKiP7dXhYXNEIO3IjvmzKdyZMS_YYgB2zRkbZs4SLFVBOdJpB3L19p9-zxxOyqHp9Lk-fOum-vlUa4.mp4?_nc_cat=107&_nc_sid=5e9851&_nc_ht=scontent-dfw5-2.cdninstagram.com&_nc_ohc=eyaMjy3BLs8Q7kNvwFAQ_2h&efg=eyJ2ZW5jb2RlX3RhZyI6Inhwdl9wcm9ncmVzc2l2ZS5JTlNUQUdSQU0uQ0xJUFMuQzMuNzIwLmRhc2hfYmFzZWxpbmVfMV92MSIsInhwdl9hc3NldF9pZCI6MTc3MTU2NjI2MDMyMzQ3NSwiYXNzZXRfYWdlX2RheXMiOjQ2NiwidmlfdXNlY2FzZV9pZCI6MTAwOTksImR1cmF0aW9uX3MiOjQ5LCJ1cmxnZW5fc291cmNlIjoid3d3In0%3D&ccb=17-1&_nc_gid=f8NLMHfSvJHjKW7CNjdR5w&_nc_ss=8&_nc_zt=28&vs=4e62294db6b90ea0&_nc_vs=HBksFQIYQGlnX2VwaGVtZXJhbC82NTRENUM0OTczREYzNDQ0MzFDQTExRDQxRTY0RUI5Rl92aWRlb19kYXNoaW5pdC5tcDQVAALIARIAFQIYRmlnX3hwdl9yZWVsc19wZXJtYW5lbnRfc3JfcHJvZC8xMTYwODk0Nzg1Mzk1ODg1XzgyNDkxMDM2OTY3NjU4NTg4MS5tcDQVAgLIARIAKAAYABsCiAd1c2Vfb2lsATEScHJvZ3Jlc3NpdmVfcmVjaXBlATEVAAAmppKkmt3OpQYVAigCQzMsF0BI7tkWhysCGBJkYXNoX2Jhc2VsaW5lXzFfdjERAHX-B2XmnQEA&oh=00_AfxxoxyLQuVwyz2uioRVM08hneqBb3CfGndyLkviQkDqVw&oe=69BCE6C8"\
      },\
      {\
        "caption": "Podcast out NOW ✨\n\nWe really enjoyed our chat with @michealmartintd \n\n✨telepathy between him and his wife\n✨the ingredients to his perfect salad\n✨book club inspiration \n✨what he REALLY wanted to be when he grew up \n\n#jennyandmaireadnow #whatweknownow #irishpodcasts #friendship #collabrativestudio",\
        "comments": 29,\
        "content_type": "Video",\
        "datetime": "2024-11-13T11:36:18.000Z",\
        "id": "3500373609463083880",\
        "image_url": "https://scontent-dfw5-2.cdninstagram.com/v/t51.2885-15/466773911_17936241830947844_3117143642697548716_n.jpg?stp=dst-jpg_e15_tt6&_nc_ht=scontent-dfw5-2.cdninstagram.com&_nc_cat=108&_nc_oc=Q6cZ2QH-MUSe6C4PkyFc8saG_6IRC_V3hZ9c7StCViUw-zl5K7a2Qh7u0q29i7etbbV1SI4&_nc_ohc=1pwaOyShnGoQ7kNvwGsRorU&_nc_gid=f8NLMHfSvJHjKW7CNjdR5w&edm=AOQ1c0wBAAAA&ccb=7-5&oh=00_AfxMIFfgprmdzKi-AErgzTmN3E-gzqKmuT2QhUQC1TC7NQ&oe=69BCD28B&_nc_sid=8b3546",\
        "is_pinned": false,\
        "likes": 197,\
        "location": {\
          "has_public_page": null,\
          "id": null,\
          "name": null,\
          "slug": null\
        },\
        "post_hashtags": [\
          "jennyandmaireadnow",\
          "whatweknownow",\
          "irishpodcasts",\
          "friendship",\
          "collabrativestudio"\
        ],\
        "url": "https://www.instagram.com/p/DCT00CFMvNo",\
        "video_url": "https://scontent-dfw5-1.cdninstagram.com/o1/v/t2/f2/m367/AQNLvylMFRY6P74zmh9wwvuEJ7rtO-sItj8FJLT2nSb_PeMIpJmOm8SkfRH64lOCNztgBnZpZ-XoKhrc8CItJtQKS1Mut4lfPZFXbj8.mp4?_nc_cat=110&_nc_sid=5e9851&_nc_ht=scontent-dfw5-1.cdninstagram.com&_nc_ohc=qIweWDr6GKEQ7kNvwHO-YZz&efg=eyJ2ZW5jb2RlX3RhZyI6Inhwdl9wcm9ncmVzc2l2ZS5JTlNUQUdSQU0uQ0xJUFMuQzMuNzIwLmRhc2hfYmFzZWxpbmVfMV92MSIsInhwdl9hc3NldF9pZCI6MzkwMzA5NDY3MzI4MjA3MiwiYXNzZXRfYWdlX2RheXMiOjQ4NywidmlfdXNlY2FzZV9pZCI6MTAwOTksImR1cmF0aW9uX3MiOjQzLCJ1cmxnZW5fc291cmNlIjoid3d3In0%3D&ccb=17-1&_nc_gid=f8NLMHfSvJHjKW7CNjdR5w&_nc_ss=8&_nc_zt=28&vs=15624de47fd39130&_nc_vs=HBksFQIYQGlnX2VwaGVtZXJhbC8yOTQ3MDYwMDcyNEI5QTQ4Njk2RDIzNUNCQjZGNzI5MV92aWRlb19kYXNoaW5pdC5tcDQVAALIARIAFQIYR2lnX3hwdl9yZWVsc19wZXJtYW5lbnRfc3JfcHJvZC8xMzIyMTQ3MTEyNDk4NDU0Xzg1NDM2NTk1NDU5NDg0NjEyNjYubXA0FQICyAESACgAGAAbAogHdXNlX29pbAExEnByb2dyZXNzaXZlX3JlY2lwZQExFQAAJrDQtLiB9u4NFQIoAkMzLBdARfMzMzMzMxgSZGFzaF9iYXNlbGluZV8xX3YxEQB1_gdl5p0BAA&oh=00_Afx5DWMCHEDJoObUP3-Lb7Hu9-RkPZteuaVDucxzxkaVtg&oe=69BCD8B3"\
      },\
      {\
        "caption": "🎙️Bit of a different podcast for you this week! \n\nWe sat down with Tánaiste @michealmartintd and asked him ‘What He Knows Now.\n\n✨Life lessons that have got him this far. \n✨Friendships, family & grief\n✨Sea swimming, dry robes & switching off\n\n Full episode drops tomorrow at 6am wherever you get your podcasts. \n\nJ & M\n\nThank you to our sponsor @vhi_ie \n\n#jennyandmaireadnow #lifelessons #dryrobe  #seaswimming",\
        "comments": 25,\
        "content_type": "Video",\
        "datetime": "2024-11-12T22:26:31.000Z",\
        "id": "3499981808361075522",\
        "image_url": "https://scontent-dfw5-2.cdninstagram.com/v/t51.71878-15/466690817_552614564296939_1070270335390837149_n.jpg?stp=dst-jpg_e15_tt6&_nc_ht=scontent-dfw5-2.cdninstagram.com&_nc_cat=107&_nc_oc=Q6cZ2QH-MUSe6C4PkyFc8saG_6IRC_V3hZ9c7StCViUw-zl5K7a2Qh7u0q29i7etbbV1SI4&_nc_ohc=4Pn0CaGAEAwQ7kNvwGgi0OG&_nc_gid=f8NLMHfSvJHjKW7CNjdR5w&edm=AOQ1c0wBAAAA&ccb=7-5&oh=00_Afy31s1gWLZgx-uRpeh_veSBHwycbYIjHaSe6e6ghEjJug&oe=69BCCA2F&_nc_sid=8b3546",\
        "is_pinned": false,\
        "likes": 367,\
        "location": {\
          "has_public_page": null,\
          "id": null,\
          "name": null,\
          "slug": null\
        },\
        "post_hashtags": [\
          "jennyandmaireadnow",\
          "lifelessons",\
          "dryrobe",\
          "seaswimming"\
        ],\
        "url": "https://www.instagram.com/p/DCSbuk3sPNC",\
        "video_url": "https://scontent-dfw6-1.cdninstagram.com/o1/v/t2/f2/m367/AQOQyKg3hXP5Vbemc9YXLsURych3495OTaZ-k5hA5Ud_bPJkecOs-XoiZXj14XHIu3zOfYzZrFmrf4xdztvyIdI8ID29tB2UCIKdGKQ.mp4?_nc_cat=106&_nc_sid=5e9851&_nc_ht=scontent-dfw6-1.cdninstagram.com&_nc_ohc=xQB7AZzudfwQ7kNvwFSfvDS&efg=eyJ2ZW5jb2RlX3RhZyI6Inhwdl9wcm9ncmVzc2l2ZS5JTlNUQUdSQU0uQ0xJUFMuQzMuNDgwLmRhc2hfYmFzZWxpbmVfMV92MSIsInhwdl9hc3NldF9pZCI6MTEwMzM1MzI5Nzg3MDA1NCwiYXNzZXRfYWdlX2RheXMiOjQ4NywidmlfdXNlY2FzZV9pZCI6MTAwOTksImR1cmF0aW9uX3MiOjM2LCJ1cmxnZW5fc291cmNlIjoid3d3In0%3D&ccb=17-1&vs=52ef0882b0559893&_nc_vs=HBksFQIYQGlnX2VwaGVtZXJhbC9BMzQxREExQUVBNTJCQUUzNDNCMUEyNzNCQ0FFMzNCQl92aWRlb19kYXNoaW5pdC5tcDQVAALIARIAFQIYRmlnX3hwdl9yZWVsc19wZXJtYW5lbnRfc3JfcHJvZC80NTE4MzkyMTEzNTQwNTNfMjIyNDI2NDEzOTg0ODkxMDcwOC5tcDQVAgLIARIAKAAYABsCiAd1c2Vfb2lsATEScHJvZ3Jlc3NpdmVfcmVjaXBlATEVAAAmzPOM1s7f9QMVAigCQzMsF0BB92yLQ5WBGBJkYXNoX2Jhc2VsaW5lXzFfdjERAHX-B2XmnQEA&_nc_gid=f8NLMHfSvJHjKW7CNjdR5w&_nc_ss=8&_nc_zt=28&oh=00_Afxh28JyyPy9AVGT2wQv9pVAJuU58mjJPkCKFeb6f4Oh8w&oe=69BCE4E7"\
      },\
      {\
        "caption": "Did a photoshoot with Stan because he’s just back from the hairdressers and looking so floofy and smelling beautiful 😍 I needed to document his clean smelling look as he will be rolling in some dirt/fox smell/ muck very soon 🤪 #dogsofinstagram #goldenretriever",\
        "comments": 12,\
        "content_type": "Carousel",\
        "datetime": "2024-11-12T15:25:04.000Z",\
        "id": "3499769896973330029",\
        "image_url": "https://scontent-dfw5-2.cdninstagram.com/v/t51.29350-15/466995326_990526599761200_5153153982064132557_n.jpg?stp=dst-jpg_e35_p1080x1080_tt6&_nc_ht=scontent-dfw5-2.cdninstagram.com&_nc_cat=104&_nc_oc=Q6cZ2QH-MUSe6C4PkyFc8saG_6IRC_V3hZ9c7StCViUw-zl5K7a2Qh7u0q29i7etbbV1SI4&_nc_ohc=UxLUkZuUog8Q7kNvwEC_RWC&_nc_gid=f8NLMHfSvJHjKW7CNjdR5w&edm=AOQ1c0wBAAAA&ccb=7-5&oh=00_AfyUh-GMDlDzUu9nBtb6d8zt0aKqVnKXwgO24rSu4kLSnw&oe=69BCECBC&_nc_sid=8b3546",\
        "is_pinned": false,\
        "likes": 432,\
        "location": {\
          "has_public_page": null,\
          "id": null,\
          "name": null,\
          "slug": null\
        },\
        "post_hashtags": [\
          "dogsofinstagram",\
          "goldenretriever"\
        ],\
        "url": "https://www.instagram.com/p/DCRri3As2Zt",\
        "video_url": null\
      },\
      {\
        "caption": "Behind the scenes brain melt during podcast recording @jennyandmaireadnow 😆 #irishpodcast #brainmelt",\
        "comments": 5,\
        "content_type": "Video",\
        "datetime": "2024-11-06T13:01:12.000Z",\
        "id": "3495348313982605954",\
        "image_url": "https://scontent-dfw5-1.cdninstagram.com/v/t51.71878-15/504211000_1111075530847029_6819244619431359412_n.jpg?stp=dst-jpg_e15_tt6&_nc_ht=scontent-dfw5-1.cdninstagram.com&_nc_cat=109&_nc_oc=Q6cZ2QH-MUSe6C4PkyFc8saG_6IRC_V3hZ9c7StCViUw-zl5K7a2Qh7u0q29i7etbbV1SI4&_nc_ohc=heyO9GE4JlsQ7kNvwFGOhvN&_nc_gid=f8NLMHfSvJHjKW7CNjdR5w&edm=AOQ1c0wBAAAA&ccb=7-5&oh=00_AfyNVgaEmlBsmZcJ8ZLetflfbX0IbHpSFLa21YNcV-oLoA&oe=69BCE5A5&_nc_sid=8b3546",\
        "is_pinned": false,\
        "likes": 47,\
        "location": {\
          "has_public_page": null,\
          "id": null,\
          "name": null,\
          "slug": null\
        },\
        "post_hashtags": [\
          "irishpodcast",\
          "brainmelt"\
        ],\
        "url": "https://www.instagram.com/p/DCB-MW9MZqC",\
        "video_url": "https://scontent-dfw6-1.cdninstagram.com/o1/v/t2/f2/m367/AQNC9pTSh_sqrA-fhRMmhTUPsv-xrcuqgUEQScc1hUi7SBjj25GcbBoVf_NhjuetkQJhS0LduAJJfqz_Me4Kk3z5CX3qqgUtF3K282A.mp4?_nc_cat=101&_nc_sid=5e9851&_nc_ht=scontent-dfw6-1.cdninstagram.com&_nc_ohc=fKCWP4nLTc4Q7kNvwGRtcmn&efg=eyJ2ZW5jb2RlX3RhZyI6Inhwdl9wcm9ncmVzc2l2ZS5JTlNUQUdSQU0uQ0xJUFMuQzMuNzIwLmRhc2hfYmFzZWxpbmVfMV92MSIsInhwdl9hc3NldF9pZCI6OTY1MDc1OTg4NzgwMzE4LCJhc3NldF9hZ2VfZGF5cyI6NDk0LCJ2aV91c2VjYXNlX2lkIjoxMDA5OSwiZHVyYXRpb25fcyI6MjMsInVybGdlbl9zb3VyY2UiOiJ3d3cifQ%3D%3D&ccb=17-1&_nc_gid=f8NLMHfSvJHjKW7CNjdR5w&_nc_ss=8&_nc_zt=28&vs=ed3daf27ab696a71&_nc_vs=HBksFQIYQGlnX2VwaGVtZXJhbC8xMzQzOTZBRTEyMDg4RDg2MTYzQjIxQkEyMTM0MUVBOV92aWRlb19kYXNoaW5pdC5tcDQVAALIARIAFQIYR2lnX3hwdl9yZWVsc19wZXJtYW5lbnRfc3JfcHJvZC8xMDk1MDkzODgyMTI2MTkyXzg4Njc1NDA2NTc4NDE0MDA5NzMubXA0FQICyAESACgAGAAbAogHdXNlX29pbAExEnByb2dyZXNzaXZlX3JlY2lwZQExFQAAJrzU8Lfo7rYDFQIoAkMzLBdAN7MzMzMzMxgSZGFzaF9iYXNlbGluZV8xX3YxEQB1_gdl5p0BAA&oh=00_AfzX-ow_DcwGwG-N-wJRo2wUhFiBQWG9HH74zasp7_xKdg&oe=69BCE9BA"\
      }\
    ],\
    "profile_image_link": "htt***//s***ten*********cdn*********************885************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************",\
    "profile_url": "htt***//i***agr*********nny************",\
    "profile_name": "Jenny K***y",\
    "highlights_count": 1,\
    "highlights": [\
      {\
        "highlight_url": "https://www.instagram.com/stories/highlights/18026550763647585",\
        "id": "18026550763647585",\
        "image": "https://scontent-atl3-3.cdninstagram.com/v/t51.82787-15/573732645_18127616266495367_3673315206062571981_n.jpg?stp=c0.455.1170.1170a_dst-jpg_e15_s150x150_tt6&_nc_ht=scontent-atl3-3.cdninstagram.com&_nc_cat=111&_nc_oc=Q6cZ2QEE4OreRXzcQ2CqfikRW1dKnGrkuowmELfFxSlLCv0wKApkCk_6Wcbln6C2erPd-Xo&_nc_ohc=pr5PJJAmFYkQ7kNvwGad141&_nc_gid=uQYUd6X3lmUi--ZasXrx5A&edm=AGXveE0BAAAA&ccb=7-5&oh=00_AfxIP7Y-MDVbXrKf1PFIq3qOQemwInWjCDquh1v-Zuc0qQ&oe=69BCC45C&_nc_sid=522435",\
        "owner": "jennykelly1972",\
        "title": "📚"\
      }\
    ],\
    "full_name": "Jenny K***y",\
    "is_private": false,\
    "bio_hashtags": null,\
    "url": "https://www.instagram.com/jennykelly1972/",\
    "is_joined_recently": false,\
    "has_channel": false,\
    "partner_id": "5087052934",\
    "business_address": null,\
    "related_accounts": [],\
    "email_address": "jen***dar***ail******",\
    "external_url_title": {\
      "title": null,\
      "url": null\
    },\
    "pronouns": null\
  }\
]
```

Instagram

# Discover Instagram posts by URL

Copy pageCopy page

Use the Bright Data Web Scraper API to discover Instagram posts by URL. Calls the POST /datasets/v3/scrape endpoint and returns a snapshot ID.

Copy pageCopy page

POST

/

datasets

/

v3

/

scrape

Try it

Discover Instagram posts by URL

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
      "posts_to_not_include": [\
        "<string>"\
      ],\
      "start_date": 123,\
      "end_date": 123,\
      "post_type": "<string>"\
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
            "posts_to_not_include": ["<string>"],\
            "start_date": 123,\
            "end_date": 123,\
            "post_type": "<string>"\
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
        posts_to_not_include: ['<string>'],\
        start_date: 123,\
        end_date: 123,\
        post_type: '<string>'\
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
                'posts_to_not_include' => [\
                                '<string>'\
                ],\
                'start_date' => 123,\
                'end_date' => 123,\
                'post_type' => '<string>'\
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

	payload := strings.NewReader("{\n  \"input\": [\n    {\n      \"url\": \"<string>\",\n      \"num_of_posts\": 123,\n      \"posts_to_not_include\": [\n        \"<string>\"\n      ],\n      \"start_date\": 123,\n      \"end_date\": 123,\n      \"post_type\": \"<string>\"\n    }\n  ]\n}")

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
  .body("{\n  \"input\": [\n    {\n      \"url\": \"<string>\",\n      \"num_of_posts\": 123,\n      \"posts_to_not_include\": [\n        \"<string>\"\n      ],\n      \"start_date\": 123,\n      \"end_date\": 123,\n      \"post_type\": \"<string>\"\n    }\n  ]\n}")
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
request.body = "{\n  \"input\": [\n    {\n      \"url\": \"<string>\",\n      \"num_of_posts\": 123,\n      \"posts_to_not_include\": [\n        \"<string>\"\n      ],\n      \"start_date\": 123,\n      \"end_date\": 123,\n      \"post_type\": \"<string>\"\n    }\n  ]\n}"

response = http.request(request)
puts response.read_body
```

200

```
[\
  {\
    "account": "jen***ell***72",\
    "fbid": "17841405188025881",\
    "id": "5087052934",\
    "followers": 7938,\
    "posts_count": 835,\
    "is_business_account": false,\
    "is_professional_account": false,\
    "is_verified": false,\
    "avg_engagement": 0.0582,\
    "external_url": null,\
    "biography": "Pod: @raydarcydaily \nemail: jenny@darcydaily.com",\
    "business_category_name": null,\
    "category_name": null,\
    "post_hashtags": null,\
    "following": 2520,\
    "posts": [\
      {\
        "caption": "BEING HUMAN - A six part series where Ray chats to 6 well known Irish people about what it means to be human. \n\nFirst episode Wednesday 18th March, and every Wednesday after.\n\nA What Next Production\nPresented by Ray D’Arcy\nProduced by Jenny Kelly\n\n#beinghuman \n#podcast \n#irishpodcast",\
        "comments": 2,\
        "content_type": "Video",\
        "datetime": "2026-03-12T11:52:08.000Z",\
        "id": "3851176228498036124",\
        "image_url": "https://scontent-dfw5-2.cdninstagram.com/v/t51.82787-15/651142041_18334056292172935_8112879477358850984_n.jpg?stp=dst-jpg_e15_tt6&_nc_ht=scontent-dfw5-2.cdninstagram.com&_nc_cat=107&_nc_oc=Q6cZ2QH-MUSe6C4PkyFc8saG_6IRC_V3hZ9c7StCViUw-zl5K7a2Qh7u0q29i7etbbV1SI4&_nc_ohc=W4Jy7OhEd8MQ7kNvwFBSQNv&_nc_gid=f8NLMHfSvJHjKW7CNjdR5w&edm=AOQ1c0wBAAAA&ccb=7-5&oh=00_Afwe_S8Bh8FtoL_RtvxoQ6RF2c20beQzWeLfJfizNBlciQ&oe=69BCEC94&_nc_sid=8b3546",\
        "is_pinned": false,\
        "likes": 36,\
        "location": {\
          "has_public_page": null,\
          "id": null,\
          "name": null,\
          "slug": null\
        },\
        "post_hashtags": [\
          "beinghuman",\
          "podcast",\
          "irishpodcast"\
        ],\
        "url": "https://www.instagram.com/p/DVyIGAbDdWc",\
        "video_url": "https://scontent-dfw6-1.cdninstagram.com/o1/v/t16/f2/m69/AQMSgH9bCDeY_VmVFTYEzrv9RMglEw0prtVd_QFRgC21aFXJ10hPg07pPxQ6VZdxe1vFeVnYABQlz2zcpXVrQqfV.mp4?strext=1&_nc_cat=103&_nc_sid=5e9851&_nc_ht=scontent-dfw6-1.cdninstagram.com&_nc_ohc=F9Tybdk82ZQQ7kNvwGJ2sbT&efg=eyJ2ZW5jb2RlX3RhZyI6Inhwdl9wcm9ncmVzc2l2ZS5JTlNUQUdSQU0uQ0xJUFMuQzMuNDgwLmRhc2hfYmFzZWxpbmVfMV92MSIsInhwdl9hc3NldF9pZCI6MTgzMzQwNTU2MDgxNzI5MzUsImFzc2V0X2FnZV9kYXlzIjozLCJ2aV91c2VjYXNlX2lkIjoxMDA5OSwiZHVyYXRpb25fcyI6MTE3LCJ1cmxnZW5fc291cmNlIjoid3d3In0%3D&ccb=17-1&_nc_gid=f8NLMHfSvJHjKW7CNjdR5w&_nc_ss=8&_nc_zt=28&vs=672fccf82fe0dcbe&_nc_vs=HBksFQIYOnBhc3N0aHJvdWdoX2V2ZXJzdG9yZS9HUGlMdHlhY29GUzFoRFFEQU9udTlRZ1ByVDFKYnNwVEFRQUYVAALIARIAFQIYUWlnX3hwdl9wbGFjZW1lbnRfcGVybWFuZW50X3YyL0E5NEZGMjZCMjU0OTFERkZBNzYzQjU2NDhBOUM5QThGX2F1ZGlvX2Rhc2hpbml0Lm1wNBUCAsgBEgAoABgAGwKIB3VzZV9vaWwBMRJwcm9ncmVzc2l2ZV9yZWNpcGUBMRUAACaOhor9vq6RQRUCKAJDMywXQF1AAAAAAAAYEmRhc2hfYmFzZWxpbmVfMV92MREAdf4HZeadAQA&oh=00_AfyDY32lp2KMgYLDKEK7Wx7ocPFPwwhGkiuWvBKwB_joLg&oe=69BCCEE9"\
      },\
      {\
        "caption": "Our brand new daily podcast is starting tomorrow \n\nRay D’Arcy Daily \n\nWherever you get your podcasts.\n\nEmail us ray@darcydaily.com\n#podcast #irishpodcast",\
        "comments": 86,\
        "content_type": "Video",\
        "datetime": "2026-03-08T16:21:04.000Z",\
        "id": "3848412628930911784",\
        "image_url": "https://scontent-dfw5-1.cdninstagram.com/v/t51.71878-15/649327000_1860456074651243_3014167701283875235_n.jpg?stp=dst-jpg_e15_tt6&_nc_ht=scontent-dfw5-1.cdninstagram.com&_nc_cat=111&_nc_oc=Q6cZ2QH-MUSe6C4PkyFc8saG_6IRC_V3hZ9c7StCViUw-zl5K7a2Qh7u0q29i7etbbV1SI4&_nc_ohc=b0EoQkmauKkQ7kNvwGZzfjq&_nc_gid=f8NLMHfSvJHjKW7CNjdR5w&edm=AOQ1c0wBAAAA&ccb=7-5&oh=00_AfxQfU7Ocg9M26vOgYlA3m4oy4cpmvDY9859u4P35lUqng&oe=69BCEFC3&_nc_sid=8b3546",\
        "is_pinned": false,\
        "likes": 992,\
        "location": {\
          "has_public_page": null,\
          "id": null,\
          "name": null,\
          "slug": null\
        },\
        "post_hashtags": [\
          "podcast",\
          "irishpodcast"\
        ],\
        "url": "https://www.instagram.com/p/DVoTuVwjd4o",\
        "video_url": "https://scontent-dfw5-2.cdninstagram.com/o1/v/t16/f2/m69/AQNqwbuRAKLUvBo_BRm3bnGbIV2EPYfXffZLw2f3swiqVgfVNN31xLUjJYzBUmk31ks69X_8_c7EKmCelHv_buYH.mp4?strext=1&_nc_cat=104&_nc_sid=5e9851&_nc_ht=scontent-dfw5-2.cdninstagram.com&_nc_ohc=iuf2XH_4eaAQ7kNvwGQqv3J&efg=eyJ2ZW5jb2RlX3RhZyI6Inhwdl9wcm9ncmVzc2l2ZS5JTlNUQUdSQU0uQ0xJUFMuQzMuNzIwLmRhc2hfYmFzZWxpbmVfMV92MSIsInhwdl9hc3NldF9pZCI6MTgzMzM2MzkxNzIxNzI5MzUsImFzc2V0X2FnZV9kYXlzIjo3LCJ2aV91c2VjYXNlX2lkIjoxMDA5OSwiZHVyYXRpb25fcyI6NjAsInVybGdlbl9zb3VyY2UiOiJ3d3cifQ%3D%3D&ccb=17-1&_nc_gid=f8NLMHfSvJHjKW7CNjdR5w&_nc_ss=8&_nc_zt=28&vs=ce88cc19b1c12270&_nc_vs=HBksFQIYOnBhc3N0aHJvdWdoX2V2ZXJzdG9yZS9HSVhrcWlhdEZTUTBGLTBFQUNGU2oydVRFWlZ4YnNwVEFRQUYVAALIARIAFQIYUWlnX3hwdl9wbGFjZW1lbnRfcGVybWFuZW50X3YyLzIwNEVCQTgxMTJEMkM2ODRBNzFEREU0RTQwNTBFQThDX2F1ZGlvX2Rhc2hpbml0Lm1wNBUCAsgBEgAoABgAGwKIB3VzZV9vaWwBMRJwcm9ncmVzc2l2ZV9yZWNpcGUBMRUAACaOsuGkoJaRQRUCKAJDMywXQE464UeuFHsYEmRhc2hfYmFzZWxpbmVfMV92MREAdf4HZeadAQA&oh=00_AfzE-98jZ3zhfaRZuLxlWwz5GmrjBpxgERbFaOjPj7UIrw&oe=69BCCCA4"\
      },\
      {\
        "caption": "We have some news! \n\nRAY D’ARCY DAILY - your daily podcast. \n\nThis five day a week show is nothing new, and yet ALL NEW. It’s Monday to Friday with Ray giving his own world view while surrounded by friends of the show, Jenny Kelly (that’s me 🤪), Mairead Ronan and Bernard O’Shea to name a few. \n\nWe hope you’ll join us. \nStarting Monday 9th. \n\nFollow the show now to make sure you never miss an episode. \n\nListen wherever you get your Podcasts #irishpodcast #podcast \n@cocomairead @bernardo.oshea @acast",\
        "comments": 166,\
        "content_type": "Video",\
        "datetime": "2026-03-02T13:25:41.000Z",\
        "id": "3843977898726623596",\
        "image_url": "https://scontent-dfw5-1.cdninstagram.com/v/t51.71878-15/641425914_1446430403853586_8943556578413069821_n.jpg?stp=dst-jpg_e15_tt6&_nc_ht=scontent-dfw5-1.cdninstagram.com&_nc_cat=110&_nc_oc=Q6cZ2QH-MUSe6C4PkyFc8saG_6IRC_V3hZ9c7StCViUw-zl5K7a2Qh7u0q29i7etbbV1SI4&_nc_ohc=j-4QNAsV4yEQ7kNvwEWKOeO&_nc_gid=f8NLMHfSvJHjKW7CNjdR5w&edm=AOQ1c0wBAAAA&ccb=7-5&oh=00_Afy2MQCg7ccEpt8gZNJowsCxi2k7fkX141C5dFU-dvfEfg&oe=69BCC84E&_nc_sid=8b3546",\
        "is_pinned": false,\
        "likes": 1158,\
        "location": {\
          "has_public_page": null,\
          "id": null,\
          "name": null,\
          "slug": null\
        },\
        "post_hashtags": [\
          "irishpodcast",\
          "podcast"\
        ],\
        "url": "https://www.instagram.com/p/DVYjYhaDYls",\
        "video_url": "https://scontent-dfw6-1.cdninstagram.com/o1/v/t16/f2/m69/AQM_D-LpDwCPxPZrnXzoyfkknE8jP_GwRpGwtEvjefP4KUFo7dAEFZ51YD7Nn6-NLnnVLm3sIF5e7jbT_ImFtRri.mp4?strext=1&_nc_cat=103&_nc_sid=5e9851&_nc_ht=scontent-dfw6-1.cdninstagram.com&_nc_ohc=-FdPzVISP18Q7kNvwEcVVkv&efg=eyJ2ZW5jb2RlX3RhZyI6Inhwdl9wcm9ncmVzc2l2ZS5JTlNUQUdSQU0uQ0xJUFMuQzMuNzIwLmRhc2hfYmFzZWxpbmVfMV92MSIsInhwdl9hc3NldF9pZCI6MTgzMzMwNTA3OTExNzI5MzUsImFzc2V0X2FnZV9kYXlzIjoxMywidmlfdXNlY2FzZV9pZCI6MTAwOTksImR1cmF0aW9uX3MiOjE0MSwidXJsZ2VuX3NvdXJjZSI6Ind3dyJ9&ccb=17-1&_nc_gid=f8NLMHfSvJHjKW7CNjdR5w&_nc_ss=8&_nc_zt=28&vs=54251b7443d07334&_nc_vs=HBksFQIYOnBhc3N0aHJvdWdoX2V2ZXJzdG9yZS9HSnlFZHlhaTdRb2U1SmtFQURXYkJFSjd5XzEwYnNwVEFRQUYVAALIARIAFQIYUWlnX3hwdl9wbGFjZW1lbnRfcGVybWFuZW50X3YyLzEyNEU2RjhEQkU4M0NCQ0Y3NEU5Njk2Q0I0NTJDRkIxX2F1ZGlvX2Rhc2hpbml0Lm1wNBUCAsgBEgAoABgAGwKIB3VzZV9vaWwBMRJwcm9ncmVzc2l2ZV9yZWNpcGUBMRUAACaO7fTAgPSQQRUCKAJDMywXQGGqp--dsi0YEmRhc2hfYmFzZWxpbmVfMV92MREAdf4HZeadAQA&oh=00_AfxknzHbQifAj5YoGVzxwXn2cPKeVRcRrdXbooIhlD8ZBQ&oe=69BCDC41"\
      },\
      {\
        "caption": "PODCAST NEWS 📢\n\nAfter 3 years we have made the decision to hang up our ‘Jenny and Mairéad NOW' mics. \n\nWe have LOVED doing it. 💕\n\nWe re-connected with so many listeners from our radio days and got lots of new listeners along the way. We want to thank you for all the laughs and life stories you’ve shared with us. \n\nWe both have new commitments that we are diving into, so for today, we'll say ‘so long for now’ 💫 \n\nLots of love, \nJenny and Mairéad \nXx \n\nPS..leave your lips alone, buy a spray mop and remember… \"you’ll be dead forever”",\
        "comments": 158,\
        "content_type": "Image",\
        "datetime": "2025-09-24T17:50:53.000Z",\
        "id": "3728872417469969396",\
        "image_url": "https://scontent-dfw5-2.cdninstagram.com/v/t51.82787-15/553161422_17973649637947844_5055340064665934469_n.webp?stp=dst-jpg_e35_s1080x1080_sh0.08_tt6&_nc_ht=scontent-dfw5-2.cdninstagram.com&_nc_cat=108&_nc_oc=Q6cZ2QH-MUSe6C4PkyFc8saG_6IRC_V3hZ9c7StCViUw-zl5K7a2Qh7u0q29i7etbbV1SI4&_nc_ohc=0IDMJZLADZgQ7kNvwGBZl2R&_nc_gid=f8NLMHfSvJHjKW7CNjdR5w&edm=AOQ1c0wBAAAA&ccb=7-5&oh=00_AfxVGERnGo1gjS9N7F4Hvi14Ek0zIbXq_m_2vnk8p1c0mQ&oe=69BCDBC8&_nc_sid=8b3546",\
        "is_pinned": false,\
        "likes": 1572,\
        "location": {\
          "has_public_page": null,\
          "id": null,\
          "name": null,\
          "slug": null\
        },\
        "post_hashtags": null,\
        "url": "https://www.instagram.com/p/DO_nbUQDLP0",\
        "video_url": null\
      },\
      {\
        "caption": "I COULD have been a camogie player (never played in my life 🤣), and @cocomairead COULD have been a pop star … what COULD you have been? \n\nPodcast out tomorrow 6am #irishpodcast #podcast #jennyandmaireadnow",\
        "comments": null,\
        "content_type": "Video",\
        "datetime": "2025-04-29T21:44:06.000Z",\
        "id": "3621719997521697568",\
        "image_url": "https://scontent-dfw6-1.cdninstagram.com/v/t51.71878-15/491461907_976222424658362_5118993394906495251_n.jpg?stp=dst-jpg_e15_tt6&_nc_ht=scontent-dfw6-1.cdninstagram.com&_nc_cat=102&_nc_oc=Q6cZ2QH-MUSe6C4PkyFc8saG_6IRC_V3hZ9c7StCViUw-zl5K7a2Qh7u0q29i7etbbV1SI4&_nc_ohc=fdEBmapVjIYQ7kNvwH9d2ns&_nc_gid=f8NLMHfSvJHjKW7CNjdR5w&edm=AOQ1c0wBAAAA&ccb=7-5&oh=00_Afz4h2HLZTuYioO61W7aDIMzXCHL34Tv_SD_q5TYfJ99iA&oe=69BCBEDC&_nc_sid=8b3546",\
        "is_pinned": false,\
        "likes": 62,\
        "location": {\
          "has_public_page": null,\
          "id": null,\
          "name": null,\
          "slug": null\
        },\
        "post_hashtags": [\
          "irishpodcast",\
          "podcast",\
          "jennyandmaireadnow"\
        ],\
        "url": "https://www.instagram.com/p/DJC7yYoNZsg",\
        "video_url": "https://scontent-dfw5-2.cdninstagram.com/o1/v/t2/f2/m367/AQNdTe3n8U7HJAUZPYQ2IKytrTScEjIa2LVv7p-gcs7bfH2WDHkU1GuQ63tg4BxPEIFCVKgn-k9soAiz09MH_R_ORdQFWDf5N2MPRLY.mp4?_nc_cat=104&_nc_sid=5e9851&_nc_ht=scontent-dfw5-2.cdninstagram.com&_nc_ohc=Syer777RuQMQ7kNvwEmKdhm&efg=eyJ2ZW5jb2RlX3RhZyI6Inhwdl9wcm9ncmVzc2l2ZS5JTlNUQUdSQU0uQ0xJUFMuQzMuNDgwLmRhc2hfYmFzZWxpbmVfMV92MSIsInhwdl9hc3NldF9pZCI6MTU5NDc3ODcyNzg2ODYyNywiYXNzZXRfYWdlX2RheXMiOjMxOSwidmlfdXNlY2FzZV9pZCI6MTAwOTksImR1cmF0aW9uX3MiOjY5LCJ1cmxnZW5fc291cmNlIjoid3d3In0%3D&ccb=17-1&_nc_gid=f8NLMHfSvJHjKW7CNjdR5w&_nc_ss=8&_nc_zt=28&vs=1d3eb966c62b0ed0&_nc_vs=HBksFQIYQGlnX2VwaGVtZXJhbC8zMTRBRkNEOTM4NTM5NjI2MzhBMUQwQ0QxNDk2QzE4QV92aWRlb19kYXNoaW5pdC5tcDQVAALIARIAFQIYRmlnX3hwdl9yZWVsc19wZXJtYW5lbnRfc3JfcHJvZC8xMjE3ODU0OTYzMjg1ODY0Xzk0ODMzNjE1ODI3NjU5Njg3OC5tcDQVAgLIARIAKAAYABsCiAd1c2Vfb2lsATEScHJvZ3Jlc3NpdmVfcmVjaXBlATEVAAAmpqOPuauc1QUVAigCQzMsF0BRUQYk3S8bGBJkYXNoX2Jhc2VsaW5lXzFfdjERAHX-B2XmnQEA&oh=00_AfxYnVqq-YPFAKEW8CVj-CJBIvyL0qQSOxuzTNCksnr_Sg&oe=69BCE24D"\
      },\
      {\
        "caption": "Podcast @jennyandmaireadnow out tomorrow 6am \n\n✨Mairead needs help\n✨Netflix Doc: Buy Now!\n✨2025 Manifesto\n✨Colour and word of the year \n✨Debutant Balls and Feis\n\nThanks to our sponsor @vhi_ie \n#irishpodcast #podcast #friendship",\
        "comments": null,\
        "content_type": "Video",\
        "datetime": "2024-12-10T21:36:11.000Z",\
        "id": "3520245279648780747",\
        "image_url": "https://scontent-dfw5-2.cdninstagram.com/v/t51.2885-15/469729187_18286176577172935_8198072792922023263_n.jpg?stp=dst-jpg_e15_tt6&_nc_ht=scontent-dfw5-2.cdninstagram.com&_nc_cat=107&_nc_oc=Q6cZ2QH-MUSe6C4PkyFc8saG_6IRC_V3hZ9c7StCViUw-zl5K7a2Qh7u0q29i7etbbV1SI4&_nc_ohc=skhiJmD75-kQ7kNvwEeKZA6&_nc_gid=f8NLMHfSvJHjKW7CNjdR5w&edm=AOQ1c0wBAAAA&ccb=7-5&oh=00_AfzWsdPI0aqqm2_IHDtzlIqHu2mL76RyRwvUBMetthP-hg&oe=69BCCDF6&_nc_sid=8b3546",\
        "is_pinned": false,\
        "likes": 64,\
        "location": {\
          "has_public_page": null,\
          "id": null,\
          "name": null,\
          "slug": null\
        },\
        "post_hashtags": [\
          "irishpodcast",\
          "podcast",\
          "friendship"\
        ],\
        "url": "https://www.instagram.com/p/DDabG5HthHL",\
        "video_url": "https://scontent-dfw5-1.cdninstagram.com/o1/v/t2/f2/m367/AQMy1Odi0RhpjgXggsSeeNNxmcDcNt0_X6IYxlCD21k4z4h46ndGKxoNjJIRjVg94CuujC1j-CiG89HT8-O9C-XPAl_3C_7p3GqzZ5M.mp4?_nc_cat=109&_nc_sid=5e9851&_nc_ht=scontent-dfw5-1.cdninstagram.com&_nc_ohc=zEKeRBdP2mAQ7kNvwENzKpk&efg=eyJ2ZW5jb2RlX3RhZyI6Inhwdl9wcm9ncmVzc2l2ZS5JTlNUQUdSQU0uQ0xJUFMuQzMuNzIwLmRhc2hfYmFzZWxpbmVfMV92MSIsInhwdl9hc3NldF9pZCI6MTIzMzY5MjkwNzcxNjE1MSwiYXNzZXRfYWdlX2RheXMiOjQ1OSwidmlfdXNlY2FzZV9pZCI6MTAwOTksImR1cmF0aW9uX3MiOjUxLCJ1cmxnZW5fc291cmNlIjoid3d3In0%3D&ccb=17-1&_nc_gid=f8NLMHfSvJHjKW7CNjdR5w&_nc_ss=8&_nc_zt=28&vs=be7ed278cb04ea95&_nc_vs=HBksFQIYQGlnX2VwaGVtZXJhbC9BQjQyNThCNTU0QTJGNEIxODg3NjlBQUJFMDNDMzU4Q192aWRlb19kYXNoaW5pdC5tcDQVAALIARIAFQIYRmlnX3hwdl9yZWVsc19wZXJtYW5lbnRfc3JfcHJvZC8xNTAyMTIxNTUwNzQwNjE0Xzc5ODkxODI2NzE3NDU1MDEwNy5tcDQVAgLIARIAKAAYABsCiAd1c2Vfb2lsATEScHJvZ3Jlc3NpdmVfcmVjaXBlATEVAAAm7vi1uLCCsQQVAigCQzMsF0BJmZmZmZmaGBJkYXNoX2Jhc2VsaW5lXzFfdjERAHX-B2XmnQEA&oh=00_Afzvy10txzkdt9h08tJs_9VMlJicQjSggsPEZ61LEdGYmA&oe=69BCC63E"\
      },\
      {\
        "caption": "This book took me a few weeks to read and it’s only 136 pages long. I could quite easily go back now and start it all over again. One of the most beautiful books I’ve read. It tells the story of 24 hours in the lives of 6 astronauts on the international space station. Each of the 16 chapters takes in one orbit of earth. It’s difficult to describe just how profound and touching this small book is. A love letter to Earth. It made me feel both sad and hopeful at the same time. I read that the author Samantha Harvey stopped writing half way through because she felt she didn’t have the right to write a book like this, so removed was it from her real life. I’m so glad she ignored that voice in her head because this book is something we will read for years and years to come. Stunning.",\
        "comments": 6,\
        "content_type": "Image",\
        "datetime": "2024-12-04T19:34:23.000Z",\
        "id": "3515840447256809542",\
        "image_url": "https://scontent-dfw6-1.cdninstagram.com/v/t51.82787-15/623407206_17991231980916798_8528601805505725054_n.jpg?stp=dst-jpg_e35_p1080x1080_sh0.08_tt6&_nc_ht=scontent-dfw6-1.cdninstagram.com&_nc_cat=106&_nc_oc=Q6cZ2QH-MUSe6C4PkyFc8saG_6IRC_V3hZ9c7StCViUw-zl5K7a2Qh7u0q29i7etbbV1SI4&_nc_ohc=1jkbYPze7PIQ7kNvwFhqTAc&_nc_gid=f8NLMHfSvJHjKW7CNjdR5w&edm=AOQ1c0wBAAAA&ccb=7-5&oh=00_Afzg1e_fEK30evjHAzSP597UW_USGzLTBIj1k-EIjQQMfA&oe=69BCCA41&_nc_sid=8b3546",\
        "is_pinned": false,\
        "likes": 109,\
        "location": {\
          "has_public_page": null,\
          "id": null,\
          "name": null,\
          "slug": null\
        },\
        "post_hashtags": null,\
        "url": "https://www.instagram.com/p/DDKxkJRsVBG",\
        "video_url": null\
      },\
      {\
        "caption": "Pod out Wednesday 6am\n\n✨Kissing 💋\n✨Christmas Movies 🎬\n✨family traditions 🏡\n✨Nits 🦗\n\nThanks to our sponsor @vhi_ie",\
        "comments": 1,\
        "content_type": "Video",\
        "datetime": "2024-12-03T21:00:59.000Z",\
        "id": "3515158122554635287",\
        "image_url": "https://scontent-dfw5-2.cdninstagram.com/v/t51.71878-15/503975082_1908008223345944_5512368651421990898_n.jpg?stp=dst-jpg_e15_tt6&_nc_ht=scontent-dfw5-2.cdninstagram.com&_nc_cat=108&_nc_oc=Q6cZ2QH-MUSe6C4PkyFc8saG_6IRC_V3hZ9c7StCViUw-zl5K7a2Qh7u0q29i7etbbV1SI4&_nc_ohc=LBreF5ALN2IQ7kNvwE_RtAb&_nc_gid=f8NLMHfSvJHjKW7CNjdR5w&edm=AOQ1c0wBAAAA&ccb=7-5&oh=00_AfzmTzT-OfgwVOhOYS62CUgEdWcUX2YsW20KyaTEXiv3Gg&oe=69BCD350&_nc_sid=8b3546",\
        "is_pinned": false,\
        "likes": 27,\
        "location": {\
          "has_public_page": null,\
          "id": null,\
          "name": null,\
          "slug": null\
        },\
        "post_hashtags": null,\
        "url": "https://www.instagram.com/p/DDIWbA4MrQX",\
        "video_url": "https://scontent-dfw5-2.cdninstagram.com/o1/v/t2/f2/m367/AQNO52R4NspLq6_HyhxNcCLUQtKiP7dXhYXNEIO3IjvmzKdyZMS_YYgB2zRkbZs4SLFVBOdJpB3L19p9-zxxOyqHp9Lk-fOum-vlUa4.mp4?_nc_cat=107&_nc_sid=5e9851&_nc_ht=scontent-dfw5-2.cdninstagram.com&_nc_ohc=eyaMjy3BLs8Q7kNvwFAQ_2h&efg=eyJ2ZW5jb2RlX3RhZyI6Inhwdl9wcm9ncmVzc2l2ZS5JTlNUQUdSQU0uQ0xJUFMuQzMuNzIwLmRhc2hfYmFzZWxpbmVfMV92MSIsInhwdl9hc3NldF9pZCI6MTc3MTU2NjI2MDMyMzQ3NSwiYXNzZXRfYWdlX2RheXMiOjQ2NiwidmlfdXNlY2FzZV9pZCI6MTAwOTksImR1cmF0aW9uX3MiOjQ5LCJ1cmxnZW5fc291cmNlIjoid3d3In0%3D&ccb=17-1&_nc_gid=f8NLMHfSvJHjKW7CNjdR5w&_nc_ss=8&_nc_zt=28&vs=4e62294db6b90ea0&_nc_vs=HBksFQIYQGlnX2VwaGVtZXJhbC82NTRENUM0OTczREYzNDQ0MzFDQTExRDQxRTY0RUI5Rl92aWRlb19kYXNoaW5pdC5tcDQVAALIARIAFQIYRmlnX3hwdl9yZWVsc19wZXJtYW5lbnRfc3JfcHJvZC8xMTYwODk0Nzg1Mzk1ODg1XzgyNDkxMDM2OTY3NjU4NTg4MS5tcDQVAgLIARIAKAAYABsCiAd1c2Vfb2lsATEScHJvZ3Jlc3NpdmVfcmVjaXBlATEVAAAmppKkmt3OpQYVAigCQzMsF0BI7tkWhysCGBJkYXNoX2Jhc2VsaW5lXzFfdjERAHX-B2XmnQEA&oh=00_AfxxoxyLQuVwyz2uioRVM08hneqBb3CfGndyLkviQkDqVw&oe=69BCE6C8"\
      },\
      {\
        "caption": "Podcast out NOW ✨\n\nWe really enjoyed our chat with @michealmartintd \n\n✨telepathy between him and his wife\n✨the ingredients to his perfect salad\n✨book club inspiration \n✨what he REALLY wanted to be when he grew up \n\n#jennyandmaireadnow #whatweknownow #irishpodcasts #friendship #collabrativestudio",\
        "comments": 29,\
        "content_type": "Video",\
        "datetime": "2024-11-13T11:36:18.000Z",\
        "id": "3500373609463083880",\
        "image_url": "https://scontent-dfw5-2.cdninstagram.com/v/t51.2885-15/466773911_17936241830947844_3117143642697548716_n.jpg?stp=dst-jpg_e15_tt6&_nc_ht=scontent-dfw5-2.cdninstagram.com&_nc_cat=108&_nc_oc=Q6cZ2QH-MUSe6C4PkyFc8saG_6IRC_V3hZ9c7StCViUw-zl5K7a2Qh7u0q29i7etbbV1SI4&_nc_ohc=1pwaOyShnGoQ7kNvwGsRorU&_nc_gid=f8NLMHfSvJHjKW7CNjdR5w&edm=AOQ1c0wBAAAA&ccb=7-5&oh=00_AfxMIFfgprmdzKi-AErgzTmN3E-gzqKmuT2QhUQC1TC7NQ&oe=69BCD28B&_nc_sid=8b3546",\
        "is_pinned": false,\
        "likes": 197,\
        "location": {\
          "has_public_page": null,\
          "id": null,\
          "name": null,\
          "slug": null\
        },\
        "post_hashtags": [\
          "jennyandmaireadnow",\
          "whatweknownow",\
          "irishpodcasts",\
          "friendship",\
          "collabrativestudio"\
        ],\
        "url": "https://www.instagram.com/p/DCT00CFMvNo",\
        "video_url": "https://scontent-dfw5-1.cdninstagram.com/o1/v/t2/f2/m367/AQNLvylMFRY6P74zmh9wwvuEJ7rtO-sItj8FJLT2nSb_PeMIpJmOm8SkfRH64lOCNztgBnZpZ-XoKhrc8CItJtQKS1Mut4lfPZFXbj8.mp4?_nc_cat=110&_nc_sid=5e9851&_nc_ht=scontent-dfw5-1.cdninstagram.com&_nc_ohc=qIweWDr6GKEQ7kNvwHO-YZz&efg=eyJ2ZW5jb2RlX3RhZyI6Inhwdl9wcm9ncmVzc2l2ZS5JTlNUQUdSQU0uQ0xJUFMuQzMuNzIwLmRhc2hfYmFzZWxpbmVfMV92MSIsInhwdl9hc3NldF9pZCI6MzkwMzA5NDY3MzI4MjA3MiwiYXNzZXRfYWdlX2RheXMiOjQ4NywidmlfdXNlY2FzZV9pZCI6MTAwOTksImR1cmF0aW9uX3MiOjQzLCJ1cmxnZW5fc291cmNlIjoid3d3In0%3D&ccb=17-1&_nc_gid=f8NLMHfSvJHjKW7CNjdR5w&_nc_ss=8&_nc_zt=28&vs=15624de47fd39130&_nc_vs=HBksFQIYQGlnX2VwaGVtZXJhbC8yOTQ3MDYwMDcyNEI5QTQ4Njk2RDIzNUNCQjZGNzI5MV92aWRlb19kYXNoaW5pdC5tcDQVAALIARIAFQIYR2lnX3hwdl9yZWVsc19wZXJtYW5lbnRfc3JfcHJvZC8xMzIyMTQ3MTEyNDk4NDU0Xzg1NDM2NTk1NDU5NDg0NjEyNjYubXA0FQICyAESACgAGAAbAogHdXNlX29pbAExEnByb2dyZXNzaXZlX3JlY2lwZQExFQAAJrDQtLiB9u4NFQIoAkMzLBdARfMzMzMzMxgSZGFzaF9iYXNlbGluZV8xX3YxEQB1_gdl5p0BAA&oh=00_Afx5DWMCHEDJoObUP3-Lb7Hu9-RkPZteuaVDucxzxkaVtg&oe=69BCD8B3"\
      },\
      {\
        "caption": "🎙️Bit of a different podcast for you this week! \n\nWe sat down with Tánaiste @michealmartintd and asked him ‘What He Knows Now.\n\n✨Life lessons that have got him this far. \n✨Friendships, family & grief\n✨Sea swimming, dry robes & switching off\n\n Full episode drops tomorrow at 6am wherever you get your podcasts. \n\nJ & M\n\nThank you to our sponsor @vhi_ie \n\n#jennyandmaireadnow #lifelessons #dryrobe  #seaswimming",\
        "comments": 25,\
        "content_type": "Video",\
        "datetime": "2024-11-12T22:26:31.000Z",\
        "id": "3499981808361075522",\
        "image_url": "https://scontent-dfw5-2.cdninstagram.com/v/t51.71878-15/466690817_552614564296939_1070270335390837149_n.jpg?stp=dst-jpg_e15_tt6&_nc_ht=scontent-dfw5-2.cdninstagram.com&_nc_cat=107&_nc_oc=Q6cZ2QH-MUSe6C4PkyFc8saG_6IRC_V3hZ9c7StCViUw-zl5K7a2Qh7u0q29i7etbbV1SI4&_nc_ohc=4Pn0CaGAEAwQ7kNvwGgi0OG&_nc_gid=f8NLMHfSvJHjKW7CNjdR5w&edm=AOQ1c0wBAAAA&ccb=7-5&oh=00_Afy31s1gWLZgx-uRpeh_veSBHwycbYIjHaSe6e6ghEjJug&oe=69BCCA2F&_nc_sid=8b3546",\
        "is_pinned": false,\
        "likes": 367,\
        "location": {\
          "has_public_page": null,\
          "id": null,\
          "name": null,\
          "slug": null\
        },\
        "post_hashtags": [\
          "jennyandmaireadnow",\
          "lifelessons",\
          "dryrobe",\
          "seaswimming"\
        ],\
        "url": "https://www.instagram.com/p/DCSbuk3sPNC",\
        "video_url": "https://scontent-dfw6-1.cdninstagram.com/o1/v/t2/f2/m367/AQOQyKg3hXP5Vbemc9YXLsURych3495OTaZ-k5hA5Ud_bPJkecOs-XoiZXj14XHIu3zOfYzZrFmrf4xdztvyIdI8ID29tB2UCIKdGKQ.mp4?_nc_cat=106&_nc_sid=5e9851&_nc_ht=scontent-dfw6-1.cdninstagram.com&_nc_ohc=xQB7AZzudfwQ7kNvwFSfvDS&efg=eyJ2ZW5jb2RlX3RhZyI6Inhwdl9wcm9ncmVzc2l2ZS5JTlNUQUdSQU0uQ0xJUFMuQzMuNDgwLmRhc2hfYmFzZWxpbmVfMV92MSIsInhwdl9hc3NldF9pZCI6MTEwMzM1MzI5Nzg3MDA1NCwiYXNzZXRfYWdlX2RheXMiOjQ4NywidmlfdXNlY2FzZV9pZCI6MTAwOTksImR1cmF0aW9uX3MiOjM2LCJ1cmxnZW5fc291cmNlIjoid3d3In0%3D&ccb=17-1&vs=52ef0882b0559893&_nc_vs=HBksFQIYQGlnX2VwaGVtZXJhbC9BMzQxREExQUVBNTJCQUUzNDNCMUEyNzNCQ0FFMzNCQl92aWRlb19kYXNoaW5pdC5tcDQVAALIARIAFQIYRmlnX3hwdl9yZWVsc19wZXJtYW5lbnRfc3JfcHJvZC80NTE4MzkyMTEzNTQwNTNfMjIyNDI2NDEzOTg0ODkxMDcwOC5tcDQVAgLIARIAKAAYABsCiAd1c2Vfb2lsATEScHJvZ3Jlc3NpdmVfcmVjaXBlATEVAAAmzPOM1s7f9QMVAigCQzMsF0BB92yLQ5WBGBJkYXNoX2Jhc2VsaW5lXzFfdjERAHX-B2XmnQEA&_nc_gid=f8NLMHfSvJHjKW7CNjdR5w&_nc_ss=8&_nc_zt=28&oh=00_Afxh28JyyPy9AVGT2wQv9pVAJuU58mjJPkCKFeb6f4Oh8w&oe=69BCE4E7"\
      },\
      {\
        "caption": "Did a photoshoot with Stan because he’s just back from the hairdressers and looking so floofy and smelling beautiful 😍 I needed to document his clean smelling look as he will be rolling in some dirt/fox smell/ muck very soon 🤪 #dogsofinstagram #goldenretriever",\
        "comments": 12,\
        "content_type": "Carousel",\
        "datetime": "2024-11-12T15:25:04.000Z",\
        "id": "3499769896973330029",\
        "image_url": "https://scontent-dfw5-2.cdninstagram.com/v/t51.29350-15/466995326_990526599761200_5153153982064132557_n.jpg?stp=dst-jpg_e35_p1080x1080_tt6&_nc_ht=scontent-dfw5-2.cdninstagram.com&_nc_cat=104&_nc_oc=Q6cZ2QH-MUSe6C4PkyFc8saG_6IRC_V3hZ9c7StCViUw-zl5K7a2Qh7u0q29i7etbbV1SI4&_nc_ohc=UxLUkZuUog8Q7kNvwEC_RWC&_nc_gid=f8NLMHfSvJHjKW7CNjdR5w&edm=AOQ1c0wBAAAA&ccb=7-5&oh=00_AfyUh-GMDlDzUu9nBtb6d8zt0aKqVnKXwgO24rSu4kLSnw&oe=69BCECBC&_nc_sid=8b3546",\
        "is_pinned": false,\
        "likes": 432,\
        "location": {\
          "has_public_page": null,\
          "id": null,\
          "name": null,\
          "slug": null\
        },\
        "post_hashtags": [\
          "dogsofinstagram",\
          "goldenretriever"\
        ],\
        "url": "https://www.instagram.com/p/DCRri3As2Zt",\
        "video_url": null\
      },\
      {\
        "caption": "Behind the scenes brain melt during podcast recording @jennyandmaireadnow 😆 #irishpodcast #brainmelt",\
        "comments": 5,\
        "content_type": "Video",\
        "datetime": "2024-11-06T13:01:12.000Z",\
        "id": "3495348313982605954",\
        "image_url": "https://scontent-dfw5-1.cdninstagram.com/v/t51.71878-15/504211000_1111075530847029_6819244619431359412_n.jpg?stp=dst-jpg_e15_tt6&_nc_ht=scontent-dfw5-1.cdninstagram.com&_nc_cat=109&_nc_oc=Q6cZ2QH-MUSe6C4PkyFc8saG_6IRC_V3hZ9c7StCViUw-zl5K7a2Qh7u0q29i7etbbV1SI4&_nc_ohc=heyO9GE4JlsQ7kNvwFGOhvN&_nc_gid=f8NLMHfSvJHjKW7CNjdR5w&edm=AOQ1c0wBAAAA&ccb=7-5&oh=00_AfyNVgaEmlBsmZcJ8ZLetflfbX0IbHpSFLa21YNcV-oLoA&oe=69BCE5A5&_nc_sid=8b3546",\
        "is_pinned": false,\
        "likes": 47,\
        "location": {\
          "has_public_page": null,\
          "id": null,\
          "name": null,\
          "slug": null\
        },\
        "post_hashtags": [\
          "irishpodcast",\
          "brainmelt"\
        ],\
        "url": "https://www.instagram.com/p/DCB-MW9MZqC",\
        "video_url": "https://scontent-dfw6-1.cdninstagram.com/o1/v/t2/f2/m367/AQNC9pTSh_sqrA-fhRMmhTUPsv-xrcuqgUEQScc1hUi7SBjj25GcbBoVf_NhjuetkQJhS0LduAJJfqz_Me4Kk3z5CX3qqgUtF3K282A.mp4?_nc_cat=101&_nc_sid=5e9851&_nc_ht=scontent-dfw6-1.cdninstagram.com&_nc_ohc=fKCWP4nLTc4Q7kNvwGRtcmn&efg=eyJ2ZW5jb2RlX3RhZyI6Inhwdl9wcm9ncmVzc2l2ZS5JTlNUQUdSQU0uQ0xJUFMuQzMuNzIwLmRhc2hfYmFzZWxpbmVfMV92MSIsInhwdl9hc3NldF9pZCI6OTY1MDc1OTg4NzgwMzE4LCJhc3NldF9hZ2VfZGF5cyI6NDk0LCJ2aV91c2VjYXNlX2lkIjoxMDA5OSwiZHVyYXRpb25fcyI6MjMsInVybGdlbl9zb3VyY2UiOiJ3d3cifQ%3D%3D&ccb=17-1&_nc_gid=f8NLMHfSvJHjKW7CNjdR5w&_nc_ss=8&_nc_zt=28&vs=ed3daf27ab696a71&_nc_vs=HBksFQIYQGlnX2VwaGVtZXJhbC8xMzQzOTZBRTEyMDg4RDg2MTYzQjIxQkEyMTM0MUVBOV92aWRlb19kYXNoaW5pdC5tcDQVAALIARIAFQIYR2lnX3hwdl9yZWVsc19wZXJtYW5lbnRfc3JfcHJvZC8xMDk1MDkzODgyMTI2MTkyXzg4Njc1NDA2NTc4NDE0MDA5NzMubXA0FQICyAESACgAGAAbAogHdXNlX29pbAExEnByb2dyZXNzaXZlX3JlY2lwZQExFQAAJrzU8Lfo7rYDFQIoAkMzLBdAN7MzMzMzMxgSZGFzaF9iYXNlbGluZV8xX3YxEQB1_gdl5p0BAA&oh=00_AfzX-ow_DcwGwG-N-wJRo2wUhFiBQWG9HH74zasp7_xKdg&oe=69BCE9BA"\
      }\
    ],\
    "profile_image_link": "htt***//s***ten*********cdn*********************885************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************",\
    "profile_url": "htt***//i***agr*********nny************",\
    "profile_name": "Jenny K***y",\
    "highlights_count": 1,\
    "highlights": [\
      {\
        "highlight_url": "https://www.instagram.com/stories/highlights/18026550763647585",\
        "id": "18026550763647585",\
        "image": "https://scontent-atl3-3.cdninstagram.com/v/t51.82787-15/573732645_18127616266495367_3673315206062571981_n.jpg?stp=c0.455.1170.1170a_dst-jpg_e15_s150x150_tt6&_nc_ht=scontent-atl3-3.cdninstagram.com&_nc_cat=111&_nc_oc=Q6cZ2QEE4OreRXzcQ2CqfikRW1dKnGrkuowmELfFxSlLCv0wKApkCk_6Wcbln6C2erPd-Xo&_nc_ohc=pr5PJJAmFYkQ7kNvwGad141&_nc_gid=uQYUd6X3lmUi--ZasXrx5A&edm=AGXveE0BAAAA&ccb=7-5&oh=00_AfxIP7Y-MDVbXrKf1PFIq3qOQemwInWjCDquh1v-Zuc0qQ&oe=69BCC45C&_nc_sid=522435",\
        "owner": "jennykelly1972",\
        "title": "📚"\
      }\
    ],\
    "full_name": "Jenny K***y",\
    "is_private": false,\
    "bio_hashtags": null,\
    "url": "https://www.instagram.com/jennykelly1972/",\
    "is_joined_recently": false,\
    "has_channel": false,\
    "partner_id": "5087052934",\
    "business_address": null,\
    "related_accounts": [],\
    "email_address": "jen***dar***ail******",\
    "external_url_title": {\
      "title": null,\
      "url": null\
    },\
    "pronouns": null\
  }\
]
```

## [​](https://docs.brightdata.com/api-reference/scrapers/social-media-apis/instagram-posts-discover-by-url\#query-parameters)  Query Parameters

[​](https://docs.brightdata.com/api-reference/scrapers/social-media-apis/instagram-posts-discover-by-url#param-dataset-id)

dataset\_id

string

default:"gd\_lk5ns7kz21pck8jpis"

required

The dataset ID used for this request.

Must be set to `gd_lk5ns7kz21pck8jpis` to collect **Discover by URL** data.

[​](https://docs.brightdata.com/api-reference/scrapers/social-media-apis/instagram-posts-discover-by-url#param-type)

type

string

default:"discover\_new"

Must be set to `discover_new`.

[​](https://docs.brightdata.com/api-reference/scrapers/social-media-apis/instagram-posts-discover-by-url#param-discover-by)

discover\_by

string

default:"url"

Must be set to `url`.

[​](https://docs.brightdata.com/api-reference/scrapers/social-media-apis/instagram-posts-discover-by-url#param-notify)

notify

boolean

default:false

Whether to send notifications when the request is completed.

[​](https://docs.brightdata.com/api-reference/scrapers/social-media-apis/instagram-posts-discover-by-url#param-include-errors)

include\_errors

boolean

default:true

Whether to include errors in the response.

## [​](https://docs.brightdata.com/api-reference/scrapers/social-media-apis/instagram-posts-discover-by-url\#request-body)  Request Body

[​](https://docs.brightdata.com/api-reference/scrapers/social-media-apis/instagram-posts-discover-by-url#param-input)

input

object\[\]

required

An array of input objects.

Show properties

[​](https://docs.brightdata.com/api-reference/scrapers/social-media-apis/instagram-posts-discover-by-url#param-url)

url

string

required

The URL of the Instagram profile.

[​](https://docs.brightdata.com/api-reference/scrapers/social-media-apis/instagram-posts-discover-by-url#param-num-of-posts)

num\_of\_posts

number

The number of recent posts to collect, missing value indicates no limit.

[​](https://docs.brightdata.com/api-reference/scrapers/social-media-apis/instagram-posts-discover-by-url#param-posts-to-not-include)

posts\_to\_not\_include

string\[\]

Post IDs not to include

[​](https://docs.brightdata.com/api-reference/scrapers/social-media-apis/instagram-posts-discover-by-url#param-start-date)

start\_date

integer

Start date filter `MM-DD-YYYY` (should be earlier than “end\_date”)

[​](https://docs.brightdata.com/api-reference/scrapers/social-media-apis/instagram-posts-discover-by-url#param-end-date)

end\_date

integer

End date filter `MM-DD-YYYY` (should be later than “start\_date”)

[​](https://docs.brightdata.com/api-reference/scrapers/social-media-apis/instagram-posts-discover-by-url#param-post-type)

post\_type

string

Posts to collect by type.One of: `post`, `reel`

#### [​](https://docs.brightdata.com/api-reference/scrapers/social-media-apis/instagram-posts-discover-by-url\#example)  Example

```
{
  "input": [\
    {\
      "url": "https://www.instagram.com/marcusfaberfdp",\
      "num_of_posts": 10,\
      "start_date": "01-01-2025",\
      "end_date": "03-01-2025",\
      "post_type": "Post"\
    },\
    {\
      "url": "https://www.instagram.com/meta/",\
      "num_of_posts": "",\
      "posts_to_not_include": [\
        "3529568342229145484"\
      ],\
      "start_date": "03-01-2025",\
      "end_date": "03-17-2025",\
      "post_type": "Reel"\
    },\
    {\
      "url": "https://instagram.com/tips_-_-_",\
      "start_date": "",\
      "end_date": "",\
      "post_type": ""\
    },\
    {\
      "url": "https://www.instagram.com/_blakegreiner_/",\
      "start_date": "",\
      "end_date": "",\
      "post_type": ""\
    }\
  ]
}
```

## [​](https://docs.brightdata.com/api-reference/scrapers/social-media-apis/instagram-posts-discover-by-url\#response)  Response

Was this page helpful?

YesNo

[Posts - Collect by URL](https://docs.brightdata.com/api-reference/scrapers/social-media-apis/instagram-posts-collect-by-url) [Reels - Collect by URL](https://docs.brightdata.com/api-reference/scrapers/social-media-apis/instagram-reels-collect-by-url)

Ctrl+I

[linkedin](https://il.linkedin.com/company/bright-data) [youtube](https://www.youtube.com/channel/UCM_0cG1ljAoEUcZIyoUIq6g) [github](https://github.com/luminati-io)