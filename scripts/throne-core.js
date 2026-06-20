"use strict";

const STARTING_CASH = 10000;
const SUCCESSION_MARGIN = 0.005;
const STRATEGY_START_DATE = "2026-03-31";
const MARKET_HOLIDAYS = new Set([
	"2026-01-01",
	"2026-01-19",
	"2026-02-16",
	"2026-04-03",
	"2026-05-25",
	"2026-06-19",
	"2026-07-03",
	"2026-09-07",
	"2026-11-26",
	"2026-12-25"
]);

function calendarMonthEnd(year, monthIndex) {
	const date = new Date(Date.UTC(year, monthIndex + 1, 0));
	return date.toISOString().slice(0, 10);
}

function completedMonthEnds(lastCheckDate, now) {
	const today = toDateString(now);
	const currentMonth = today.slice(0, 7);
	const lastMonth = lastCheckDate ? String(lastCheckDate).slice(0, 7) : null;
	const start = lastMonth ? parseMonth(lastMonth) : parseMonth(STRATEGY_START_DATE.slice(0, 7));
	const results = [];
	let year = start.year;
	let monthIndex = start.monthIndex + 1;

	while (true) {
		if (monthIndex > 11) {
			year += 1;
			monthIndex = 0;
		}
		const key = `${year}-${String(monthIndex + 1).padStart(2, "0")}`;
		if (key >= currentMonth) {
			break;
		}
		results.push(calendarMonthEnd(year, monthIndex));
		monthIndex += 1;
	}

	return results;
}

function effectiveMarketDate(priceMaps, scheduledMonthEnd) {
	const maps = Array.from(priceMaps.values());
	if (!maps.length) {
		return null;
	}
	const commonDates = Array.from(maps[0].keys())
		.filter((date) => date <= scheduledMonthEnd && maps.every((map) => map.has(date)))
		.sort();
	return commonDates.length ? commonDates[commonDates.length - 1] : null;
}

function estimateMarketCaps(candidates, priceMaps, effectiveDate) {
	return candidates
		.map((candidate) => {
			const currentPrice = positiveNumber(candidate.marketCapReferencePrice) || positiveNumber(candidate.price);
			const currentMarketCap = positiveNumber(candidate.marketCap);
			const historicalPrice = positiveNumber(priceMaps.get(candidate.symbol) && priceMaps.get(candidate.symbol).get(effectiveDate));
			if (!currentPrice || !currentMarketCap || !historicalPrice) {
				return null;
			}
			const impliedShares = currentMarketCap / currentPrice;
			return {
				symbol: candidate.symbol,
				name: candidate.name,
				issuerId: candidate.issuerId,
				price: roundMoney(historicalPrice),
				impliedShares: Math.round(impliedShares),
				estimatedMarketCap: Math.round(impliedShares * historicalPrice),
				referenceMarketCap: Math.round(currentMarketCap),
				referencePrice: roundMoney(currentPrice),
				marketCapSource: candidate.marketCapSource || null
			};
		})
		.filter(Boolean)
		.sort((a, b) => b.estimatedMarketCap - a.estimatedMarketCap)
		.map((candidate, index) => ({ ...candidate, rank: index + 1 }));
}

function evaluateSuccession(holderSymbol, estimates, margin = SUCCESSION_MARGIN) {
	if (!estimates.length) {
		throw new Error("Cannot evaluate succession without market-cap estimates.");
	}
	const leader = estimates[0];
	if (!holderSymbol || holderSymbol === "CASH") {
		return {
			action: "assignment",
			leader,
			holder: null,
			thresholdMarketCap: null,
			rotates: true
		};
	}
	const holder = estimates.find((candidate) => candidate.symbol === holderSymbol);
	if (!holder) {
		throw new Error(`Missing market-cap estimate for current holder ${holderSymbol}.`);
	}
	const thresholdMarketCap = Math.round(holder.estimatedMarketCap * (1 + margin));
	const rotates = leader.symbol !== holderSymbol && leader.estimatedMarketCap >= thresholdMarketCap;
	return {
		action: rotates ? "rotated" : "retained",
		leader,
		holder,
		thresholdMarketCap,
		rotates
	};
}

function rotatePortfolio(portfolioValue, newPrice) {
	const value = positiveNumber(portfolioValue);
	const price = positiveNumber(newPrice);
	if (!value || !price) {
		throw new Error("Portfolio value and new price must be positive.");
	}
	return {
		portfolioValue: roundMoney(value),
		shares: roundShares(value / price)
	};
}

