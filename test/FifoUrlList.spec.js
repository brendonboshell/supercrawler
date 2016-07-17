var FifoUrlList = require("../lib/FifoUrlList"),
    expect = require("chai").expect,
    makeUrl;

makeUrl = function (url, statusCode) {
  function Url(opts) {
    this.url = opts.url;
    this.statusCode = opts.statusCode;
  }

  Url.prototype.getUniqueId = function () {
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

describe("FifoUrlList", function () {
  it("returns an instance when called as a function", function () {
    expect(FifoUrlList()).to.be.an.instanceOf(FifoUrlList);
  });

  it("returns an element that's been added", function (done) {
    var fifoUrlList,
        url;

    fifoUrlList = new FifoUrlList();
    url = makeUrl("https://example.com");
    fifoUrlList.insert(url).then(function () {
      return fifoUrlList.getNextUrl();
    }).then(function (res) {
      expect(res).to.equal(url);
      done();
    });
  });

  it("gives error if getting next URL when list is empty", function (done) {
    new FifoUrlList().getNextUrl().catch(function (err) {
      expect(err).to.be.an.instanceOf(RangeError);
      done();
    });
  });

  it("returns the first element in FIFO queue", function (done) {
    var fifoUrlList,
        url1,
        url2;

    fifoUrlList = new FifoUrlList();
    url1 = makeUrl("https://example.com");
    url2 = makeUrl("https://example.com/privacy.html");
    fifoUrlList.insert(url1).then(function () {
      return fifoUrlList.insert(url2);
    }).then(function () {
      return fifoUrlList.getNextUrl();
    }).then(function (res) {
      expect(res).to.equal(url1);
      done();
    });
  });

  it("returns the second element in FIFO queue", function (done) {
    var fifoUrlList,
        url1,
        url2;

    fifoUrlList = new FifoUrlList();
    url1 = makeUrl("https://example.com");
    url2 = makeUrl("https://example.com/privacy.html");
    fifoUrlList.insert(url1).then(function () {
      return fifoUrlList.insert(url2);
    }).then(function () {
      return fifoUrlList.getNextUrl();
    }).then(function () {
      return fifoUrlList.getNextUrl();
    }).then(function (res) {
      expect(res).to.equal(url2);
      done();
    });
  });

  it("updates the queue item if a duplicate", function (done) {
    var fifoUrlList,
        url1,
        url2;

    fifoUrlList = new FifoUrlList();
    url1 = makeUrl("https://example.com", null);
    url2 = makeUrl("https://example.com", 200);
    fifoUrlList.insert(url1).then(function () {
      return fifoUrlList.insert(url2);
    }).then(function () {
      return fifoUrlList.getNextUrl();
    }).then(function (res) {
      expect(res.getStatusCode()).to.equal(200);
      done();
    });
  });
});
