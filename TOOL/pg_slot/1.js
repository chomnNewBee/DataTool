CoinManager.ComputeCoinValues = function(minBet, maxBet) {
    var totalMinMode = false;
    if (maxBet < minBet) {
        var aux = minBet;
        minBet = maxBet;
        maxBet = aux;
        totalMinMode = true
    }
    var curve = [.05, .1, .2, .4];
    var levels = XT.GetInt(Vars.NumberOfBetLevels);
    if (totalMinMode)
        levels = 10;
    while (minBet * levels < maxBet / levels * curve[0])
        curve.unshift(curve[0] * .2);
    if (maxBet / minBet < levels) {
        levels = maxBet * 1E3 / (minBet * 1E3) | 0;
        if (!totalMinMode)
            XT.SetInt(Vars.NumberOfBetLevels, levels)
    }
    var maxCoinValue = maxBet * 1E3 / levels / 1E3;
    if (!totalMinMode && checkIsRequired("ABL")) {
        while (Math.floor((maxCoinValue + 1E-4) * 100) / 100 * levels < maxBet) {
            levels--;
            maxCoinValue = maxBet * 1E3 / levels / 1E3
        }
        XT.SetInt(Vars.NumberOfBetLevels, levels)
    }
    if (checkIsRequired("RMCV"))
        maxCoinValue = CoinManager.GetNiceCoinValue(maxCoinValue);
    if (!totalMinMode) {
        maxCoinValue = Math.floor((maxCoinValue + 1E-4) * 100) / 100;
        if (maxCoinValue == 0)
            return []
    }
    if (maxCoinValue * levels > maxBet)
        maxCoinValue = (maxCoinValue * 100 | 0) / 100;
    var x = maxCoinValue - minBet;
    var coinValues = [];
    coinValues.push(minBet);
    for (var j = 0; j < curve.length; j++) {
        var computedVal = CoinManager.GetNiceCoinValue(minBet + x * curve[j]);
        if (computedVal > minBet && computedVal < maxCoinValue)
            coinValues.push(computedVal)
    }
    if (maxCoinValue > 0)
        coinValues.push(maxCoinValue);
    for (var i = 1; i < coinValues.length; i++)
        if (Math.abs(coinValues[i] - coinValues[i - 1]) < .001) {
            coinValues.splice(i, 1);
            i--
        }
    return coinValues
}