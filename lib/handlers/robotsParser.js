var robotsParser = require("robots-parser"),
    urlMod = require("url");

/**
 * This is a parse that analyzes URL with path /robots.txt.
 *
 * @return {Function} Returns the handler.
 */
module.exports = function (opts) {
  if (!opts) {
    opts = {};
  }

  if (!opts.urlFilter) {
    opts.urlFilter = function () {
      return true;
    };
  }

  return function (context) {
    var robots,
        urlObj;

    urlObj = urlMod.parse(context.url);

    // skip if this is not actually a robots.txt file.
    if (urlObj.pathname !== "/robots.txt") {
      return [];
    }

    robots = robotsParser(context.url, context.body.toString());

    return robots.getSitemaps().map(function (sitemapHref) {
      return urlMod.resolve(context.url, sitemapHref);
    }).filter(function (sitemapUrl) {
      return opts.urlFilter(sitemapUrl, context.url);
    });
  };
};
