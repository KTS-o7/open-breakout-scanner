import { HashRouter, Routes, Route, NavLink } from "react-router-dom"
import Dashboard from "@/pages/Dashboard"
import Screener from "@/pages/Screener"
import StockDetail from "@/pages/StockDetail"
import Backtest from "@/pages/Backtest"

function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex">
      <aside className="w-56 border-r bg-muted/30 p-4 hidden md:block">
        <div className="font-bold text-lg mb-6">Open Breakout</div>
        <nav className="space-y-2">
          <NavLink
            to="/"
            className={({ isActive }) =>
              `block px-3 py-2 rounded-md text-sm font-medium ${isActive ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`
            }
          >
            Dashboard
          </NavLink>
          <NavLink
            to="/screener"
            className={({ isActive }) =>
              `block px-3 py-2 rounded-md text-sm font-medium ${isActive ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`
            }
          >
            Screener
          </NavLink>
          <NavLink
            to="/backtest"
            className={({ isActive }) =>
              `block px-3 py-2 rounded-md text-sm font-medium ${isActive ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`
            }
          >
            Backtest
          </NavLink>
        </nav>
      </aside>
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  )
}

function App() {
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

export default App
