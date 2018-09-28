const { expect } = require("chai");
const sinon = require("sinon");

const proxyquire = require("proxyquire");

describe("down", () => {
  let down;
  let status;
  let configFile;
  let migrationsDir;
  let db;
  let migration;
  let changelogCollection;

  function mockStatus() {
    return sinon.stub().returns(
      Promise.resolve([
        {
          fileName: "20160609113224-first_migration.js",
          appliedAt: new Date()
        },
        {
          fileName: "20160609113225-last_migration.js",
          appliedAt: new Date()
        }
      ])
    );
  }

  function mockConfigFile() {
    return {
      shouldExist: sinon.stub().returns(Promise.resolve()),
      read: sinon.stub().returns({ changelogCollectionName: "changelog" })
    };
  }

  function mockMigrationsDir() {
    return {
      loadMigration: sinon.stub().returns(migration)
    };
  }

  function mockDb() {
    const mock = {};
    mock.collection = sinon.stub();
    mock.collection.withArgs("changelog").returns(changelogCollection);
    return mock;
  }

  function mockMigration() {
    const theMigration = {
      down: sinon.stub()
    };
    theMigration.down.returns(Promise.resolve());
    return theMigration;
  }

  function mockChangelogCollection() {
    return {
      deleteOne: sinon.stub().returns(Promise.resolve())
    };
  }

  function loadDownWithInjectedMocks() {
    return proxyquire("../lib/actions/down", {
      "./status": status,
      "../env/configFile": configFile,
      "../env/migrationsDir": migrationsDir
    });
  }

  beforeEach(() => {
    migration = mockMigration();
    changelogCollection = mockChangelogCollection();

    status = mockStatus();
    configFile = mockConfigFile();
    migrationsDir = mockMigrationsDir();
    db = mockDb();

    down = loadDownWithInjectedMocks();
  });

  it("should fetch the status", async () => {
    await down(db);
    expect(status.called).to.equal(true);
  });

  it("should yield empty list when nothing to downgrade", async () => {
    status.returns(
      Promise.resolve([
        { fileName: "20160609113224-some_migration.js", appliedAt: "PENDING" }
      ])
    );
    const migrated = await down(db);
    expect(migrated).to.deep.equal([]);
  });

  it("should load the last applied migration", async () => {
    await down(db);
    expect(migrationsDir.loadMigration.getCall(0).args[0]).to.equal(
      "20160609113225-last_migration.js"
    );
  });

  it("should downgrade the last applied migration", async () => {
    await down(db);
    expect(migration.down.called).to.equal(true);
  });

  it("should be able to downgrade callback based migration", async () => {
    migration = {
      down(db, callback) {
        return callback();
      }
    };
    migrationsDir = mockMigrationsDir();
    down = loadDownWithInjectedMocks();
    await down(db);
  });

  /* eslint no-unused-vars: "off" */
  it("should allow downgrade to return promise", async () => {
    migrationsDir = mockMigrationsDir();
    down = loadDownWithInjectedMocks();
    await down(db);
    expect(migration.down.called).to.equal(true);
  });

  it("should yield an error when an error occurred during the downgrade", async () => {
    migration.down.returns(Promise.reject(new Error("Invalid syntax")));
    try {
      await down(db);
      expect.fail("Error was not thrown");
    } catch (err) {
      expect(err.message).to.equal(
        "Could not migrate down 20160609113225-last_migration.js: Invalid syntax"
      );
    }
  });

  it("should remove the entry of the downgraded migration from the changelog collection", async () => {
    await down(db);
    expect(changelogCollection.deleteOne.called).to.equal(true);
    expect(changelogCollection.deleteOne.callCount).to.equal(1);
  });

  it("should yield errors that occurred when deleting from the changelog collection", async () => {
    changelogCollection.deleteOne.returns(
      Promise.reject(new Error("Could not delete"))
    );
    try {
      await down(db);
    } catch (err) {
      expect(err.message).to.equal(
        "Could not update changelog: Could not delete"
      );
    }
  });

  it("should yield a list of downgraded items", async () => {
    const items = await down(db);
    expect(items).to.deep.equal(["20160609113225-last_migration.js"]);
  });
});
