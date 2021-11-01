const Homey = require('homey');

module.exports = [
	{
		description: 'Show loglines',
		method: 'GET',
		path: '/getlogs/',
		requires_authorization: true,
		role: 'owner',
		fn: function fn(args, callback) {
			const result = Homey.app.getLogs();
			callback(null, result);
		},
	},
	{
		description: 'Delete logs',
		method: 'GET',
		path: '/deletelogs/',
		requires_authorization: true,
		role: 'owner',
		fn: function fn(args, callback) {
			const result = Homey.app.deleteLogs();
			callback(null, result);
		},
	},
	{
		description: 'check API Key',
		method: 'POST',
		path: '/checkkey/',
		requires_authorization: true,
		role: 'owner',
		fn: function fn(args, callback) {
			Homey.app.checkKey(args.body.key)
				.then((result) => callback(null, result))
				.catch((error) => {
					callback(error, null);
				});
		},
	},

	// {
	// 	description: 'Detect Plate',
	// 	method: 'POST',
	// 	path: '/detectplate/',
	// 	requires_authorization: true,
	// 	role: 'owner',
	// 	fn: function fn(args, callback) {
	// 		Homey.app.log('Analyzing new image from app settings');
	// 		Homey.app.detectPlates(args.body.img)
	// 			.then((result) => callback(null, result))
	// 			.catch((error) => {
	// 				Homey.app.error(error);
	// 				callback(error, null);
	// 			});
	// 	},
	// },


];
