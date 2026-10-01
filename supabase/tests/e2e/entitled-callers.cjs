// Entitled callers still get their answers (LOCAL).
const c = require('./common.cjs');
(async () => {
  const st = c.loadState();
  const anonKey = c.env.ANON_KEY;
  const tokenFor = async (email) => (await (await fetch(`${c.API}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: anonKey, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: 'E2eTest123!' }) })).json()).access_token;
  const call = async (tok, fn, body) => { const r = await fetch(`${c.API}/rest/v1/rpc/${fn}`, { method: 'POST', headers: { apikey: anonKey, Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); return r.json(); };
  const walker = await tokenFor('walker@e2e.test'), client = await tokenFor('client@e2e.test'), partner = await tokenFor('partner@e2e.test');
  const all = await call(walker, 'walk_client_ids', { w: st.walkId });
  const mine = await call(client, 'walk_client_ids', { w: st.walkId });
  c.ok(all.length === 2, `the walk's own walker sees both clients on the walk (${all.length})`);
  c.ok(mine.length === 1 && mine[0] === st.clientId, `a client on the walk sees only their own client id (${JSON.stringify(mine)})`);
  const sq = await call(walker, 'squad_ids_of', { w: st.walkerId });
  const sqClient = await call(client, 'squad_ids_of', { w: st.walkerId });
  const sqPartner = await call(partner, 'squad_ids_of', { w: st.walkerId });
  c.ok(sq.length === 1 && sqClient.length === 1, 'the walker and their client see the walker\'s squad');
  c.ok(sqPartner.length === 1 && sqPartner[0] === st.partner, 'a squad member sees only themself in it');
  c.ok((await call(walker, 'walker_is_suspended', { p_walker: st.walkerId })) === false && (await call(partner, 'is_operator', {})) === false, 'self-checks still answer');
})().catch((e) => { console.error(e); process.exit(1); });
