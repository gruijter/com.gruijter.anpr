/* eslint-disable no-unused-vars */
/* eslint-disable no-undef */

// tab 2 stuff here
function displayLogs(lines) {
	$('#loglines').html(lines);
}

function updateLogs() {
	try {
		displayLogs('');
		const showLogs = $('#show_logs').prop('checked');
		const showErrors = $('#show_errors').prop('checked');
		const showNoDetects = $('#show_no_detections').prop('checked');
		Homey.api('GET', 'getlogs/', null, (err, result) => {
			if (!err) {
				let lines = '';
				result
					.reverse()
					.forEach((line) => {
						if (!showLogs) {
							if (line.includes('[log]')) return;
						}
						if (!showErrors) {
							if (line.includes('[err]')) return;
						}
						if (!showNoDetects) {
							if (line.includes(' found in image')) return;
						}
						const logLine = line.replace(' [ANPRApp]', '');
						lines += `${logLine}<br />`;

					});
				displayLogs(lines);
			} else {
				displayLogs(err);
			}
		});
	} catch (e) {
		displayLogs(e);
	}
}

function deleteLogs() {
	Homey.confirm(Homey.__('settings.tab2.deleteWarning'), 'warning', (error, result) => {
		if (result) {
			Homey.api('GET', 'deletelogs/', null, (err) => {
				if (err) {
					Homey.alert(err.message, 'error'); // [, String icon], Function callback )
				} else {
					Homey.alert(Homey.__('settings.tab2.deleted'), 'info');
					updateLogs();
				}
			});
		}
	});
}

// tab 3 stuff here
function checkKeys(set) {
	try {
		const ready = set.map((key) => {
			return new Promise((resolve, reject) => {
				Homey.api('POST', 'checkkey/', { key }, (err, result) => {
					if (err) return reject(err);
					return resolve(result);
				});
			});
		});
		return Promise.all(ready);
	} catch (error) {
		return Promise.reject(error);
	}
}

async function showInfo3() {
	try {
		const key1 = document.getElementById('apiKey1');
		const key2 = document.getElementById('apiKey2');
		const key3 = document.getElementById('apiKey3');
		const key4 = document.getElementById('apiKey4');
		key1.type = 'password';
		key2.type = 'password';
		key3.type = 'password';
		key4.type = 'password';
		Homey.get('settingsKey', (err, set) => {
			if (err || !set || !set.apiKeys) return;
			$('#apiKey1').val(set.apiKeys[0]);
			$('#apiKey2').val(set.apiKeys[1]);
			$('#apiKey3').val(set.apiKeys[2]);
			$('#apiKey4').val(set.apiKeys[3]);
		});
		Homey.get('settingsMatch', (err, set) => {
			if (err || !set || !set.regions) return;
			$('#threshold').val(set.threshold);
			$('#regions').val(set.regions.join());
		});
	} catch (error) {
		Homey.alert(error.message, 'error');
	}
}

function togglePasswordView() {
	const key1 = document.getElementById('apiKey1');
	const key2 = document.getElementById('apiKey2');
	const key3 = document.getElementById('apiKey3');
	const key4 = document.getElementById('apiKey4');
	if (key1.type === 'password') {
		key1.type = 'text';
		key2.type = 'text';
		key3.type = 'text';
		key4.type = 'text';
	} else {
		key1.type = 'password';
		key2.type = 'password';
		key3.type = 'password';
		key4.type = 'password';
	}
}

async function saveSettingsKey() {
	try {
		const apiKeys = [$('#apiKey1').val(), $('#apiKey2').val(), $('#apiKey3').val(), $('#apiKey4').val()]
			.filter((key) => key.length > 0);
		if (!apiKeys[0]) return Homey.alert('At least 1 API Key must be entered!', 'error');
		await checkKeys(apiKeys);
		await Homey.set('settingsKey', { apiKeys });
		return Homey.alert('API Keys are saved!', 'info');
	} catch (error) {
		return Homey.alert(error.message, 'error');
	}
}

async function saveSettingsMatch() {
	try {
		const threshold = $('#threshold').val();
		if (threshold < 0 || threshold > 100) throw Error('Threshold must be between 0 and 100');
		const regions = $('#regions').val().replace(' ', '').split(',');
		await Homey.set('settingsMatch', { threshold, regions });
		return Homey.alert('Settings are saved!', 'info');
	} catch (error) {
		return Homey.alert(error.message, 'error');
	}
}

// generic stuff here
function showTab(tab) {
	if (tab === 2) updateLogs();
	if (tab === 3) showInfo3();

	$('.tab').removeClass('tab-active');
	$('.tab').addClass('tab-inactive');
	$(`#tabb${tab}`).removeClass('tab-inactive');
	$(`#tabb${tab}`).addClass('active');
	$('.panel').hide();
	$(`#tab${tab}`).show();
}

function onHomeyReady(homeyReady) {
	Homey = homeyReady;
	showInfo3();
	showTab(1);
	Homey.ready();
}
