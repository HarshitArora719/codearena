const STYLES = {
  AC: ['Accepted', 'bg-emerald-600'],
  WA: ['Wrong Answer', 'bg-red-600'],
  TLE: ['Time Limit Exceeded', 'bg-amber-600'],
  MLE: ['Memory Limit Exceeded', 'bg-amber-600'],
  OLE: ['Output Limit Exceeded', 'bg-amber-600'],
  RE: ['Runtime Error', 'bg-red-600'],
  CE: ['Compile Error', 'bg-purple-600'],
  SE: ['System Error', 'bg-slate-600'],
};

export default function Verdict({ sub }) {
  if (!sub) return null;
  let label, color;
  if (sub.status === 'QUEUED') [label, color] = ['Queued...', 'bg-slate-600'];
  else if (sub.status === 'RUNNING') [label, color] = ['Running...', 'bg-sky-600'];
  else [label, color] = STYLES[sub.verdict] ?? [sub.verdict ?? 'Done', 'bg-slate-600'];
  return (
    <span className={`rounded px-3 py-1 text-sm font-medium ${color}`}>
      {label}
      {sub.status === 'DONE' && sub.timeMs != null ? ` (${sub.timeMs} ms)` : ''}
    </span>
  );
}
