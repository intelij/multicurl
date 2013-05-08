var util         = require("util")
  , EventEmitter = require("events").EventEmitter
  , request      = require("request")
  , Connection   = require("./connection")
  , _            = require("underscore");

function multicurl(url, options) {
  if(!options) var options = {};
  if(!options.destination) throw new Error("No destination given");

  this.url = url;
  this.options = options;
  this.defaults = {
    connections: 1
  };

  // Merge options with defaults
  this.options = _.defaults(this.options, this.defaults);
};
util.inherits(multicurl, EventEmitter);

// Starts the download process
multicurl.prototype.run = function() {
  var self = this;

  // Get total file size
  this.getTotalFilesize(function (err, totalFilesize) {
    if(err) return self.emit("error", err);

    var connections = []
      , connectionsDone = 0;

    // Build the ranges and connections
    for(var i = 0; i < self.options.connections; i++) {
      var options = _.clone(self.options);
      options.range = self.buildRange(totalFilesize, i);

      var connection = new Connection(self.url, options);

      connection.on("progress", function (bytesDone) {
        // Sum up the amounts
        var totalBytesDone = 0;
        for(var i = 0; i < connections.length; i++) {
          var connection = connections[i];
          totalBytesDone += connection.bytesDone;
        }

        self.emit("progress", totalBytesDone, totalFilesize);
      });

      connection.on("error", function (err) {
        self.emit("error", err);
      });

      connection.on("done", function () {
        connectionsDone++;
        if(connectionsDone === self.options.connections) {
          self.emit("done");
        }
      });
      connection.run();
      connections.push(connection);
    }
  })
};

// Build range string
multicurl.prototype.buildRange = function(totalFilesize, index) {
  var sizePerConnection = Math.floor(totalFilesize / this.options.connections)
    , fromByte = sizePerConnection * index
    , toByte   = fromByte + sizePerConnection - 1;

  if(index == this.options.connections - 1) {
    toByte = totalFilesize - 1;
  }
  return { from: fromByte, to: toByte, size: toByte - fromByte + 1 };
};

// Finds out the total file size by sending a HEAD request
multicurl.prototype.getTotalFilesize = function(callback) {
  this.options.followAllRedirects = true;
  request.head(this.url, this.options, function (err, response, body) {
    if(err) return callback(err);

    if(response.statusCode !== 200) {
      return callback(new Error("Wrong status code: " + response.statusCode + " (Expected 200 OK)"));
    }

    callback(null, parseInt(response.headers["content-length"]));
  });
}

module.exports = multicurl;