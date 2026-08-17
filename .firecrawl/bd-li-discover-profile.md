> ## Documentation Index
>
> Fetch the complete documentation index at: [/llms.txt](https://docs.brightdata.com/llms.txt)
>
> Use this file to discover all available pages before exploring further.

[Skip to main content](https://docs.brightdata.com/api-reference/scrapers/social-media-apis/linkedin-posts-discover-by-profile-url#content-area)

[Bright Data Docs home page![light logo](https://mintcdn.com/brightdata/FreEYbEGZchU-2Iw/logo/light.svg?fit=max&auto=format&n=FreEYbEGZchU-2Iw&q=85&s=fa5461a75d0b4cf2e744c89d4b67afac)![dark logo](https://mintcdn.com/brightdata/FreEYbEGZchU-2Iw/logo/dark.svg?fit=max&auto=format&n=FreEYbEGZchU-2Iw&q=85&s=43d5b51e1516be57edb429337abdc90f)](https://brightdata.com/)

English

Search...

Ctrl K

- [Support](https://brightdata.zendesk.com/hc/en-us/requests/new)
- [Sign up](https://brightdata.com/?hs_signup=1&utm_source=docs)
- [Sign up](https://brightdata.com/?hs_signup=1&utm_source=docs)

Search...

Navigation

LinkedIn

Discover LinkedIn posts by profile URL

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



      - [POST\\
        \\
        Collect Profiles by URL](https://docs.brightdata.com/api-reference/scrapers/social-media-apis/linkedin-profiles-collect-by-url)
      - [POST\\
        \\
        Collect Companies by URL](https://docs.brightdata.com/api-reference/scrapers/social-media-apis/linkedin-companies-collect-by-url)
      - [POST\\
        \\
        Discover Jobs by URL](https://docs.brightdata.com/api-reference/scrapers/social-media-apis/linkedin-jobs-discover-by-url)
      - [POST\\
        \\
        Collect Jobs by URL](https://docs.brightdata.com/api-reference/scrapers/social-media-apis/linkedin-jobs-collect-by-url)
      - [POST\\
        \\
        Discover Jobs by Keyword](https://docs.brightdata.com/api-reference/scrapers/social-media-apis/linkedin-jobs-discover-by-keyword)
      - [POST\\
        \\
        Discover Posts by Profile URL](https://docs.brightdata.com/api-reference/scrapers/social-media-apis/linkedin-posts-discover-by-profile-url)
      - [POST\\
        \\
        Discover Posts by URL](https://docs.brightdata.com/api-reference/scrapers/social-media-apis/linkedin-posts-discover-by-url)
      - [POST\\
        \\
        Collect Posts by URL](https://docs.brightdata.com/api-reference/scrapers/social-media-apis/linkedin-posts-collect-by-url)
      - [POST\\
        \\
        Discover Posts by Company URL](https://docs.brightdata.com/api-reference/scrapers/social-media-apis/linkedin-posts-discover-by-company-url)
      - [POST\\
        \\
        Discover New Profiles](https://docs.brightdata.com/api-reference/scrapers/social-media-apis/linkedin-people-discover-new-profiles)
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


Discover LinkedIn Posts by Profile URL

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
      "start_date": "<string>",\
      "end_date": "<string>",\
      "only_authored_posts": true\
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
            "start_date": "<string>",\
            "end_date": "<string>",\
            "only_authored_posts": True\
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
        start_date: '<string>',\
        end_date: '<string>',\
        only_authored_posts: true\
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
                'start_date' => '<string>',\
                'end_date' => '<string>',\
                'only_authored_posts' => true\
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

	payload := strings.NewReader("{\n  \"input\": [\n    {\n      \"url\": \"<string>\",\n      \"start_date\": \"<string>\",\n      \"end_date\": \"<string>\",\n      \"only_authored_posts\": true\n    }\n  ]\n}")

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
  .body("{\n  \"input\": [\n    {\n      \"url\": \"<string>\",\n      \"start_date\": \"<string>\",\n      \"end_date\": \"<string>\",\n      \"only_authored_posts\": true\n    }\n  ]\n}")
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
request.body = "{\n  \"input\": [\n    {\n      \"url\": \"<string>\",\n      \"start_date\": \"<string>\",\n      \"end_date\": \"<string>\",\n      \"only_authored_posts\": true\n    }\n  ]\n}"

response = http.request(request)
puts response.read_body
```

200

```
[\
  {\
    "url": "https://de.linkedin.com/posts/bathildisheim_sport-inklusion-sportf%C3%BCralle-activity-7439619065922625537-K5QL",\
    "id": "7439619065922625537",\
    "user_id": "bat***dis***m",\
    "use_url": "https://de.linkedin.com/company/bathildisheim?trk=public_post_feed-actor-image",\
    "title": "#sp*** #i***usi*********für*********************weg************************",\
    "headline": "Aus***chn*** fü********* Vi******************",\
    "post_text": "Auszeichnung für gelebte Vielfalt im #Sport . Das Projekt Miteinander bewegt ist gemeinsam mit dem VfL Bad Wildungen mit dem Sonderpreis „Ländlicher Raum“ der Demokratie-Verstärker:innen ausgezeichnet worden. Verliehen wurde der Preis im Rahmen der Initiative „Offen für Vielfalt – Geschlossen gegen Ausgrenzung“ im Regierungspräsidium Kassel. Gewürdigt wurde das gemeinsame Projekt „Boxen ist für alle da“, das seit knapp einem Jahr im Landkreis Waldeck-Frankenberg angeboten wird. Die Auszeichnung macht sichtbar, was das Projekt in der Praxis zeigt: Sport ist weit mehr als Bewegung. Sport schafft Begegnung, stärkt Selbstvertrauen und verbindet Menschen mit unterschiedlichen Voraussetzungen. Gerade deshalb ist es wichtig, dass sportliche Angebote allen offenstehen. Bei „Boxen ist für alle da“ trainieren Menschen mit und ohne Behinderung gemeinsam. So entstehen nicht nur sportliche Erfahrungen, sondern auch Teilhabe, Zusammenhalt und ein selbstverständliches Miteinander. Dass dieses Engagement nun besonders für den ländlichen Raum gewürdigt wird, ist ein starkes Zeichen. Die Freude über den Preis ist groß. Denn er würdigt den gemeinsamen Einsatz für Inklusion, Vielfalt und demokratisches Miteinander im Sport. Ein herzlicher Dank gilt allen Beteiligten, Unterstützer:innen und natürlich den Teilnehmenden, die dieses Projekt mit Leben füllen. #Inklusion #SportFürAlle #bathildisheimbewegt Sebastian Gleim",\
    "date_posted": "2026-03-17T10:30:06.724Z",\
    "hashtags": [\
      "#Sport",\
      "#Inklusion",\
      "#SportFürAlle",\
      "#bathildisheimbewegt"\
    ],\
    "embedded_links": [\
      "https://www.linkedin.com/feed/hashtag/sport",\
      "https://www.linkedin.com/feed/hashtag/inklusion",\
      "https://www.linkedin.com/feed/hashtag/sportfAeSralle",\
      "https://www.linkedin.com/feed/hashtag/bathildisheimbewegt",\
      "https://de.linkedin.com/in/sebastian-gleim-47063430a?trk=public_post-text"\
    ],\
    "images": [\
      "https://media.licdn.com/dms/image/v2/D4D22AQGI_ALONwR9og/feedshare-shrink_800/B4DZz7WHjuKQAg-/0/1773743405596?e=2147483647&v=beta&t=dXPqg2rYvo3UwNHHx-irACA7lQ7GWovL4egJ3smyH3o"\
    ],\
    "videos": null,\
    "num_likes": 2,\
    "num_comments": 0,\
    "more_articles_by_user": null,\
    "more_relevant_posts": null,\
    "top_visible_comments": null,\
    "user_followers": 412,\
    "user_posts": 0,\
    "user_articles": 0,\
    "post_type": "post",\
    "account_type": "Organization",\
    "post_text_html": "Auszeichnung für gelebte Vielfalt im <a class=\"link\" href=\"https://www.linkedin.com/signup/cold-join?session_redirect=https%3A%2F%2Fwww.linkedin.com%2Ffeed%2Fhashtag%2Fsport&amp;trk=public_post-text\" target=\"_self\" data-tracking-control-name=\"public_post-text\" data-tracking-will-navigate>#Sport</a>. Das Projekt Miteinander bewegt ist gemeinsam mit dem VfL Bad Wildungen mit dem Sonderpreis „Ländlicher Raum“ der Demokratie-Verstärker:innen ausgezeichnet worden. Verliehen wurde der Preis im Rahmen der Initiative „Offen für Vielfalt – Geschlossen gegen Ausgrenzung“ im Regierungspräsidium Kassel.<br/>Gewürdigt wurde das gemeinsame Projekt „Boxen ist für alle da“, das seit knapp einem Jahr im Landkreis Waldeck-Frankenberg angeboten wird.<br/><br/>Die Auszeichnung macht sichtbar, was das Projekt in der Praxis zeigt: Sport ist weit mehr als Bewegung. Sport schafft Begegnung, stärkt Selbstvertrauen und verbindet Menschen mit unterschiedlichen Voraussetzungen. Gerade deshalb ist es wichtig, dass sportliche Angebote allen offenstehen.<br/><br/>Bei „Boxen ist für alle da“ trainieren Menschen mit und ohne Behinderung gemeinsam. So entstehen nicht nur sportliche Erfahrungen, sondern auch Teilhabe, Zusammenhalt und ein selbstverständliches Miteinander. Dass dieses Engagement nun besonders für den ländlichen Raum gewürdigt wird, ist ein starkes Zeichen.<br/>Die Freude über den Preis ist groß. Denn er würdigt den gemeinsamen Einsatz für Inklusion, Vielfalt und demokratisches Miteinander im Sport.<br/>Ein herzlicher Dank gilt allen Beteiligten, Unterstützer:innen und natürlich den Teilnehmenden, die dieses Projekt mit Leben füllen.<br/><br/><a class=\"link\" href=\"https://www.linkedin.com/signup/cold-join?session_redirect=https%3A%2F%2Fwww.linkedin.com%2Ffeed%2Fhashtag%2Finklusion&amp;trk=public_post-text\" target=\"_self\" data-tracking-control-name=\"public_post-text\" data-tracking-will-navigate>#Inklusion</a> <a class=\"link\" href=\"https://www.linkedin.com/signup/cold-join?session_redirect=https%3A%2F%2Fwww.linkedin.com%2Ffeed%2Fhashtag%2FsportfAeSralle&amp;trk=public_post-text\" target=\"_self\" data-tracking-control-name=\"public_post-text\" data-tracking-will-navigate>#SportFürAlle</a> <a class=\"link\" href=\"https://www.linkedin.com/signup/cold-join?session_redirect=https%3A%2F%2Fwww.linkedin.com%2Ffeed%2Fhashtag%2Fbathildisheimbewegt&amp;trk=public_post-text\" target=\"_self\" data-tracking-control-name=\"public_post-text\" data-tracking-will-navigate>#bathildisheimbewegt</a> <a class=\"link\" href=\"https://de.linkedin.com/in/sebastian-gleim-47063430a?trk=public_post-text\" target=\"_self\" data-tracking-control-name=\"public_post-text\" data-tracking-will-navigate>Sebastian Gleim</a>",\
    "repost": null,\
    "tagged_companies": [],\
    "tagged_people": [\
      {\
        "link": "https://de.linkedin.com/in/sebastian-gleim-47063430a?trk=public_post-text",\
        "name": "Sebastian G***m",\
        "type": "people"\
      }\
    ],\
    "user_title": null,\
    "author_profile_pic": "htt***//m***a.l*********dms*********************mzL************************************************************************************************************************************************************",\
    "num_connections": null,\
    "video_duration": null,\
    "external_link_data": null,\
    "video_thumbnail": null,\
    "document_cover_image": null,\
    "document_page_count": null,\
    "original_post_text": "Auszeichnung für gelebte Vielfalt im <a class=\"link\" href=\"https://www.linkedin.com/signup/cold-join?session_redirect=https%3A%2F%2Fwww.linkedin.com%2Ffeed%2Fhashtag%2Fsport&amp;trk=public_post-text\" target=\"_self\" data-tracking-control-name=\"public_post-text\" data-tracking-will-navigate>#Sport</a>. Das Projekt Miteinander bewegt ist gemeinsam mit dem VfL Bad Wildungen mit dem Sonderpreis „Ländlicher Raum“ der Demokratie-Verstärker:innen ausgezeichnet worden. Verliehen wurde der Preis im Rahmen der Initiative „Offen für Vielfalt – Geschlossen gegen Ausgrenzung“ im Regierungspräsidium Kassel.\nGewürdigt wurde das gemeinsame Projekt „Boxen ist für alle da“, das seit knapp einem Jahr im Landkreis Waldeck-Frankenberg angeboten wird.\n\nDie Auszeichnung macht sichtbar, was das Projekt in der Praxis zeigt: Sport ist weit mehr als Bewegung. Sport schafft Begegnung, stärkt Selbstvertrauen und verbindet Menschen mit unterschiedlichen Voraussetzungen. Gerade deshalb ist es wichtig, dass sportliche Angebote allen offenstehen.\n\nBei „Boxen ist für alle da“ trainieren Menschen mit und ohne Behinderung gemeinsam. So entstehen nicht nur sportliche Erfahrungen, sondern auch Teilhabe, Zusammenhalt und ein selbstverständliches Miteinander. Dass dieses Engagement nun besonders für den ländlichen Raum gewürdigt wird, ist ein starkes Zeichen.\nDie Freude über den Preis ist groß. Denn er würdigt den gemeinsamen Einsatz für Inklusion, Vielfalt und demokratisches Miteinander im Sport.\nEin herzlicher Dank gilt allen Beteiligten, Unterstützer:innen und natürlich den Teilnehmenden, die dieses Projekt mit Leben füllen.\n\n<a class=\"link\" href=\"https://www.linkedin.com/signup/cold-join?session_redirect=https%3A%2F%2Fwww.linkedin.com%2Ffeed%2Fhashtag%2Finklusion&amp;trk=public_post-text\" target=\"_self\" data-tracking-control-name=\"public_post-text\" data-tracking-will-navigate>#Inklusion</a> <a class=\"link\" href=\"https://www.linkedin.com/signup/cold-join?session_redirect=https%3A%2F%2Fwww.linkedin.com%2Ffeed%2Fhashtag%2FsportfAeSralle&amp;trk=public_post-text\" target=\"_self\" data-tracking-control-name=\"public_post-text\" data-tracking-will-navigate>#SportFürAlle</a> <a class=\"link\" href=\"https://www.linkedin.com/signup/cold-join?session_redirect=https%3A%2F%2Fwww.linkedin.com%2Ffeed%2Fhashtag%2Fbathildisheimbewegt&amp;trk=public_post-text\" target=\"_self\" data-tracking-control-name=\"public_post-text\" data-tracking-will-navigate>#bathildisheimbewegt</a> <a class=\"link\" href=\"https://de.linkedin.com/in/sebastian-gleim-47063430a?trk=public_post-text\" target=\"_self\" data-tracking-control-name=\"public_post-text\" data-tracking-will-navigate>Sebastian Gleim</a>"\
  }\
]
```

LinkedIn

# Discover LinkedIn posts by profile URL

Copy pageCopy page

Discover LinkedIn posts from a profile URL using the Bright Data Web Scraper API with dataset ID gd\_lyy3tktm25m4avu764 for individual feed monitoring.

Copy pageCopy page

POST

/

datasets

/

v3

/

scrape

Try it

Discover LinkedIn Posts by Profile URL

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
      "start_date": "<string>",\
      "end_date": "<string>",\
      "only_authored_posts": true\
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
            "start_date": "<string>",\
            "end_date": "<string>",\
            "only_authored_posts": True\
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
        start_date: '<string>',\
        end_date: '<string>',\
        only_authored_posts: true\
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
                'start_date' => '<string>',\
                'end_date' => '<string>',\
                'only_authored_posts' => true\
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

	payload := strings.NewReader("{\n  \"input\": [\n    {\n      \"url\": \"<string>\",\n      \"start_date\": \"<string>\",\n      \"end_date\": \"<string>\",\n      \"only_authored_posts\": true\n    }\n  ]\n}")

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
  .body("{\n  \"input\": [\n    {\n      \"url\": \"<string>\",\n      \"start_date\": \"<string>\",\n      \"end_date\": \"<string>\",\n      \"only_authored_posts\": true\n    }\n  ]\n}")
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
request.body = "{\n  \"input\": [\n    {\n      \"url\": \"<string>\",\n      \"start_date\": \"<string>\",\n      \"end_date\": \"<string>\",\n      \"only_authored_posts\": true\n    }\n  ]\n}"

response = http.request(request)
puts response.read_body
```

200

```
[\
  {\
    "url": "https://de.linkedin.com/posts/bathildisheim_sport-inklusion-sportf%C3%BCralle-activity-7439619065922625537-K5QL",\
    "id": "7439619065922625537",\
    "user_id": "bat***dis***m",\
    "use_url": "https://de.linkedin.com/company/bathildisheim?trk=public_post_feed-actor-image",\
    "title": "#sp*** #i***usi*********für*********************weg************************",\
    "headline": "Aus***chn*** fü********* Vi******************",\
    "post_text": "Auszeichnung für gelebte Vielfalt im #Sport . Das Projekt Miteinander bewegt ist gemeinsam mit dem VfL Bad Wildungen mit dem Sonderpreis „Ländlicher Raum“ der Demokratie-Verstärker:innen ausgezeichnet worden. Verliehen wurde der Preis im Rahmen der Initiative „Offen für Vielfalt – Geschlossen gegen Ausgrenzung“ im Regierungspräsidium Kassel. Gewürdigt wurde das gemeinsame Projekt „Boxen ist für alle da“, das seit knapp einem Jahr im Landkreis Waldeck-Frankenberg angeboten wird. Die Auszeichnung macht sichtbar, was das Projekt in der Praxis zeigt: Sport ist weit mehr als Bewegung. Sport schafft Begegnung, stärkt Selbstvertrauen und verbindet Menschen mit unterschiedlichen Voraussetzungen. Gerade deshalb ist es wichtig, dass sportliche Angebote allen offenstehen. Bei „Boxen ist für alle da“ trainieren Menschen mit und ohne Behinderung gemeinsam. So entstehen nicht nur sportliche Erfahrungen, sondern auch Teilhabe, Zusammenhalt und ein selbstverständliches Miteinander. Dass dieses Engagement nun besonders für den ländlichen Raum gewürdigt wird, ist ein starkes Zeichen. Die Freude über den Preis ist groß. Denn er würdigt den gemeinsamen Einsatz für Inklusion, Vielfalt und demokratisches Miteinander im Sport. Ein herzlicher Dank gilt allen Beteiligten, Unterstützer:innen und natürlich den Teilnehmenden, die dieses Projekt mit Leben füllen. #Inklusion #SportFürAlle #bathildisheimbewegt Sebastian Gleim",\
    "date_posted": "2026-03-17T10:30:06.724Z",\
    "hashtags": [\
      "#Sport",\
      "#Inklusion",\
      "#SportFürAlle",\
      "#bathildisheimbewegt"\
    ],\
    "embedded_links": [\
      "https://www.linkedin.com/feed/hashtag/sport",\
      "https://www.linkedin.com/feed/hashtag/inklusion",\
      "https://www.linkedin.com/feed/hashtag/sportfAeSralle",\
      "https://www.linkedin.com/feed/hashtag/bathildisheimbewegt",\
      "https://de.linkedin.com/in/sebastian-gleim-47063430a?trk=public_post-text"\
    ],\
    "images": [\
      "https://media.licdn.com/dms/image/v2/D4D22AQGI_ALONwR9og/feedshare-shrink_800/B4DZz7WHjuKQAg-/0/1773743405596?e=2147483647&v=beta&t=dXPqg2rYvo3UwNHHx-irACA7lQ7GWovL4egJ3smyH3o"\
    ],\
    "videos": null,\
    "num_likes": 2,\
    "num_comments": 0,\
    "more_articles_by_user": null,\
    "more_relevant_posts": null,\
    "top_visible_comments": null,\
    "user_followers": 412,\
    "user_posts": 0,\
    "user_articles": 0,\
    "post_type": "post",\
    "account_type": "Organization",\
    "post_text_html": "Auszeichnung für gelebte Vielfalt im <a class=\"link\" href=\"https://www.linkedin.com/signup/cold-join?session_redirect=https%3A%2F%2Fwww.linkedin.com%2Ffeed%2Fhashtag%2Fsport&amp;trk=public_post-text\" target=\"_self\" data-tracking-control-name=\"public_post-text\" data-tracking-will-navigate>#Sport</a>. Das Projekt Miteinander bewegt ist gemeinsam mit dem VfL Bad Wildungen mit dem Sonderpreis „Ländlicher Raum“ der Demokratie-Verstärker:innen ausgezeichnet worden. Verliehen wurde der Preis im Rahmen der Initiative „Offen für Vielfalt – Geschlossen gegen Ausgrenzung“ im Regierungspräsidium Kassel.<br/>Gewürdigt wurde das gemeinsame Projekt „Boxen ist für alle da“, das seit knapp einem Jahr im Landkreis Waldeck-Frankenberg angeboten wird.<br/><br/>Die Auszeichnung macht sichtbar, was das Projekt in der Praxis zeigt: Sport ist weit mehr als Bewegung. Sport schafft Begegnung, stärkt Selbstvertrauen und verbindet Menschen mit unterschiedlichen Voraussetzungen. Gerade deshalb ist es wichtig, dass sportliche Angebote allen offenstehen.<br/><br/>Bei „Boxen ist für alle da“ trainieren Menschen mit und ohne Behinderung gemeinsam. So entstehen nicht nur sportliche Erfahrungen, sondern auch Teilhabe, Zusammenhalt und ein selbstverständliches Miteinander. Dass dieses Engagement nun besonders für den ländlichen Raum gewürdigt wird, ist ein starkes Zeichen.<br/>Die Freude über den Preis ist groß. Denn er würdigt den gemeinsamen Einsatz für Inklusion, Vielfalt und demokratisches Miteinander im Sport.<br/>Ein herzlicher Dank gilt allen Beteiligten, Unterstützer:innen und natürlich den Teilnehmenden, die dieses Projekt mit Leben füllen.<br/><br/><a class=\"link\" href=\"https://www.linkedin.com/signup/cold-join?session_redirect=https%3A%2F%2Fwww.linkedin.com%2Ffeed%2Fhashtag%2Finklusion&amp;trk=public_post-text\" target=\"_self\" data-tracking-control-name=\"public_post-text\" data-tracking-will-navigate>#Inklusion</a> <a class=\"link\" href=\"https://www.linkedin.com/signup/cold-join?session_redirect=https%3A%2F%2Fwww.linkedin.com%2Ffeed%2Fhashtag%2FsportfAeSralle&amp;trk=public_post-text\" target=\"_self\" data-tracking-control-name=\"public_post-text\" data-tracking-will-navigate>#SportFürAlle</a> <a class=\"link\" href=\"https://www.linkedin.com/signup/cold-join?session_redirect=https%3A%2F%2Fwww.linkedin.com%2Ffeed%2Fhashtag%2Fbathildisheimbewegt&amp;trk=public_post-text\" target=\"_self\" data-tracking-control-name=\"public_post-text\" data-tracking-will-navigate>#bathildisheimbewegt</a> <a class=\"link\" href=\"https://de.linkedin.com/in/sebastian-gleim-47063430a?trk=public_post-text\" target=\"_self\" data-tracking-control-name=\"public_post-text\" data-tracking-will-navigate>Sebastian Gleim</a>",\
    "repost": null,\
    "tagged_companies": [],\
    "tagged_people": [\
      {\
        "link": "https://de.linkedin.com/in/sebastian-gleim-47063430a?trk=public_post-text",\
        "name": "Sebastian G***m",\
        "type": "people"\
      }\
    ],\
    "user_title": null,\
    "author_profile_pic": "htt***//m***a.l*********dms*********************mzL************************************************************************************************************************************************************",\
    "num_connections": null,\
    "video_duration": null,\
    "external_link_data": null,\
    "video_thumbnail": null,\
    "document_cover_image": null,\
    "document_page_count": null,\
    "original_post_text": "Auszeichnung für gelebte Vielfalt im <a class=\"link\" href=\"https://www.linkedin.com/signup/cold-join?session_redirect=https%3A%2F%2Fwww.linkedin.com%2Ffeed%2Fhashtag%2Fsport&amp;trk=public_post-text\" target=\"_self\" data-tracking-control-name=\"public_post-text\" data-tracking-will-navigate>#Sport</a>. Das Projekt Miteinander bewegt ist gemeinsam mit dem VfL Bad Wildungen mit dem Sonderpreis „Ländlicher Raum“ der Demokratie-Verstärker:innen ausgezeichnet worden. Verliehen wurde der Preis im Rahmen der Initiative „Offen für Vielfalt – Geschlossen gegen Ausgrenzung“ im Regierungspräsidium Kassel.\nGewürdigt wurde das gemeinsame Projekt „Boxen ist für alle da“, das seit knapp einem Jahr im Landkreis Waldeck-Frankenberg angeboten wird.\n\nDie Auszeichnung macht sichtbar, was das Projekt in der Praxis zeigt: Sport ist weit mehr als Bewegung. Sport schafft Begegnung, stärkt Selbstvertrauen und verbindet Menschen mit unterschiedlichen Voraussetzungen. Gerade deshalb ist es wichtig, dass sportliche Angebote allen offenstehen.\n\nBei „Boxen ist für alle da“ trainieren Menschen mit und ohne Behinderung gemeinsam. So entstehen nicht nur sportliche Erfahrungen, sondern auch Teilhabe, Zusammenhalt und ein selbstverständliches Miteinander. Dass dieses Engagement nun besonders für den ländlichen Raum gewürdigt wird, ist ein starkes Zeichen.\nDie Freude über den Preis ist groß. Denn er würdigt den gemeinsamen Einsatz für Inklusion, Vielfalt und demokratisches Miteinander im Sport.\nEin herzlicher Dank gilt allen Beteiligten, Unterstützer:innen und natürlich den Teilnehmenden, die dieses Projekt mit Leben füllen.\n\n<a class=\"link\" href=\"https://www.linkedin.com/signup/cold-join?session_redirect=https%3A%2F%2Fwww.linkedin.com%2Ffeed%2Fhashtag%2Finklusion&amp;trk=public_post-text\" target=\"_self\" data-tracking-control-name=\"public_post-text\" data-tracking-will-navigate>#Inklusion</a> <a class=\"link\" href=\"https://www.linkedin.com/signup/cold-join?session_redirect=https%3A%2F%2Fwww.linkedin.com%2Ffeed%2Fhashtag%2FsportfAeSralle&amp;trk=public_post-text\" target=\"_self\" data-tracking-control-name=\"public_post-text\" data-tracking-will-navigate>#SportFürAlle</a> <a class=\"link\" href=\"https://www.linkedin.com/signup/cold-join?session_redirect=https%3A%2F%2Fwww.linkedin.com%2Ffeed%2Fhashtag%2Fbathildisheimbewegt&amp;trk=public_post-text\" target=\"_self\" data-tracking-control-name=\"public_post-text\" data-tracking-will-navigate>#bathildisheimbewegt</a> <a class=\"link\" href=\"https://de.linkedin.com/in/sebastian-gleim-47063430a?trk=public_post-text\" target=\"_self\" data-tracking-control-name=\"public_post-text\" data-tracking-will-navigate>Sebastian Gleim</a>"\
  }\
]
```

## [​](https://docs.brightdata.com/api-reference/scrapers/social-media-apis/linkedin-posts-discover-by-profile-url\#query-parameters)  Query Parameters

[​](https://docs.brightdata.com/api-reference/scrapers/social-media-apis/linkedin-posts-discover-by-profile-url#param-dataset-id)

dataset\_id

string

default:"gd\_lyy3tktm25m4avu764"

required

The dataset ID used for this request.

Must be set to `gd_lyy3tktm25m4avu764` to collect **Discover Posts by Profile URL** data.

[​](https://docs.brightdata.com/api-reference/scrapers/social-media-apis/linkedin-posts-discover-by-profile-url#param-type)

type

string

default:"discover\_new"

Must be set to `discover_new`.

[​](https://docs.brightdata.com/api-reference/scrapers/social-media-apis/linkedin-posts-discover-by-profile-url#param-discover-by)

discover\_by

string

default:"profile\_url"

Must be set to `profile_url`.

[​](https://docs.brightdata.com/api-reference/scrapers/social-media-apis/linkedin-posts-discover-by-profile-url#param-notify)

notify

boolean

default:false

Whether to send notifications when the request is completed.

[​](https://docs.brightdata.com/api-reference/scrapers/social-media-apis/linkedin-posts-discover-by-profile-url#param-include-errors)

include\_errors

boolean

default:true

Whether to include errors in the response.

## [​](https://docs.brightdata.com/api-reference/scrapers/social-media-apis/linkedin-posts-discover-by-profile-url\#request-body)  Request Body

[​](https://docs.brightdata.com/api-reference/scrapers/social-media-apis/linkedin-posts-discover-by-profile-url#param-input)

input

object\[\]

required

An array of input objects.

Show properties

[​](https://docs.brightdata.com/api-reference/scrapers/social-media-apis/linkedin-posts-discover-by-profile-url#param-url)

url

string

required

LinkedIn company url

[​](https://docs.brightdata.com/api-reference/scrapers/social-media-apis/linkedin-posts-discover-by-profile-url#param-start-date)

start\_date

string

`start_date` to filter by, if filled will only collect posts with publish date

[​](https://docs.brightdata.com/api-reference/scrapers/social-media-apis/linkedin-posts-discover-by-profile-url#param-end-date)

end\_date

string

`end_date` to filter by, if filled will only collect posts with publish date

[​](https://docs.brightdata.com/api-reference/scrapers/social-media-apis/linkedin-posts-discover-by-profile-url#param-only-authored-posts)

only\_authored\_posts

boolean

Return only posts created by the profile owner

#### [​](https://docs.brightdata.com/api-reference/scrapers/social-media-apis/linkedin-posts-discover-by-profile-url\#example)  Example

```
{
  "input":[\
    {\
      "url":"https://www.linkedin.com/in/bettywliu",\
      "start_date":"2018-04-25T00:00:00.000Z",\
      "end_date":"2021-05-25T00:00:00.000Z"\
    }\
  ]
}
```

## [​](https://docs.brightdata.com/api-reference/scrapers/social-media-apis/linkedin-posts-discover-by-profile-url\#response)  Response

Was this page helpful?

YesNo

[Discover Jobs by Keyword](https://docs.brightdata.com/api-reference/scrapers/social-media-apis/linkedin-jobs-discover-by-keyword) [Discover Posts by URL](https://docs.brightdata.com/api-reference/scrapers/social-media-apis/linkedin-posts-discover-by-url)

Ctrl+I

[linkedin](https://il.linkedin.com/company/bright-data) [youtube](https://www.youtube.com/channel/UCM_0cG1ljAoEUcZIyoUIq6g) [github](https://github.com/luminati-io)