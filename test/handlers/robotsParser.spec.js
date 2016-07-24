var robotsParser = require("../../lib/handlers/robotsParser"),
    expect = require("chai").expect;

describe("robotsParser", function () {
  var rb,
      robotsTxt;

  beforeEach(function () {
    robotsTxt = ["User-agent: *",
      "Disallow: /test/",
      "",
      //"Sitemap: /sitemap_index.xml",
      "Sitemap: http://subdomain.example.com/sitemap_index_1.xml"
    ].join("\n");

    rb = robotsParser();
  });

  it("can extract extract a absolute path sitemap", function () {
    expect(rb({
      body: new Buffer(robotsTxt),
      url: "http://example.com/robots.txt"
    })).to.deep.equal([
      "http://subdomain.example.com/sitemap_index_1.xml"
    ]);
  });

  it("can extract extract a relative path sitemap", function () {
    robotsTxt += "\nSitemap: /sitemap_index.xml";

    expect(rb({
      body: new Buffer(robotsTxt),
      url: "http://example.com/robots.txt"
    })).to.deep.equal([
      "http://subdomain.example.com/sitemap_index_1.xml",
      "http://example.com/sitemap_index.xml"
    ]);
  });

  it ("can apply a filter to the URLs discovered", function () {
    var rb = robotsParser({
      urlFilter: function (sitemapUrl) {
        return sitemapUrl.indexOf("sitemap_index.xml") === -1;
      }
    });

    expect(rb({
      body: new Buffer(robotsTxt),
      url: "http://example.com/robots.txt"
    })).to.deep.equal([
      "http://subdomain.example.com/sitemap_index_1.xml"
    ]);
  });

  it("returns empty when there are no sitemaps", function () {
    robotsTxt = "";
    expect(rb({
      body: new Buffer(robotsTxt),
      url: "http://example.com/robots.txt"
    })).to.deep.equal([]);
  });

  it("returns empty when the URL path is not /robots.txt", function () {
    expect(rb({
      body: new Buffer(robotsTxt),
      url: "http://example.com/Iamnotarobots.txt"
    })).to.deep.equal([]);
  });
});
