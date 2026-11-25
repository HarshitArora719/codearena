import { Routes, Route, Link, Navigate } from 'react-router-dom';
import { useAuth } from './auth.jsx';
import Home from './pages/Home.jsx';
import Login from './pages/Login.jsx';
import Problem from './pages/Problem.jsx';
import Submissions from './pages/Submissions.jsx';

function Nav() {
  const { user, logout } = useAuth();
  return (
    <nav className="flex items-center gap-4 border-b border-slate-800 px-4 py-3">
      <Link to="/" className="text-lg font-bold text-emerald-400">CodeArena</Link>
      <Link to="/" className="text-slate-300 hover:text-white">Problems</Link>
      {user && <Link to="/submissions" className="text-slate-300 hover:text-white">My submissions</Link>}
      <span className="ml-auto text-sm text-slate-400">{user?.name}</span>
      {user ? (
        <button onClick={logout} className="rounded bg-slate-800 px-3 py-1 text-sm hover:bg-slate-700">Log out</button>
      ) : (
        <Link to="/login" className="rounded bg-emerald-600 px-3 py-1 text-sm hover:bg-emerald-500">Log in</Link>
      )}
    </nav>
  );
}

function Private({ children }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  return user ? children : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <>
      <Nav />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route path="/problems/:slug" element={<Problem />} />
        <Route path="/submissions" element={<Private><Submissions /></Private>} />
      </Routes>
    </>
  );
}
