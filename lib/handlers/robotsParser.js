var robotsParser = require("robots-parser"),
    urlMod = require("url");

/**
 * This is a parse that analyzes URL with path /robots.txt.
 *
 * @return {Function} Returns the handler.
 */
module.exports = function () {
  return function (buf, url) {
    var robots,
        urlObj;

    urlObj = urlMod.parse(url);

    // skip if this is not actually a robots.txt file.
    if (urlObj.pathname !== "/robots.txt") {
      return [];
    }

    robots = robotsParser(url, buf.toString());

    return robots.getSitemaps().map(function (sitemapHref) {
      return urlMod.resolve(url, sitemapHref);
    });
  };
};
