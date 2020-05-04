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
function checkKeys() {
	Homey.get('settingsKey', (error, set) => {
		if (error || !set) return Homey.alert('API Key and Secret are not saved!', 'error');
		if (!set.apiKey || set.apiKey.length < 10) return Homey.alert('API Key not correctly saved!', 'error');
		return true;
	});
}

function showInfo3() {
	Homey.get('settingsKey', (err, set) => {
		if (err || !set) return;
		$('#apiKey').val(set.apiKey);
	});
	// Homey.get('settingsMatch', (err, set) => {
	// 	if (err || !set) return;
	// 	$('#threshold').val(set.threshold);
	// });
}

function saveSettingsKey() {
	const apiKey = $('#apiKey').val();
	Homey.set('settingsKey', { apiKey }, (err, result) => {
		if (err) {
			return Homey.alert(err.message, 'error'); // [, String icon], Function callback )
		}
		return Homey.alert('API Key is saved!', 'info');
	});
}

function saveSettingsMatch() {
	const threshold = $('#threshold').val();
	Homey.set('settingsMatch', { threshold }, (err, result) => {
		if (err) {
			return Homey.alert(err.message, 'error'); // [, String icon], Function callback )
		}
		return Homey.alert('Settings are saved!', 'info');
	});
}


// generic stuff here
function showTab(tab) {
	if (tab === 2) updateLogs();
	if (tab === 3) {
		checkKeys();
		showInfo3();
	}

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
