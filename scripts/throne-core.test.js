"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
	calendarMonthEnd,
	calendarDatesBetween,
	completedMonthEnds,
	effectiveMarketDate,
	estimateMarketCaps,
	expandSnapshotsToCalendar,
	evaluateSuccession,
	rotatePortfolio,
	simulatePortfolioHistory
} = require("./throne-core");
const {
	CANDIDATES,
	resolveCandidateMarketData,
	validateCandidateUniverse
} = require("./update-throne");

test("candidate universe contains one canonical ticker per issuer", () => {
	assert.doesNotThrow(() => validateCandidateUniverse(CANDIDATES));
	assert.equal(CANDIDATES.some((candidate) => candidate.symbol === "GOOGL"), true);
	assert.equal(CANDIDATES.some((candidate) => candidate.symbol === "GOOG"), false);
	assert.equal(new Set(CANDIDATES.map((candidate) => candidate.issuerId)).size, CANDIDATES.length);
});

test("fresh company profile replaces a missing batch market cap", () => {
	const candidate = CANDIDATES.find((item) => item.symbol === "LLY");
	const result = resolveCandidateMarketData({
		candidate,
		priceRecord: { date: "2026-06-18", price: 1103.6 },
		capRecord: null,
		profileRecord: {
			symbol: "LLY",
			cik: candidate.issuerId,
			price: 1099.69,
			marketCap: 1035623819509
		},
		existingPrice: 1090,
		fetchedDate: "2026-06-18"
	});
	assert.equal(result.marketCap, 1035623819509);
	assert.equal(result.marketCapSource, "company-profile");
	assert.equal(result.marketCapReferencePrice, 1099.69);
	assert.equal(result.marketCapIsFresh, true);
});

test("month-end dates include weekends and due checks wait for a completed month", () => {
	assert.equal(calendarMonthEnd(2026, 4), "2026-05-31");
	assert.deepEqual(completedMonthEnds("2026-03-31", new Date("2026-06-18T12:00:00Z")), [
		"2026-04-30",
		"2026-05-31"
	]);
	assert.deepEqual(completedMonthEnds("2026-05-29", new Date("2026-06-18T12:00:00Z")), []);
	assert.deepEqual(completedMonthEnds("2026-05-29", new Date("2026-07-01T12:00:00Z")), ["2026-06-30"]);
});

test("calendar expansion fills Juneteenth and weekend dates from the prior market close", () => {
	const expanded = expandSnapshotsToCalendar([
		marketSnapshot("2026-06-18", 12047.02)
	], "2026-06-18", "2026-06-20");

	assert.deepEqual(expanded.map((snapshot) => snapshot.date), [
		"2026-06-18",
		"2026-06-19",
		"2026-06-20"
	]);
	assert.equal(expanded[0].isCarriedForward, false);
	assert.equal(expanded[1].marketDate, "2026-06-18");
	assert.equal(expanded[1].isCarriedForward, true);
	assert.equal(expanded[1].carryForwardReason, "market-closed");
	assert.equal(expanded[2].marketDate, "2026-06-18");
	assert.equal(expanded[2].strategyValue, 12047.02);
});

test("calendar expansion uses same-day market data when it is available", () => {
	const expanded = expandSnapshotsToCalendar([
		marketSnapshot("2026-06-18", 12047.02),
		marketSnapshot("2026-06-22", 12100)
	], "2026-06-18", "2026-06-22");

	const latest = expanded[expanded.length - 1];
	assert.equal(latest.date, "2026-06-22");
	assert.equal(latest.marketDate, "2026-06-22");
	assert.equal(latest.isCarriedForward, false);
	assert.equal(latest.strategyValue, 12100);
});

test("calendar expansion repairs provider delay when a delayed market close appears", () => {
	const delayed = expandSnapshotsToCalendar([
		marketSnapshot("2026-06-22", 12100)
	], "2026-06-22", "2026-06-23");
	assert.equal(delayed[1].date, "2026-06-23");
	assert.equal(delayed[1].marketDate, "2026-06-22");
	assert.equal(delayed[1].carryForwardReason, "provider-delay");

	const repaired = expandSnapshotsToCalendar([
		marketSnapshot("2026-06-22", 12100),
		marketSnapshot("2026-06-23", 12250)
	], "2026-06-22", "2026-06-23");
	assert.equal(repaired[1].date, "2026-06-23");
	assert.equal(repaired[1].marketDate, "2026-06-23");
	assert.equal(repaired[1].isCarriedForward, false);
	assert.equal(repaired[1].strategyValue, 12250);
});

test("effective market date falls back from a weekend to the last common trading date", () => {
	const prices = new Map([
		["NVDA", new Map([["2026-05-29", 211.14]])],
		["AAPL", new Map([["2026-05-29", 312.06]])],
		["SPY", new Map([["2026-05-29", 756.48]])]
	]);
	assert.equal(effectiveMarketDate(prices, "2026-05-31"), "2026-05-29");
});

