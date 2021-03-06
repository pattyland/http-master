'use strict';
var XRegExp = require('xregexp').XRegExp;

// globStringToRegex from: http://stackoverflow.com/a/13818704/403571
function regexpQuote(str, delimiter) {
  // http://kevin.vanzonneveld.net
  // +   original by: booeyOH
  // +   improved by: Ates Goral (http://magnetiq.com)
  // +   improved by: Kevin van Zonneveld (http://kevin.vanzonneveld.net)
  // +   bugfixed by: Onno Marsman
  // +   improved by: Brett Zamir (http://brett-zamir.me)
  // *     example 1: preg_quote("$40");
  // *     returns 1: '\$40'
  // *     example 2: preg_quote("*RRRING* Hello?");
  // *     returns 2: '\*RRRING\* Hello\?'
  // *     example 3: preg_quote("\\.+*?[^]$(){}=!<>|:");
  // *     returns 3: '\\\.\+\*\?\[\^\]\$\(\)\{\}\=\!\<\>\|\:'
  return (str + '').replace(new RegExp('[.\\\\+*?\\[\\^\\]$(){}=!<>|:\\' + (delimiter || '') + '-]', 'g'), '\\$&');
}

function splitFirst(str) {

  var m = str.match(/^(\^?[^\/]+)\$?(?:(\/)(\^?)(.+))?$/);
  if(m.length > 2) {
    // make ^/path from /^path
    return [m[1], m[3] + m[2]+m[4]]; 
  }
  return [m[1]];
}



function globStringToRegex(str, specialCh) {
  if(!specialCh)
    specialCh = '.';
  var inside = regexpQuote(str);
  if(specialCh == '.') {
    inside = inside.replace(/^\\\*$/g, '(?:(?<host>.*))');
    inside = inside.replace(/^\\\*\\\?\\\./g, '(?:(.+)\\.)?');
    inside = inside.replace(/^\\\*\\\./g, '(?:(.+)\\.)');
    inside = inside.replace(/\\\.\\\*\\\?/g, '(?:\\.([^'+specialCh+']+))?');    
  }
  else
    inside = inside.replace(/\/\\\*$/g, '(?:\/(?<rest>.*|)|)');
  inside = inside.replace(/\\\*/g, '([^'+specialCh+']+)');

  var regexp = new XRegExp('^' + inside + '$');
  return regexp;
}

function getRegexpIfNeeded(str, specialCh) {
  if (typeof str == 'string') {
    var m = str.match(/^\^(.*)\$?$/);
    if (m) {
      return new XRegExp('^' + m[1] + '$');
    } else if (str.match(/[*?]/)) {
      return globStringToRegex(str, specialCh);
    }
  }
  return undefined;
}

function postParseKey(entryKey, entry) {
  var regexp = getRegexpIfNeeded(entryKey);
  if (regexp)
    entry.regexp = regexp;
  return entryKey;
}

function DispatchTable(params) {
  var parseEntry = params.entryParser;
  var config = params.config;
  var port = params.port;

  var self = this;
  this.requestHandler = params.requestHandler;
  this.upgradeHandler = params.upgradeHandler;
  this.table = {};
  this.regexpEntries = [];
  this.failedEntries = {};
  Object.keys(config).forEach(function(entryKey) {
    var entry = config[entryKey];


    // split entry 192.168.0.0/host to
    // ['192.168.0.0', '/']
    var entryKeyData = splitFirst(entryKey);
    entryKey = entryKeyData[0];
    var entryPath = entryKeyData[1];

    if(entryPath) {
      entryPath = decodeURIComponent(entryPath);
    }

    if (parseEntry) {
      try {
        var parsed = parseEntry(entryKey, entry);
        entryKey = parsed[0];
        entry = parsed[1];
      } catch(err) {
        // save failed parsed entry for future
        // error reporting
        self.failedEntries[entryKey] = {
          err: err,
          entry: entry
        };
        return;
      }
    }
    entry = {
      target: entry,
    };
    if (entryPath) {
      entry.path = entryPath;
      var pathRegexp = getRegexpIfNeeded(entryPath, '\/');
      if (pathRegexp)
        entry.pathRegexp = pathRegexp;
    }
    entryKey = postParseKey(entryKey, entry);
    port = port || 80;

    if (entry.regexp) {
      self.regexpEntries.push(entry);
    } else {

      if (self.table[entryKey]) {
        if (self.table[entryKey] instanceof Array) {
          self.table[entryKey].push(entry);
          self.table[entryKey + ':' + port].push(entry);
        } else {
          var oldEntry = self.table[entryKey];
          self.table[entryKey] = [oldEntry, entry];
          self.table[entryKey + ':' + port] = [oldEntry, entry];
        }
      } else {
        self.table[entryKey + ':' + port] = entry;
        self.table[entryKey] = entry;
      }
    }
  });
}

DispatchTable.prototype.checkPathForReq = function(req, entry) {
  if(!entry.path)
    return true;
  var m;

  var parsedUrl = req.parsedUrl;
  var pathname = parsedUrl.pathname || '';

  try {
    pathname = decodeURIComponent(pathname);
  } catch(err) {}

  if(entry.pathRegexp) {
    m = pathname.match(entry.pathRegexp);
    if (m) {
      req.pathMatch = m;
      return true;
    } 
  }
  else if(pathname == entry.path) {
    return true;
  }
  return false;
};

DispatchTable.prototype.getTargetForReq = function(req) {
  var i, m;
  var host = req.unicodeHost || req.headers.host || ''; // host can be undefined

  if (this.table[host]) {
    if (this.table[host].target) {
      if(this.checkPathForReq(req, this.table[host])) {
        return this.table[host].target;
      }
    }
    else { // multiple entries, check pathnames
      var targetEntries = this.table[host];
      for (i = 0; i < targetEntries.length; ++i) {
        if(this.checkPathForReq(req, targetEntries[i]))
          return targetEntries[i].target;
      }
    }
  }
  if (this.regexpEntries.length) {
    var regexpEntries = this.regexpEntries;
    for (i = 0; i < regexpEntries.length; ++i) {
      var entry = regexpEntries[i];
      if(!entry.regexp) {
        // TODO: research this
        console.log('Should not happen', (new Error()).toString());
        continue;
      }
      m = host.match(entry.regexp);
      if (m) {
        req.hostMatch = m;
        if(this.checkPathForReq(req, entry))
          return entry.target;
      }
    }
  }
};

DispatchTable.prototype.dispatchUpgrade = function(req, socket, head) {
  var target = this.getTargetForReq(req);
  if(target && this.upgradeHandler) {
    this.upgradeHandler(req, socket, head, target);
    return true;
  }
  return false;
};

DispatchTable.prototype.handleUpgrade = DispatchTable.prototype.dispatchUpgrade;

DispatchTable.prototype.dispatchRequest = function(req, res, next) {
  var target = this.getTargetForReq(req);
  if(target && this.requestHandler) {
    return this.requestHandler(req, res, next, target);
  }
  next();
};

DispatchTable.prototype.handleRequest = DispatchTable.prototype.dispatchRequest;

module.exports = DispatchTable;

module.exports.regexpQuote = regexpQuote;