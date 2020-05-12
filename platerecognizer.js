
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

const https = require('https');
const qs = require('querystring');
const Queue = require('smart-request-balancer');
// const util = require('util');

const APIHost = 'api.platerecognizer.com';
const detectLPlateEP = '/v1/plate-reader/';
const statisticsEP = '/v1/statistics/';

const parse = (data) => {
	try {
		const parsed = JSON.parse(data);
		return parsed;
	} catch (error) {
		return {};
	}
};

class ANPR {

	constructor(opts) {
		const options = opts || {};
		this.host = options.host || APIHost;
		this.port = options.port || 443;
		this.timeout = options.timeout || 10000;
		this.apiKeys = options.apiKeys || [];
		this.apiKeyIndex = 0;
		this.initQueue();
	}

	// queue stuff
	initQueue() {
		const config = {
			rules: {				// Describing our rules by rule name
				common: {			// Common rule. Will be used if you won't provide rule argument
					rate: 3,		// Allow to send 10 messages
					limit: 1,		// per 1 second
					priority: 1,	// Rule priority. The lower priority is, the higher chance that this rule will execute faster
				},
			},
			overall: {				// Overall queue rates and limits
				rate: 10,
				limit: 1,
			},
			retryTime: 2,		// Default retry time (seconds). Can be configured in retry fn
			ignoreOverallOverheat: true,	// Should we ignore overheat of queue itself
		};
		this.queue = new Queue(config);
	}

	queueMessage(path, msg, apiKey) {
		const key = Date.now(); // 'homey';
		const requestHandler = (retry) => this._makeRequest(path, msg, apiKey)
			.then((response) => response)
			.catch((error) => {
				if (error.message && (error.message.includes('throttled') || error.message.includes('429'))) {	// or 500?
					return retry();
				}
				throw error;
			});
		return this.queue.request(requestHandler, key);
	}

	// returns an array of detected plates with attributes
	async detectPlates(opts) {
		try {
			const randomIndex = Math.floor(Math.random() * this.apiKeys.length);
			const apiKey = this.apiKeys[randomIndex];

			const postData = {
				// upload:	(required) The file to be uploaded. The parameter can either be the file bytes (using Content-Type multipart/form-data) OR a base64 encoded image.
				// regions: ['nl', 'be', 'de'], // Match the license plate pattern of a specific region or regions. This parameter can be used multiple times to specify more than one region.
				// camera_id:	Unique camera identifier.
				timestamp:	new Date().toISOString(),	// ISO 8601 timestamp. For example, 2019-08-19T13:11:25. The timestamp has to be in UTC.
			};
			Object.assign(postData, opts);
			const result = await this.queueMessage(detectLPlateEP, postData, apiKey);
			// const result = await this._makeRequest(detectLPlateEP, postData, apiKey);
			return Promise.resolve(result);
		} catch (error) {
			return Promise.reject(error);
		}
	}

	// returns the statistics of the used API key
	async getStatistics(apiKey) {
		try {
			const stat = await this.queueMessage(statisticsEP, '', apiKey);
			return Promise.resolve(stat);
		} catch (error) {
			return Promise.reject(error);
		}
	}

	getAllStatistics() {
		try {
			const stats = this.apiKeys.map((apiKey) => this.getStatistics(apiKey).catch(() => null));
			return Promise.all(stats);
		} catch (error) {
			return Promise.reject(error);
		}
	}

	// HTTPS request

	async _makeRequest(path, msg, apiKey) {
		try {
			const message = qs.stringify(Object.assign(msg));
			const headers = {
				Authorization: `Token ${apiKey}`,
				// 'cache-control': 'no-cache',
				// 'content-type': 'multipart/form-data',	// for stream
				'content-type': 'application/x-www-form-urlencoded',	// for base64 encoded file
				'content-length': Buffer.byteLength(message),
				connection: 'Keep-Alive',
			};
			const options = {
				hostname: this.host,
				port: this.port,
				path,
				headers,
				method: 'POST',
			};
			if (path === statisticsEP) options.method = 'GET';
			const result = await this._makeHttpsRequest(options, message);
			const body = parse(result.body);
			// console.log(util.inspect(body, false, 10, true));
			if (!Object.keys(body).length) throw Error(result.statusCode, result.body);
			// if (body.detail) throw Error(body.detail);
			// if (body.non_field_errors) throw Error(body.non_field_errors[0]);
			// if (body.upload) throw Error(body.upload[0]);
			if (result.statusCode !== 200 && result.statusCode !== 201) throw Error(JSON.stringify(body));
			// all is good
			return Promise.resolve(body);
		} catch (error) {
			return Promise.reject(error);
		}
	}