function simulatePortfolioHistory({
	dates,
	priceMaps,
	startDate,
	initialCash = STARTING_CASH,
	initialSymbol,
	rotations = [],
	benchmarkSymbols = ["SPY", "QQQ"]
}) {
	const rotationByDate = new Map(rotations.map((rotation) => [rotation.date, rotation]));
	const strategyStartPrice = requirePrice(priceMaps, initialSymbol, startDate);
	const benchmarkStartPrices = Object.fromEntries(
		benchmarkSymbols.map((symbol) => [symbol, requirePrice(priceMaps, symbol, startDate)])
	);
	let holder = initialSymbol;
	let shares = initialCash / strategyStartPrice;
	const snapshots = [];

	dates.filter((date) => date >= startDate).sort().forEach((date) => {
		const rotation = rotationByDate.get(date);
		if (rotation && rotation.to !== holder) {
			const oldPrice = requirePrice(priceMaps, holder, date);
			const newPrice = requirePrice(priceMaps, rotation.to, date);
			const value = shares * oldPrice;
			shares = value / newPrice;
			holder = rotation.to;
		}

		const strategyPrice = requirePrice(priceMaps, holder, date);
		const strategyValue = roundMoney(shares * strategyPrice);
		const spyPrice = requirePrice(priceMaps, benchmarkSymbols[0], date);
		const qqqPrice = requirePrice(priceMaps, benchmarkSymbols[1], date);
		const spyValue = roundMoney(initialCash * spyPrice / benchmarkStartPrices[benchmarkSymbols[0]]);
		const qqqValue = roundMoney(initialCash * qqqPrice / benchmarkStartPrices[benchmarkSymbols[1]]);
		snapshots.push({
			date,
			marketDate: date,
			isCarriedForward: false,
			strategySymbol: holder,
			strategyValue,
			spyValue,
			qqqValue,
			excessVsSpy: roundMoney(strategyValue - spyValue),
			excessVsQqq: roundMoney(strategyValue - qqqValue),
			strategyPrice: roundMoney(strategyPrice),
			spyPrice: roundMoney(spyPrice),
			qqqPrice: roundMoney(qqqPrice)
		});
	});

	return {
		snapshots,
		currentSymbol: holder,
		shares: roundShares(shares),
		portfolioValue: snapshots.length ? snapshots[snapshots.length - 1].strategyValue : initialCash
	};
}

function expandSnapshotsToCalendar(marketSnapshots, startDate, endDate) {
	const sortedMarketSnapshots = marketSnapshots
		.slice()
		.sort((a, b) => a.date.localeCompare(b.date));
	const byMarketDate = new Map(sortedMarketSnapshots.map((snapshot) => [snapshot.date, snapshot]));
	const latestMarketDate = sortedMarketSnapshots.length
		? sortedMarketSnapshots[sortedMarketSnapshots.length - 1].date
		: null;
	let latestMarketSnapshot = null;

	return calendarDatesBetween(startDate, endDate).map((date) => {
		const sameDaySnapshot = byMarketDate.get(date);
		if (sameDaySnapshot) {
			latestMarketSnapshot = sameDaySnapshot;
			return {
				...sameDaySnapshot,
				date,
				marketDate: sameDaySnapshot.marketDate || date,
				isCarriedForward: false,
				carryForwardReason: null
			};
		}

		if (!latestMarketSnapshot) {
			return null;
		}

		const marketDate = latestMarketSnapshot.marketDate || latestMarketSnapshot.date;
		return {
			...latestMarketSnapshot,
			date,
			marketDate,
			isCarriedForward: true,
			carryForwardReason: carryForwardReasonForDate(date, latestMarketDate)
		};
	}).filter(Boolean);
}

function calendarDatesBetween(startDate, endDate) {
	const dates = [];
	const cursor = dateFromString(startDate);
	const end = dateFromString(endDate);
	while (cursor <= end) {
		dates.push(toDateString(cursor));
		cursor.setUTCDate(cursor.getUTCDate() + 1);
	}
	return dates;
}

function carryForwardReasonForDate(date, latestMarketDate) {
	if (isWeekend(date) || MARKET_HOLIDAYS.has(date) || (latestMarketDate && date < latestMarketDate)) {
		return "market-closed";
	}
	return "provider-delay";
}

function isWeekend(value) {
	const day = dateFromString(value).getUTCDay();
	return day === 0 || day === 6;
}

function requirePrice(priceMaps, symbol, date) {
	const price = positiveNumber(priceMaps.get(symbol) && priceMaps.get(symbol).get(date));
	if (!price) {
		throw new Error(`Missing ${symbol} price for ${date}.`);
	}
	return price;
}

function parseMonth(value) {
	const [year, month] = value.split("-").map(Number);
	return { year, monthIndex: month - 1 };
}

function positiveNumber(value) {
	const number = Number(value);
	return Number.isFinite(number) && number > 0 ? number : null;
}

function toDateString(date) {
	return date.toISOString().slice(0, 10);
}

function dateFromString(value) {
	const [year, month, day] = value.split("-").map(Number);
	return new Date(Date.UTC(year, month - 1, day));
}

function roundMoney(value) {
	return Number(Number(value).toFixed(2));
}

function roundShares(value) {
	return Number(Number(value).toFixed(6));
}

module.exports = {
	STARTING_CASH,
	STRATEGY_START_DATE,
	SUCCESSION_MARGIN,
	calendarMonthEnd,
	calendarDatesBetween,
	carryForwardReasonForDate,
	completedMonthEnds,
	effectiveMarketDate,
	estimateMarketCaps,
	expandSnapshotsToCalendar,
	evaluateSuccession,
	rotatePortfolio,
	simulatePortfolioHistory
};
