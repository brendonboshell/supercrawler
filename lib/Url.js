if (!URL) {
  var URL = require("url").URL;
}

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

  this._url = new URL(opts.url).href;
  this._statusCode = opts.statusCode ? opts.statusCode : null;
  this._errorCode = opts.errorCode ? opts.errorCode : null;
  this._errorMessage = opts.errorMessage ? opts.errorMessage : null;
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
 * Get the string URL that is to be requested.
 *
 * @return {string} URL.
 */
Url.prototype.getUrl = function () {
  return this._url;
};

/**
 * Get the error code of the the crawl.
 *
 * @return {string|null} String error code, or null if no error.
 */
Url.prototype.getErrorCode = function () {
  return this._errorCode;
};

/**
 * Return the status code of the crawl.
 *
 * @return {number|null} Status code, or null if crawl hasn't completed.
 */
Url.prototype.getStatusCode = function () {
  return this._statusCode;
};

/**
 * Return the error message of the URL.
 *
 * @return {string} Error message string.
 */
Url.prototype.getErrorMessage = function () {
  if (typeof this._errorMessage === "string") {
    return this._errorMessage.substr(0, 1000);
  }

  return null;
};

module.exports = Url;
