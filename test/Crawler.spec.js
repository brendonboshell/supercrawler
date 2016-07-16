var Crawler = require("../lib/Crawler"),
    expect = require("chai").expect;

describe("Crawler", function () {
  it("returns an instance when called as a function", function () {
    expect(Crawler()).to.be.an.instanceOf(Crawler);
  });
});