test("succession requires a challenger to clear the 0.5 percent threshold", () => {
	const estimates = [
		{ symbol: "AAPL", estimatedMarketCap: 1006000000 },
		{ symbol: "NVDA", estimatedMarketCap: 1000000000 }
	];
	assert.equal(evaluateSuccession("NVDA", estimates).action, "rotated");

	const closeEstimates = [
		{ symbol: "AAPL", estimatedMarketCap: 1004000000 },
		{ symbol: "NVDA", estimatedMarketCap: 1000000000 }
	];
	assert.equal(evaluateSuccession("NVDA", closeEstimates).action, "retained");
});

test("portfolio value remains continuous through a rotation", () => {
	const rotated = rotatePortfolio(12500, 250);
	assert.equal(rotated.shares, 50);
	assert.equal(rotated.portfolioValue, 12500);

	const priceMaps = new Map([
		["NVDA", new Map([["2026-03-31", 100], ["2026-04-30", 125]])],
		["AAPL", new Map([["2026-03-31", 200], ["2026-04-30", 250]])],
		["SPY", new Map([["2026-03-31", 500], ["2026-04-30", 550]])],
		["QQQ", new Map([["2026-03-31", 400], ["2026-04-30", 440]])]
	]);
	const result = simulatePortfolioHistory({
		dates: ["2026-03-31", "2026-04-30"],
		priceMaps,
		startDate: "2026-03-31",
		initialSymbol: "NVDA",
		rotations: [{ date: "2026-04-30", to: "AAPL" }]
	});
	assert.equal(result.snapshots[1].strategyValue, 12500);
	assert.equal(result.shares, 50);
});

test("calendar daily snapshots preserve portfolio continuity through a rotation", () => {
	const priceMaps = new Map([
		["NVDA", new Map([["2026-04-30", 125], ["2026-05-04", 130]])],
		["AAPL", new Map([["2026-04-30", 250], ["2026-05-04", 260]])],
		["SPY", new Map([["2026-04-30", 550], ["2026-05-04", 555]])],
		["QQQ", new Map([["2026-04-30", 440], ["2026-05-04", 450]])]
	]);
	const result = simulatePortfolioHistory({
		dates: ["2026-04-30", "2026-05-04"],
		priceMaps,
		startDate: "2026-04-30",
		initialCash: 12500,
		initialSymbol: "NVDA",
		rotations: [{ date: "2026-05-04", to: "AAPL" }]
	});
	const expanded = expandSnapshotsToCalendar(result.snapshots, "2026-04-30", "2026-05-04");

	assert.deepEqual(expanded.map((snapshot) => snapshot.date), calendarDatesBetween("2026-04-30", "2026-05-04"));
	assert.equal(expanded.find((snapshot) => snapshot.date === "2026-05-02").strategySymbol, "NVDA");
	assert.equal(expanded.find((snapshot) => snapshot.date === "2026-05-02").isCarriedForward, true);
	assert.equal(expanded.find((snapshot) => snapshot.date === "2026-05-04").strategySymbol, "AAPL");
	assert.equal(expanded.find((snapshot) => snapshot.date === "2026-05-04").strategyValue, 13000);
	assert.equal(result.shares, 50);
});

test("historical reconstruction selects NVDA at each seeded month-end", () => {
	const candidates = [
		{ symbol: "NVDA", name: "NVIDIA", marketCap: 5043054572617, price: 208.24 },
		{ symbol: "AAPL", name: "Apple", marketCap: 4416487949200, price: 300.63 },
		{ symbol: "GOOGL", name: "Alphabet", marketCap: 4441780581696, price: 369.10999 }
	];
	const priceMaps = new Map([
		["NVDA", new Map([
			["2026-03-31", 174.4],
			["2026-04-30", 199.57],
			["2026-05-29", 211.14]
		])],
		["AAPL", new Map([
			["2026-03-31", 253.79],
			["2026-04-30", 271.35],
			["2026-05-29", 312.06]
		])],
		["GOOGL", new Map([
			["2026-03-31", 287.56],
			["2026-04-30", 384.8],
			["2026-05-29", 380.34]
		])]
	]);

	for (const date of ["2026-03-31", "2026-04-30", "2026-05-29"]) {
		const estimates = estimateMarketCaps(candidates, priceMaps, date);
		assert.equal(estimates[0].symbol, "NVDA");
	}
});

function marketSnapshot(date, value) {
	return {
		date,
		marketDate: date,
		isCarriedForward: false,
		strategySymbol: "NVDA",
		strategyValue: value,
		spyValue: 11000,
		qqqValue: 12000,
		excessVsSpy: Number((value - 11000).toFixed(2)),
		excessVsQqq: Number((value - 12000).toFixed(2)),
		strategyPrice: 210,
		spyPrice: 740,
		qqqPrice: 730
	};
}
