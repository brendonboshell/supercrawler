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

crawler.getUrlList().upsert(new supercrawler.Url({
  url: strUrl,
  errorCode: null
})).then(function () {
  return crawler.getUrlList().upsert(new supercrawler.Url({
    url: strUrl,
    errorCode: "NOT_EXISTS"
  }));
});
