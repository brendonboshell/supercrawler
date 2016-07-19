var cheerio = require("cheerio"),
    Promise = require("bluebird"),
    zlib = require("zlib");

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

  return function (buf, url, contentType) {
    var xmlBufProm;

    // If sitemap has come in compressed state, we must uncompress it!
    if (contentType === "application/x-gzip" ||
        contentType === "application/gzip") {
      xmlBufProm = Promise.promisify(zlib.gunzip)(buf);
    } else {
      xmlBufProm = Promise.resolve(buf);
    }

    return xmlBufProm.then(function (xmlBuf) {
      var sitemapUrls,
          urlUrls,
          linkUrls;

      var $ = cheerio.load(xmlBuf, {
        xmlMode: true
      });

      sitemapUrls = $("sitemapindex > sitemap > loc").map(function () {
        return $(this).text();
      }).get();

      urlUrls = $("urlset > url > loc").map(function () {
        return $(this).text();
      }).get().filter(opts.urlFilter);

      linkUrls = $("urlset > url > xhtml\\:link[href][rel=alternate]").map(function () {
        return $(this).attr("href");
      }).get().filter(opts.urlFilter);

      return sitemapUrls.concat(urlUrls).concat(linkUrls);
    });
  };
};
