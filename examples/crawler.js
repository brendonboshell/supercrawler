/* globals console */
var supercrawler = require("../lib"),
    crawler;

var crawler = new supercrawler.Crawler({
  interval: 100,
  concurrentRequestsLimit: 5,
  urlList: new supercrawler.RedisUrlList({
    redis: {
      port: 6379,
      host: '127.0.0.1'
    }
  })
});

crawler.on("crawlurl", function (url) {
  console.log("Crawling " + url);
});
crawler.on("urllistempty", function () {
  console.warn("The URL queue is empty.");
});
crawler.on("handlersError", function (err) {
  console.error(err);
});
crawler.addHandler("text/html", supercrawler.handlers.htmlLinkParser(

));
crawler.addHandler(function (context) {
  console.log("Processed " + context.url);
});

crawler.getUrlList().insertIfNotExists(new supercrawler.Url({
  url: "https://sweetpricing.com"
})).then(function () {
  crawler.start();
});
