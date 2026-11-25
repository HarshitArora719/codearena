import { useEffect, useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import Editor from '@monaco-editor/react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import Verdict from '../Verdict.jsx';

const TEMPLATE = `#include <iostream>
using namespace std;

int main() {
    long long a, b;
    cin >> a >> b;
    cout << a + b << "\\n";
}
`;

export default function Problem() {
  const { slug } = useParams();
  const { user } = useAuth();
  const [problem, setProblem] = useState(null);
  const [source, setSource] = useState(TEMPLATE);
  const [sub, setSub] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const esRef = useRef(null);

  useEffect(() => {
    api(`/api/problems/${slug}`).then(setProblem).catch((e) => setError(e.message));
    return () => esRef.current?.close();
  }, [slug]);

  function watch(id) {
    esRef.current?.close();
    const es = new EventSource(`/api/submissions/${id}/events`);
    esRef.current = es;
    const finish = (ev) => { setSub(ev); setBusy(false); es.close(); }; // close, or the browser reconnects forever
    es.onmessage = (m) => {
      const ev = JSON.parse(m.data);
      if (ev.status === 'DONE') finish(ev);
      else setSub((prev) => ({ ...prev, ...ev }));
    };
    es.onerror = async () => { // fallback: ask the plain endpoint for the final state
      try {
        const cur = await api(`/api/submissions/${id}`);
        if (cur.status === 'DONE') finish({ ...cur, id });
      } catch { /* the browser will retry the stream */ }
    };
  }

  async function submit() {
    setError('');
    setSub(null);
    setBusy(true);
    try {
      const { id } = await api('/api/submissions', { method: 'POST', body: { problemSlug: slug, source } });
      setSub({ id, status: 'QUEUED' });
      watch(id);
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  }

  if (!problem) return <p className="p-6">{error || 'Loading...'}</p>;
  return (
    <div className="grid gap-4 p-4 lg:grid-cols-[2fr_3fr]">
      <section className="space-y-2 rounded-lg bg-slate-900 p-4">
        <h1 className="text-xl font-semibold">{problem.title}</h1>
        <p className="text-slate-300">{problem.statement}</p>
        <h2 className="pt-2 font-medium">Sample</h2>
        <pre className="rounded bg-slate-800 p-2 text-sm">{problem.sample?.input}</pre>
        <pre className="rounded bg-slate-800 p-2 text-sm">{problem.sample?.output}</pre>
        <p className="text-sm text-slate-400">
          Time limit {problem.timeLimitMs} ms, memory {problem.memoryMb} MB
        </p>
      </section>
      <section>
        <Editor height="55vh" language="cpp" theme="vs-dark" value={source}
          onChange={(v) => setSource(v ?? '')} options={{ fontSize: 14, minimap: { enabled: false } }} />
        <div className="mt-3 flex items-center gap-3">
          {user ? (
            <button onClick={submit} disabled={busy}
              className="rounded bg-emerald-600 px-4 py-2 font-medium hover:bg-emerald-500 disabled:opacity-50">
              Submit
            </button>
          ) : (
            <Link to="/login" className="rounded bg-slate-800 px-4 py-2 hover:bg-slate-700">Log in to submit</Link>
          )}
          <Verdict sub={sub} />
        </div>
        {error && <p className="mt-2 text-red-400">{error}</p>}
        {sub?.status === 'DONE' && sub.failedTest != null && (
          <p className="mt-2 text-sm text-slate-300">Failed on hidden test #{sub.failedTest + 1}</p>
        )}
        {sub?.detail && (
          <pre className="mt-2 max-h-48 overflow-auto rounded bg-slate-900 p-2 text-xs text-red-300">{sub.detail}</pre>
        )}
      </section>
    </div>
  );
}
