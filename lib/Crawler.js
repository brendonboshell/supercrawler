var Crawler,
    util = require("util"),
    EventEmitter = require("events").EventEmitter,
    FifoUrlList = require("./FifoUrlList"),
    Url = require("./Url"),
    Promise = require("bluebird"),
    urlMod = require("url"),
    NodeCache = require("node-cache"),
    request = Promise.promisify(require("request")),
    robotsParser = require("robots-parser"),
    mime = require('mime-types'),
    _ = require("lodash"),
    error = require("./error"),
    DEFAULT_INTERVAL = 1000,
    DEFAULT_CONCURRENT_REQUESTS_LIMIT = 5,
    DEFAULT_ROBOTS_CACHE_TIME = 1000 * 60 * 60,
    DEFAULT_USER_AGENT = "Mozilla/5.0 (compatible; supercrawler/1.0; +https://github.com/brendonboshell/supercrawler)";

/**
 * Object represents an instance of a crawler, i.e. a HTTP client that
 * automatically crawls webpages according to the settings passed to it.
 *
 * @param {Object} [opts] Object of configuration options.
 */
Crawler = function (opts) {
  if (!(this instanceof Crawler)) {
    return new Crawler(opts);
  }

  if (typeof opts === "undefined") {
    opts = {};
  }

  this._urlList = opts.urlList || new FifoUrlList();
  this._interval = opts.interval || DEFAULT_INTERVAL;
  this._concurrentRequestsLimit = opts.concurrentRequestsLimit ||
    DEFAULT_CONCURRENT_REQUESTS_LIMIT;
  this._robotsCache = new NodeCache({
    stdTTL: (opts.robotsCacheTime || DEFAULT_ROBOTS_CACHE_TIME) / 1000
  });
  this._userAgent = opts.userAgent || DEFAULT_USER_AGENT;
  this._request = opts.request || {};
  this._handlers = [];
  this._outstandingRequests = 0;
  this._robotsIgnoreServerError = opts.robotsIgnoreServerError || false;
  this._robotsEnabled = (opts.robotsEnabled !== false);
};

util.inherits(Crawler, EventEmitter);

/**
 * Returns the instance of a \UrlList object that is being used. Unless
 * specified to the constructor, this will be \FifoUrlList type
 *
 * @return {UrlList} Instance of \UrlList type object.
 */
Crawler.prototype.getUrlList = function () {
  return this._urlList;
};

/**
 * Get the interval setting, that is the number of milliseconds that the
 * crawler waits before performing another request.
 *
 * @return {number} Interval in milliseconds.
 */
Crawler.prototype.getInterval = function () {
  return this._interval;
};

/**
 * Get the maximum number of requests that can be in progress at any one time.
 *
 * @return {number} Maximum number of requests
 */
Crawler.prototype.getConcurrentRequestsLimit = function () {
  return this._concurrentRequestsLimit;
};

/**
 * Get the user agent that is used to make requests.
 *
 * @return {string} User agent
 */
Crawler.prototype.getUserAgent = function (url) {
  if (typeof this._userAgent === 'function') {
    return this._userAgent(url);
  }

  return this._userAgent;
};

/**
 * Custom options to be passed to the request library.
 *
 * @return {Object} Object of request options to be merged with the defaults.
 */
Crawler.prototype.getRequestOptions = function () {
  return this._request;
};

/**
 * Start the crawler. Pages will be crawled according to the configuration
 * provided to the Crawler's constructor.
 *
 * @return {Boolean} True if crawl started; false if crawl already running.
 */
Crawler.prototype.start = function () {
  var concurrentRequestsLimit,
      i;

  // TODO can only start when there are no outstanding requests.

  if (this._started) {
    return false;
  }

  concurrentRequestsLimit = this.getConcurrentRequestsLimit();
  this._started = true;

  for (i = 0; i < concurrentRequestsLimit; i++) {
    this._crawlTick();
  }

  return true;
};

/**
 * Prevent crawling of any further URLs.
 */
Crawler.prototype.stop = function () {
  this._started = false;
};

