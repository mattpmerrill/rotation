# Rule changes

Every change to `config/rules.yaml` or `config/universe.yaml` gets a line here and a
`version` bump. Engine outputs record the config hash, so any old result can be traced
to the rules that produced it.

| Date | Version | Change | Why | Who |
|---|---|---|---|---|
| 2026-09-23 | 1 | Initial encoding of the program doc. Profit ladder in USD. Regime order Euphoria > Defend > Expand > Accumulate. Leverage bucket = collateral, Euphoria leverage 0%, leverage disabled until backtested. Beck defaults for undefined terms (marked `# DEFAULT`). | Program doc + Matt's answers | Matt / Beck |
| 2026-09-23 | 1 | universe.yaml: exclusions by exact CoinGecko category name (stables, wrapped/bridged, cTokens/aTokens, LST/LRT receipts, tokenized TradFi assets). Force-include ETHLend and Olympus. Peg detector for uncategorised stables. Ranking eligibility: 20 of 30 days with volume and 30D median volume/market cap >= 0.01%. | Keyword matching wrongly excluded AAVE, MKR, LDO, ENA, WLFI and let cTokens/SolvBTC through; CoinGecko has impossible caps on dead markets (e.g. $2.9e21 on $563 volume) | Beck (Matt to confirm) |
