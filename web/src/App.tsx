import { BrowserRouter, Routes, Route, Link, useLocation } from 'react-router-dom'
import Gallery from './components/Gallery'
import DetailPage from './components/DetailPage'

function NavBar() {
  const location = useLocation()
  const isDetail = location.pathname.startsWith('/companies/')

  return (
    <nav className="sticky top-0 z-50 bg-gray-900/90 backdrop-blur border-b border-gray-800">
      <div className="max-w-screen-2xl mx-auto px-4 h-14 flex items-center gap-4">
        <Link to="/" className="text-xl font-bold tracking-tight text-white hover:text-emerald-400 transition-colors">
          Newtoad
        </Link>
        {isDetail && (
          <Link
            to="/"
            className="ml-2 text-sm text-gray-400 hover:text-white transition-colors flex items-center gap-1"
          >
            <span>&#8592;</span>
            <span>Back to Gallery</span>
          </Link>
        )}
      </div>
    </nav>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <NavBar />
      <main className="max-w-screen-2xl mx-auto px-4 py-6">
        <Routes>
          <Route path="/" element={<Gallery />} />
          <Route path="/companies/:id" element={<DetailPage />} />
        </Routes>
      </main>
    </BrowserRouter>
  )
}
