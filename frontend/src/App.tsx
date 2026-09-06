import { useEffect, useState } from "react"
import { HashRouter, NavLink, Route, Routes } from "react-router-dom"

import Backtest from "@/pages/Backtest"
import Dashboard from "@/pages/Dashboard"
import Screener from "@/pages/Screener"
import StockDetail from "@/pages/StockDetail"

const navigation = [
  { to: "/", label: "Today", end: true },
  { to: "/screener", label: "Screener" },
  { to: "/backtest", label: "Backtest" },
]

function Layout({ children }: { children: React.ReactNode }) {
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem("theme") === "dark")

  useEffect(() => {
    document.documentElement.classList.toggle("dark", darkMode)
    localStorage.setItem("theme", darkMode ? "dark" : "light")
  }, [darkMode])

  return (
    <div className="min-h-screen">
      <a className="skip-link" href="#main-content">Skip to content</a>
      <header className="sticky top-0 z-20 border-b border-border/80 bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-[1440px] items-center gap-2 px-3 sm:h-16 sm:gap-4 sm:px-6">
          <NavLink aria-label="Open Breakout" to="/" end className="shrink-0 text-sm font-semibold tracking-[-0.02em] text-foreground">
            <span className="sm:hidden" aria-hidden="true">OB</span>
            <span className="hidden sm:inline">Open Breakout</span>
          </NavLink>
          <span className="hidden h-4 w-px bg-border sm:block" aria-hidden="true" />
          <nav className="flex min-w-0 flex-1 items-center gap-0.5" aria-label="Primary">
            {navigation.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  [
                    "whitespace-nowrap rounded-md px-2 py-2 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:px-3 sm:text-sm",
                    isActive ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  ].join(" ")
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
          <span className="hidden text-xs text-muted-foreground md:inline">Local research</span>
          <button
            type="button"
            onClick={() => setDarkMode((value) => !value)}
            className="grid size-9 shrink-0 place-items-center rounded-md border border-border text-sm transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            aria-label={darkMode ? "Use light theme" : "Use dark theme"}
            title={darkMode ? "Use light theme" : "Use dark theme"}
          >
            <span aria-hidden="true">{darkMode ? "☀" : "◐"}</span>
          </button>
        </div>
      </header>
      <main id="main-content" className="mx-auto w-full max-w-[1440px] px-4 py-7 sm:px-6 sm:py-10">
        {children}
      </main>
    </div>
  )
}

export default function App() {
  return (
    <HashRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/screener" element={<Screener />} />
          <Route path="/backtest" element={<Backtest />} />
          <Route path="/stock/:isin" element={<StockDetail />} />
        </Routes>
      </Layout>
    </HashRouter>
  )
}
