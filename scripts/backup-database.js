"use strict";
const { db } = require("../src/db");
const { runDatabaseBackup } = require("../src/services/databaseBackupService");
runDatabaseBackup()
  .then((result) => console.log(JSON.stringify(result)))
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(() => db.close());
