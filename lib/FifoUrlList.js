var FifoUrlList,
    Promise = require("bluebird");

/**
 * A simple queue for \Url objects that holds the queue in-memory and works
 * in a first-in, first-out fashion. Note that all \Url, even those that
 * are "popped", are kept in-memory because they store crawl state info, too.
 */
FifoUrlList = function () {
  if (!(this instanceof FifoUrlList)) {
    return new FifoUrlList();
  }

  this._list = [];
  this._listIndexesByUniqueId = {};
  this._nextIndex = 0;
};

/**
 * Insert a \Url object into the queue. Resolves even if record currently
 * exists.
 *
 * @param  {Url} url     \Url object
 * @return {Promise}     Returns the inserted object with a promise.
 */
FifoUrlList.prototype.insertIfNotExists = function (url) {
  var uniqueId,
      currentIndex;

  uniqueId = url.getUniqueId();
  currentIndex = this._listIndexesByUniqueId[uniqueId];

  if (typeof currentIndex === "undefined") {
    this._pushUrlToList(url);
  }

  return Promise.resolve(url);
};

/**
 * Insert a new URL, or update it if it already exists. This method is used
 * to update the state of a crawl.
 *
 * @param  {Url} url     \Url object
 * @return {Promise}     Returns the inserted object with a promise.
 */
FifoUrlList.prototype.upsert = function (url) {
  var uniqueId,
      self = this;

  uniqueId = url.getUniqueId();

  return this.insertIfNotExists(url).then(function () {
    var currentIndex;

    currentIndex = self._listIndexesByUniqueId[uniqueId];
    self._list[currentIndex] = url;
  });
};

/**
 * Insert a URL that isn't already in the list, i.e. update the list array
 * and the lookup object.
 *
 * @param  {Url} url    \Url object
 * @return {number}     Index of the record that has been inserted.
 */
FifoUrlList.prototype._pushUrlToList = function (url) {
  var listLength,
      uniqueId;

  listLength = this._list.length;
  uniqueId = url.getUniqueId();
  this._list[listLength] = url;
  this._listIndexesByUniqueId[uniqueId] = listLength;

  return listLength;
};

/**
 * Get the next URL that should be crawled. In this list, URLs are crawled
 * in a first-in, first-out fashion. They are never crawled twice, even if the
 * first request failed.
 *
 * @return {Promise} Returns the next \Url to crawl with a promise.
 */
FifoUrlList.prototype.getNextUrl = function () {
  var item;

  if (this._nextIndex >= this._list.length) {
    return Promise.reject(new RangeError("The list has been exhausted."));
  }

  item = this._list[this._nextIndex];
  this._nextIndex++;

  return Promise.resolve(item);
};

module.exports = FifoUrlList;
