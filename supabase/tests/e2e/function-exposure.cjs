// Calls EVERY function in the public schema over the REST API, as a logged-out visitor
// and as a signed-in walker who owns nothing, and classifies each answer. LOCAL stack only.
// Usage: node function-exposure.cjs <label>   (run seed.cjs and seed2.cjs first)
const c = require('./common.cjs');
const fs = require('fs');
const label = process.argv[2] || 'run';
(async () => {
  const st = c.loadState();
  const anonKey = c.env.ANON_KEY;
  const tok = await (await fetch(`${c.API}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: anonKey, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'nobody@e2e.test', password: 'E2eTest123!' }) })).json();
  if (!tok.access_token) throw new Error('nobody login failed');
  const fns = c.sql(`select p.proname || '|' || coalesce(array_to_string(p.proargnames[1:p.pronargs], ','), '') || '|' ||
      coalesce((select string_agg(format_type(t, null), ',' order by o) from unnest(p.proargtypes) with ordinality u(t, o)), '') || '|' || p.prosecdef || '|' || format_type(p.prorettype, null)
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.prokind = 'f' order by 1`).split('\n').filter(Boolean)
    .map((l) => { const [name, an, at, def, ret] = l.split('|'); return { name, args: an ? an.split(',') : [], types: at ? at.split(',') : [], definer: def === 't', ret }; });
  const anyStayUpdate = c.sql(`select id from stay_updates limit 1`) || st.reminderStay;
  const uuidFor = (fn, a) => ({
    walk_client_ids: st.walkId, walk_walker_name: st.walkId, squad_ids_of: st.walkerId, walker_is_suspended: st.susp,
    client_can_see_photo: st.photo, walker_can_see_covered_photo: st.photo, reschedule_coverage: st.booking,
    end_stay: st.reminderStay, finish_walk: st.walkId, post_stay_update: anyStayUpdate,
  }[fn] ?? st.walkerId);
  const valueFor = (fn, a, t) => {
    if (t === 'uuid') return uuidFor(fn, a);
    if (t === 'text') return a === 'p_handle' ? 'e2e-walker' : a === 'p_tz' ? 'UTC' : 'x';
    if (t === 'date') return fn === 'claim_stay_reminders' ? st.tomorrow : new Date().toISOString().slice(0, 10);
    if (t.startsWith('timestamp')) return new Date(Date.now() + 2 * 864e5).toISOString();
    if (t === 'integer') return 60;
    if (t === 'boolean') return false;
    if (t === 'jsonb') return [];
    if (t === 'user_role') return 'walker';
    return null;
  };
  // Answers that are fine by design: public card, a fact about the caller themself.
  const byDesign = {
    public_walker_profile: 'public profile card (intended for everyone)',
    find_walker_by_handle: 'exact-handle walker card (walkers adding to their squad)',
    current_role_is: 'a yes/no about the caller themself',
  };
  const empty = (v) => v === null || v === false || v === '' || (Array.isArray(v) && v.length === 0);
  const out = [];
  for (const who of ['anon', 'nobody']) {
    const bearer = who === 'anon' ? anonKey : tok.access_token;
    for (const f of fns) {
      const body = Object.fromEntries(f.args.map((a, i) => [a, valueFor(f.name, a, f.types[i])]));
      const r = await fetch(`${c.API}/rest/v1/rpc/${f.name}`, { method: 'POST', headers: { apikey: anonKey, Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const text = await r.text();
      let v; try { v = JSON.parse(text); } catch { v = text; }
      let verdict;
      if (!r.ok) verdict = 'refused';
      else if (empty(v)) verdict = 'nothing';
      else if (byDesign[f.name]) verdict = 'by design';
      else verdict = 'LEAK';
      out.push({ who, fn: f.name, definer: f.definer, status: r.status, verdict, detail: !r.ok ? (v?.message ?? String(v)).slice(0, 90) : JSON.stringify(v).slice(0, 90) });
    }
  }
  // The rating summary view and the ratings table, read directly.
  for (const who of ['anon', 'nobody']) {
    const bearer = who === 'anon' ? anonKey : tok.access_token;
    for (const t of ['walker_rating_summary', 'ratings']) {
      const r = await fetch(`${c.API}/rest/v1/${t}?select=*`, { headers: { apikey: anonKey, Authorization: `Bearer ${bearer}` } });
      const v = await r.json().catch(() => null);
      out.push({ who, fn: `[table] ${t}`, status: r.status, verdict: !r.ok ? 'refused' : empty(v) ? 'nothing' : 'LEAK', detail: JSON.stringify(v).slice(0, 90) });
    }
  }
  fs.writeFileSync(`${__dirname}/.function-exposure-${label}.json`, JSON.stringify(out, null, 1));
  const pad = (s, n) => String(s).padEnd(n);
  for (const o of out) console.log(`${pad(o.who, 7)}${pad(o.fn, 30)}${pad(o.status, 5)}${pad(o.verdict, 10)}${o.detail}`);
  const leaks = out.filter((o) => o.verdict === 'LEAK');
  console.log(`\n${label}: ${out.length} calls, ${out.filter((o) => o.status < 300).length} answered, ${leaks.length} LEAK`);
  if (leaks.length) process.exitCode = 1;
})().catch((e) => { console.error(e); process.exit(1); });
