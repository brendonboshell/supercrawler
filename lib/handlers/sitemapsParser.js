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
module.exports = function () {
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
      var locUrls,
          linkUrls;

      var $ = cheerio.load(xmlBuf, {
        xmlMode: true
      });

      locUrls = $("sitemapindex > sitemap > loc, urlset > url > loc").map(function () {
        return $(this).text();
      }).get();

      linkUrls = $("urlset > url > xhtml\\:link[href][rel=alternate]").map(function () {
        return $(this).attr("href");
      }).get();

      return locUrls.concat(linkUrls);
    });
  };
};
