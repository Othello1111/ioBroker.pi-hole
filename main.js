"use strict";

const utils = require("@iobroker/adapter-core");
const request = require("request");
//const ca = require("ssl-root-cas/latest").create();
let systemLanguage;
let piholeIntervall;
let piholeParseIntervall;
let url;
let bolReject;
const valuePaths = ["getQueryTypes","version","type","summaryRaw","summary","topItems","getQuerySources","overTimeData10mins","getForwardDestinations"];

let adapter;
function startAdapter(options) {
	options = options || {};
	Object.assign(options, {
		name: "pi-hole",
		stateChange: function (id, state) {
			const command = id.split(".").pop();
            
			// you can use the ack flag to detect if it is status (true) or command (false)
			if (!state || state.ack) return;
			
			if (command == "deactPiHoleTime") {
				let deactTime = 0;

				if(state.val > 0) {
					deactTime = state.val;
				}

				deactivatePihole(deactTime);
				setTimeout(function(){
					getPiholeValues("summary");
					getPiholeValues("summaryRaw");
				}, 1000);
			}

			if (command == "actPiHole") {
				activatePihole();
				setTimeout(function(){
					getPiholeValues("summary");
					getPiholeValues("summaryRaw");
				}, 1000);
			}
		},
		unload: function (callback) {
			try {
				if (piholeIntervall) clearInterval(piholeIntervall);
				if (piholeParseIntervall) clearInterval(piholeParseIntervall);
				adapter.log.info("cleaned everything up...");
				callback();
			} catch (e) {
				callback();
			}
		},
		ready: function () {
			adapter.getForeignObject("system.config", function (err, obj) {
				if (err) {
					adapter.log.error(err);
					return;
				} else if (obj) {
					if (!obj.common.language) {
						adapter.log.info("Language not set. English set therefore.");
					} else {
						systemLanguage = obj.common.language;
					}
					if (adapter.config.piholeAllCerts === true) {
						bolReject = false;
					} else {
						bolReject = true;
					}
					url = "http://" + adapter.config.piholeIP + "/admin/api.php?";
					main();
				}
			});
		}
	});
	adapter = new utils.Adapter(options);
    
	return adapter;
}

function parsePiHole() {
	const httpOptions = {
		url: "http://" + adapter.config.piholeIP + "/admin/index.php",
		method: "GET",
		json: true
	};

	const httpsOptions = {
		url: "https://" + adapter.config.piholeIP + "/admin/index.php",
		method: "GET",
		json: true,
		rejectUnauthorized: bolReject/*,
		ca: ca*/
	};

	let reqOptions;
	if (adapter.config.piholeHttps === true) {
		reqOptions = httpsOptions;
	} else {
		reqOptions = httpOptions;
	}

	try {
		request(reqOptions, function (error, response, body) {
			if (!error && response.statusCode == 200) {
				const update_pattern = new RegExp(adapter.config.piholeUpdatePattern);
				if (body.match(update_pattern) === null) adapter.setState("updatePiholeAvailable", false);
				else {
					const update_arr =  body.match(update_pattern);
					const update = update_arr[0];
					const update_bool = update === (adapter.config.piholeUpdatePattern) ? true : false;
					adapter.setState("updatePiholeAvailable", update_bool);          
				}
			} else {
				adapter.log.error(error);
			}
		});
	} catch (e) {
		adapter.log.error("Unable to read pi-hole interface.");
	}
}

function deactivatePihole(intSeconds){
	let timeOff = "";
	if (intSeconds) {
		timeOff = "=" + intSeconds;
	}

	const httpOptions = {
		url: "http://" + adapter.config.piholeIP + "/admin/api.php?disable" + timeOff + "&auth=" + adapter.config.piholeToken,
		method: "GET",
		json: true
	};

	const httpsOptions = {
		url: "https://" + adapter.config.piholeIP + "/admin/api.php?disable" + timeOff + "&auth=" + adapter.config.piholeToken,
		method: "GET",
		json: true,
		rejectUnauthorized: bolReject/*,
		ca: ca*/
	};

	let reqOptions;
	if (adapter.config.piholeHttps === true) {
		reqOptions = httpsOptions;
	} else {
		reqOptions = httpOptions;
	}
	
	request(reqOptions, function(error, response) {
		if (!error && response.statusCode == 200) {
			//everything okay
			adapter.log.info("pi-hole deactivated");
		} else {
			adapter.log.error(error);
		}
	});
}

function activatePihole(){	
	const httpOptions = {
		url: "http://" + adapter.config.piholeIP + "/admin/api.php?enable&auth=" + adapter.config.piholeToken,
		method: "GET",
		json: true
	};

	const httpsOptions = {
		url: "https://" + adapter.config.piholeIP + "/admin/api.php?enable&auth=" + adapter.config.piholeToken,
		method: "GET",
		json: true,
		rejectUnauthorized: bolReject/*,
		ca: ca*/
	};

	let reqOptions;
	if (adapter.config.piholeHttps === true) {
		reqOptions = httpsOptions;
	} else {
		reqOptions = httpOptions;
	}
	
	request(reqOptions, function(error, response) {
		if (!error && response.statusCode == 200) {
			//everything okay
			adapter.log.info("pi-hole activated");
		} else {
			adapter.log.error(error);
		}
	});
}

