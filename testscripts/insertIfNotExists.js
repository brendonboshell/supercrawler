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

crawler.getUrlList().insertIfNotExists(new supercrawler.Url("https://sweetpricing.com/" + Math.random()));
