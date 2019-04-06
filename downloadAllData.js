"use strict";

require("colors"); // To print pretty

const ib = require("ib"); // IBKR Node API
const moment = require("moment"); // Date/Time library
const fs = require("fs"); // FileSystem library
const util = require("util");

// Import library responsable for workload scheduling
const Scheduler = require('node-promise-scheduler').Scheduler;
const Task = require('node-promise-scheduler').Task;

const SYMBOLS_URL = "https://api.iextrading.com/1.0/ref-data/symbols"; // Where to download the list of symbols

const syncRequest = require("sync-request");

const CSV_HEADER = "date,symbol,what,open,high,low,close,volume\n"; // Header line in our csv file

const endDate = moment(); // We want data upto this moment in time

// Connection to IBKR API Settings
const HOST = "127.0.0.1";
const PORT = 7496;
const CLIENT_ID = 22;

const MAX_LOAD = 45; // How many parallel symbols to download data for

var requestId = 1; // Current request ID

var conn; // Is the connection to IBKR

var promiseCallbacksMap = {}; // Contains the map of symbol to task promise callbacks

var dataHistoryMap = {};

var reqIdToSymbol = {};

// First, let's get all the symbols that there are

const getSymbols = function (callback) {
	const res = syncRequest('GET', SYMBOLS_URL);

	const body = JSON.parse(res.getBody('utf8'));

	const symbols = [];

	body.forEach((res) => {
		symbols.push(res['symbol']);
	})

	callback(symbols);
}


// Get where to save the data
const getFilename = function (symbol) {
	return util.format("./data/%s.csv", symbol)
}

// Creates the node-promise task for downloading a symbol file
const createTask = function (symbol) {
	const task = new Task((done, rej) => {
		// Create the file where we are going to store the data
		// fs.writeFileSync(util.format("./data/%s.csv", symbol), CSV_HEADER, { flag: "w" });

		const reqId = requestId++;
		const ticker = ib.contract.stock(symbol, "ISLAND", "USD");
		console.log("[Requesting data for "+symbol+"]".yellow);

		reqIdToSymbol[reqId] = symbol;
		dataHistoryMap[symbol] = [];
		promiseCallbacksMap[symbol] = done;

		conn.reqHistoricalData(reqId, ticker, endDate.format("YYYYMMDD HH:mm:ss"), "1 Y", "30 mins", "TRADES", 0, 2, false);
	});

	return task;
}

const onConnected = function() {
	getSymbols((symbols) => {
		console.log("Got", (symbols.length + "").yellow, "symbols");

		const tasks = []; // List of tasks to execute

		symbols.forEach((symbol) => {
			const task = createTask(symbol);
			tasks.push(task);
		});

		const scheduler = new Scheduler({
			tasks: tasks,
			maxLoad: MAX_LOAD
		});

		scheduler.execute();
	});
}

conn = new ib({
	clientId: CLIENT_ID,
	host: HOST,
	port: PORT
}).on("error", function (err, data) {
	const reqId = data['id'];
	const symbol = reqIdToSymbol[reqId];

	console.error("[%s][Monitor][Error] %s".red, new Date().toString(), err.message, symbol);

	delete dataHistoryMap[symbol];

	const callback = promiseCallbacksMap[symbol];

	delete promiseCallbacksMap[symbol];

	delete reqIdToSymbol[reqId];

	if (callback) {
		callback(true);
	}


}).on("connected", function() {
	console.log("[%s][Monitor][Connected]".green, new Date().toString());
	// timer = setTimeout(requestHistory, 3 * 1000);
	onConnected();
}).on("disconnected", function() {
	console.log("[%s][Monitor][Disconnected]".green, new Date().toString());
}).on('historicalData', function (reqId, date, open, high, low, close, volume, barCount, WAP, hasGaps) {
	const symbol = reqIdToSymbol[reqId];
	const history = dataHistoryMap[symbol];
	if (!isNaN(date)) {
		var bar = {
			date: new Date(parseInt(date) * 1000),
			open: open,
			high: high,
			low: low,
			close: close,
			volume: volume,
			barCount: barCount,
			WAP: WAP,
			hasGaps: hasGaps
		};

		history.push(bar);
	} else {
		if (date) {
			if (date.indexOf("finished") === 0) {
				console.log("[FINISHED for "+symbol+"] ".green + date);

				const filename = getFilename(symbol);

				// Write data to CSV file
				fs.writeFileSync(filename, CSV_HEADER, { flag: "w" });

				for (var i = 0; i < history.length; i++) {
					var entry = history[i];
					var line = util.format("%s,%s,%s,%s,%s,%s,%s,%s\n", entry.date, symbol, "TRADES", entry.open, entry.high, entry.low, entry.close, entry.volume);
					fs.writeFileSync(filename, line, { flag: "a" });
				}

				delete dataHistoryMap[symbol];

				const callback = promiseCallbacksMap[symbol];

				delete promiseCallbacksMap[symbol];

				delete reqIdToSymbol[reqId];

				callback(true);

			} else {
				console.log("[UNKNOWN DATE] ".red + date);
			}
		}
	}
});

conn.connect();


