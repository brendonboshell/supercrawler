var Url;

/**
 * Represents a URL, that is either waiting to be crawled or has already
 * been crawled. It also contains some state information, i.e. whether or not
 * the page was crawled, status code, etc.
 *
 * @param {Object|string} opts Options about this URL. Can also be string URL.
 */
Url = function (opts) {
  if (!(this instanceof Url)) {
    return new Url(opts);
  }

  if (typeof opts === "string") {
    opts = {
      url: opts
    };
  }

  this._url = opts.url;
  this._statusCode = opts.statusCode ? opts.statusCode : null;
};

/**
 * Get the string that uniquely identifies this record; typically the URL.
 * This will ensure that the object is replaced when added to a \UrlList.
 *
 * @return {string} Unique identifier
 */
Url.prototype.getUniqueId = function () {
  return this._url;
};

/**
 * Return the status code of the crawl.
 *
 * @return {number|null} Status code, or null if crawl hasn't completed.
 */
Url.prototype.getStatusCode = function () {
  return this._statusCode;
};

module.exports = Url;
