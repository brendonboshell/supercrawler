var RedisUrlList,
    urlMod = require("url"),
    Redis = require("ioredis"),
    Url = require("./Url"),
    Promise = require("bluebird"),
    DEFAULT_DELAY_HALF_LIFE_MS = 3600 * 1000,
    DEFAULT_EXPIRY_TIME_MS = 30 * 86400 * 1000,
    DEFAULT_INITIAL_RETRY_TIME_MS = 3600 * 1000,
    LOCK_TIME_MS = 60 * 1000;
/**
 * A Redis backed queue that features retry logic and equal distribution between
 * hosts.
 *
 * @param {Object} opts Options
 */
RedisUrlList = function (opts) {
  if (!(this instanceof RedisUrlList)) {
    return new RedisUrlList(opts);
  }

  this._delayHalfLifeMs = opts.delayHalfLifeMs || DEFAULT_DELAY_HALF_LIFE_MS;
  this._expiryTimeMs = opts.expiryTimeMs || DEFAULT_EXPIRY_TIME_MS;
  this._initialRetryTimeMs = opts.initialRetryTimeMs || DEFAULT_INITIAL_RETRY_TIME_MS;
  this._redis = new Redis(opts.redis);
  this._redis.defineCommand("zaddwithdelay", {
    numberOfKeys: 3,
    lua: "\n" +
      "local key = KEYS[1]\n" +
      "local delayKey = KEYS[2]\n" +
      "local lastupdateKey = KEYS[3]\n" +
      "local member = ARGV[1]\n" +
      "local nowTime = tonumber(ARGV[2])\n" +
      "local halflife = tonumber(ARGV[3])\n" +
      "local getDelayRes\n" +
      "local currentDelay = 0\n" +
      "local newDelay\n" +
      "local currentLastUpdate = nowTime\n" +
      "local diff\n" +
      "local rankRes = redis.call('zrank', key, member)\n" +
      "if (rankRes == false) then\n" +
      "\tgetDelayRes = redis.call('get', delayKey)\n" +
      "\tif (getDelayRes ~= false) then\n" +
      "\t\tcurrentDelay = tonumber(getDelayRes)\n" +
      "\t\tcurrentLastUpdate = tonumber(redis.call('get', lastupdateKey))\n" +
      "\tend\n" +
      "\tdiff = nowTime - currentLastUpdate\n" +
      "\tnewDelay = currentDelay * math.exp(math.log(0.5) / halflife * diff) + 1\n" +
      "\tredis.call('set', delayKey, newDelay)\n" +
      "\tredis.call('set', lastupdateKey, nowTime)\n" +
      "\treturn redis.call('zadd', key, newDelay, member)\n" +
      "end\n" +
      "return 0"
  });
  this._redis.defineCommand("zaddreseterrors", {
    numberOfKeys: 3,
    lua: "\n" +
      "local key = KEYS[1]\n" +
      "local errorsKey = KEYS[2]\n" +
      "local errorKey = KEYS[3]\n" +
      "local crawlTime = tonumber(ARGV[1])\n" +
      "local member = ARGV[2]\n" +
      "local hdelRes = redis.call('hdel', errorKey, 'numErrors', 'statusCode', 'errorCode', 'errorMessage')\n" +
      "if (hdelRes ~= 0) then\n" +
      "\tredis.call('srem', errorsKey, errorKey)\n" +
      "end\n" +
      "return redis.call('zadd', key, crawlTime, member)"
  });
  this._redis.defineCommand("zaddwithretrydelay", {
    numberOfKeys: 3,
    lua: "\n" +
      "local key = KEYS[1]\n" +
      "local errorsKey = KEYS[2]\n" +
      "local errorKey = KEYS[3]\n" +
      "local nowTime = tonumber(ARGV[1])\n" +
      "local member = ARGV[2]\n" +
      "local initialRetryTime = tonumber(ARGV[3])\n" +
      "local statusCode = ARGV[4]\n" +
      "local errorCode = ARGV[5]\n" +
      "local errorMessage = ARGV[6]\n" +
      "local numErrors = redis.call('hincrby', errorKey, 'numErrors', 1)\n" +
      "redis.call('hset', errorKey, 'statusCode', statusCode)\n" +
      "redis.call('hset', errorKey, 'errorCode', errorCode)\n" +
      "redis.call('hset', errorKey, 'errorMessage', errorMessage)\n" +
      "redis.call('sadd', errorsKey, errorKey)\n" +
      "local crawlTime = nowTime + initialRetryTime * 2 ^ (numErrors - 1)\n" +
      "return redis.call('zadd', key, crawlTime, member)"
  });
  this._redis.defineCommand("zrangebyscoreandlock", {
    numberOfKeys: 1,
    lua: "\n" +
      "local key = KEYS[1]\n" +
      "local fromTime = ARGV[1]\n" +
      "local toTime = ARGV[2]\n" +
      "local lockTimeMs = ARGV[3]\n" +
      "local zrangebyscoreRes = redis.call('zrangebyscore', key, fromTime, toTime, 'LIMIT', 0, 1)\n" +
      "if (zrangebyscoreRes[1] ~= nil) then\n" +
      "\tredis.call('zadd', key, toTime + lockTimeMs, zrangebyscoreRes[1])\n" +
      "end\n" +
      "return zrangebyscoreRes"
  });
};

