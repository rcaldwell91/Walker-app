// Extra LOCAL data for the function-exposure test: a squad partner, a suspended walker,
// a walker who owns nothing, a stay with a reminder due, a ratings row.
const c = require('./common.cjs');
(async () => {
  const st = c.loadState();
  async function user(email, role, full_name) {
    const r = await fetch(`${c.API}/auth/v1/admin/users`, { method: 'POST', headers: { apikey: c.KEY, Authorization: `Bearer ${c.KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'E2eTest123!', email_confirm: true, user_metadata: { role, full_name } }) });
    const j = await r.json();
    if (r.ok) return j.id;
    const id = c.sql(`select id from auth.users where email = '${email}'`);
    if (!id) throw new Error(JSON.stringify(j));
    return id;
  }
  const partner = await user('partner@e2e.test', 'walker', 'E2E Partner');
  const susp = await user('suspended@e2e.test', 'walker', 'E2E Suspended');
  const nobody = await user('nobody@e2e.test', 'walker', 'E2E Nobody');
  c.sql(`insert into walkers (id, handle) values ('${partner}', 'e2e-partner'), ('${susp}', 'e2e-suspended'), ('${nobody}', 'e2e-nobody') on conflict do nothing`);
  c.sql(`update walkers set status = 'suspended' where id = '${susp}'`);
  c.sql(`insert into squad_links (requester_id, recipient_id, status) values ('${st.walkerId}', '${partner}', 'accepted') on conflict do nothing`);
  const ymd = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: 'UTC' }).format(d);
  const tomorrow = ymd(new Date(Date.now() + 864e5));
  const stayId = c.sql(`insert into boarding_stays (walker_id, client_id, starts_at, ends_at, start_day, end_day, nights, price_cents)
    values ('${st.walkerId}', '${st.clientId}', now() + interval '1 day', now() + interval '3 days', '${tomorrow}', '${tomorrow}'::date + 2, 2, 8000) returning id`).split('\n')[0];
  c.sql(`insert into stay_pets (stay_id, dog_id) values ('${stayId}', '${st.rex}')`);
  const booking = c.sql(`insert into bookings (walker_id, client_id, service_type_id, starts_at, duration_min) values ('${st.walkerId}', '${st.clientId}', '${st.groupWalk}', now() + interval '2 days', 60) returning id`).split('\n')[0];
  const photo = c.sql(`select id from photos limit 1`);
  c.saveState({ partner, susp, nobody, reminderStay: stayId, booking, photo, tomorrow });
  console.log('seeded', { partner, susp, nobody, stayId, booking, photo });
})().catch((e) => { console.error(e); process.exit(1); });
