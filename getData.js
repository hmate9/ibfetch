"use strict";

require("colors");
var util = require("util");
var path = require("path");
var fs = require("fs");
var ib = require("ib");
var moment = require("moment");

var endDate = moment();
// endDate.subtract(1, "months");

var CSV_HEADER = "date,symbol,what,open,high,low,close,volume\n";

const what = "TRADES";

const symbols = ["AAPL", "MSFT", "RH", "ODP"];

var requestId = 1;

var history = [];
var currentSymbol = "";
var ticker = null;

var symbolI = 0;

const totalToGet = 12;
var totalMadeSoFar = 0;

var conn;

const getData = function (i, subtract) {
	const symbol = symbols[i];
	currentSymbol = symbol;
	console.log("Getting data for"m currentSymbol.yellow);
	ticker = ib.contract.stock(currentSymbol, "ISLAND", "USD");
	history = [];
	if (subtract == 0) {
		endDate = moment();
		fs.writeFileSync(util.format("%s.csv", currentSymbol), CSV_HEADER, { flag: "w" });
	}
	endDate.subtract(1, "months");
	conn.reqHistoricalData(requestId++, ticker, endDate.format("YYYYMMDD HH:mm:ss"), "1 M", "30 mins", what, 0, 2, false);
}

const onConnected = function () {
	getData(symbolI);
}

conn = new ib({
	clientId: 69,
	host: "127.0.0.1",
	port: 7496
}).on("error", function (err, data) {
	console.error("[%s][Monitor][Error] %s".red, new Date().toString(), err.message);
}).on("connected", function() {
	console.log("[%s][Monitor][Connected]".green, new Date().toString());
	// timer = setTimeout(requestHistory, 3 * 1000);
	onConnected();
}).on("disconnected", function() {
	console.log("[%s][Monitor][Disconnected]".green, new Date().toString());
}).on('historicalData', function (reqId, date, open, high, low, close, volume, barCount, WAP, hasGaps) {
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
				console.log("[PROGRESS: FINISHED] ".green + date);

				// Write data to CSV file
				history = history.reverse();
				for (var i = 0; i < history.length; i++) {
					var entry = history[i];
					var line = util.format("%s,%s,%s,%s,%s,%s,%s,%s\n", entry.date, ticker.symbol, what, entry.open, entry.high, entry.low, entry.close, entry.volume);
					fs.writeFileSync(util.format("%s.csv", currentSymbol), line, { flag: "a" });
				}
				history = [];

				totalMadeSoFar++;

				if (totalMadeSoFar >= totalToGet) {
					totalMadeSoFar = 0;
					// Next round
					getData(++symbolI, totalMadeSoFar);
				} else {
					getData(symbolI, totalMadeSoFar);
				}

			} else {
				console.log("[UNKNOWN DATE] ".red + date);
			}
		}
	}
});

conn.connect();