/**
 * Add URL to queue if it doesn't already exist. If it is a new URL, it is
 * given a delay based on number of URLs that have been crawled in the past.
 * This delay decays according to the `delayHalfLifeMs` option. This ensures
 * that, if we crawl a website's sitemaps, we don't get stuck in crawling those
 * URLs first.
 *
 * @param  {Url} url     Url object.
 * @return {Promise}     Promise resolves when URL added to queue.
 */
RedisUrlList.prototype.insertIfNotExists = function (url) {
  return this.insertIfNotExistsBulk([url]);
};

RedisUrlList.prototype.insertIfNotExistsBulk = function (urls) {
  var self = this;

  return this._redis.pipeline(urls.map(function (url) {
    var urlObj,
        hostname = "OTHER";

    urlObj = urlMod.parse(url.getUrl());

    if (urlObj && urlObj.hostname) {
      hostname = urlObj.hostname;
    }

    return [
      "zaddwithdelay",
      "scheduledcrawls",
      "hostdelay:" + hostname,
      "hostlastupdate:" + hostname,
      url.getUrl(),
      new Date().getTime(),
      self._delayHalfLifeMs
    ];
  })).exec().then(function (res) {
    res.forEach(function (commandRes) {
      if (commandRes[0] !== null) {
        throw commandRes[0];
      }
    });
  });
};

/**
 * Update the URL record, delaying it by an exponentially increasing factor if
 * the crawl failed.
 *
 * @param  {Url} url     Url object.
 * @return {Promise}     Promise resolved once updated.
 */
RedisUrlList.prototype.upsert = function (url) {
  var nextCrawlTimeMs;

  if (url.getErrorCode() === null) {
    nextCrawlTimeMs = new Date(new Date().getTime() + this._expiryTimeMs).getTime();

    return this._redis.zaddreseterrors(
      "scheduledcrawls",
      "errors",
      "error:" + url.getUrl(),
      nextCrawlTimeMs,
      url.getUrl()
    );
  } else {
    return this._redis.zaddwithretrydelay(
      "scheduledcrawls",
      "errors",
      "error:" + url.getUrl(),
      new Date().getTime(),
      url.getUrl(),
      this._initialRetryTimeMs,
      url.getStatusCode(),
      url.getErrorCode(),
      url.getErrorMessage()
    );
  }
};

/**
 * Get the next URL to be crawled.
 *
 * @return {Promise} Resolves with the \Url for the next crawl.
 */
RedisUrlList.prototype.getNextUrl = function () {
  return this._redis.zrangebyscoreandlock(
    "scheduledcrawls",
    "-inf",
    new Date().getTime(),
    LOCK_TIME_MS
  ).then(function (res) {
    if (!res[0]) {
      return Promise.reject(new RangeError("The list has been exhausted."));
    }

    return new Url({
      url: res[0]
    });
  });
};

module.exports = RedisUrlList;
