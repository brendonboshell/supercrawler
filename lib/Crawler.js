var Crawler,
    FifoUrlList = require("./FifoUrlList"),
    DEFAULT_INTERVAL = 1000,
    DEFAULT_CONCURRENT_REQUESTS_LIMIT = 5;

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
};

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
 * Start the crawler. Pages will be crawled according to the configuration
 * provided to the Crawler's constructor.
 *
 * @return {Boolean} True if crawl started; false if crawl already running.
 */
Crawler.prototype.start = function () {
  var concurrentRequestsLimit,
      i;

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
 * Check if we are allowed to send a request and, if we are, send it. If we
 * are not, reschedule the request for NOW + INTERVAL in the future.
 */
Crawler.prototype._crawlTick = function () {
  var urlList,
      nextRequestDate,
      concurrentRequestsLimit,
      nowDate,
      self = this;

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

  urlList.getNextUrl().finally(function () {
    // We must schedule the next check. Note that _scheduleNextTick only ever
    // gets called once and once only PER CALL to _crawlTick.
    self._scheduleNextTick();
  });
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
