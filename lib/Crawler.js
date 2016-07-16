var Crawler;

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
};

module.exports = Crawler;
