var proxyquire = require('proxyquire'),
    expect = require("chai").expect,
    CrawlerMock,
    UrlMock,
    htmlLinkParserMock,
    index;

CrawlerMock = function () {};
UrlMock = function () {};
htmlLinkParserMock = function () {};

index = proxyquire("../lib/index", {
  "./Crawler": CrawlerMock,
  "./Url": UrlMock,
  "./handlers/htmlLinkParser": htmlLinkParserMock
});

describe("index", function () {
  it("exposes Crawler", function () {
    expect(index.Crawler).to.equal(CrawlerMock);
  });

  it("exposes Url", function () {
    expect(index.Url).to.equal(UrlMock);
  });

  it("exposes htmlLinkParser", function () {
    expect(index.handlers.htmlLinkParser).to.equal(htmlLinkParserMock);
  });
});
