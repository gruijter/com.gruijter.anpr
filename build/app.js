/*
Copyright 2020 -2021, Robin de Gruijter (gruijter@hotmail.com)

This file is part of com.gruijter.anpr.

com.gruijter.anpr is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

com.gruijter.anpr is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with com.gruijter.anpr.  If not, see <http://www.gnu.org/licenses/>.
*/

'use strict';

const Homey = require('homey');
// const util = require('util');
// const fs = require('fs');

const Logger = require('./captureLogs.js');
const ANPR = require('./platerecognizer.js');

// const setTimeoutPromise = util.promisify(setTimeout);

// convert binary data to base64 encoded string
const base64Encode = (img) => Buffer.from(img).toString('base64');
// const base64Decode = (base64) => Buffer.from(base64, 'base64');

class ANPRApp extends Homey.App {

	async onInit() {
		try {
			if (!this.logger) this.logger = new Logger({ name: 'log', length: 200, homey: this.homey });

			// register some listeners
			process.on('unhandledRejection', (error) => {
				this.error('unhandledRejection! ', error);
			});
			process.on('uncaughtException', (error) => {
				this.error('uncaughtException! ', error);
			});
			this.homey
				.on('unload', () => {
					this.log('app unload called');
					// save logs to persistant storage
					this.logger.saveLogs();
				})
				.on('memwarn', () => {
					this.error('memwarn!');
				});

			// first remove settings events listener
			if (this.listeners && this.listeners.set) {
				this.homey.settings.removeListener('set', this.listeners.set);
			}

			// listen to change settings events
			this.listeners.set = (key) => {
				if (key === 'settingsMatch') {
					this.log('Plate search settings changed:', JSON.stringify(this.homey.settings.get('settingsMatch')));
				}
				if (key === 'settingsKey') {
					this.log('API Key settings changed, reloading app now');
				}
				this.logger.saveLogs();
				this.log('Re-initing app now');
				this.onInit();
			};
			this.homey.settings
				.on('set', this.listeners.set);

			// init values from app settings
			const matchSettings = this.homey.settings.get('settingsMatch') || {}; // { threshold, regions };
			this.matchThreshold = (matchSettings.threshold || 85) / 100;
			this.regions = matchSettings.regions;	// [ 'nl', 'de' ]

			const keySettings = this.homey.settings.get('settingsKey') || {}; // { apiKeys: [ apiKey1 ... apiKey4 ] }
			let { apiKeys } = keySettings;
			apiKeys = apiKeys ? apiKeys.filter((key) => key.length > 0) : [];

			const options = { apiKeys };
			this.ANPR = new ANPR(options);

			if (!apiKeys || !apiKeys[0]) {
				this.log('No API key entered in app settings');
				return;
			}

			// register flows and tokens, and start polling stuff
			await this.registerFlowListeners();
			await this.registerFlowTokens();
			// this.startPolling();

			// get stats
			this.updateStats();

			this.log('ANPR is running...');

			// do garbage collection every 10 minutes
			// this.intervalIdGc = setInterval(() => {
			// 	global.gc();
			// }, 1000 * 60 * 10);

		} catch (error) {
			this.error(error);
		}

	}

	//  stuff for frontend API
	deleteLogs() {
		return this.logger.deleteLogs();
	}

	getLogs() {
		return this.logger.logArray;
	}

	checkKey(body) {
		this.log('Checking new API key from frontend');
		return Promise.resolve(this.ANPR.getStatistics(body.key));
	}

	// update usage statistics tokens
	async updateStats() {
		try {
			if (this.busyStat) return;
			this.busyStat = true;
			const stats = await this.ANPR.getAllStatistics();
			stats.forEach((stat, index) => {
				const token = `key${index + 1}UsageToken`;
				if (stat && stat.total_calls && this.tokens && this.tokens[token]) {
					const keyUsage = Math.round((stat.usage.calls / stat.total_calls) * 1000) / 10;
					this.tokens[token].setValue(keyUsage);
				}
			});
			this.busyStat = false;
		} catch (error) {
			this.error(error);
		}
	}

