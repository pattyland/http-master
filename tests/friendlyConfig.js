'use strict';
require('should');
var assert = require('assert');
var processConfig = require('../friendlyConfig');

describe('domains config processor', function() {

  it('should handle empty config', function() {
    var input = {

    };
    var expected = {
      ports: {

      }
    };
    assert.deepEqual(processConfig(input), expected);
  });

  it('should generate \"ports\" keys from list of ports', function() {
    var input = {
      http: [80, 8080],
      https: [443, 80443]
    };
    var expected = {
      ports: {
        '80': {},
        '8080': {},
        '443': {
          ssl: {}
        },
        '80443': {
          ssl: {}
        }
      }
    };
    assert.deepEqual(processConfig(input), expected);
  });
  it('should support ssl config per port', function() {
    var input = {
      https: [{
        port: 443,
        cipherList: ['CIPHER1', 'CIPHER2'],
        spdy: true
      }]
    };
    var expected = {
      ports: {
        '443': {
          ssl: {
            cipherList: ['CIPHER1', 'CIPHER2'],
            spdy: true
          }
        }
      }
    };
    assert.deepEqual(processConfig(input), expected);
  });

  it('should support simplified http entry', function() {
    var input = {
      http: true,
      https: true
    };
    var expected = {
      ports: {
        '80': {},
        '443': {
          ssl: {}
        },
      }
    };

    assert.deepEqual(processConfig(input), expected);
  });

  it('should support simple string keys with numerical target', function() {
    var input = {
      http: true,
      routes: {
        'code2flow.com:80': 4030
      }
    };
    var expected = {
      ports: {
        '80': {
          proxy: {
            'code2flow.com': 4030
          }
        }
      }
    };
    assert.deepEqual(processConfig(input), expected);
  });
  it('should support simple string keys with string target and path', function() {

    var input = {
      https: [{
        port: 443,
        spdy: true,
        key: 'key.pem',
        cert: 'cert.pem'
      }],
      routes: {
        'somehost:80': 50,
        'code2flow.com:443/test': 'redirect: https://sometarget'
      }
    };
    var expected = {
      ports: {
        '443': {
          ssl: {
            spdy: true,
            key: 'key.pem',
            cert: 'cert.pem'
          },
          redirect: {
            'code2flow.com/test': 'https://sometarget'
          }
        },
        '80': {
          proxy: {
            'somehost': 50
          }
        }
      }
    };
    assert.deepEqual(processConfig(input), expected);
  });
  it('should handle entry without port as belonging to all ports', function() {
    var input = {
      http: [80, 81],
      https: [443, 444],
      routes: {
        'somehost': 50,
        'code2flow.com/test': 'redirect: https://sometarget'
      }
    };
    var expected = {
      ports: {
        '80': {
          proxy: {
            'somehost': 50
          },
          redirect: {
            'code2flow.com/test': 'https://sometarget'
          }
        },
        '81': {
          proxy: {
            'somehost': 50
          },
          redirect: {
            'code2flow.com/test': 'https://sometarget'
          }
        },
        '443': {
          proxy: {
            'somehost': 50
          },
          redirect: {
            'code2flow.com/test': 'https://sometarget'
          },
          ssl: {}
        },
        '444': {
          proxy: {
            'somehost': 50
          },
          redirect: {
            'code2flow.com/test': 'https://sometarget'
          },
          ssl: {}
        }
      }
    };
    assert.deepEqual(processConfig(input), expected);
  });
  it('should handle group with multiple interfaces', function() {
    var input = {
      groups: {
        localOnlyHttp: {
          interfaces: ['127.0.0.1', '::1'],
          ports: [80]
        }
      },
      routes: {
        'localOnlyHttp | code2flow.com/test': 3040
      }
    };
    var expected = {
      ports: {
        '127.0.0.1:80': {
          proxy: {
            'code2flow.com/test': 3040
          }
        },
        '[::1]:80': {
          proxy: {
            'code2flow.com/test': 3040
          }
        }
      }
    };
    assert.deepEqual(processConfig(input), expected);
  });
  it('should handle global multiple interfaces', function() {
    var input = {
      interfaces: ['127.0.0.1', '::1'],
      routes: {
        'code2flow.com:80/test': 3040
      }
    };
    var expected = {
      ports: {
        '127.0.0.1:80': {
          proxy: {
            'code2flow.com/test': 3040
          }
        },
        '[::1]:80': {
          proxy: {
            'code2flow.com/test': 3040
          }
        }
      }
    };
    assert.deepEqual(processConfig(input), expected);
  });

  it('should discard other interfaces if '*' is defined', function() {
    var input = {
      interfaces: ['127.0.0.1', '::1', '*'],
      routes: {
        'code2flow.com:80/test': 3040
      }
    };
    var expected = {
      ports: {
        '80': {
          proxy: {
            'code2flow.com/test': 3040
          }
        }
      }
    };
    assert.deepEqual(processConfig(input), expected);
  });

  it('should allow by group subdomain definitions', function() {
    var input = {
      groups: {
        'www': {
          subdomains: {
            '': '[target]',
            'www.': '[target]'
          }
        }
      },
      routes: {
        'www | code2flow.com:80': 567
      }
    };
    var expected = {
      'ports': {
        '80': {
          'proxy': {
            'code2flow.com': 567,
            'www.code2flow.com': 567
          }
        }
      }
    };
    assert.deepEqual(processConfig(input), expected);
  });

  it('should allow subdomain definitions in object', function() {
    var input = {
      routes: {
        'code2flow.com:80': {
          subdomains: {
            'www.': 3040
          }
        }
      }
    };
    var expected = {
      'ports': {
        '80': {
          'proxy': {
            'www.code2flow.com': 3040
          }
        }
      }
    };
    assert.deepEqual(processConfig(input), expected);
  });

});