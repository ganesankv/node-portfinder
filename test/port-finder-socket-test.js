/*
 * portfinder-test.js: Tests for the `portfinder` module.
 *
 * (C) 2011, Charlie Robbins
 *
 */

/*
NOTE: These tests curently fail when using the bash shell on windows. Socket
      support for that env has not landed.
 */

"use strict";

var assert = require('assert'),
    net = require('net'),
    path = require('path'),
    async = require('async'),
    vows = require('vows'),
    portfinder = require('../lib/portfinder'),
    fs = require('fs'),
    glob = require('glob'),
    Promise = require('bluebird');

var servers = [],
    socketDir = path.join(__dirname, 'fixtures'),
    badDir = path.join(__dirname, 'bad-dir');

const internals = {};

internals.pathToSocket = function _pathToSocket(dirname, filename) {
  return path.join(dirname, filename)
}


internals.isSocketPossible = function _isSocketPossible() {
  function cleanupTrySocket() {
    return new Promise(function(resolve, reject) {
      glob(path.resolve(socketDir, '*'), function (err, files) {
        if (err) { reject(err); }
        for (var i = 0; i < files.length; i++) { fs.unlinkSync(files[i]); }
        resolve();
      });
    });
  }

  return new Promise(function(resolve, reject) {
    if (process.platform === 'win32') { resolve(true); }

    var server = net.createServer(function() {});
    var socket = internals.pathToSocket(socketDir, 'trysocket.sock');

    server.listen(socket);

    server.once('listening', function() {
      cleanupTrySocket(function() { resolve(); });
    });

    server.once('error', function(err) {
      cleanupTrySocket(function() { reject(err); });
    });
  });
}

function createServers (callback) {
  var base = 0;

  async.whilst(
    function () { return base < 5 },
    function (next) {
      var server = net.createServer(function () { }),
          name = base === 0 ? 'test.sock' : 'test' + base + '.sock',
          sock = internals.pathToSocket(socketDir, name);

      // shamelessly stolen from foreverjs,
      // https://github.com/foreverjs/forever/blob/6d143609dd3712a1cf1bc515d24ac6b9d32b2588/lib/forever/worker.js#L141-L154
      if (process.platform === 'win32') {
        //
        // Create 'symbolic' file on the system, so it can be later
        // found via "forever list" since the `\\.pipe\\*` "files" can't
        // be enumerated because ... Windows.
        //
        fs.openSync(sock, 'w');

        //
        // It needs the prefix, otherwise EACCESS error happens on Windows
        // (no .sock extension, only named pipes with .pipe prefixes)
        //
        sock = '\\\\.\\pipe\\' + sock;
      }

      server.listen(sock, next);
      base++;
      servers.push(server);
    }, callback);
}

function cleanup(callback) {
  fs.rmdirSync(badDir);
  glob(path.resolve(socketDir, '*'), function (err, files) {
    if (err) { callback(err); }
    for (var i = 0; i < files.length; i++) { fs.unlinkSync(files[i]); }
    callback(null, true);
  });
}


internals.isSocketPossible()
  .then(function(/*result*/) {
    vows.describe('portfinder').addBatch({
      "When using portfinder module": {
        "with 5 existing servers": {
          topic: function () {
            createServers(function() {
              portfinder.getSocket({
                path: path.join(badDir, 'test.sock')
              }, this.callback);
            }.bind(this));
          },
          "the getPort() method": {
            topic: function () {
              portfinder.getSocket({
                path: path.join(socketDir, 'test.sock')
              }, this.callback);
            },
            "should respond with the first free socket (test5.sock)": function (err, socket) {
              assert.isTrue(!err);
              assert.equal(socket, path.join(socketDir, 'test5.sock'));
            }
          }
        }
      }
    }).addBatch({
      "When using portfinder module": {
        "with no existing servers": {
          "the getSocket() method": {
            "with a directory that doesnt exist": {
              topic: function () {
                fs.rmdir(badDir, function () {
                  portfinder.getSocket({
                    path: path.join(badDir, 'test.sock')
                  }, this.callback);
                }.bind(this));
              },
              "should respond with the first free socket (test.sock)": function (err, socket) {
                assert.isTrue(!err);
                assert.equal(socket, path.join(badDir, 'test.sock'));
              }
            },
            "with a directory that exists": {
              topic: function () {
                portfinder.getSocket({
                  path: path.join(socketDir, 'exists.sock')
                }, this.callback);
              },
              "should respond with the first free socket (exists.sock)": function (err, socket) {
                assert.isTrue(!err);
                assert.equal(socket, path.join(socketDir, 'exists.sock'));
              }
            }
          }
        }
      }
    }).addBatch({
      "When the tests are over": {
        topic: function() {
          cleanup(this.callback);
        },
        "necessary cleanup should have taken place": function (err, wasRun) {
          assert.isTrue(!err);
          assert.isTrue(wasRun);
        }
      }
    }).export(module);
  })
  .catch(function(err) {
    console.error("This operating system does support binding a socket to a UNIX file descriptor nor a Windows named pipe. This most likely means your running Bash on Windows, which currently does not support binding to a named socket %o", err);
  });