	// returns a formatted array of recognised plates, and triggers flowCards
	async detectPlates(imgBase64, origin) {
		try {
			const options = {
				upload:	imgBase64,	// (required) The file to be uploaded.
				regions: this.regions, // Match the license plate pattern of a specific region or regions.
				camera_id:	origin || 'homey',	// Unique camera identifier.
				timestamp:	new Date().toISOString(),	// ISO 8601 timestamp. For example, 2019-08-19T13:11:25. The timestamp has to be in UTC.
			};
			const { results, camera_id: cameraID } = await this.ANPR.detectPlates(options);
			// console.dir(results, { depth: null });
			const searchResult = results
				.filter((plate) => plate.score > this.matchThreshold)
				.map((plate) => {
					const tokens = {
						origin: cameraID, // || origin || 'undefined',
						plate: plate.plate,
						confidence: Math.round(plate.score * 1000) / 10,
						quality: Math.round(plate.dscore * 1000) / 10,
						region: plate.region.code,
						region_conf: Math.round(plate.region.score * 1000) / 10,
						vehicle: plate.vehicle.type,
						vehicle_conf: Math.round(plate.vehicle.score * 1000) / 10,
					};
					this.log(tokens);
					const plateDetectedTrigger = this.homey.flow.getTriggerCard('plate_detected');
					plateDetectedTrigger.trigger(tokens);
					return tokens;
				});
			await Promise.all(searchResult);
			if (searchResult.length === 0) this.log(`no plates found in image ${origin}`);
			this.updateStats();
		} catch (error) {
			this.error(error.message);
		}
	}

	async analyzeImage(args) {
		try {
			// get the contents of the image
			const image = args.droptoken;
			if (!image || !image.getStream) throw Error('no valid image stream');
			// if (typeof image === 'undefined' || image == null) return false;
			const imageStream = await image.getStream();
			// load image in memory
			imageStream.once('error', (err) => {
				this.error(err);
			});
			const chunks = [];
			// File is done being read
			imageStream.once('end', () => {
				const imgBuffer = Buffer.concat(chunks);
				this.detectPlates(base64Encode(imgBuffer), args.origin);
			});
			imageStream.on('data', (chunk) => {
				chunks.push(chunk); // push data chunk to array
			});
		} catch (error) {
			this.error(error);
		}
	}

	// register flow cards
	async registerFlowListeners() {
		try {
			// action cards
			const analyzeImageAction = this.homey.flow.getActionCard('search_plates');
			analyzeImageAction.registerRunListener((args) => this.analyzeImage(args));
			return Promise.resolve(this.flows);
		} catch (error) {
			return Promise.resolve(error);
		}
	}

	// register global flow tokens
	async registerFlowTokens() {
		try {
			// unregister tokens first
			if (!this.tokens) this.tokens = {};
			const ready = Object.keys(this.tokens).map((token) => Promise.resolve(this.homey.ManagerFlow.unregisterToken(this.tokens[token])));
			await Promise.all(ready);

			// register the test image
			const testImage = await this.homey.images.createImage();
			testImage.setPath('/assets/images/test.jpg');

			// create a droptoken for test image
			this.tokens.testImageToken = await this.homey.flow.createToken('test_image_token', {
				type: 'image',
				title: 'Test Image',
			});
			await this.tokens.testImageToken.setValue(testImage);

			// register API call usage token
			this.tokens.key1UsageToken = await this.homey.flow.createToken('key1_usage_token', {
				type: 'number',
				title: 'Key usage %',
			});

			return Promise.resolve(this.tokens);
		} catch (error) {
			return Promise.resolve(error);
		}

	}

	// register polling stuff
	// async startPolling() {
	// 	try {
	// 		// clear intervals first
	// 		if (!this.interval) this.interval = {};
	// 		const ready = Object.keys(this.interval).map((interval) => Promise.resolve(clearInterval(this.interval[interval])));
	// 		await Promise.all(ready);

	// 		// start polling statistics every minute
	// 		this.interval.stats = setInterval(() => {
	// 			this.updateStats();
	// 		}, 1000 * 60 * 0.1);

	// 	} catch (error) {
	// 		this.error(error);
	// 	}

	// }

}

module.exports = ANPRApp;

/*

{
  origin: 'undefined',
  plate: 'dj1313',
  confidence: 90.3,
  quality: 80.9,
  region: 'lu',
  region_conf: 86.4,
  vehicle: 'Car',
  vehicle_conf: 80.2
}

[
  { total_calls: 2500, usage: { year: 2020, month: 5, calls: 832 } },
  { total_calls: 2500, usage: { year: 2020, month: 5, calls: 13 } }
]

*/
