"use strict";
const jwt = require("jsonwebtoken");
const sharedSecret = "secretKetUpiPay";

// Middleware function to check the token sent in header is valid
exports.verifyToken = function (req, authOrSecDef, token, callback) {
  function sendError() {
    return req.res.status(403).json({
      message: "Error: Access Denied",
    });
  }

  if (token && token.indexOf("Bearer ") == 0) {
    var tokenString = token.split(" ")[1];
    jwt.verify(tokenString, sharedSecret, function (verificationError, decodedToken) {
      if (verificationError == null && decodedToken) {
        req.auth = decodedToken;
        req.auth.tokenValue = tokenString;
        return callback(null);
      } else {
        return callback(sendError());
      }
    });
  } else {
    return callback(sendError());
  }
};


// Create token on login or register
exports.issueToken = function (user) {
  var token = jwt.sign({ ...user }, sharedSecret, {
    expiresIn: 1 * 24 * 60 * 60,
  });
  return token;
};