	_makeHttpsRequest(options, postData) {
		return new Promise((resolve, reject) => {
			const req = https.request(options, (res) => {
				let resBody = '';
				res.on('data', (chunk) => {
					resBody += chunk;
				});
				res.once('end', () => {
					if (!res.complete) {
						return reject(Error('The connection was terminated while the message was still being sent'));
					}
					res.body = resBody;
					return resolve(res); // resolve the request
				});
			});
			req.once('error', (e) => {
				req.abort();
				return reject(e);
			});
			req.setTimeout(this.timeout, () => {
				req.abort();
			});
			// req.write(postData);
			req.end(postData);
		});
	}

}

module.exports = ANPR;

/*

{
  "usage": {
    "month": 1,
    "calls": 128,
    "year": 2019
  },
  "total_calls": 2500
}

{
  processing_time: 67.586,
  results: [
    {
      box: { xmin: 124, ymin: 459, xmax: 292, ymax: 509 },
      plate: 'dj1313',
      region: { score: 0.864, code: 'lu' },
      vehicle: {
        score: 0.802,
        box: { xmin: 36, ymin: 174, xmax: 833, ymax: 597 },
        type: 'Car'
      },
      score: 0.903,
      candidates: [
        { score: 0.903, plate: 'dj1313' },
        { score: 0.761, plate: 'dj13i3' },
        { score: 0.761, plate: 'dji313' },
        { score: 0.619, plate: 'dji3i3' },
        [length]: 4
      ],
      dscore: 0.809
    },
    [length]: 1
  ],
  filename: '2009_sb90q_f4d06171-f321-4f23-bd96-da7a8cd577d4.jpg',
  version: 1,
  camera_id: 'homey',
  timestamp: '2020-05-03T20:09:13.198000Z'
}

{
  processing_time: 91.141,
  results: [
    {
      box: { xmin: 292, ymin: 372, xmax: 496, ymax: 444 },
      plate: 'nsn666',
      region: { score: 0.94, code: 'de' },
      vehicle: {
        score: 0.808,
        box: { xmin: 7, ymin: 79, xmax: 652, ymax: 561 },
        type: 'Car'
      },
      score: 0.901,
      candidates: [ { score: 0.901, plate: 'nsn666' } ],
      dscore: 0.923
    },
    {
      box: { xmin: 656, ymin: 206, xmax: 720, ymax: 228 },
      plate: 'nsn458',
      region: { score: 0.882, code: 'de' },
      vehicle: {
        score: 0.358,
        box: { xmin: 430, ymin: 90, xmax: 788, ymax: 279 },
        type: 'Car'
      },
      score: 0.904,
      candidates: [
        { score: 0.904, plate: 'nsn458' },
        { score: 0.763, plate: 'nsn45b' }
      ],
      dscore: 0.728
    },
    {
      box: { xmin: 818, ymin: 196, xmax: 851, ymax: 223 },
      plate: 'ak92115',
      region: { score: 0.852, code: 'it' },
      vehicle: {
        score: 0,
        type: 'Unknown',
        box: { xmin: 0, ymin: 0, xmax: 0, ymax: 0 }
      },
      score: 0.91,
      candidates: [
        { score: 0.91, plate: 'ak92115' },
        { score: 0.789, plate: 'ak921i5' },
        { score: 0.784, plate: 'ak92i15' },
        { score: 0.663, plate: 'ak92ii5' }
      ],
      dscore: 0.428
    }
  ],
  filename: '0842_6gW1A_b13d0a9b-b774-47c4-b80d-cc88b0d0e317.jpg',
  version: 1,
  camera_id: 'homey',
  timestamp: '2020-05-04T08:42:18.134000Z'
}

*/
