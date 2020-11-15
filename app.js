"use strict";
require("dotenv").config();
const swaggerTools = require("swagger-tools");
const express = require("express");
var yaml = require("js-yaml");
var fs = require("fs");
const auth = require("./api/helpers/auth");
const cors = require("cors");
const initDb = require("./api/helpers/db").initDb;
const fileUpload = require("express-fileupload");

const app = express();
const swaggerDoc = fs.readFileSync("./api/swagger/swagger.yaml", "utf8");
const swaggerConfig = yaml.safeLoad(swaggerDoc);
const port = require("./config/config.json").port;

function logger(req, res, next) {
  res.on("finish", () => {
    console.log(`${req.method} : ${req.url} -> ${res.statusCode} ${res.statusMessage}`);
  });
  next();
}

app.use(logger);
app.use(cors());
app.use(fileUpload());

swaggerTools.initializeMiddleware(swaggerConfig, function (middleware) {
  app.use(middleware.swaggerMetadata());

  var routerConfig = {
    controllers: "./api/controllers",
    useStubs: false,
  };

  app.use(
    middleware.swaggerSecurity({
      Bearer: auth.verifyToken,
    })
  );

  app.use(middleware.swaggerRouter(routerConfig));

  app.use(middleware.swaggerUi());
  initDb(function (err) {
    app.listen(port, function () {
      console.log(`Started server on port: ${port}`);
    });
  });
});