function getPiholeValues(strURL) {
	const httpOptions = {
		uri: "http://" + adapter.config.piholeIP + "/admin/api.php?" + strURL + "&auth=" + adapter.config.piholeToken,
		method: "GET",
		json: true
	};

	const httpsOptions = {
		uri: "https://" + adapter.config.piholeIP + "/admin/api.php?" + strURL + "&auth=" + adapter.config.piholeToken,
		method: "GET",
		json: true,
		rejectUnauthorized: bolReject/*,
		ca: ca*/
	};

	let reqOptions;
	if (adapter.config.piholeHttps === true) {
		reqOptions = httpsOptions;
	} else {
		reqOptions = httpOptions;
	}
	
	request(reqOptions, function(error, response, content) {
		if (!error && response.statusCode == 200) {
		//create channel for each specific url
			adapter.setObjectNotExists(
				strURL, {
					common: {
						name: strURL,
					},
					type: "channel"
				}
			);
			
			for (const i in content) {
				if (typeof(content[i]) !== "object") {
					if (content.hasOwnProperty(i)) {
						adapter.setObjectNotExists(
							strURL + "." + i, {
								type: "state",
								common: {
									name: i,
									type: typeof(content[i]),
									read: true,
									write: false,
									unit: "",
									role: "value"
								},
								native: {}
							},
							adapter.setState(
								strURL + "." + i,
								{val: content[i], ack: true}
							)
						);
					}
				} else {
					if (content.hasOwnProperty(i)) {
						adapter.setObjectNotExists(
							strURL + "." + i, {
								common: {
									name: i,
								},
								type: "channel"
							}
						);
						
						for (const j in content[i]) {
							if (typeof(content[i][j]) !== "object") {
								if(strURL == "topItems" || strURL == "getQuerySources" || strURL == "overTimeData10mins" || strURL == "getForwardDestinations") {
									
									adapter.setObjectNotExists(
										strURL + "." + i + ".data-table", {
											type: "state",
											common: {
												name: "data-table",
												type: "object",
												read: true,
												write: false,
												unit: "",
												role: "table"
											},
											native: {}
										},
										adapter.setState(
											strURL + "." + i + ".data-table",
											{val: "[" + JSON.stringify(content[i]) + "]", ack: true}
										)
									);
								} else {
									adapter.setObjectNotExists(
										strURL + "." + i + "." + j, {
											type: "state",
											common: {
												name: i,
												type: typeof(content[i][j]),
												read: true,
												write: false,
												unit: "",
												role: "value"
											},
											native: {}
										},
										adapter.setState(
											strURL + "." + i + "." + j,
											{val: content[i][j], ack: true}
										)
									);
								}
							} else {
								if (content[i].hasOwnProperty(j)) {
									adapter.setObjectNotExists(
										strURL + "." + i + "." + j, {
											common: {
												name: j,
											},
											type: "channel"
										}
									);

									for (const k in content[i][j]) {
										if (typeof(content[i][j][k]) !== "object") {
											adapter.setObjectNotExists(
												strURL + "." + i + "." + j + "." + k, {
													type: "state",
													common: {
														name: k,
														type: typeof(content[i][j][k]),
														read: true,
														write: false,
														unit: "",
														role: "value"
													},
													native: {}
												},
												adapter.setState(
													strURL + "." + i + "." + j + "." + k,
													{val: content[i][j][k], ack: true}
												)
											);
										}
									}
								}
							}
						}
					}
				}
			}

		} else {
			adapter.log.error(error);
		}
	});
}

function main() {
	adapter.setObjectNotExists(
		"updatePiholeAvailable", {
			type: "state",
			common: {
				name: "pi-hole update available",
				type: "boolean", 
				read: true,
				write: true,
				role: "indicator"
			},
			native: {}
		},
		adapter.subscribeStates("updatePiholeAvailable")
	);
	
	adapter.setObjectNotExists(
		"deactPiHoleTime", {
			type: "state",
			common: {
				name: "interval for deactivating pi-hole",
				type: "number",
				role: "value.interval",
				read: true,
				write: true
			},
			native: {}
		},
		adapter.subscribeStates("deactPiHoleTime")
	);

	adapter.setObjectNotExists(
		"actPiHole", {
			type: "state",
			common: {
				name: "activate pi-hole",
				type: "boolean",
				role: "button.start",
				read: true,
				write: true
			},
			native: {}
		},
		adapter.subscribeStates("actPiHole")
	);
	
	const httpOptions = {
		url: "http://" + adapter.config.piholeIP + "/admin/api.php?topItems&auth=" + adapter.config.piholeToken,
		method: "GET",
		json: true
	};

	const httpsOptions = {
		url: "https://" + adapter.config.piholeIP + "/admin/api.php?topItems&auth=" + adapter.config.piholeToken,
		method: "GET",
		json: true,
		rejectUnauthorized: bolReject/*,
		ca: ca*/
	};

	let reqOptions;
	if (adapter.config.piholeHttps === true) {
		reqOptions = httpsOptions;
	} else {
		reqOptions = httpOptions;
	}

	request(reqOptions, function(error, response) {
		if (!error && response.statusCode == 200) {
			adapter.setState(
				"info.connection",
				{val: true, ack: true}
			);
		}
	});
	
	valuePaths.forEach(function(item){
		getPiholeValues(item);
	});

	parsePiHole();

	if(adapter.config.piholeRenew > 1) {
		piholeIntervall = setInterval(function(){
			valuePaths.forEach(function(item){
				getPiholeValues(item);
			});
		}, (adapter.config.piholeRenew * 1000));

		piholeParseIntervall = setInterval(function(){
			parsePiHole();
		}, (adapter.config.piholeRenew * 2000));
	}
}

// If started as allInOne/compact mode => return function to create instance
if (module && module.parent) {
	module.exports = startAdapter;
} else {
	// or start the instance directly
	startAdapter();
} 