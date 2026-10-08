// RADIX Command Center v1 — read-only snapshot of the existing shared workspace.
// No artificial agents/runs, no new tables and no public exposure of private state.
const { sql } = require('./_db');
const { getSessionUser } = require('./_auth');

const object = v => v && typeof v === 'object' && !Array.isArray(v) ? v : {};
const list = v => Array.isArray(v) ? v : [];
const safeDate = v => {
  const d = new Date(v || 0);
  return Number.isFinite(d.getTime()) && d.getTime() > 0 ? d.toISOString() : null;
};
function snapshot(data, meta) {
  const state = object(data);
  const history = object(state.history);
  const agents = Object.entries(history).map(([id, entries]) => ({
    id,
    messages: list(entries).length,
  })).filter(a => a.messages > 0).sort((a, b) => b.messages - a.messages);
  // The legacy workspace stores multiple representations across versions:
  // count only confirmed records, never simulate an active run.
  const projectsRaw = state.projects;
  const projects = (Array.isArray(projectsRaw) ? projectsRaw : Object.values(object(projectsRaw)))
    .filter(v => v && typeof v === 'object')
    .map(v => ({ id: String(v.id || ''), name: String(v.name || v.title || 'Progetto') }))
    .slice(0, 24);
  const pipeline = object(state.pipeline);
  const flow = object(state.flow);
  const rawLog = list(flow.log);
  const activity = rawLog.slice(-12).reverse().map((entry, i) => ({
    id: String(entry.id || i),
    text: typeof entry === 'string' ? entry.slice(0, 240) : String(entry.message || entry.text || entry.event || 'Evento registrato').slice(0, 240),
    time: safeDate(entry.at || entry.time || entry.timestamp),
  }));
  const flowStatus = flow.halted ? 'halted' : flow.running || flow.status === 'running' ? 'running' : flow.status === 'completed' ? 'completed' : 'idle';
  return {
    generatedAt: new Date().toISOString(),
    updatedAt: safeDate(meta.updated_at),
    updatedBy: meta.updated_by || null,
    projects,
    agents,
    counts: {
      projects: projects.length,
      agentsWithHistory: agents.length,
      messages: agents.reduce((total, a) => total + a.messages, 0),
      activityEvents: rawLog.length,
    },
    flow: {
      status: flowStatus,
      steps: list(flow.nodes).length || list(flow.tasks).length || list(pipeline.steps).length,
      startedAt: safeDate(flow.startedAt),
    },
    activity,
  };
}
module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Metodo non consentito' });
  const user = getSessionUser(req);
  if (!user) return res.status(401).json({ error: 'Accedi a RADIX per visualizzare il Command Center.' });
  try {
    const rows = await sql()`SELECT data, updated_at, updated_by FROM workspace_state WHERE id = 1`;
    const row = rows[0];
    if (!row) return res.status(200).json({ ...snapshot({}, {}), initialized: false });
    return res.status(200).json({ ...snapshot(row.data, row), initialized: true });
  } catch (error) {
    console.error('Command Center snapshot failed', error);
    return res.status(503).json({ error: 'Dati non disponibili. Verifica la connessione al database e la migrazione.' });
  }
};
