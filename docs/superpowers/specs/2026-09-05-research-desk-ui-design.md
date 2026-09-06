# Open Breakout research desk UI design

## Goal

Make the local scanner fast to use for three real jobs: identify eligible breakout candidates, compare the liquid universe, and validate the rules with a deliberate backtest.

## Research basis

The redesign keeps the screener as a table because tables support finding and comparing multivariate records when identifiers, filters, and related fields are kept close together. It also makes filters explicit, keeps the table header and instrument identity in view, and treats the stock page as the focused single-record view. These choices follow the data-table and complex-application guidance gathered on 5 September 2026.

## Information architecture

The app has four routes and one compact, responsive navigation shell.

1. **Today** (`/`) is the daily briefing. It shows data freshness, a plain-language market regime, a short list of eligible breakout candidates, and links to the full screener. It does not repeat the full universe as a long table.
2. **Screener** (`/screener`) is the comparison workspace. It offers symbol search, clear quick filters (all liquid, leaders, breakouts), a visible result count, sortable numeric columns, and a single primary row action: inspect the stock.
3. **Stock detail** (`/stock/:isin`) is the decision context for one stock. It supplies a back link, prominent symbol/name/market status, a compact price-and-moving-average chart, qualification checks, and recent-session data. It remains a read-only research view.
4. **Backtest** (`/backtest`) is the validation workspace. It explains the rule set, keeps settings grouped and labelled, runs only when the user selects “Run backtest”, preserves an existing result while a replacement is running, and makes the output and CSV export easy to interpret.

## Visual direction

Use a calm, high-contrast “research terminal” rather than a marketing dashboard: warm off-white in light mode, deep blue-black in dark mode, a single muted teal signal colour, compact tabular type for prices and percentages, and restrained borders. Green and red are reserved for market meaning, never decoration. Cards are used only for distinct summaries; the screener is a full-width table surface.

## Shared shell

The shell has a thin top bar: product name, the current route, data-status text, and a theme control. Desktop navigation sits in the same bar. On narrow screens, it becomes a horizontally scrollable navigation strip so no route disappears. A skip link and visible keyboard focus make all routes usable without a mouse.

## Data and interaction rules

- Continue using the existing `/api/health`, `/api/universe`, `/api/stock`, and `/api/backtest` endpoints. No hosting, authentication, data-source, or trading action is introduced.
- Today and Screener use the same liquid-plus-breakout eligibility condition. The displayed candidate count must agree with `health.breaking_out`.
- Search and quick filters are client-side against the loaded snapshot. The row count and empty-state message must reflect the active filters.
- The first screen shows the latest snapshot date. A missing or failed snapshot gives a helpful recovery message rather than an opaque fetch error.
- The backtest does not start on page load. A running state says that the local full-universe calculation can take a few minutes and keeps previous results visible.

## Responsive and accessible behaviour

- Desktop tables retain a sticky header and first column, with horizontal scroll available for secondary data.
- Narrow screens use a condensed, vertically scannable result card for each screener row; it still includes symbol, close, RS, volume ratio, and the qualifying flags.
- Numeric fields use tabular figures, data values remain right-aligned, controls have associated labels, and all actions are native buttons or links.
- Colour is never the only signal. Trend, leader, and breakout status have text labels or icons with accessible names.
- Motion is limited to short opacity/transform transitions and disabled for reduced-motion users.

## Acceptance criteria

1. A user can identify the as-of date, number of eligible breakouts, and why a candidate qualifies from Today without opening a second page.
2. A user can find a stock by symbol, filter for breakouts, see the active result count, sort by key figures, and open its research page.
3. A user can return from stock detail, inspect charted price context and rule flags, and read recent prices on desktop or mobile.
4. Opening Backtest does not call the full backtest endpoint. The user can review settings, run it, read progress and results, and export the trade log.
5. Keyboard navigation, focus visibility, small-screen navigation, loading, empty, and error states are present.
6. Existing API contracts and backend tests remain unchanged except for UI-supporting tests; the frontend production build succeeds.

## Out of scope

No broker integration, watchlist persistence, user accounts, real-time market feed, automated trade execution, server deployment, or Vercel configuration is added.