Crawler.prototype.addHandler = function (contentType, handler) {
  // if this method is called as addHandler(\Function), that means the
  // handler will deal with all content types.
  if (arguments.length === 1) {
    return this.addHandler("*", arguments[0]);
  }

  this._handlers.push({
    contentType: contentType,
    handler: handler
  });

  return true;
};

/**
 * Check if we are allowed to send a request and, if we are, send it. If we
 * are not, reschedule the request for NOW + INTERVAL in the future.
 */
Crawler.prototype._crawlTick = function () {
  var urlList,
      nextRequestDate,
      concurrentRequestsLimit,
      nowDate,
      self = this;

  // Crawling has stopped, so don't start any new requests
  if (!this._started) {
    return;
  }

  urlList = this.getUrlList();
  nextRequestDate = this._getNextRequestDate();
  concurrentRequestsLimit = this.getConcurrentRequestsLimit();
  nowDate = new Date();

  // Check if we are allowed to send the request yet. If we aren't allowed,
  // schedule the request for LAST_REQUEST_DATE + INTERVAL.
  if (nextRequestDate - nowDate > 0) {
    this._scheduleNextTick();

    return;
  }

  // lastRequestDate must always be set SYNCHRONOUSLY! This is because there
  // will be multiple calls to _crawlTick.
  this._lastRequestDate = nowDate;

  urlList.getNextUrl().then(function (urlObj) {
    var url = urlObj.getUrl();

    // We keep track of number of outstanding requests. If this is >= 1, the
    // queue is still subject to change -> so we do not wish to declare
    // urllistcomplete until those changes are synced with the \UrlList.
    self._outstandingRequests++;

    return self._processUrl(url).then(function (resultUrl) {
      return urlList.upsert(resultUrl);
    }).finally(function () {
      self._outstandingRequests--;
    });
  }).catch(RangeError, function () {
    self.emit("urllistempty");

    if (self._outstandingRequests === 0) {
      self.emit("urllistcomplete");
    }
  }).finally(function () {
    // We must schedule the next check. Note that _scheduleNextTick only ever
    // gets called once and once only PER CALL to _crawlTick.
    self._scheduleNextTick();
  });
};

/**
 * Start the crawl process for a specific URL. This method will first check
 * robots.txt to make sure it allowed to crawl the URL.
 *
 * @param  {string} url   The URL to crawl.
 * @return {Promise}      Promise of result URL object.
 */
Crawler.prototype._processUrl = function (url) {
  var self = this,
      response,
      urlList;

  urlList = this.getUrlList();
  this.emit("crawlurl", url);

  // perform url download
  var downloadPromise = null;
  if (this._robotsEnabled) {
    downloadPromise = this._downloadAndCheckRobots(url).then(function () {
      return self._downloadUrl(url, false);
    });
  } else {
    downloadPromise = this._downloadUrl(url, false);
  }

  return downloadPromise.then(function (_response) {
    var contentType,
        statusCode,
        location;

    response = _response;
    contentType = response.headers["content-type"] || mime.lookup(url);
    statusCode = response.statusCode;
    location = response.headers.location;

    // If this is a redirect, we follow the location header.
    // Otherwise, we get the discovered URLs from the content handlers.
    if (statusCode >= 300 && statusCode < 400) {
      self.emit("redirect", url, location);
      return [urlMod.resolve(url, location)];
    } else {
      return self._fireHandlers(contentType, response.body, url).catch(function (err) {
        self.emit("handlersError", err);
        err = new error.HandlersError("A handlers error occured. " + err.message);

        return Promise.reject(err);
      });
    }
  }).then(function (links) {
    var insertProm;

    self.emit("links", url, links);

    if (typeof urlList.insertIfNotExistsBulk === "undefined") {
      insertProm = Promise.map(links, function (link) {
        return urlList.insertIfNotExists(new Url({
          url: link
        }));
      });
    } else {
      insertProm = urlList.insertIfNotExistsBulk(links.map(function (link) {
        return new Url({
          url: link
        });
      }));
    }

    return insertProm;
  }).then(function () {
    return new Url({
      url: url,
      errorCode: null,
      statusCode: response.statusCode
    });
  }).catch(error.RobotsNotAllowedError, function (err) {
    return new Url({
      url: url,
      errorCode: "ROBOTS_NOT_ALLOWED",
      errorMessage: err.message
    });
  }).catch(error.HttpError, function (err) {
    self.emit("httpError", err, url);

    return new Url({
      url: url,
      errorCode: "HTTP_ERROR",
      statusCode: err.statusCode
    });
  }).catch(error.RequestError, function (err) {
    return new Url({
      url: url,
      errorCode: "REQUEST_ERROR",
      errorMessage: err.message
    });
  }).catch(error.HandlersError, function (err) {
    return new Url({
      url: url,
      errorCode: "HANDLERS_ERROR",
      errorMessage: err.message
    });
  }).catch(function (err) {
    return new Url({
      url: url,
      errorCode: "OTHER_ERROR",
      errorMessage: err.message
    });
  }).then(function (url) {
    self.emit("crawledurl", url.getUrl(), url.getErrorCode(), url.getStatusCode());

    return url;
  });
};

