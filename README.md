# Supercrawler - Node.js Web Crawler

Supercrawler is a Node.js web crawler. It is designed to be highly configurable and easy to use.

Supercrawler can store state information in a database, so you an can start and stop crawls easily. It will automatically retry failed URLs in an exponential backoff style (starting at 1 hour and doubling thereafter).

When Supercrawler successfully crawls a page (which could be a image, text, etc), it will fire your custom content-type handlers. Define your own custom handlers to parse pages, save data and do anything else you need.

## Step 1. Create a New Crawler

    var crawler = new supercrawler.Crawler({
      interval: 100
    });

## Step 2. Add Content handlers

You can specify your own content handlers for all types of content or groups
of content. You can target `text` or `text/html` documents easily.

The `htmlLinkParser` handler is included with Supercrawler. It automatically
parses a HTML document, discovers links and adds them to the crawl queue. You
can specify an array of allowed hostnames with the `hostnames` option, allowing
you to easily control the scope of your crawl.

You can also specify your own handlers. Use these handlers to parse content,
save files or identify links. Just return an array of links (absolute paths)
from your handler, and Supercrawler will add them to the queue.

    crawler.addHandler("text/html", supercrawler.handlers.htmlLinkParser({
      hostnames: ["example.com"]
    }));
    crawler.addHandler("text/html", function (body, url) {
      console.log("Got page", url);
    });

## Step 3. Start the Crawl

Insert a starting URL into the queue, and call `crawler.start()`.

    crawler.getUrlList()
      .insertIfNotExists(new supercrawler.Url("https://example.com/"))
      .then(function () {
        return crawler.start();
      });

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

Example usage:

    var crawler = new supercrawler.Crawler({
      interval: 1000,
      concurrentRequestsLimit: 1
    });

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

    var url = new supercrawler.Url({
      url: "https://example.com"
    });

You can also call it just a string URL:

    var url = new supercrawler.Url("https://example.com");

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

    var hlp = supercrawler.handlers.htmlLinkParser({
      hostnames: ["example.com"]
    });

## Features

* Pluggable priority queues. Supercrawler ships with a simple first-in,
  first-out style queue. But you can easily plug your own queue in, allowing
  you to retry failed crawls, prioritize specific pages or save crawl data
  in a database, for example.
* Concurrency limiting. You can set a maximum number of requests that can
  execute at the same time.
* Rate limiting. You can set a rate limit to prevent crawling too quickly.
* Robots adherence. Supercrawler automatically downloads, checks and caches
  the results of robots.txt exclusions.
