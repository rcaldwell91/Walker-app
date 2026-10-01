// Local test stack only: local Supabase (Docker) + a dev server on :3100. Never the live project.
const fs = require('fs');
const { execSync } = require('child_process');
// Env from `supabase status -o env > supabase/.local.env` (never the live project).
const env = Object.fromEntries(fs.readFileSync(process.env.LOCAL_ENV || __dirname + '/../../.local.env', 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).replace(/^"|"$/g, '')]));
if (!/127\.0\.0\.1|localhost/.test(env.API_URL)) throw new Error('Not the local stack: refusing to run');
const { chromium } = require(execSync('npm root -g').toString().trim() + '/playwright');
const BASE = 'http://localhost:3100';
const API = env.API_URL;
const KEY = env.SERVICE_ROLE_KEY;
async function rest(path, opts = {}) {
  const r = await fetch(`${API}/rest/v1/${path}`, { ...opts, headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', Prefer: 'return=representation', ...(opts.headers || {}) } });
  const t = await r.text();
  if (!r.ok) throw new Error(`${r.status} ${path}: ${t}`);
  return t ? JSON.parse(t) : null;
}
const db = (q) => rest(q);
function sql(q) {
  return execSync('psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -At -q -v ON_ERROR_STOP=1', { input: q, env: { ...process.env, PGPASSWORD: 'postgres' } }).toString().trim();
}
async function browser() {
  const pac = `function FindProxyForURL(u,h){return (h=="localhost"||h=="127.0.0.1")?"DIRECT":"PROXY ${new URL(process.env.HTTPS_PROXY).host}";}`;
  return chromium.launch({ args: [`--proxy-pac-url=data:application/x-ns-proxy-autoconfig;base64,${Buffer.from(pac).toString('base64')}`] });
}
const context = (b, extra = {}) => b.newContext({ timezoneId: 'America/Los_Angeles', viewport: { width: 390, height: 844 }, ...extra });
async function login(page, email, pw) {
  await page.goto(BASE + '/login', { waitUntil: 'networkidle' });
  await page.fill('input[name=email]', email);
  await page.fill('input[name=password]', pw);
  await page.click('button[type=submit]');
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 60000 });
}
function watchErrors(page, tag) {
  const errs = [];
  page.on('console', (m) => { if (m.type() === 'error' && !/tile\.openstreetmap|ERR_TUNNEL|ERR_CONNECTION|ERR_INTERNET_DISCONNECTED|Failed to load resource|Failed to fetch/.test(m.text())) errs.push(`[${tag}] ${m.text().slice(0, 300)}`); });
  page.on('pageerror', (e) => errs.push(`[${tag}] pageerror: ${e.message}`));
  return errs;
}
const ok = (cond, msg) => console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`);
const STATE = __dirname + '/.state.json';
const loadState = () => (fs.existsSync(STATE) ? JSON.parse(fs.readFileSync(STATE, 'utf8')) : {});
const saveState = (s) => fs.writeFileSync(STATE, JSON.stringify({ ...loadState(), ...s }, null, 1));
module.exports = { env, API, KEY, rest, db, sql, browser, context, login, watchErrors, ok, BASE, loadState, saveState };
