import { useEffect, useState } from 'react';
import { api } from '../api.js';
import Verdict from '../Verdict.jsx';

export default function Submissions() {
  const [rows, setRows] = useState([]);
  useEffect(() => { api('/api/submissions').then(setRows).catch(() => {}); }, []);
  return (
    <div className="mx-auto max-w-3xl p-6">
      <h1 className="mb-4 text-2xl font-semibold">My submissions</h1>
      <table className="w-full text-left text-sm">
        <thead className="text-slate-400">
          <tr><th className="p-2">When</th><th className="p-2">Result</th><th className="p-2">Failed test</th></tr>
        </thead>
        <tbody>
          {rows.map((s) => (
            <tr key={s._id} className="border-t border-slate-800">
              <td className="p-2">{new Date(s.createdAt).toLocaleString()}</td>
              <td className="p-2"><Verdict sub={s} /></td>
              <td className="p-2">{s.failedTest != null ? `#${s.failedTest + 1}` : '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
