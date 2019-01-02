var cheerio = require("cheerio"),
    urlMod = require("url");

module.exports = function (opts) {
  if (!opts) {
    opts = {};
  }

  return function (context) {
    var $;

    $ = context.$ || cheerio.load(context.body);
    context.$ = $;

    return $("a[href], link[href][rel=alternate], area[href]").map(function () {
      var $this,
          targetHref,
          absoluteTargetUrl,
          urlObj,
          protocol,
          hostname;

      $this = $(this);
      targetHref = $this.attr("href");
      absoluteTargetUrl = urlMod.resolve(context.url, targetHref);
      urlObj = urlMod.parse(absoluteTargetUrl);
      protocol = urlObj.protocol;
      hostname = urlObj.hostname;

      if (protocol !== "http:" && protocol !== "https:") {
        return null;
      }

      // Restrict links to a particular group of hostnames.
      if (typeof opts.hostnames !== "undefined") {
        if (opts.hostnames.indexOf(hostname) === -1) {
          return null;
        }
      }

      return urlMod.format({
        protocol: urlObj.protocol,
        auth: urlObj.auth,
        host: urlObj.host,
        pathname: urlObj.pathname,
        search: urlObj.search
      });
    }).get();
  };
};
