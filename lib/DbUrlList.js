var DbUrlList,
    Promise = require("bluebird"),
    Url = require("./Url"),
    Sequelize = require('sequelize'),
    crypto = require("crypto");

/**
 * A database backed queue that features retry logic. Generates URLs that:
 * (a) has not been crawled and is not being crawled (errorCode == null && statusCode == null); OR
 * (b) a crawl that failed a certain amount of time ago. (errorCode !== NULL && nextRetryDate < NOW)
 * Provide database details in opts.db. Database connection managed by
 * Sequelize.
 *
 * @param {Object} opts Options
 */
DbUrlList = function (opts) {
  if (!(this instanceof DbUrlList)) {
    return new DbUrlList(opts);
  }

  if (!opts) {
    opts = {};
  }

  if (typeof opts.db === "undefined") {
    throw new Error("Must provide db options");
  }

  opts.db.sequelizeOpts.logging = false;

  this._db = new Sequelize(opts.db.database, opts.db.username, opts.db.password,
    opts.db.sequelizeOpts);
  this._urlTable = this._db.define('url', {
    urlHash: {
      type: Sequelize.STRING,
      allowNull: false,
      unique: true
    },
    url: {
      type: Sequelize.STRING(10000),
      allowNull: false
    },
    statusCode: {
      type: Sequelize.STRING,
      allowNull: true
    },
    errorCode: {
      type: Sequelize.STRING,
      allowNull: true
    },
    numErrors: {
      type: Sequelize.INTEGER(10),
      allowNull: false
    },
    nextRetryDate: {
      type: Sequelize.DATE,
      allowNull: false
    },
    holdDate: {
      type: Sequelize.DATE,
      allowNull: false
    }
  });
  this._urlTableSynced = false;
  this._initialRetryTime = 1000 * 60 * 60;
};

/**
 * Create the URL table if it doesn't already exist, and return it (promise).
 *
 * @return {Promise} Promise returning the Sequelize model.
 */
DbUrlList.prototype._getUrlTable = function () {
  var syncProm = Promise.resolve(),
      self = this;

  if (!this._urlTableSynced) {
    syncProm = this._urlTable.sync();
  }

  this._urlTableSynced = true;

  return syncProm.then(function () {
    return self._urlTable;
  });
};

/**
 * Insert new URL record if it doesn't already exist. If it does exist, this
 * function resolves anyway.
 *
 * @param  {Url} url    Url object
 * @return {Promise}    Promise resolved when record inserted.
 */
DbUrlList.prototype.insertIfNotExists = function (url) {
  var self = this,
      urlHash;

  urlHash = crypto.createHash('sha1').update(url.getUrl()).digest("hex");

  return this._getUrlTable().then(function (urlTable) {
    return urlTable.create({
      urlHash: urlHash,
      url: url.getUrl(),
      statusCode: url.getStatusCode(),
      errorCode: url.getErrorCode(),
      numErrors: url.getErrorCode() === null ? 0 : 1,
      nextRetryDate: url.getErrorCode() === null ? self._calcNextRetryDate(0) : self._calcNextRetryDate(1),
      holdDate: new Date(0)
    }).catch(Sequelize.UniqueConstraintError, function () {
      // we ignore unqiue constraint errors
      return true;
    });
  });
};

/**
 * Calculate the next retry date, given the number of errors that have now
 * occurred. The retry interval is based on an exponentially (power of 2)
 * increasing retry time.
 *
 * @param  {number} numErrors Number of errors occurred so far.
 * @return {Date}             Date object of next retry date.
 */
DbUrlList.prototype._calcNextRetryDate = function (numErrors) {
  var date,
      delay;

  date = new Date();

  if (numErrors === 0) {
    delay = 0;
  } else {
    delay = this._initialRetryTime * Math.pow(2, numErrors - 1);
  }

  return new Date(date.getTime() + delay);
};

/**
 * Insert a record, or update it if it already exists.
 *
 * @param  {Url} url    Url object.
 * @return {Promise}    Promise resolved once record upserted.
 */
DbUrlList.prototype.upsert = function (url) {
  var self = this,
      urlHash;

  urlHash = crypto.createHash('sha1').update(url.getUrl()).digest("hex");

  return this._getUrlTable().then(function (urlTable) {
    return urlTable.findOne({
      where: {
        urlHash: urlHash
      }
    }).then(function (record) {
      var numErrors = 0;

      if (record !== null) {
        numErrors = record.get("numErrors");
      }

      return urlTable.upsert({
        urlHash: urlHash,
        url: url.getUrl(),
        statusCode: url.getStatusCode(),
        errorCode: url.getErrorCode(),
        numErrors: url.getErrorCode() === null ? 0 : (numErrors + 1),
        nextRetryDate: url.getErrorCode() === null ? self._calcNextRetryDate(0) : self._calcNextRetryDate(numErrors + 1),
        holdDate: new Date(0)
      });
    });
  });
};

/**
 * Get the next URL to be crawled.
 *
 * @return {Promise} Promise resolving with the next URL to be crawled.
 */
DbUrlList.prototype.getNextUrl = function () {
  var self = this;

  return this._getUrlTable().then(function (urlTable) {
    return urlTable.findOne({
      where: {
        $or: [{
          errorCode: null,
          statusCode: null
        }, {
          errorCode: {
            $not: null
          },
          nextRetryDate: {
            $lt: new Date()
          }
        }],
        holdDate: {
          $lt: new Date(new Date().getTime() - 60000)
        }
      },
    }).then(function (urlRecord) {
      if (urlRecord === null) {
        return Promise.reject(new RangeError("The list has been exhausted."));
      }

      return urlTable.update({
        holdDate: new Date()
      }, {
        where: {
          id: urlRecord.get("id"),
          holdDate: urlRecord.get("holdDate")
        }
      }).then(function (res) {
        var numAffected = res[0];

        // If we haven't managed to update this record, that means another
        // process has updated it! So we'll have to try again
        if (numAffected === 0) {
          return self.getNextUrl();
        }

        // We've managed to secure this URL for our process to crawl.
        return new Url({
          url: urlRecord.get("url"),
          statusCode: urlRecord.get("statusCode"),
          errorCode: urlRecord.get("errorCode")
        });
      });
    });
  });
};

module.exports = DbUrlList;
