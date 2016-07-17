var proxyquire = require('proxyquire'),
    expect = require("chai").expect,
    Crawler,
    FifoUrlListMock;

FifoUrlListMock = function () {

};

Crawler = proxyquire("../lib/Crawler", {
  "./FifoUrlList": FifoUrlListMock
});

describe("Crawler", function () {
  it("returns an instance when called as a function", function () {
    expect(Crawler()).to.be.an.instanceOf(Crawler);
  });

  it("if no urlList is specified, defaults to a FifoUrlList", function () {
    var crawler = new Crawler();

    expect(crawler.getUrlList()).to.be.an.instanceOf(FifoUrlListMock);
  });
});
