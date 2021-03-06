'use strict';
require('should');

function makeReq(host, path) {
	return {
		url: path,
		headers: {
			host: host
		},
    parsedUrl: require('url').parse(path),
		connection: {},
	};
}


var onTarget;

var redirect = require('../modules/redirect');

describe('redirect module', function() {
	it('should handle [path] without leading /', function() {

		var middleware = redirect.middleware({
			redirect: {
				'jira.atlashost.eu/*': 'https://jira.atlashost.eu/[path]'
			}
		});


		function makeTest(host, path, cb) {
			onTarget = cb;
			middleware.handleRequest(makeReq(host, path), {
				setHeader: function(str, target) {
					if(str == 'Location')
						cb(target);
				},
				end: function(){}
			}, function(err) {
				onTarget('');
			});
		}
		
		var assertPath = function(host, path, mustEqual) {
			makeTest(host, path, function(target) {
				target.should.equal(mustEqual);
			});
		};

		assertPath('jira.atlashost.eu', '/test', 'https://jira.atlashost.eu/test');
		assertPath('jira.atlashost.eu', '/', 'https://jira.atlashost.eu/');
		assertPath('jira.atlashost.eu', '', 'https://jira.atlashost.eu/');
	});
});