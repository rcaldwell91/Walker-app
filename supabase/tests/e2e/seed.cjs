// Seed the LOCAL stack: an e2e walker, two e2e clients with pets, rates. Idempotent-ish (fresh each run).
const c = require('./common.cjs');
(async () => {
  async function user(email, role, full_name) {
    const r = await fetch(`${c.API}/auth/v1/admin/users`, { method: 'POST', headers: { apikey: c.KEY, Authorization: `Bearer ${c.KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'E2eTest123!', email_confirm: true, user_metadata: { role, full_name } }) });
    const j = await r.json();
    if (!r.ok) throw new Error(JSON.stringify(j));
    return j.id;
  }
  const w = await user('walker@e2e.test', 'walker', 'E2E Walker');
  const cl = await user('client@e2e.test', 'client', 'E2E Client');
  const cl2 = await user('client2@e2e.test', 'client', 'E2E Client Two');
  await c.rest('walkers', { method: 'POST', body: JSON.stringify({ id: w, handle: 'e2e-walker', business_name: '[test] E2E Walks' }) });
  const [client] = await c.rest('clients', { method: 'POST', body: JSON.stringify({ walker_id: w, name: '[test] Client One', profile_id: cl, status: 'active', address_line: '1 Main St', city: 'SF', lat: 37.781, lng: -122.41 }) });
  const [client2] = await c.rest('clients', { method: 'POST', body: JSON.stringify({ walker_id: w, name: '[test] Client Two', profile_id: cl2, status: 'active', lat: 37.785, lng: -122.42 }) });
  const [rex] = await c.rest('dogs', { method: 'POST', body: JSON.stringify({ walker_id: w, client_id: client.id, name: 'Rex' }) });
  const [bo] = await c.rest('dogs', { method: 'POST', body: JSON.stringify({ walker_id: w, client_id: client2.id, name: 'Bo' }) });
  const svc = await c.db('service_types?select=id,key&key=eq.group_walk');
  await c.rest('walker_services', { method: 'POST', body: JSON.stringify({ walker_id: w, service_type_id: svc[0].id, rate_cents: 2500, enabled: true }) });
  c.saveState({ walkerId: w, clientUser: cl, client2User: cl2, clientId: client.id, client2Id: client2.id, rex: rex.id, bo: bo.id, groupWalk: svc[0].id });
  console.log('seeded', { w, client: client.id, rex: rex.id, bo: bo.id });
})().catch((e) => { console.error(e); process.exit(1); });
