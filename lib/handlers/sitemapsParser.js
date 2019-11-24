var cheerio = require("cheerio"),
    Promise = require("bluebird"),
    zlib = require("zlib"),
    _ = require("lodash"),
    nullFilter;

nullFilter = function (a) {
  // Some of the maps() might have returned null, so we filter
  // those out here.
  return a !== null;
};

/**
 * This handler parses XML format sitemaps, and extracts links from them,
 * including links to other sitemaps.
 *
 * Sitemap files can also be served as gz files (with an actual
 * application/x-gzip). Unfortunately, that means we have to open up the file
 * to see what is inside.
 *
 * @return {Array} Array of links discovered in the sitemap.
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

  if (typeof opts.gzipContentTypes === "string") {
    opts.gzipContentTypes = [opts.gzipContentTypes];
  } else if (!Array.isArray(opts.gzipContentTypes)) {
    opts.gzipContentTypes = ["application/x-gzip", "application/gzip"];
  }

  return function (context) {
    var xmlBufProm;

    // If sitemap has come in compressed state, we must uncompress it!
    if (opts.gzipContentTypes.indexOf(context.contentType) > -1) {
      xmlBufProm = Promise.promisify(zlib.gunzip)(context.body);
    } else {
      xmlBufProm = Promise.resolve(context.body);
    }

    return xmlBufProm.then(function (xmlBuf) {
      var sitemapUrls,
          urlUrls,
          linkUrls;

      var $ = context.$ || cheerio.load(xmlBuf);
      context.$ = $;

      // We map over the array rather than using Cheerio's map, because it is
      // a lot faster. It's important when we are dealing with very large
      // sitemaps.
      sitemapUrls = $("sitemapindex > sitemap > loc").get().map(function (el) {
        var match = _.find(el.children, function (child) {
          return child.type === "text";
        });

        return match ? match.data : null;
      }).filter(nullFilter).filter(opts.urlFilter);

      urlUrls = $("urlset > url > loc").get().map(function (el) {
        var match = _.find(el.children, function (child) {
          return child.type === "text";
        });

        return match ? match.data : null;
      }).filter(nullFilter).filter(opts.urlFilter);

      linkUrls = $("urlset > url > xhtml\\:link[href][rel=alternate]").get().map(function (el) {
        return el.attribs.href ? el.attribs.href : null;
      }).filter(nullFilter).filter(opts.urlFilter);

      return sitemapUrls.concat(urlUrls).concat(linkUrls);
    });
  };
};
