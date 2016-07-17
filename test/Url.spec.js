var Url = require("../lib/Url"),
    expect = require("chai").expect;

describe("Url", function () {
  it("returns an instance when called as a function", function () {
    expect(Url({
      url: "https://example.com"
    })).to.be.an.instanceOf(Url);
  });

  it("uses URL as the unique ID", function () {
    expect(new Url({
      url: "https://example.com"
    }).getUniqueId()).to.equal("https://example.com");
  });

  it("accepts a string URL as the only argument", function () {
    expect(new Url("https://example.com").getUniqueId()).to.equal("https://example.com");
  });

  describe("statusCode", function () {
    it("returns the statusCode if specified", function () {
      expect(new Url({
        url: "https://example.com",
        statusCode: 201
      }).getStatusCode()).to.equal(201);
    });

    it("defaults to null if statusCode not specified", function () {
      expect(new Url({
        url: "https://example.com"
      }).getStatusCode()).to.equal(null);
    });
  });
});
