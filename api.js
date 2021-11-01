module.exports = {
	// retrieve logs
	async getLogs({ homey }) {
		const result = await homey.app.getLogs();
		return result;
	},
	// delete logs
	async deleteLogs({ homey }) {
		const result = await homey.app.deleteLogs();
		return result;
	},
	// check api key
	async checkkey({ homey, body }) {
		const result = await homey.app.checkKey(body);
		return result;
	},
};
