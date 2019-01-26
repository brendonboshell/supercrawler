var proxyquire = require('proxyquire'),
    sinon = require("sinon"),
    expect = require("chai").expect,
    makeUrl = require("./utils/makeUrl"),
    Promise = require("bluebird");

// Note: I cannot get sinon's useFakeTimers to behave with Bluebird's
// promises. The calls to .finally(\Function) seem to only be called at the
// last minute. Instead, the tests are using actual timing, which is not ideal.

describe("Crawler", function () {
  var Crawler,
      listSize,
      FifoUrlListMock,
      requestSpy,
      insertIfNotExistsSpy,
      insertIfNotExistsBulkSpy,
      upsertSpy,
      pageContentType,
      pageLocationHeader,
      pageStatusCode,
      pageBody,
      robotsStatusCode,
      robotsTxt;

  beforeEach(function () {
    pageContentType = "text/html";
    pageStatusCode = 200;
    pageBody = "<html><body>test</body></html>";
    robotsStatusCode = 200;
    robotsTxt = ["User-agent: *",
      "Allow: /",
      "Disallow: /index17.html"
    ].join("\n");
    listSize = 20;

    FifoUrlListMock = function () {
      this.callCount = 0;
      this.delayTime = 1;
    };

    FifoUrlListMock.prototype.getNextUrl = function () {
      var self = this;

      this.callCount++;

      if (this.callCount > listSize) {
        return Promise.reject(new RangeError("rangeerror"));
      }

      return Promise.delay(this.delayTime).then(function () {
        return makeUrl("https://example.com/index" + self.callCount + ".html");
      });
    };

    requestSpy = sinon.spy(function (opts, cb) {
      if (opts.url.indexOf("robots") === -1) {
        setTimeout(function () {
          var headers = {};

          if (pageContentType) {
            headers["content-type"] = pageContentType;
          }

          if (pageLocationHeader) {
            headers.location = pageLocationHeader;
          }

          if (pageStatusCode === 0) {
            return cb(new Error("Some request error"));
          }

          cb(null, {
            headers: headers,
            statusCode: pageStatusCode,
            body: new Buffer(pageBody)
          });
        }, 1);
      } else {
        setTimeout(function () {
          if (robotsStatusCode === 0) {
            return cb(new Error("Some request error"));
          }

          cb(null, {
            headers: {
              "content-type": "text/plain"
            },
            statusCode: robotsStatusCode,
            body: new Buffer(robotsTxt)
          });
        }, 1);
      }
    });

    insertIfNotExistsSpy = sinon.spy(function () {
      return Promise.resolve();
    });

    FifoUrlListMock.prototype.insertIfNotExists = insertIfNotExistsSpy;

    insertIfNotExistsBulkSpy = sinon.spy(function () {
      return Promise.resolve();
    });

    upsertSpy = sinon.spy(function () {
      return Promise.resolve();
    });

    FifoUrlListMock.prototype.upsert = upsertSpy;

    Crawler = proxyquire("../lib/Crawler", {
      "./FifoUrlList": FifoUrlListMock,
      "request": requestSpy
    });
  });

  var numCrawlsOfUrl = function (url, followRedirect) {
    var numCalls = 0;
    var n = 0;
    var call;

    while (requestSpy.getCall(n)) {
      call = requestSpy.getCall(n);

      if (call.calledWith(sinon.match({
        url: url,
        forever: true,
        followRedirect: followRedirect
      }))) {
        numCalls++;
      }

      n++;
    }

    return numCalls;
  };

  var numRobotsCalls = function () {
    return numCrawlsOfUrl("https://example.com/robots.txt", true);
  };

  it("returns an instance when called as a function", function () {
    expect(Crawler()).to.be.an.instanceOf(Crawler);
  });

  describe("#getUrlList", function () {
    it("if no urlList is specified, defaults to a FifoUrlList", function () {
      var crawler = new Crawler();

      expect(crawler.getUrlList()).to.be.an.instanceOf(FifoUrlListMock);
    });

    it("can use a specified UrlList instance", function () {
      var urlList = new FifoUrlListMock();
      var crawler = new Crawler({
        urlList: urlList
      });

      expect(crawler.getUrlList()).to.equal(urlList);
    });
  });

  describe("#getInterval", function () {
    it("uses a default interval of 1000ms", function () {
      expect(new Crawler().getInterval()).to.equal(1000);
    });

    it("will use a specified interval", function () {
      expect(new Crawler({
        interval: 5000
      }).getInterval()).to.equal(5000);
    });
  });

  describe("#getConcurrentRequestsLimit", function () {
    it("uses a default setting of 5", function () {
      expect(new Crawler().getConcurrentRequestsLimit()).to.equal(5);
    });

    it("will use a specified limit", function () {
      expect(new Crawler({
        concurrentRequestsLimit: 99
      }).getConcurrentRequestsLimit()).to.equal(99);
    });
  });

  describe("#getUserAgent", function () {
    it("uses a default user agent", function () {
      expect(new Crawler().getUserAgent()).to.equal("Mozilla/5.0 " +
        "(compatible; supercrawler/1.0; " +
        "+https://github.com/brendonboshell/supercrawler)");
    });

    it("will use a specified user agent", function () {
      expect(new Crawler({
        userAgent: "mybot/1.1"
      }).getUserAgent()).to.equal("mybot/1.1");
    });
  });

  describe("#start", function () {
    it("returns false if crawl is already running", function () {
      var crawler;

      crawler = new Crawler();
      crawler.start();

      expect(crawler.start()).to.equal(false);
      crawler.stop();
    });

    it("returns true if crawl is not already started", function () {
      var crawler;

      crawler = new Crawler();

      expect(crawler.start()).to.equal(true);
      crawler.stop();
    });

    it("emits a urllistempty event if no URLs", function (done) {
      var crawler = new Crawler({ interval: 50 }),
          listenSpy = sinon.spy();

      listSize = 0;
      crawler.on("urllistempty", listenSpy);
      crawler.start();

      setTimeout(function () {
        crawler.stop();
        sinon.assert.called(listenSpy);
        done();
      }, 100);
    });

    it("emits urllistempty if list is intermittently empty", function (done) {
      var urlList = new FifoUrlListMock(),
          crawler = new Crawler({
            urlList: urlList,
            interval: 200,
            concurrentRequestsLimit: 2
          }),
          listenSpy = sinon.spy();

      listSize = 1;
      urlList.upsert = function () {
        return Promise.delay(250).then(function () {
          urlList.callCount = 0;
        });
      };
      crawler.on("urllistempty", listenSpy);
      crawler.start();

      setTimeout(function () {
        crawler.stop();
        sinon.assert.called(listenSpy);
        done();
      }, 300);
    });

    it("does not emit urllistcomplete if list is intermittently empty", function (done) {
      var urlList = new FifoUrlListMock(),
          crawler = new Crawler({
            urlList: urlList,
            interval: 200,
            concurrentRequestsLimit: 2
          }),
          listenSpy = sinon.spy();

      listSize = 1;
      urlList.upsert = function () {
        return Promise.delay(250).then(function () {
          urlList.callCount = 0;
        });
      };
      crawler.on("urllistcomplete", listenSpy);
      crawler.start();

      setTimeout(function () {
        crawler.stop();
        sinon.assert.notCalled(listenSpy);
        done();
      }, 300);
    });

    it("emits urllistcomplete if list is permanently empty", function (done) {
      var urlList = new FifoUrlListMock(),
          crawler = new Crawler({
            urlList: urlList,
            interval: 200,
            concurrentRequestsLimit: 2
          }),
          listenSpy = sinon.spy();

      listSize = 0;
      urlList.upsert = function () {
        return Promise.delay(250).then(function () {
          urlList.callCount = 0;
        });
      };
      crawler.on("urllistcomplete", listenSpy);
      crawler.start();

      setTimeout(function () {
        crawler.stop();
        sinon.assert.called(listenSpy);
        done();
      }, 300);
    });

    it("throttles requests according to the interval", function (done) {
      var crawler = new Crawler({
        interval: 50
      });
      var fifoUrlList = crawler.getUrlList();

      crawler.start();

      // call at 0ms, 50ms, 100ms
      setTimeout(function () {
        crawler.stop();
        expect(fifoUrlList.callCount).to.equal(3);
        done();
      }, 130);
    });

    it("obeys the concurrency limit", function (done) {
      var crawler = new Crawler({
        interval: 50,
        concurrentRequestsLimit: 1
      });
      var fifoUrlList = crawler.getUrlList();

      // simulate each request taking 75ms
      fifoUrlList.delayTime = 75;

      crawler.start();

      // call at 0ms finished at 75ms
      // call at 75ms finishes at 150ms
      // call at 150ms finishes at 225ms
      // call at 225ms finsihes at 300ms
      setTimeout(function () {
        crawler.stop();
        expect(fifoUrlList.callCount).to.equal(4);
        done();
      }, 280);
    });

    it("caches robots.txt for a default of 60 minutes", function () {
      var crawler = new Crawler({
        interval: 1000 * 60 * 5, // get page every 5 minutes
        concurrentRequestsLimit: 1
      });

      // There's no easy way to test this without use sinon fakeTimers (see
      // top of this file.)
      expect(crawler._robotsCache.options.stdTTL).to.equal(3600);
    });

    it("caches robots.txt for a specified amount of time", function (done) {
      var crawler = new Crawler({
        interval: 20, // 20 ms
        concurrentRequestsLimit: 1,
        robotsCacheTime: 100 // 100ms
      });

      crawler.start();

      // get robots at 0ms, 100ms, 200ms
      setTimeout(function () {
        crawler.stop();
        expect(numRobotsCalls()).to.equal(3);
        done();
      }, 280);
    });

    it("adds the robots.txt file itself to the crawl queue", function (done) {
      var crawler = new Crawler({
        interval: 10
      });

      crawler.start();

      setTimeout(function () {
        crawler.stop();
        sinon.assert.calledWith(insertIfNotExistsSpy, sinon.match({
          _url: "https://example.com/robots.txt"
        }));
        done();
      }, 200);
    });

    it("will add destination URL to queue when redirected", function (done) {
      var crawler = new Crawler({ interval: 10 });

      crawler.start();

      pageStatusCode = 301;
      pageLocationHeader = "https://example.com/destination.html";

      setTimeout(function () {
        crawler.stop();
        sinon.assert.calledWith(insertIfNotExistsSpy, sinon.match({
          _url: "https://example.com/destination.html"
        }));
        done();
      }, 200);
    });

    it("will add relative destination URL to queue when redirected", function (done) {
      var crawler = new Crawler({ interval: 10 });

      crawler.start();

      pageStatusCode = 301;
      pageLocationHeader = "/destination2.html";

      setTimeout(function () {
        crawler.stop();
        sinon.assert.calledWith(insertIfNotExistsSpy, sinon.match({
          _url: "https://example.com/destination2.html"
        }));
        done();
      }, 200);
    });

    it("requests a page that is not excluded by robots.txt", function (done) {
      var crawler = new Crawler({
        interval: 10
      });

      crawler.start();

      setTimeout(function () {
        crawler.stop();
        expect(numCrawlsOfUrl("https://example.com/index18.html", false)).to.equal(1);
        done();
      }, 200);
    });

    it("emits the crawlurl event", function (done) {
      var crawler = new Crawler({ interval: 10 });
      var spy = sinon.spy();

      crawler.on("crawlurl", spy);
      crawler.start();

      setTimeout(function () {
        crawler.stop();
        sinon.assert.calledWith(spy, "https://example.com/index18.html");
        done();
      }, 200);
    });

    it("emits a crawled event", function (done) {
      var crawler = new Crawler({ interval: 10 });
      var spy = sinon.spy();

      crawler.on("crawledurl", spy);
      crawler.start();

      setTimeout(function () {
        crawler.stop();
        sinon.assert.calledWith(spy, "https://example.com/index1.html", null, 200);
        done();
      }, 200);
    });

    it("skips page excluded by robots.txt, even if robots.txt not in cache", function (done) {
      var crawler = new Crawler({
        interval: 10
      });

      robotsTxt = ["User-agent: *",
        "Allow: /",
        "Disallow: /index1.html"
      ].join("\n");
      crawler.start();

      setTimeout(function () {
        crawler.stop();
        expect(numCrawlsOfUrl("https://example.com/index1.html", false)).to.equal(0);
        done();
      }, 200);
    });

    it("works with multiple User agent rows", function (done) {
      var crawler = new Crawler({
        interval: 10
      });

      robotsTxt = ["User-agent: *",
        "User-agent: googlebot",
        "Allow: /",
        "Disallow: /index1.html"
      ].join("\n");
      crawler.start();

      setTimeout(function () {
        crawler.stop();
        expect(numCrawlsOfUrl("https://example.com/index1.html", false)).to.equal(0);
        done();
      }, 200);
    });

    it("skips a page that is excluded by robots.txt", function (done) {
      var crawler = new Crawler({
        interval: 10
      });

      crawler.start();

      setTimeout(function () {
        crawler.stop();
        expect(numCrawlsOfUrl("https://example.com/index17.html", false)).to.equal(0);
        done();
      }, 200);
    });

    it("crawls all pages if robots.txt is 404", function (done) {
      var crawler = new Crawler({
        interval: 10
      });

      crawler.start();
      robotsStatusCode = 404;

      setTimeout(function () {
        crawler.stop();
        expect(numCrawlsOfUrl("https://example.com/index17.html", false)).to.equal(1);
        done();
      }, 200);
    });

    it("crawls all pages if robots.txt is 410", function (done) {
      var crawler = new Crawler({
        interval: 10
      });

      crawler.start();
      robotsStatusCode = 410;

      setTimeout(function () {
        crawler.stop();
        expect(numCrawlsOfUrl("https://example.com/index17.html", false)).to.equal(1);
        done();
      }, 200);
    });

    it("crawls all pages if robots.txt is 500", function (done) {
      var crawler = new Crawler({
        interval: 10,
        robotsIgnoreServerError: true
      });

      crawler.start();
      robotsStatusCode = 500;

      setTimeout(function () {
        crawler.stop();
        expect(numCrawlsOfUrl("https://example.com/index17.html", false)).to.equal(1);
        done();
      }, 200);
    });

    it("excludes all pages if robots.txt could not be crawled", function (done) {
      var crawler = new Crawler({
        interval: 10
      });

      crawler.start();
      robotsStatusCode = 600;

      setTimeout(function () {
        crawler.stop();
        expect(numCrawlsOfUrl("https://example.com/index5.html", false)).to.equal(0);
        done();
      }, 200);
    });

    it("updates the error code to ROBOTS_NOT_ALLOWED", function (done) {
      var crawler = new Crawler({
        interval: 10
      });

      crawler.start();

      setTimeout(function () {
        crawler.stop();
        sinon.assert.calledWith(upsertSpy, sinon.match({
          _url: "https://example.com/index17.html",
          _errorCode: "ROBOTS_NOT_ALLOWED"
        }));
        done();
      }, 200);
    });

    it("updates the error code for a 404", function (done) {
      var crawler = new Crawler({
        interval: 10
      });

      crawler.start();
      pageStatusCode = 404;

      setTimeout(function () {
        crawler.stop();
        sinon.assert.calledWith(upsertSpy, sinon.match({
          _url: "https://example.com/index1.html",
          _errorCode: "HTTP_ERROR",
          _statusCode: 404
        }));
        done();
      }, 200);
    });

    it("updates the error code for a request error", function (done) {
      var crawler = new Crawler({
        interval: 10
      });

      crawler.start();
      pageStatusCode = 0;

      setTimeout(function () {
        crawler.stop();
        sinon.assert.calledWith(upsertSpy, sinon.match({
          _url: "https://example.com/index1.html",
          _errorCode: "REQUEST_ERROR"
        }));
        done();
      }, 200);
    });

    it("asks for a gzipped response", function (done) {
      var crawler = new Crawler({
        interval: 10
      });

      crawler.start();

      setTimeout(function () {
        crawler.stop();
        sinon.assert.calledWith(requestSpy, sinon.match({
          gzip: true
        }));
        done();
      }, 100);
    });

    it("accepts custom request options", function (done) {
      var crawler = new Crawler({
        interval: 50,
        request: {
          headers: {
            'x-test-header': 'test'
          }
        }
      });

      crawler.start();

      setTimeout(function () {
        crawler.stop();
        sinon.assert.calledWith(requestSpy, sinon.match({
          headers: {
            'x-test-header': 'test'
          }
        }));
        done();
      }, 200);
    });
  });

  describe("#addHandler", function () {
    var handler,
        handlerRet,
        handlerType;

    beforeEach(function () {
      handlerRet = [];
      handlerType = 'resolve';
      handler = sinon.spy(function () {
        if (handlerType === 'reject') {
          return Promise.reject(handlerRet);
        } else {
          return handlerRet;
        }
      });
    });

    it("can listen to all content types", function (done) {
      var crawler = new Crawler({
        interval: 100
      });

      crawler.addHandler(handler);
      crawler.start();
      pageContentType = "text/plain";

      setTimeout(function () {
        crawler.stop();
        sinon.assert.calledWith(handler, sinon.match({
          body: sinon.match(new Buffer("<html><body>test</body></html>")),
          url: "https://example.com/index1.html",
          contentType: "text/plain"
        }));
        done();
      }, 200);
    });

    it("fires for matching content types", function (done) {
      var crawler = new Crawler({
        interval: 100
      });

      pageContentType = "text/html";
      crawler.addHandler("text/html", handler);
      crawler.start();

      setTimeout(function () {
        crawler.stop();
        sinon.assert.calledWith(handler, sinon.match({
          body: sinon.match(new Buffer("<html><body>test</body></html>")),
          url: "https://example.com/index1.html",
          contentType: "text/html"
        }));
        done();
      }, 200);
    });

    it("does not fire for non-matching content types", function (done) {
      var crawler = new Crawler({
        interval: 100
      });

      pageContentType = "text/plain";
      crawler.addHandler("text/html", handler);
      crawler.start();

      setTimeout(function () {
        crawler.stop();
        expect(handler.calledWith(sinon.match({
          body: sinon.match("<html><body>test</body></html>"),
          url: "https://example.com/index1.html"
        }))).to.equal(false);
        done();
      }, 200);
    });

    it("fires for a wide-matching content type", function (done) {
      var crawler = new Crawler({
        interval: 100
      });

      pageContentType = "text/plain";
      crawler.addHandler("text", handler);
      crawler.start();

      setTimeout(function () {
        crawler.stop();
        expect(handler.calledWith(sinon.match({
          body: sinon.match(new Buffer("<html><body>test</body></html>")),
          url: "https://example.com/index1.html"
        }))).to.equal(true);
        done();
      }, 200);
    });

    it("can fire when content type determined from extension", function (done) {
      var crawler = new Crawler({
        interval: 100
      });

      pageContentType = "";
      crawler.addHandler("text/html", handler);
      crawler.start();

      setTimeout(function () {
        crawler.stop();
        expect(handler.calledWith(sinon.match({
          body: sinon.match(new Buffer("<html><body>test</body></html>")),
          url: "https://example.com/index1.html"
        }))).to.equal(true);
        done();
      }, 200);
    });

    it("can hold fire when content type determined from extension", function (done) {
      var crawler = new Crawler({
        interval: 100
      });

      pageContentType = "";
      crawler.addHandler("text/plain", handler);
      crawler.start();

      setTimeout(function () {
        crawler.stop();
        expect(handler.calledWith(sinon.match({
          body: sinon.match("<html><body>test</body></html>"),
          url: "https://example.com/index1.html"
        }))).to.equal(false);
        done();
      }, 200);
    });

    it("passes the content type as the third argument", function (done) {
      var crawler = new Crawler({
        interval: 100
      });

      crawler.addHandler(handler);
      crawler.start();
      pageContentType = "text/plain";

      setTimeout(function () {
        crawler.stop();
        sinon.assert.calledWith(handler, sinon.match({
          body: sinon.match(new Buffer("<html><body>test</body></html>")),
          url: "https://example.com/index1.html",
          contentType: "text/plain"
        }));
        done();
      }, 200);
    });

    it("adds URL to the queue", function (done) {
      var crawler = new Crawler({
        interval: 100
      });

      handlerRet = [
        "https://example.com/page98.html",
        "https://example.com/page99.html"
      ];
      crawler.addHandler(handler);
      crawler.start();

      setTimeout(function () {
        crawler.stop();
        sinon.assert.calledWith(insertIfNotExistsSpy, sinon.match({
          _url: "https://example.com/page99.html"
        }));
        sinon.assert.calledWith(insertIfNotExistsSpy, sinon.match({
          _url: "https://example.com/page98.html"
        }));
        done();
      }, 200);
    });

    it("uses the bulk insert method if it exists", function (done) {
      var crawler = new Crawler({
        interval: 100
      });

      handlerRet = [
        "https://example.com/page98.html",
        "https://example.com/page99.html"
      ];
      crawler.addHandler(handler);
      crawler.getUrlList().insertIfNotExistsBulk = insertIfNotExistsBulkSpy;
      crawler.start();

      setTimeout(function () {
        crawler.stop();
        sinon.assert.calledWith(insertIfNotExistsBulkSpy, sinon.match([sinon.match({
          _url: "https://example.com/page98.html"
        }), sinon.match({
          _url: "https://example.com/page99.html"
        })]));
        done();
      }, 200);
    });

    it("works if handler returns invalid value", function (done) {
      var crawler = new Crawler({
        interval: 100
      });

      handlerRet = true;
      crawler.addHandler(handler);
      crawler.start();

      setTimeout(function () {
        crawler.stop();
        expect(insertIfNotExistsSpy.calledWith(sinon.match({
          _url: true
        }))).to.equal(false);
        done();
      }, 200);
    });

    it("records a HANDLERS_ERROR if exception thrown", function (done) {
      var crawler = new Crawler({
        interval: 100
      });

      handlerType = 'reject';
      handlerRet = new Error("Something went wrong");
      crawler.addHandler(handler);
      crawler.start();

      setTimeout(function () {
        crawler.stop();
        sinon.assert.calledWith(upsertSpy, sinon.match({
          _url: "https://example.com/index1.html",
          _errorCode: "HANDLERS_ERROR"
        }));
        done();
      }, 200);
    });

    it("emits a handlersError event if exception thrown", function (done) {
      var crawler = new Crawler({
        interval: 100
      });
      var listenSpy = sinon.spy();
      var err = new Error("test");

      handlerType = 'reject';
      handlerRet = err;
      crawler.addHandler(handler);
      crawler.on("handlersError", listenSpy);
      crawler.start();

      setTimeout(function () {
        crawler.stop();
        sinon.assert.calledWith(listenSpy, err);
        done();
      }, 200);
    });

    it("emits arbitrary errors thrown by the UrlList", function (done) {
      var crawler = new Crawler({
        interval: 100
      });
      var spy = sinon.spy();

      crawler.getUrlList().insertIfNotExistsBulk = sinon.spy(function () {
        return Promise.reject(new Error('abitrary error'));
      });
      crawler.on("crawledurl", spy);
      crawler.start();

      setTimeout(function () {
        crawler.stop();
        sinon.assert.calledWith(spy, "https://example.com/index1.html", "OTHER_ERROR", null);
        done();
      }, 200);
    });
  });
});
