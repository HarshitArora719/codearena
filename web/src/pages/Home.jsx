import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';

export default function Home() {
  const [problems, setProblems] = useState([]);
  useEffect(() => { api('/api/problems').then(setProblems).catch(() => {}); }, []);
  return (
    <div className="mx-auto max-w-2xl p-6">
      <h1 className="mb-4 text-2xl font-semibold">Problems</h1>
      <ul className="space-y-2">
        {problems.map((p) => (
          <li key={p.slug}>
            <Link to={`/problems/${p.slug}`} className="block rounded bg-slate-900 p-3 hover:bg-slate-800">
              {p.title}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
