var util = require("util");

module.exports = {
  makeError: function (name) {
    var CustomError;

    CustomError = function (message) {
      Error.call(this, arguments);
      Error.captureStackTrace(this, this.constructor);
      this.message = message;
    };

    util.inherits(CustomError, Error);
    CustomError.prototype.name = name;

    return CustomError;
  }
};
