const getDb = require("../helpers/db.js").getDb;
const auth = require("../helpers/auth");
const bcrypt = require("bcrypt");
const shortUuid = require("short-uuid");
const { ObjectId } = require("mongodb");
const moment = require("moment");
const config = require("../../config/config.json");
const csvParser = require("csv-parser");
const fs = require("fs");

//Common function to set response and headers
function sendResp(req, res, code, msg) {
  res.writeHead(code, {
    "Content-Type": "application/json",
  });
  return res.end(JSON.stringify({ message: msg }));
}

exports.login = (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    sendResp(req, res, 400, "Param verification failed");
  } else {
    const dbo = getDb();
    //username is not case sensitive
    let findData = {
      username: username.toLowerCase(),
    };

    dbo.collection("user").findOne(findData, (err, result) => {
      if (err) {
        console.log(err);
        const response = {
          message: "Error: Could not login",
        };
        res.writeHead(400, {
          "Content-Type": "application/json",
        });

        return res.end(JSON.stringify(response));
      } else {
        let response;
        if (result) {
          bcrypt.compare(password, result.password, function (errBcrypt, isPassword) {
            if (errBcrypt) {
              //Becrypt throws error
              const response = {
                message: "Error: Could not login",
              };
              res.writeHead(400, {
                "Content-Type": "application/json",
              });
              return res.end(JSON.stringify(response));
            } else {
              if (isPassword) {
                // Password Match
                response = { _id: result._id, name: result.name };
                //Check if csv record exits or not
                if (result.csv.length == 0) {
                  response.msg = "Please Upload CSV";
                }
                response.token = auth.issueToken({
                  _id: result._id,
                  name: result.name,
                  username: result.username,
                  accountNumber: result.account_no,
                });
                res.writeHead(200, {
                  "Content-Type": "application/json",
                });
                return res.end(JSON.stringify(response));
              } else {
                // Password don't match
                sendResp(req, res, 401, "Incorrect Credentials");
              }
            }
          });
        } else {
          const response = {
            message: "User not found",
          };
          res.writeHead(401, {
            "Content-Type": "application/json",
          });
          return res.end(JSON.stringify(response));
        }
      }
    });
  }
};

exports.register = (req, res) => {
  const dbo = getDb();
  const saltRounds = 10;
  let accountNumber = shortUuid("0123456789").generate().substr(0, 8).toUpperCase();

  const { name, username, password } = req.body;
  if (!name || !username || !password) {
    sendResp(req, res, 400, "Param verfication failed");
  } else {
    bcrypt.hash(password, saltRounds, function (err, hashPassword) {
      // Password hashed
      let insertData = {
        name,
        username: username.toLowerCase(),
        password: hashPassword,
        account_no: accountNumber,
        csv: [],
      };
      dbo.collection("user").insertOne(insertData, (err, result) => {
        if (err) {
          let response;
          //username unique index fail
          if (err.code === 11000) {
            response = {
              message: "Duplicate username",
            };
          } else {
            response = {
              message: "Could not insert user",
            };
          }

          res.writeHead(400, {
            "Content-Type": "application/json",
          });
          return res.end(JSON.stringify(response));
        } else {
          res.writeHead(200, {
            "Content-Type": "application/json",
          });
          const response = {
            message: "User created",
            name: name,
            accountNumber: accountNumber,
            token: auth.issueToken({
              _id: result.insertedId,
              name,
              username,
              accountNumber,
            }),
          };
          return res.end(JSON.stringify(response));
        }
      });
    });
  }
};

exports.upload = (req, res) => {
  const date = moment(new Date()).format("DD-MM-YYYY:HH-MM-SS");
  const file = req.files.file;
  const name = `user-${req.auth._id}_${date}.csv`;
  let fullPath = `${__dirname}/../../${config.baseUrlUpload}/csv/${name}`;

  //upload file to server
  if (file) {
    file.mv(fullPath, function (err) {
      if (err) {
        console.log(err);
      }
    });
  } else {
    sendResp(req, res, 500, "Failed to upload");
  }

  let result = [];
  let count = 1;

  //Parse the CSV file
  fs.createReadStream(fullPath)
    .pipe(csvParser())
    .on("data", (row) => {
      //Check if number of records is withing 100
      if (count++ < 100) {
        let obj = {
          dateString: row.Date,
          user: ObjectId(req.auth._id),
          desc: row.Description,
          withdraw: parseInt(row.Withdraw),
          deposit: parseInt(row.Deposit),
          bal: parseInt(row["Closing Balance"]),
        };
        result.push(obj);
      }
    })
    .on("end", () => {
      // Data object for calculating credit limit, MBA

      let data = {};
      //Initialize data with each month found as a key and empty array as value
      result.forEach((item) => {
        let month = item.dateString.split("/")[0];
        data[month] = { totDeposit: 0, totWithdraw: 0, arr: [] };
      });

      // Push the record of each month into arr (month(key))
      // Calculate the totDeposit and totWithdraw per month
      result.forEach((item) => {
        let month = item.dateString.split("/")[0];
        if (item.withdraw) {
          data[month].totWithdraw = data[month].totWithdraw + item.withdraw;
        } else {
          data[month].totDeposit = data[month].totDeposit + item.deposit;
        }
        data[month].mb = data[month].totDeposit - data[month].totWithdraw;
        data[`${month}`].arr.push(item);
      });

      //Iterate the data object to sum all monthly balances and divide by 12 for avg
      let mba = 0;
      Object.entries(data).map((item) => {
        if (item[1].mb) mba += item[1].mb;
      });
      mba /= 12;

      const creditLimit = mba * 1.2;

      // Insert each record into the datbase (transaction collection) with userId
      // And return avg monthly balance and Credit limit
      // Also add each csv upload path to the user collection (csv array in each user document)
      const dbo = getDb();
      dbo.collection("transaction").insertMany(result, (err, result) => {
        if (err) {
          sendResp(req, res, 500, "Coult not add records");
        } else {
          dbo
            .collection("user")
            .update(
              { _id: ObjectId(req.auth._id) },
              { $push: { csv: fullPath } },
              (error2, result2) => {
                if (error2) {
                  sendResp(req, res, 500, "Coult not add records");
                }
                res.writeHead(200, {
                  "Content-Type": "application/json",
                });
                return res.end(
                  JSON.stringify({ AMB: mba, creditLimit: parseFloat(creditLimit.toFixed(2)) })
                );
              }
            );
        }
      });
    });
};
