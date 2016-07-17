var Crawler,
    FifoUrlList = require("./FifoUrlList");

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

  if (typeof opts.urlList === "undefined") {
    this._urlList = new FifoUrlList();
  } else {
    this._urlList = opts.urlList;
  }
};

/**
 * Returns the instance of a \UrlList object that is being used. Unless
 * specified to the constructor, this will be \FifoUrlList type
 *
 * @return {UrlList} Instance of \UrlList type object.
 */
Crawler.prototype.getUrlList = function () {
  var urlList;

  urlList = this._urlList;

  if (typeof urlList === "undefined") {
    throw new Error("No urlList is specified");
  }

  return urlList;
};

module.exports = Crawler;
