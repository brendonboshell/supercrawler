var cheerio = require("cheerio"),
    urlMod = require("url");

module.exports = function () {
  return function (body, url) {
    var $;

    $ = cheerio.load(body);

    return $("a[href]").map(function () {
      var $this,
          targetHref,
          absoluteTargetUrl,
          protocol;

      $this = $(this);
      targetHref = $this.attr("href");
      absoluteTargetUrl = urlMod.resolve(url, targetHref);
      protocol = urlMod.parse(absoluteTargetUrl).protocol;

      if (protocol !== "http:" && protocol !== "https:") {
        return null;
      }

      return absoluteTargetUrl;
    }).get();
  };
};
