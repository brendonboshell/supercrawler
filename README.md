# Node.js Web Crawler

[![npm](https://img.shields.io/npm/v/supercrawler.svg?maxAge=2592000)]()
[![npm](https://img.shields.io/npm/l/supercrawler.svg?maxAge=2592000)]()
[![GitHub issues](https://img.shields.io/github/issues/brendonboshell/supercrawler.svg?maxAge=2592000)]()
[![David](https://img.shields.io/david/brendonboshell/supercrawler.svg?maxAge=2592000)]()
[![David](https://img.shields.io/david/dev/brendonboshell/supercrawler.svg?maxAge=2592000)]()
[![Travis](https://img.shields.io/travis/brendonboshell/supercrawler.svg?maxAge=2592000)]()

Supercrawler is a Node.js web crawler. It is designed to be highly configurable and easy to use.

When Supercrawler successfully crawls a page (which could be an image, a text document or any other file), it will fire your custom content-type handlers. Define your own custom handlers to parse pages, save data and do anything else you need.

## Features

* **Link Detection**. Supercrawler will parse crawled HTML documents, identify
  links and add them to the queue.
* **Robots Parsing**. Supercrawler will request robots.txt and check the rules
  before crawling. It will also identify any sitemaps.
* **Sitemaps Parsing**. Supercrawler will read links from XML sitemap files,
  and add links to the queue.
* **Concurrency Limiting**. Supercrawler limits the number of requests sent out
  at any one time.
* **Rate limiting**. Supercrawler will add a delay between requests to avoid
  bombarding servers.
* **Exponential Backoff Retry**. Supercrawler will retry failed requests after 1 hour, then 2 hours, then 4 hours, etc. To use this feature, you must use the database-backed or Redis-backed crawl queue.
* **Hostname Balancing**. Supercrawler will fairly split requests between
different hostnames. To use this feature, you must use the Redis-backed crawl queue.

## How It Works

**Crawling** is controlled by the an instance of the `Crawler` object, which acts like a web client. It is responsible for coordinating with the *priority queue*, sending requests according to the concurrency and rate limits, checking the robots.txt rules and despatching content to the custom *content handlers* to be processed. Once started, it will automatically crawl pages until you ask it to stop.

The **Priority Queue** or **UrlList** keeps track of which URLs need to be crawled, and the order in which they are to be crawled. The Crawler will pass new URLs discovered by the content handlers to the priority queue. When the crawler is ready to crawl the next page, it will call the `getNextUrl` method. This method will work out which URL should be crawled next, based on implementation-specific rules. Any retry logic is handled by the queue.

The **Content Handlers** are functions which take content buffers and do some further processing with them. You will almost certainly want to create your own content handlers to analyze pages or store data, for example. The content handlers tell the Crawler about new URLs that should be crawled in the future. Supercrawler provides content handlers to parse links from HTML pages, analyze robots.txt files for `Sitemap:` directives and parse sitemap files for URLs.

## Get Started

First, install Supercrawler.

```
npm install supercrawler --save
```

Second, create an instance of `Crawler`.

```js
var supercrawler = require("supercrawler");

// 1. Create a new instance of the Crawler object, providing configuration
// details. Note that configuration cannot be changed after the object is
// created.
var crawler = new supercrawler.Crawler({
  // By default, Supercrawler uses a simple FIFO queue, which doesn't support
  // retries or memory of crawl state. For any non-trivial crawl, you should
  // create a database. Provide your database config to the constructor of
  // DbUrlList.
  urlList: new supercrawler.DbUrlList({
    db: {
      database: "crawler",
      username: "root",
      password: secrets.db.password,
      sequelizeOpts: {
        dialect: "mysql",
        host: "localhost"
      }
    }
  }),
  // Tme (ms) between requests
  interval: 1000,
  // Maximum number of requests at any one time.
  concurrentRequestsLimit: 5,
  // Time (ms) to cache the results of robots.txt queries.
  robotsCacheTime: 3600000,
  // Query string to use during the crawl.
  userAgent: "Mozilla/5.0 (compatible; supercrawler/1.0; +https://github.com/brendonboshell/supercrawler)",
  // Custom options to be passed to request.
  request: {
    headers: {
      'x-custom-header': 'example'
    }
  }
});
```

Third, add some content handlers.

```js
// Get "Sitemaps:" directives from robots.txt
crawler.addHandler(supercrawler.handlers.robotsParser());

// Crawl sitemap files and extract their URLs.
crawler.addHandler(supercrawler.handlers.sitemapsParser());

// Pick up <a href> links from HTML documents
crawler.addHandler("text/html", supercrawler.handlers.htmlLinkParser({
  // Restrict discovered links to the following hostnames.
  hostnames: ["example.com"]
}));

// Custom content handler for HTML pages.
crawler.addHandler("text/html", function (context) {
  var sizeKb = Buffer.byteLength(context.body) / 1024;
  logger.info("Processed", context.url, "Size=", sizeKb, "KB");
});
```

Fourth, add a URL to the queue and start the crawl.

```js
crawler.getUrlList()
  .insertIfNotExists(new supercrawler.Url("http://example.com/"))
  .then(function () {
    return crawler.start();
  });
```

That's it! Supercrawler will handle the crawling for you. You only have to define your custom behaviour in the content handlers.

## Crawler

Each `Crawler` instance represents a web crawler. You can configure your
crawler with the following options:

| Option | Description |
| --- | --- |
| urlList | Custom instance of `UrlList` type queue. Defaults to `FifoUrlList`, which processes URLs in the order that they were added to the queue; once they are removed from the queue, they cannot be recrawled. |
| interval | Number of milliseconds between requests. Defaults to 1000. |
| concurrentRequestsLimit | Maximum number of concurrent requests. Defaults to 5. |
| robotsCacheTime | Number of milliseconds that robots.txt should be cached for. Defaults to 3600000 (1 hour). |
| userAgent | User agent to use for requests. Defaults to `Mozilla/5.0 (compatible; supercrawler/1.0; +https://github.com/brendonboshell/supercrawler)` |
| request | Object of options to be passed to [request](https://github.com/request/request). Note that request does not support an asynchronous (and distributed) cookie jar. |

Example usage:

```js
var crawler = new supercrawler.Crawler({
  interval: 1000,
  concurrentRequestsLimit: 1
});
```

The following methods are available:

| Method | Description |
| --- | --- |
| getUrlList | Get the `UrlList` type instance. |
| getInterval | Get the interval setting. |
| getConcurrentRequestsLimit | Get the maximum number of concurrent requests. |
| getUserAgent | Get the user agent. |
| start | Start crawling. |
| stop | Stop crawling. |
| addHandler(handler) | Add a handler for all content types. |
| addHandler(contentType, handler) | Add a handler for a specific content type. |

The `Crawler` object fires the following events:

| Event | Description |
| --- | --- |
| crawlurl(url) | Fires when crawling starts with a new URL. |
| crawledurl(url, errorCode, statusCode) | Fires when crawling of a URL is complete. `errorCode` is `null` if no error occurred. `statusCode` is set if and only if the request was successful. |
| urllistempty | Fires when the URL list is (intermittently) empty. |
| urllistcomplete | Fires when the URL list is permanently empty, barring URLs added by external sources. This only makes sense when running Supercrawler in non-distributed fashion. |

## DbUrlList

`DbUrlList` is a queue backed with a database, such as MySQL, Postgres or SQLite. You can use any database engine supported by Sequelize.

If a request fails, this queue will ensure the request gets retried at some point in the future. The next request is schedule 1 hour into the future. After that, the period of delay doubles for each failure.

Options:

| Option | Description |
| --- | --- |
| opts.db.database | Database name. |
| opts.db.username | Database username. |
| opts.db.password | Database password. |
| opts.db.sequelizeOpts | Options to pass to sequelize. |

Example usage:

```js
new supercrawler.DbUrlList({
  db: {
    database: "crawler",
    username: "root",
    password: "password",
    sequelizeOpts: {
      dialect: "mysql",
      host: "localhost"
    }
  }
})
```

The following methods are available:

| Method | Description |
| --- | --- |
| insertIfNotExists(url) | Insert a `Url` object. |
| upsert(url) | Upsert `Url` object. |
| getNextUrl() | Get the next `Url` to be crawled. |

## RedisUrlList

`RedisUrlList` is a queue backed with Redis.

If a request fails, this queue will ensure the request gets retried at some point in the future. The next request is schedule 1 hour into the future. After that, the period of delay doubles for each failure.

It also balances requests between different hostnames. So, for example, if you
crawl a sitemap file with 10,000 URLs, the next 10,000 URLs will not be stuck in
the same host.

Options:

| Option | Description |
| --- | --- |
| opts.redis | Options passed to [ioredis](https://github.com/luin/ioredis). |
| opts.delayHalfLifeMs | Hostname delay factor half-life. Requests are delayed by an amount of time proportional to the number of pages crawled for a hostname, but this factor exponentially decays over time. Default = 3600000 (1 hour). |
| opts.expiryTimeMs | Amount of time before recrawling a successful URL. Default = 2592000000 (30 days). |
| opts.initialRetryTimeMs | Amount of time to wait before first retry after a failed URL. Default = 3600000 (1 hour) |

Example usage:

```js
new supercrawler.RedisUrlList({
  redis: {
    host: "127.0.0.1"
  }
})
```

The following methods are available:

| Method | Description |
| --- | --- |
| insertIfNotExists(url) | Insert a `Url` object. |
| upsert(url) | Upsert `Url` object. |
| getNextUrl() | Get the next `Url` to be crawled. |

## FifoUrlList

The `FifoUrlList` is the default URL queue powering the crawler. You can add
URLs to the queue, and they will be crawled in the same order (FIFO).

Note that, with this queue, URLs are only crawled once, even if the request
fails. If you need retry functionality, you must use `DbUrlList`.

The following methods are available:

| Method | Description |
| --- | --- |
| insertIfNotExists(url) | Insert a `Url` object. |
| upsert(url) | Upsert `Url` object. |
| getNextUrl() | Get the next `Url` to be crawled. |

## Url

A `Url` represents a URL to be crawled, or a URL that has already been
crawled. It is uniquely identified by an absolute-path URL, but also contains
information about errors and status codes.

| Option | Description |
| --- | --- |
| url | Absolute-path string url |
| statusCode | HTTP status code or `null`. |
| errorCode | String error code or `null`. |

Example usage:

```js
var url = new supercrawler.Url({
  url: "https://example.com"
});
```

You can also call it just a string URL:

```js
var url = new supercrawler.Url("https://example.com");
```

The following methods are available:

| Method | Description |
| --- | --- |
| getUniqueId | Get the unique identifier for this object. |
| getUrl | Get the absolute-path string URL. |
| getErrorCode | Get the error code, or `null` if it is empty. |
| getStatusCode | Get the status code, or `null` if it is empty. |

## handlers.htmlLinkParser

A function that returns a handler which parses a HTML page and identifies any
links.

| Option | Description |
| --- | --- |
| hostnames | Array of hostnames that are allowed to be crawled. |

Example usage:

```js
var hlp = supercrawler.handlers.htmlLinkParser({
  hostnames: ["example.com"]
});
```

## handlers.robotsParser

A function that returns a handler which parses a robots.txt file. Robots.txt
file are automatically crawled, and sent through the same content handler
routines as any other file. This handler will look for any `Sitemap: ` directives,
and add those XML sitemaps to the crawl.

It will ignore any files that are not `/robots.txt`.

If you want to extract the URLs from those XML sitemaps, you will also need
to add a sitemap parser.

| Option | Description |
| --- | --- |
| urlFilter(sitemapUrl, robotsTxtUrl) | Function that takes a URL and returns `true` if it should be included. |

Example usage:

```js
var rp = supercrawler.handlers.robotsParser();
crawler.addHandler("text/plain", supercrawler.handlers.robotsParser());
```

## handlers.sitemapsParser

A function that returns a handler which parses an XML sitemaps file. It will
pick up any URLs matching `sitemapindex > sitemap > loc, urlset > url > loc`.

It will also handle a gzipped file, since that it part of the sitemaps
specification.

| Option | Description |
| --- | --- |
| urlFilter | Function that takes a URL and returns `true` if it should be included. |

Example usage:

```js
var sp = supercrawler.handlers.sitemapsParser();
crawler.addHandler(supercrawler.handlers.sitemapsParser());
```

## Changelog

### 1.3.1

* [Fix] `htmlLinkParser` should detect links matching the `area[href]` selector.

### 1.3.0

* [Added] Crawler fires the `crawledurl` event the crawl of a specific URL is
complete (whether successful or not).

### 1.2.0

* [Added] Crawler fires the `urllistcomplete` event when the UrlList is permanently
empty (compare with `urllistempty`, which may fire intermittently).

### 1.1.0

* [Added] Ability to provide custom options to the `request` library.

### 1.0.0

* [Fixed] Removed warnings from unit tests.
* [Changed] Updated dependencies.
* [Changed] Make API stable - release 1.0.0.

### 0.16.1

* [Fixed] Treats 410 the same as 404 for robots.txt requests.

### 0.16.0

* [Added] Support for `gzipContentTypes` option to `sitemapsParser`. Example: `gzipContentTypes: 'application/gzip'` and `gzipContentTypes: ['application/gzip']`.

### 0.15.1

* [Fixed] Support for multiple "User-agent" lines in robots.txt files

### 0.15.0

* [Added] Redis based queue.

### 0.14.0

* [Added] Crawler emits `redirect`, `links` and `httpError` events.

### 0.13.1

* [Fixed] `DbUrlList` doesn't fetch the existing record from the database unless
there was an error.

### 0.13.0

* [Added] `errorMessage` column on `urls` table that gives more information
about, e.g., a handlers error that occurred.

### 0.12.1

* [Fixed] Downgrade to cheerio 0.19, to fix a memory leak issue.

### 0.12.0

* [Change] Rather than calling content handlers with (body, url), they are
now called with a single `context` argument. This allows you to pass information
forwards via handlers. For example, you might cache the `cheerio` parsing
so you don't parse with every content handler.

### 0.11.0

* [Added] Event called `handlersError` is emitted if any of the handlers
returns an error.

### 0.10.4

* [Fixed] Shortend `urlHash` field to 40 characters, in case tables are using
`utf8mb4` collations for strings.

### 0.10.3

* [Fixed] URLs are now crawled in a random order. Improved the `getNextUrl`
function of `DbUrlList` to use a more optimized query.

### 0.10.2

* [Fixed] When content handler throws an exception / rejects a Promise, it will
be marked as an error. (And scheduled for a retry if using `DbUrlList`).

### 0.10.1

* [Fixed] Request sends `Accept-Encoding: gzip, deflate` header, so the
responses arrive compressed (saving data transfer).

### 0.10.0

* [Added] Support for a custom URL filter on the `robotsParser` function.

### 0.9.1

* [Fixed] Performance improvement for sitemaps parser. Very large sitemap
previous took 25 seconds, now takes 1-2 seconds.

### 0.9.0

* [Added] Support for a custom URL filter on the `sitemapsParser` function.

### 0.8.0

* [Changed] Sitemaps parser now extracts `<xhtml:link rel="alternate">` URLs,
in addition to the `<loc>` URLs.

### 0.7.0

* [Added] Support for optional `insertIfNotExistsBulk` method which can insert
a large list of URLs into the crawl queue.
* [Changed] `DbUrlList` supports the bulk insert method.

### 0.6.1

* [Fix] Support sitemaps with content type `application/gzip` as well as
`application/x-gzip`.

### 0.6.0

* [Added] Crawler fires the `urllistempty` and `crawlurl` events. It also
captures the `RangeError` event when the URL list is empty.

### 0.5.0

* [Changed] `htmlLinkParser` now also picks up `link` tags where `rel=alternate`.

### 0.4.0

* [Changed] Supercrawler no longer follows redirects on crawled URLs. Supercrawler will now add a redirected URL to the queue as a separate entry. We still follow redirects for the `/robots.txt` that is used for checking rules; but not for `/robots.txt` added to the queue.

### 0.3.3

* [Fix] `DbUrlList` to mark a URL as taken, and ensure it never returns a URL that is being crawled in another concurrent request. This has required a new field called `holdDate` on the `url` table

### 0.3.2

* [Fix] Time-based unit tests made more reliable.

### 0.3.1

* [Added] Support for Travis CI.

### 0.3.0

* [Added] Content type passed as third argument to all content type handlers.
* [Added] Sitemaps parser to extract sitemap URLs and urlset URLs.
* [Changed] Content handlers receive Buffers rather than strings for the first argument.
* [Fix] Robots.txt checking to work for the first crawled URL. There was a bug that caused robots.txt to be ignored if it wasn't in the cache.

### 0.2.3

* [Added] A robots.txt parser that identifies `Sitemap:` directives.

### 0.2.2

* [Fixed] Support for URLs up to 10,000 characters long. This required a new `urlHash` SHA1 field on the `url` table, to support the unique index.

### 0.2.1

* [Added] Extensive documentation.

### 0.2.0

* [Added] Status code is updated in the queue for successfully crawled pages (HTTP code < 400).
* [Added] A new error type `error.RequestError` for all errors that occur when requesting a page.
* [Added] `DbUrlList` queue object that stores URLs in a SQL database. Includes exponetial backoff retry logic.
* [Changed] Interface to `DbUrlList` and `FifoUrlList` is now via methods `insertIfNotExists`, `upsert` and `getNextUrl`. Previously, it was just `insert` (which also updated) and `upsert`, but we need a way to differentiate between discovered URLs which should not update the crawl state.

### 0.1.0

* [Added] `Crawler` object, supporting rate limiting, concurrent requests limiting, robots.txt caching.
* [Added] `FifoUrlList` object, a first-in, first-out in-memory list of URLs to be crawled.
* [Added] `Url` object, representing a URL in the crawl queue.
* [Added] `htmlLinkParser`, a function to extract links from crawled HTML documents.
