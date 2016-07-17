var Crawler = require("./Crawler"),
    Url = require("./Url"),
    htmlLinkParser = require("./handlers/htmlLinkParser");

module.exports = {
  Crawler: Crawler,
  Url: Url,
  handlers: {
    htmlLinkParser: htmlLinkParser
  }
};
