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
 * Insert a \Url object into the queue. If it already exists, update it.
 *
 * @param  {Url} url     \Url object
 * @return {Promise}     Returns the inserted object with a promise.
 */
FifoUrlList.prototype.insert = function (url) {
  var uniqueId,
      currentIndex;

  uniqueId = url.getUniqueId();
  currentIndex = this._listIndexesByUniqueId[uniqueId];

  if (typeof currentIndex !== "undefined") {
    this._list[currentIndex] = url;
  } else {
    this._pushUrlToList(url);
  }

  return Promise.resolve(url);
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
