var utils = require("./utils");

module.exports = {
  RobotsNotAllowedError: utils.makeError("RobotsNotAllowedError"),
  HttpError: utils.makeError("HttpError"),
  RequestError: utils.makeError("RequestError")
};
