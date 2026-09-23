# Rule changes

Every change to `config/rules.yaml` or `config/universe.yaml` gets a line here and a
`version` bump. Engine outputs record the config hash, so any old result can be traced
to the rules that produced it.

| Date | Version | Change | Why | Who |
|---|---|---|---|---|
| 2026-09-23 | 1 | Initial encoding of the program doc. Profit ladder in USD. Regime order Euphoria > Defend > Expand > Accumulate. Leverage bucket = collateral, Euphoria leverage 0%, leverage disabled until backtested. Beck defaults for undefined terms (marked `# DEFAULT`). | Program doc + Matt's answers | Matt / Beck |
