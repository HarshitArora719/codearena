import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth.jsx';

export default function Login() {
  const { login, register } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    setError('');
    setBusy(true);
    try {
      if (mode === 'login') await login(email, password);
      else await register(email, name, password);
      navigate('/');
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  const input = 'w-full rounded bg-slate-800 p-2 outline-none focus:ring-2 focus:ring-emerald-500';
  return (
    <div className="mx-auto mt-10 max-w-sm space-y-3 rounded-lg bg-slate-900 p-6">
      <h1 className="text-xl font-semibold">{mode === 'login' ? 'Log in' : 'Create account'}</h1>
      <input className={input} placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
      {mode === 'register' && (
        <input className={input} placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
      )}
      <input className={input} type="password" placeholder="Password (min 8)" value={password}
        onChange={(e) => setPassword(e.target.value)} />
      {error && <p className="text-sm text-red-400">{error}</p>}
      <button onClick={submit} disabled={busy}
        className="w-full rounded bg-emerald-600 py-2 font-medium hover:bg-emerald-500 disabled:opacity-50">
        {mode === 'login' ? 'Log in' : 'Sign up'}
      </button>
      <button onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }}
        className="w-full text-sm text-slate-400 hover:text-white">
        {mode === 'login' ? 'No account? Sign up' : 'Have an account? Log in'}
      </button>
    </div>
  );
}
