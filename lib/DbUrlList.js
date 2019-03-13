var DbUrlList,
    Promise = require("bluebird"),
    Url = require("./Url"),
    Sequelize = require('sequelize'),
    crypto = require("crypto"),
    YEAR_MS = 31536000000;

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

  // Some options defaults
  if (opts.db.table === undefined) {
    opts.db.table = "url";
  }

  this._recrawlIn = opts.recrawlIn || YEAR_MS/1000;

  opts.db.sequelizeOpts.logging = false;

  this._db = new Sequelize(opts.db.database, opts.db.username, opts.db.password,
    opts.db.sequelizeOpts);
  this._urlTable = this._db.define(opts.db.table, {
    urlHash: {
      type: Sequelize.STRING(40),
      allowNull: false
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
    errorMessage: {
      type: Sequelize.STRING(1000),
      allowNull: true
    },
    numErrors: {
      type: Sequelize.INTEGER(10),
      allowNull: false
    },
    nextRetryDate: {
      type: Sequelize.DATE,
      allowNull: false
    }
  }, {
    indexes: [{
      unique: false,
      fields: ["nextRetryDate"]
    }, {
      unique: true,
      fields: ["urlHash"]
    }]
  });
  this._urlTableSynced = false;
  this._initialRetryTime = 1000 * 60 * 60;

  // Cleanup storage if requested
  if(opts.reset) {
    this._urlTable.destroy({truncate: true});
  }
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
  var self = this;

  return this._getUrlTable().then(function (urlTable) {
    return urlTable.create(self._makeUrlRow(url)).catch(Sequelize.UniqueConstraintError, function () {
      // we ignore unqiue constraint errors
      return true;
    });
  });
};

/**
 * A method to insert an array of URLs in bulk. This is useful when we are
 * trying to insert 50,000 URLs discovered in a sitemaps file, for example.
 *
 * @param  {Array} urls  Array of URL objects to insert.
 * @return {Promise}     Promise resolves when everything is inserted.
 */
DbUrlList.prototype.insertIfNotExistsBulk = function (urls) {
  var self = this;

  return this._getUrlTable().then(function (urlTable) {
    return urlTable.bulkCreate(urls.map(function (url) {
      return self._makeUrlRow(url);
    }), {
      ignoreDuplicates: true
    });
  });
};

/**
 * Given a URL object, create the corresponding row to be inserted into the
 * urls table.
 *
 * @param  {Url} url    Url object.
 * @return {Object}     Row to be inserted into the url table.
 */
DbUrlList.prototype._makeUrlRow = function (url) {
  var urlHash;

  urlHash = crypto.createHash('sha1').update(url.getUrl()).digest("hex");

  return {
    urlHash: urlHash,
    url: url.getUrl(),
    statusCode: url.getStatusCode(),
    errorCode: url.getErrorCode(),
    errorMessage: url.getErrorMessage(),
    numErrors: url.getErrorCode() === null ? 0 : 1,
    nextRetryDate: url.getErrorCode() === null ? this._calcNextRetryDate(0) : this._calcNextRetryDate(1)
  };
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
    // If we want to schedule a crawl now, we subtract a random number of
    // seconds. This ensures the order we crawl URLs is random; otherwise, if
    // we parse a sitemap, we could get stuck crawling one host for hours.
    delay = - Math.random() * YEAR_MS;
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
    var findProm;

    // if there's an error, we must get the existing URL record first, so we
    // can increment the error count.
    if (url.getErrorCode() === null) {
      findProm = Promise.resolve(null);
    } else {
      findProm = urlTable.findOne({
        where: {
          urlHash: urlHash
        }
      });
    }

    return findProm.then(function (record) {
      var numErrors = 0,
          nextRetryDate;

      if (record !== null) {
        numErrors = record.get("numErrors");
      }

      if (url.getErrorCode() === null) {
        if (url.getStatusCode() === null) {
          // schedule a crawl immediately
          nextRetryDate = self._calcNextRetryDate(0);
        } else {
          // we've already crawled this URL successfully... don't crawl it
          // again.
          nextRetryDate = new Date(new Date().getTime() + self._recrawlIn * 1000);
        }
      } else {
        nextRetryDate = self._calcNextRetryDate(numErrors + 1);
      }

      return urlTable.upsert({
        urlHash: urlHash,
        url: url.getUrl(),
        statusCode: url.getStatusCode(),
        errorCode: url.getErrorCode(),
        errorMessage: url.getErrorMessage(),
        numErrors: url.getErrorCode() === null ? 0 : (numErrors + 1),
        nextRetryDate: nextRetryDate
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
        nextRetryDate: {
          $lt: new Date()
        }
      },
      order: ["nextRetryDate"]
    }).then(function (urlRecord) {
      if (urlRecord === null) {
        return Promise.reject(new RangeError("The list has been exhausted."));
      }

      return urlTable.update({
        nextRetryDate: new Date(new Date().getTime() + 60000)
      }, {
        where: {
          id: urlRecord.get("id"),
          nextRetryDate: urlRecord.get("nextRetryDate")
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
          errorCode: urlRecord.get("errorCode"),
          errorMessage: urlRecord.get("errorMessage")
        });
      });
    });
  });
};

module.exports = DbUrlList;
