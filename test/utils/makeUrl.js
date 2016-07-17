module.exports = function (url, statusCode) {
  function Url(opts) {
    this.url = opts.url;
    this.statusCode = opts.statusCode;
  }

  Url.prototype.getUniqueId = function () {
    return this.url;
  };

  Url.prototype.getUrl = function () {
    return this.url;
  };

  Url.prototype.getStatusCode = function () {
    return this.statusCode;
  };

  return new Url({
    url: url,
    statusCode: statusCode || null
  });
};
