var sitemapsParser = require("../../lib/handlers/sitemapsParser"),
    expect = require("chai").expect,
    Promise = require("bluebird"),
    zlib = require("zlib");

describe("sitemapsParser", function () {
  var sp,
      sitemapindex,
      urlset,
      urlsetWithAlternate;

  beforeEach(function () {
    sp = sitemapsParser();

    sitemapindex = [
      "<?xml version=\"1.0\" encoding=\"UTF-8\"?>",
      "<sitemapindex xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\">",
      "<sitemap>",
      "<loc>http://example.com/sitemap.xml.gz</loc>",
      "<lastmod>2015-07-17T18:16:02.754-07:00</lastmod>",
      "</sitemap>",
      "</sitemapindex>"
    ].join("\n");

    urlset = [
      "<?xml version=\"1.0\" encoding=\"UTF-8\"?>",
      "<urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\" xmlns:xhtml=\"http://www.w3.org/1999/xhtml\" >",
      "<url>",
      "<loc>https://example.com/home.html</loc>",
      "</url>",
      "</urlset>]"
    ].join("\n");

    urlsetWithAlternate = [
      "<?xml version=\"1.0\" encoding=\"UTF-8\"?>",
      "<urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\" xmlns:xhtml=\"http://www.w3.org/1999/xhtml\" >",
      "<url>",
      "<loc>https://example.com/home.html</loc>",
      "<xhtml:link rel=\"alternate\" hreflang=\"de\" href=\"https://example.com/home-de.html\" />",
      "</url>",
      "</urlset>]"
    ].join("\n");
  });

  // sitemaps can be either XML or a plain list of links.
  it("discovers another sitemap", function (done) {
    sp({
      body: new Buffer(sitemapindex),
      url: "http://example.com/sitemap_index.xml"
    }).then(function (urls) {
      expect(urls).to.deep.equal([
        "http://example.com/sitemap.xml.gz"
      ]);
      done();
    });
  });

  it("discovers nothing if not a sitemap file", function (done) {
    sitemapindex = "<html><body><h1>I'm not a sitemap</h1></body></html>";
    sp({
      body: new Buffer(sitemapindex),
      url: "http://example.com/sitemap_index.xml"
    }).then(function (urls) {
      expect(urls).to.deep.equal([]);
      done();
    });
  });

  it("discovers a urlset", function (done) {
    sp({
      body: new Buffer(urlset),
      url: "http://example.com/sitemap_index.xml"
    }).then(function (urls) {
      expect(urls).to.deep.equal([
        "https://example.com/home.html"
      ]);
      done();
    });
  });

  it("discovers an alternate link", function (done) {
    sp({
      body: new Buffer(urlsetWithAlternate),
      url: "http://example.com/sitemap_index.xml"
    }).then(function (urls) {
      expect(urls).to.deep.equal([
        "https://example.com/home.html",
        "https://example.com/home-de.html"
      ]);
      done();
    });
  });

  it("can apply a filter to the URLs discovered", function (done) {
    var sp = new sitemapsParser({
      urlFilter: function (url) {
        return url.indexOf("de") === -1;
      }
    });

    sp({
      body: new Buffer(urlsetWithAlternate),
      url: "http://example.com/sitemap_index.xml"
    }).then(function (urls) {
      expect(urls).to.deep.equal([
        "https://example.com/home.html"
      ]);
      done();
    });
  });

  it("supports a .gz sitemap file", function (done) {
    Promise.promisify(zlib.gzip)(new Buffer(urlset)).then(function (buf) {
      return sp({
        body: buf,
        url: "http://example.com/sitemap_index.xml",
        contentType: "application/x-gzip"
      });
    }).then(function (urls) {
      expect(urls).to.deep.equal([
        "https://example.com/home.html"
      ]);
      done();
    });
  });

  it("supports the application/gzip content type", function (done) {
    Promise.promisify(zlib.gzip)(new Buffer(urlset)).then(function (buf) {
      return sp({
        body: buf,
        url: "http://example.com/sitemap_index.xml",
        contentType: "application/gzip"
      });
    }).then(function (urls) {
      expect(urls).to.deep.equal([
        "https://example.com/home.html"
      ]);
      done();
    });
  });

  it("allows a gzip 'type' to be specified as a string", function (done) {
    var sp = new sitemapsParser({
      gzipContentTypes: "arbitrary/gzip"
    });

    Promise.promisify(zlib.gzip)(new Buffer(urlset)).then(function (buf) {
      return sp({
        body: buf,
        url: "http://example.com/sitemap_index.xml",
        contentType: "arbitrary/gzip"
      });
    }).then(function (urls) {
      expect(urls).to.deep.equal([
        "https://example.com/home.html"
      ]);
      done();
    });
  });

  it("allows a gzip 'type' to be specified as an array", function (done) {
    var sp = new sitemapsParser({
      gzipContentTypes: ["arbitrary/gzip", "esoteric/gzip"]
    });

    Promise.promisify(zlib.gzip)(new Buffer(urlset)).then(function (buf) {
      return sp({
        body: buf,
        url: "http://example.com/sitemap_index.xml",
        contentType: "esoteric/gzip"
      });
    }).then(function (urls) {
      expect(urls).to.deep.equal([
        "https://example.com/home.html"
      ]);
      done();
    });
  });

  it("gzip can be turned off with empty gzipContentTypes array", function (done) {
    var sp = new sitemapsParser({
      gzipContentTypes: []
    });

    sp({
      body: new Buffer(urlset),
      url: "http://example.com/sitemap_index.xml",
      contentType: "application/gzip"
    }).then(function (urls) {
      expect(urls).to.deep.equal([
        "https://example.com/home.html"
      ]);
      done();
    });
  });
});
