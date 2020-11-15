var client = require('mongodb').MongoClient
const config = require("../../config/config.json");
const url = `mongodb+srv://${config.user}:${config.password}@cluster0.tbiee.mongodb.net/${config.db}?retryWrites=true&w=majority`;

let _db;
function initDb(callback) {
    if (_db) {
        console.warn("Trying to init DB again!");
        return callback(null, _db);
    }
    client.connect(url, {
        useUnifiedTopology: true
    }, connected);

    function connected(err, db) {
        if (err) {
            return callback(err);
        }
        console.log("Mongo-DB connected");
        _db = db.db(config.dbPlay);
        return callback(null, _db);
    }
}
function getDb() {
    return _db;
}
module.exports = {
    getDb,
    initDb
};