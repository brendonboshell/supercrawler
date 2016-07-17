var htmlLinkParser = require("../../lib/handlers/htmlLinkParser"),
    expect = require("chai").expect,
    makeHtmlWithLinks;

makeHtmlWithLinks = function (links) {
  var html = "<html><head></head><body>";

  links.forEach(function (link) {
    html += '<a href="' + link + '">anchor</a>';
  });

  html += "</body>";

  return html;
};

describe("HtmlLikParser", function () {
  it("can return an absolute url", function () {
    var hlp = htmlLinkParser(),
        html;

    html = makeHtmlWithLinks(["https://example.com/test"]);

    expect(hlp(html, "https://example2.com/index")).to.deep.equal([
      "https://example.com/test"
    ]);
  });

  it("can return an relative url", function () {
    var hlp = htmlLinkParser(),
        html;

    html = makeHtmlWithLinks(["page2.html"]);

    expect(hlp(html, "https://example.com/my/page.html")).to.deep.equal([
      "https://example.com/my/page2.html"
    ]);
  });

  it("can return an root-relative url", function () {
    var hlp = htmlLinkParser(),
        html;

    html = makeHtmlWithLinks(["/page2.html"]);

    expect(hlp(html, "https://example.com/my/page.html")).to.deep.equal([
      "https://example.com/page2.html"
    ]);
  });

  it("can return multiple URLs", function () {
    var hlp = htmlLinkParser(),
        html;

    html = makeHtmlWithLinks([
      "/page2.html",
      "page3.html",
      "https://example2.com/55"
    ]);

    expect(hlp(html, "https://example.com/my/page.html")).to.deep.equal([
      "https://example.com/page2.html",
      "https://example.com/my/page3.html",
      "https://example2.com/55"
    ]);
  });

  it("ignores javascript urls", function () {
    var hlp = htmlLinkParser(),
        html;

    html = makeHtmlWithLinks([
      "javascript:alert('test')"
    ]);

    expect(hlp(html, "https://example.com/my/page.html")).to.deep.equal([]);
  });

  it("can restrict to specific hosts", function () {
    var hlp = htmlLinkParser({
          hostnames: ["example.com"]
        }),
        html;

    html = makeHtmlWithLinks([
      "/page2.html",
      "page3.html",
      "https://example.com/101?q=str",
      "https://example2.com/55"
    ]);

    expect(hlp(html, "https://example.com/my/page.html")).to.deep.equal([
      "https://example.com/page2.html",
      "https://example.com/my/page3.html",
      "https://example.com/101?q=str"
    ]);
  });
});
