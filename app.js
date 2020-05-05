/*
Copyright 2020, Robin de Gruijter (gruijter@hotmail.com)

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
			if (!this.logger) this.logger = new Logger('log', 200);
			this.keySettings = Homey.ManagerSettings.get('settingsKey') || {}; // apiKey
			this.matchSettings = Homey.ManagerSettings.get('settingsMatch') || { threshold: 85 }; // threshold
			const { apiKey } = this.keySettings;
			Homey.ManagerSettings
				.on('set', (key) => {
					if (key === 'settingsMatch') {
						this.log('Plate search settings changed');
						return;
					}
					if (key === 'settingsKey') {
						this.log('app Key settings changed, reloading app now');
						this.logger.saveLogs();
						this.onInit();
					}
				});
			if (!apiKey) {
				this.log('No API key entered in app settings');
				return;
			}
			const options = { key: apiKey };
			this.ANPR = new ANPR(options);
			this.log('ANPR is running...');

			// register some listeners
			process.on('unhandledRejection', (error) => {
				this.error('unhandledRejection! ', error);
			});
			process.on('uncaughtException', (error) => {
				this.error('uncaughtException! ', error);
			});
			Homey
				.on('unload', () => {
					this.log('app unload called');
					// save logs to persistant storage
					this.logger.saveLogs();
				})
				.on('memwarn', () => {
					this.log('memwarn!');
				});

			// register flows and tokens
			this.registerFlowCards();
			this.registerFlowTokens();

			// do garbage collection every 10 minutes
			// this.intervalIdGc = setInterval(() => {
			// 	global.gc();
			// }, 1000 * 60 * 10);

			// const testimg = fs.readFileSync('./assets/images/test.jpg');
			// await this.detectPlates(base64Encode(testimg));

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

	// returns a formatted array of recognised plates, and triggers flowCards
	async detectPlates(imgBase64, origin) {
		try {
			const options = {
				upload:	imgBase64,	// (required) The file to be uploaded.
				// regions:	Match the license plate pattern of a specific region or regions. This parameter can be used multiple times to specify more than one region.
				camera_id:	origin || 'homey',	// Unique camera identifier.
				timestamp:	new Date().toISOString(),	// ISO 8601 timestamp. For example, 2019-08-19T13:11:25. The timestamp has to be in UTC.
			};
			const { results, camera_id: cameraID } = await this.ANPR.detectPlates(options);
			const threshold = (Homey.ManagerSettings.get('settingsMatch').threshold || 85) / 100;
			const searchResult = results
				.filter((plate) => plate.score > threshold)
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
					this.flows.plateDetectedTrigger.trigger(tokens);
					return tokens;
				});
			await Promise.all(searchResult);
			if (searchResult.length === 0) this.log(`no plates found in image ${origin}`);
		} catch (error) {
			this.error(error);
		}
	}


	// register flow cards
	async registerFlowCards() {
		// unregister cards first
		if (!this.flows) this.flows = {};
		const ready = Object.keys(this.flows).map((flow) => Promise.resolve(Homey.ManagerFlow.unregisterCard(this.flows[flow])));
		await Promise.resolve(ready);
		// Object.keys(this.flows).forEach((flow) => Homey.ManagerFlow.unregisterCard(this.flows[flow]));

		// add trigggers
		this.flows.plateDetectedTrigger = new Homey.FlowCardTrigger('plate_detected')
			.register();

		// add actions
		this.flows.analyzeImageAction = new Homey.FlowCardAction('search_plates')
			.register()
			.registerRunListener(async (args) => {
				// get the contents of the image
				const image = args.droptoken;
				if (!image || !image.getStream) return false;
				// if (typeof image === 'undefined' || image == null) return false;
				const imageStream = await image.getStream();

				// save the image to userdata
				// this.log('saving ', imageStream.contentType);
				// const targetFile = fs.createWriteStream('./userdata/incoming.img');
				// imageStream.pipe(targetFile);

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
				return true;
			});
	}

	// register global flow tokens
	async registerFlowTokens() {
		// unregister tokens first
		if (!this.tokens) this.tokens = {};
		const ready = Object.keys(this.tokens).map((token) => Promise.resolve(Homey.ManagerFlow.unregisterToken(this.tokens[token])));
		await Promise.resolve(ready);

		// register the test image
		const testImage = new Homey.Image();
		testImage.setPath('/assets/images/test.jpg');
		testImage.register()
			.then(() => {
				// create a token & register it
				this.tokens.testImageToken = new Homey.FlowToken('test_image_token', {
					type: 'image',
					title: 'Test Image',
				});
				this.tokens.testImageToken
					.register()
					.then(() => {
						this.tokens.testImageToken.setValue(testImage)
							.catch(this.error);
					})
					.catch(this.error.bind(this, 'testImageToken.register'));
			})
			.catch(this.error);
	}

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

*/
