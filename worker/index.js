const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, CF-Access-Client-Id, CF-Access-Client-Secret',
};

function json_resp(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

function auth(request, env) {
  const id = request.headers.get('CF-Access-Client-Id');
  const secret = request.headers.get('CF-Access-Client-Secret');
  return id === env.SERVICE_CLIENT_ID && secret === env.SERVICE_CLIENT_SECRET;
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
    if (!auth(request, env)) return new Response('Unauthorized', { status: 401, headers: CORS });

    const url = new URL(request.url);
    const path = url.pathname;

    // STOCK
    if (path === '/stock' && request.method === 'GET') {
      const { results } = await env.DB.prepare('SELECT pid, estado, historico, quantidade_litros FROM stock').all();
      const out = {};
      results.forEach(r => {
        out[r.pid] = {
          estado: r.estado,
          historico: JSON.parse(r.historico || '[]'),
          quantidade_litros: r.quantidade_litros || 0
        };
      });
      return json_resp(out);
    }

    if (path.startsWith('/stock/') && request.method === 'PUT') {
      const pid = path.split('/')[2];
      const body = await request.json();
      const { estado, historico, quantidade_litros } = body;
      await env.DB.prepare(
        `INSERT INTO stock (pid, estado, historico, quantidade_litros) VALUES (?, ?, ?, ?)
         ON CONFLICT(pid) DO UPDATE SET estado=excluded.estado, historico=excluded.historico, quantidade_litros=excluded.quantidade_litros`
      ).bind(pid, estado, JSON.stringify(historico || []), quantidade_litros || 0).run();
      return json_resp({ ok: true });
    }

    // TAREFAS
    if (path.startsWith('/tarefas/') && request.method === 'GET') {
      const semana = path.split('/')[2];
      const { results } = await env.DB.prepare('SELECT tid, feita FROM tarefas WHERE semana = ?').bind(semana).all();
      const out = {};
      results.forEach(r => out[r.tid] = !!r.feita);
      return json_resp(out);
    }

    if (path.startsWith('/tarefas/') && request.method === 'PUT') {
      const [, , semana, tid] = path.split('/');
      const { feita } = await request.json();
      await env.DB.prepare(
        `INSERT INTO tarefas (semana, tid, feita) VALUES (?, ?, ?)
         ON CONFLICT(semana, tid) DO UPDATE SET feita=excluded.feita`
      ).bind(semana, tid, feita ? 1 : 0).run();
      return json_resp({ ok: true });
    }

    // REGISTOS
    if (path.startsWith('/registos/') && request.method === 'GET') {
      const aid = path.split('/')[2];
      const { results } = await env.DB.prepare(
        'SELECT * FROM registos WHERE arvore_id = ? ORDER BY data ASC'
      ).bind(aid).all();
      return json_resp(results.map(r => ({ ...r, fotos: JSON.parse(r.fotos || '[]') })));
    }

    if (path.startsWith('/registos/') && request.method === 'POST') {
      const aid = path.split('/')[2];
      const body = await request.json();
      const id = 'r' + aid + '_' + Date.now();
      await env.DB.prepare(
        `INSERT INTO registos (id, arvore_id, data, diagnostico, tratamento, urgencia, fotos)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).bind(id, aid, body.data, body.diagnostico, body.tratamento || '', body.urgencia || 'medio', JSON.stringify(body.fotos || [])).run();
      return json_resp({ ok: true, id });
    }

    if (path.startsWith('/registos/') && request.method === 'PUT') {
      const id = path.split('/')[2];
      const body = await request.json();
      await env.DB.prepare(
        `UPDATE registos SET data=?, diagnostico=?, tratamento=?, urgencia=? WHERE id=?`
      ).bind(body.data, body.diagnostico, body.tratamento, body.urgencia, id).run();
      return json_resp({ ok: true });
    }

    if (path.startsWith('/registos/') && request.method === 'DELETE') {
      const id = path.split('/')[2];
      await env.DB.prepare('DELETE FROM registos WHERE id=?').bind(id).run();
      return json_resp({ ok: true });
    }

    return json_resp({ error: 'Not found' }, 404);
  }
};