/**
 * Fire any matching handlers for a particular page that has been crawled.
 *
 * @param  {string} contentType Content type, e.g. "text/html; charset=utf8"
 * @param  {string} body        Body content.
 * @param  {string} url         Page URL, absolute.
 * @return {Promise}            Promise returning an array of discovered links.
 */
Crawler.prototype._fireHandlers = function (contentType, body, url) {
  var ctx;

  contentType = contentType.replace(/;.*$/g, "");

  ctx = {
    body: body,
    url: url,
    contentType: contentType
  };

  return Promise.reduce(this._handlers, function (arr, handlerObj) {
    var handlerContentType = handlerObj.contentType,
        handlerFun = handlerObj.handler,
        match = false;

    if (handlerContentType === "*") {
      match = true;
    } else if (Array.isArray(handlerContentType) && (handlerContentType).indexOf(contentType) > -1) {
      match = true;
    } else if ((contentType + "/").indexOf(handlerContentType + "/") === 0) {
      match = true;
    }

    if (!match) {
      return Promise.resolve(arr);
    }

    return Promise.try(function () {
      return handlerFun(ctx);
    }).then(function (subArr) {
      if (!(subArr instanceof Array)) {
        subArr = [];
      }

      return arr.concat(subArr);
    });
  }, []);
};

/**
 * Download a particular URL. Generally speaking, we do not want to follow
 * redirects, because we just add the destination URLs to the queue and crawl
 * them later. But, when requesting /robots.txt, we do follow the redirects.
 * This is an edge case.
 *
 * @param  {string} url             URL to fetch.
 * @param  {Boolean} followRedirect True if redirect should be followed.
 * @return {Promise}                Promise of result.
 */
Crawler.prototype._downloadUrl = function (url, followRedirect) {
  var defaultOptions,
      requestOptions;

  defaultOptions = {
    url: url,
    forever: true,
    headers: {
      "User-Agent": this.getUserAgent(url)
    },
    encoding: null,
    followRedirect: Boolean(followRedirect),
    gzip: true
  };
  requestOptions = _.merge(defaultOptions, this.getRequestOptions());

  return request(requestOptions).catch(function (err) {
    err = new error.RequestError("A request error occured. " + err.message);

    return Promise.reject(err);
  }).then(function (response) {
    var err;

    if (response.statusCode >= 400) {
      err = new error.HttpError("HTTP status code is " + response.statusCode);
      err.statusCode = response.statusCode;

      return Promise.reject(err);
    }

    return response;
  });
};

/**
 * For a specific URL, download the robots.txt file and check the URL against
 * it.
 *
 * @param  {string} url  URL to be checked.
 * @return {Promise}     Promise resolves if allowed, rejects if not allowed.
 */
Crawler.prototype._downloadAndCheckRobots = function (url) {
  var self = this;

  return this._getOrDownloadRobots(url).then(function (robotsTxt) {
    var robots,
        isAllowed;

    robots = robotsParser(self._getRobotsUrl(url), robotsTxt);
    isAllowed = robots.isAllowed(url, self.getUserAgent(url));

    if (!isAllowed) {
      return Promise.reject(new error.RobotsNotAllowedError("The URL is " +
        url + " is not allowed to be crawled due to robots.txt exclusion"));
    }
  });
};

