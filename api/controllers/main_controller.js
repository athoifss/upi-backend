const getDb = require("../helpers/db.js").getDb;
const auth = require("../helpers/auth");
const bcrypt = require("bcrypt");
const shortUuid = require("short-uuid");
const { ObjectId } = require("mongodb");

function sendError(req, res, code, msg) {
  res.writeHead(code, {
    "Content-Type": "application/json",
  });
  return res.end(JSON.stringify({ message: msg }));
}

exports.login = (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    sendError(req, res, 400, "Param verification failed");
  } else {
    const dbo = getDb();
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
              const response = {
                message: "Error: Could not login",
              };
              res.writeHead(400, {
                "Content-Type": "application/json",
              });
              return res.end(JSON.stringify(response));
            } else {
              if (isPassword) {
                response = { _id: result._id, name: result.name };
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
                sendError(req,res,401, "Incorrect Credentials")
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
    sendError(req, res, 400, "Param verfication failed");
  } else {
    bcrypt.hash(password, saltRounds, function (err, hashPassword) {
      // Password hashed
      let insertData = {
        name,
        username: username.toLowerCase(),
        password: hashPassword,
        account_no: accountNumber
      };
      dbo.collection("user").insertOne(insertData, (err, result) => {
        if (err) {
          let response;
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
              accountNumber
            }),
          };
          return res.end(JSON.stringify(response));
        }
      });
    });
  }
};
