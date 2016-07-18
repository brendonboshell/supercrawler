var expect = require("chai").expect,
    sinon = require("sinon"),
    Promise = require("bluebird"),
    proxyquire = require("proxyquire"),
    makeUrl = require("./utils/makeUrl"),
    Url = require("../lib/Url");

describe("DbUrlList", function () {
  var opts,
      sequelizeMock,
      defineSpy,
      syncSpy,
      createSpy,
      upsertSpy,
      numErrors,
      findOneResult,
      findOneSpy,
      DbUrlList,
      createRes;

  opts = {
    db: {
      database: "crawler",
      username: "crawleruser",
      password: "crawlerpassword",
      sequelizeOpts: {
        dialect: "sqlite"
      }
    }
  };

  beforeEach(function () {
    sequelizeMock = sinon.spy(function () {

    });

    syncSpy = sinon.spy(function () {
      return Promise.resolve();
    });

    createRes = Promise.resolve();
    createSpy = sinon.spy(function () {
      return createRes;
    });

    upsertSpy = sinon.spy(function () {
      return Promise.resolve();
    });

    numErrors = 0;

    findOneResult = Promise.resolve({
      get: function (field) {
        if (field === "url") {
          return "https://example.com/tocrawl";
        }
        if (field === "statusCode") {
          return null;
        }
        if (field === "errorCode") {
          return null;
        }
        if (field === "numErrors") {
          return numErrors;
        }
      }
    });

    findOneSpy = sinon.spy(function () {
      return findOneResult;
    });

    defineSpy = sinon.spy(function () {
      return {
        sync: syncSpy,
        create: createSpy,
        upsert: upsertSpy,
        findOne: findOneSpy
      };
    });

    sequelizeMock.STRING = function (size) {
      return "TEST_STRING" + size;
    };
    sequelizeMock.prototype.define = defineSpy;
    sequelizeMock.prototype.UniqueConstraintError = function () { };

    DbUrlList = proxyquire("../lib/DbUrlList", {
      "sequelize": sequelizeMock
    });
  });

  it("returns an instance when called as a function", function () {
    expect(DbUrlList(opts)).to.be.an.instanceOf(DbUrlList);
  });

  it("throws if no db options specified", function () {
    expect(function () {
      new DbUrlList();
    }).to.throw();
  });

  it("creates a new sequelize instance", function () {
    new DbUrlList(opts);
    sinon.assert.calledWith(sequelizeMock, "crawler", "crawleruser",
      "crawlerpassword", sinon.match({
        dialect: "sqlite"
      }));
  });

  it("defines the url table", function () {
    new DbUrlList(opts);
    sinon.assert.calledWith(defineSpy, "url", sinon.match({
      urlHash: {
        allowNull: false,
        unique: true
      },
      url: {
        allowNull: false
      },
      statusCode: {
        allowNull: true
      },
      errorCode: {
        allowNull: true
      },
      numErrors: {
        allowNull: false
      },
      nextRetryDate: {
        allowNull: false
      }
    }));
  });

  it("url field is max 10,000 characters long", function () {
    new DbUrlList(opts);
    sinon.assert.calledWith(defineSpy, "url", sinon.match({
      url: {
        type: "TEST_STRING10000"
      }
    }));
  });

  describe("#insertIfNotExists", function () {
    it("creates the url table", function (done) {
      new DbUrlList(opts).insertIfNotExists(makeUrl("https://example.com")).then(function () {
        sinon.assert.calledWith(syncSpy);
        done();
      });
    });

    it("only creates the url table once", function (done) {
      var dbUrlList = new DbUrlList(opts);

      dbUrlList.insertIfNotExists(makeUrl("https://example.com")).then(function () {
        return dbUrlList.insertIfNotExists(makeUrl("https://example.com/page2"));
      }).then(function () {
        expect(syncSpy.getCalls().length).to.equal(1);
        done();
      });
    });

    it("inserts record into table", function (done) {
      new DbUrlList(opts).insertIfNotExists(makeUrl("https://example.com", 201)).then(function () {
        sinon.assert.calledWith(createSpy, sinon.match({
          urlHash: "327c3fda87ce286848a574982ddd0b7c7487f816",
          url: "https://example.com",
          statusCode: 201,
          errorCode: null,
          numErrors: 0
        }));
        done();
      });
    });

    it("can insert a failed record", function (done) {
      var url = new Url({
        url: "https://example.com/",
        errorCode: "HTTP_ERROR",
        statusCode: 600
      });
      new DbUrlList(opts).insertIfNotExists(url).then(function () {
        sinon.assert.calledWith(createSpy, sinon.match({
          urlHash: "b559c7edd3fb67374c1a25e739cdd7edd1d79949",
          url: "https://example.com/",
          statusCode: 600,
          errorCode: "HTTP_ERROR",
          numErrors: 1,
          nextRetryDate: sinon.match(Date)
        }));
        done();
      });
    });

    it("resolves the promise for a unique constraint error", function (done) {
      createRes = Promise.reject(new sequelizeMock.UniqueConstraintError());

      new DbUrlList(opts).insertIfNotExists(makeUrl("https://example.com")).then(function () {
        done();
      });
    });
  });

  describe("#upsert", function () {
    it("upserts record in database", function (done) {
      new DbUrlList(opts).upsert(makeUrl("https://example.com", 201)).then(function () {
        sinon.assert.calledWith(upsertSpy, sinon.match({
          urlHash: "327c3fda87ce286848a574982ddd0b7c7487f816",
          url: "https://example.com",
          statusCode: 201,
          errorCode: null,
          numErrors: 0
        }));
        done();
      });
    });

    it("can upsert a failed record", function (done) {
      var url = new Url({
        url: "https://example.com/",
        errorCode: "HTTP_ERROR",
        statusCode: 600
      });
      numErrors = 5;
      new DbUrlList(opts).upsert(url).then(function () {
        sinon.assert.calledWith(upsertSpy, sinon.match({
          urlHash: "b559c7edd3fb67374c1a25e739cdd7edd1d79949",
          url: "https://example.com/",
          statusCode: 600,
          errorCode: "HTTP_ERROR",
          numErrors: 6,
          nextRetryDate: sinon.match(Date)
        }));
        done();
      });
    });

    it("can upsert failed record with no preexisting record", function (done) {
      findOneResult = Promise.resolve(null);
      var url = new Url({
        url: "https://example.com/",
        errorCode: "HTTP_ERROR",
        statusCode: 600
      });
      numErrors = 5;
      new DbUrlList(opts).upsert(url).then(function () {
        sinon.assert.calledWith(upsertSpy, sinon.match({
          urlHash: "b559c7edd3fb67374c1a25e739cdd7edd1d79949",
          url: "https://example.com/",
          statusCode: 600,
          errorCode: "HTTP_ERROR",
          numErrors: 1,
          nextRetryDate: sinon.match(Date)
        }));
        done();
      });
    });
  });

  describe("#getNextUrl", function () {
    it("queries urls that haven't been crawled yet (statusCode = null and errorCode = null)", function (done) {
      new DbUrlList(opts).getNextUrl().then(function () {
        sinon.assert.calledWith(findOneSpy, sinon.match({
          where: {
            $or: [{
              errorCode: null,
              statusCode: null
            }, {
              errorCode: {
                $not: null
              },
              nextRetryDate: sinon.match({
                $lt: sinon.match(Date)
              })
            }]
          }
        }));
        done();
      });
    });

    it("provides the URL object", function (done) {
      new DbUrlList(opts).getNextUrl().then(function (url) {
        expect(url.getUrl()).to.equal("https://example.com/tocrawl");
        done();
      });
    });

    it("gives RangeError if no URLs left", function (done) {
      findOneResult = Promise.resolve(null);
      new DbUrlList(opts).getNextUrl().catch(function (err) {
        expect(err).to.be.an.instanceOf(RangeError);
        done();
      });
    });
  });
});