/**
 * Fetch the robots.txt file from our cache or, if the cache has expired,
 * send a request to the server to download it.
 *
 * @param  {string} url  URL to get robots.txt for.
 * @return {Promise}     Promise returning the string result of robots.txt.
 */
Crawler.prototype._getOrDownloadRobots = function (url) {
  var robotsUrl,
      robotsTxt,
      ignoreServerError,
      self = this;

  // Check if this robots.txt file already exists in the cache.
  robotsUrl = this._getRobotsUrl(url);
  robotsTxt = this._robotsCache.get(robotsUrl);
  ignoreServerError = this._robotsIgnoreServerError;

  if (typeof robotsTxt !== "undefined") {
    return Promise.resolve(robotsTxt);
  }

  // We want to add /robots.txt to the crawl queue. This is because we may
  // parse the robots.txt file with a content handler, in order to extract
  // it's Sitemap: directives. (And then we'll crawl those sitemaps too!)
  return this.getUrlList().insertIfNotExists(new Url({
    url: robotsUrl
  })).then(function () {
    // robots.txt doesn't exist in the cache, so we have to hit the
    // server to get it.
    return self._downloadUrl(robotsUrl, true);
  }).catch(error.HttpError, function (err) {
    var robotsStatusCode = err.statusCode;

    // if robots returns a dismissable status code, we assume
    // there are no restrictions.
    switch (robotsStatusCode) {
        case 404:
        case 410:
        case 500:
            if (robotsStatusCode === 500 && !ignoreServerError) {
                break;
            }

            return Promise.resolve({
                statusCode: 200,
                body: ""
            });
    }

    // but if there is another status code, we stop crawling the entire website
    return Promise.reject(new error.RobotsNotAllowedError("No crawling is " +
      "allowed because robots.txt could not be crawled. Status code " +
      robotsStatusCode));
  }).then(function (response) {
    var body,
        robotsTxt;

    body = response.body;
    robotsTxt = body.toString();
    self._robotsCache.set(robotsUrl, robotsTxt);

    return robotsTxt;
  });
};

/**
 * Given any URL, find the corresponding URL for the /robots.txt file. Robots
 * files are unique per (host, protcol, port) combination.
 *
 * @param  {string} url  Any URL.
 * @return {string}      URL of robots.txt, e.g. https://example.com/robots.txt
 */
Crawler.prototype._getRobotsUrl = function (url) {
  var parsedUrl,
      robotsUrl;

  parsedUrl = urlMod.parse(url);

  // There's a robots for every (host, protocol, port) combination
  robotsUrl = urlMod.format({
    host: parsedUrl.host,
    protocol: parsedUrl.protocol,
    port: parsedUrl.port || null,
    pathname: "/robots.txt"
  });

  return robotsUrl;
};

/**
 * Get the \Date that we are allowed to send another request. If we haven't
 * already sent a request, this will return the current date.
 *
 * @return {Date} Date of next request.
 */
Crawler.prototype._getNextRequestDate = function () {
  var interval,
      lastRequestDate,
      nextRequestDate;

  interval = this.getInterval();
  lastRequestDate = this._lastRequestDate;

  if (!lastRequestDate) {
    nextRequestDate = new Date();
  } else {
    nextRequestDate = new Date(lastRequestDate.getTime() + interval);
  }

  return nextRequestDate;
};

/**
 * Work out when we are allowed to send another request, and schedule a call
 * to _crawlTick.
 */
Crawler.prototype._scheduleNextTick = function () {
  var nextRequestDate,
      nowDate,
      delayMs,
      self = this;

  nextRequestDate = this._getNextRequestDate();
  nowDate = new Date();
  delayMs = Math.max(0, nextRequestDate - nowDate);

  setTimeout(function () {
    self._crawlTick();
  }, delayMs);
};

module.exports = Crawler;
