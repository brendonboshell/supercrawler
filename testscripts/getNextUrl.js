var supercrawler = require("../lib");

var crawler = new supercrawler.Crawler({
  interval: 1000,
  concurrentRequestsLimit: 5,
  urlList: new supercrawler.RedisUrlList({
    redis: {
      port: 6379,
      host: '127.0.0.1'
    }
  })
});

var strUrl = "https://sweetpricing.com/" + Math.random();

crawler.getUrlList().insertIfNotExists(new supercrawler.Url({
  url: strUrl
})).then(function () {
  return crawler.getUrlList().getNextUrl().then(function () {
    console.log(arguments);
  });
}).then(function () {
  return crawler.getUrlList().getNextUrl().then(function () {
    console.log(arguments);
  });
});
