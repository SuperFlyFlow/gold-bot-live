// Gold Bot Live web app. Reads the bot's reports from Supabase (project gold-bot-dashboard) through the
// get_dashboard() function, which only answers signed-in accounts on the dash.viewers allow-list.
// The publishable key below is public by design: on its own it can read nothing.
(() => {
  const SUPABASE_URL = 'https://fknwhtagrojgfbyxhlcw.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_NXK3hoBi9hZxehDigTN9UA_qnfN7xwZ';
  const POLL_MS = 15000;

  const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: true, autoRefreshToken: true } });
  const $ = (id) => document.getElementById(id);
  const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
  const signed = (v) => (v > 0 ? '+' : v < 0 ? '−' : '') + usd.format(Math.abs(v || 0));
  const pct = (v) => (v > 0 ? '+' : v < 0 ? '−' : '') + (Math.abs(v || 0) * 100).toFixed(2) + '%';
  const tz = 'Africa/Johannesburg';
  const fmtTime = new Intl.DateTimeFormat('en-ZA', { timeZone: tz, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false });
  const fmtDay = new Intl.DateTimeFormat('en-ZA', { timeZone: tz, day: 'numeric', month: 'short' });
  const fmtHM = new Intl.DateTimeFormat('en-ZA', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false });
  const px = (v) => (v == null ? '' : v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 3 }));
  const tone = (el, v) => { el.classList.toggle('up', v > 0); el.classList.toggle('down', v < 0); };
  const set = (id, text, v) => { const el = $(id); el.textContent = text; if (v !== undefined) tone(el, v); };
  const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  let last = null, reportAt = null, timer = null;

  // ------------------------------------------------------------------ sign in
  let creating = false;
  function showAuth(message, isError) {
    stopPolling();
    $('app').hidden = true;
    $('auth').hidden = false;
    $('auth-msg').textContent = message || '';
    $('auth-msg').classList.toggle('err', !!isError);
  }
  $('auth-switch').addEventListener('click', () => {
    creating = !creating;
    $('auth-title').textContent = creating ? 'Create your account' : 'Sign in';
    $('auth-go').textContent = creating ? 'Create account' : 'Sign in';
    $('auth-switch').textContent = creating ? 'Have an account? Sign in' : 'New here? Create your account';
    $('password').autocomplete = creating ? 'new-password' : 'current-password';
    $('auth-msg').textContent = '';
  });
  $('auth-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = $('email').value.trim(), password = $('password').value;
    if (!email || password.length < 8) return showAuth('Enter your email and a password of at least 8 characters.', true);
    $('auth-go').disabled = true;
    try {
      if (creating) {
        const { data, error } = await sb.auth.signUp({ email, password, options: { emailRedirectTo: location.origin + location.pathname } });
        if (error) throw error;
        if (!data.session) return showAuth('Account created. Open the confirmation email we sent, tap its link, then come back and sign in.');
      } else {
        const { error } = await sb.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (err) {
      showAuth(err.message === 'Invalid login credentials' ? 'That email and password don’t match an account.' : (err.message || 'Sign-in failed.'), true);
    } finally {
      $('auth-go').disabled = false;
    }
  });
  $('signout').addEventListener('click', () => sb.auth.signOut());
  sb.auth.onAuthStateChange((_event, session) => {
    if (session) { $('auth').hidden = true; $('app').hidden = false; startPolling(); }
    else showAuth('');
  });

  // ------------------------------------------------------------------ live data
  function notice(text) { $('notice').hidden = !text; $('notice').textContent = text || ''; }
  function status(state, text) { $('status').dataset.s = state; $('status-t').textContent = text; }
  function tickAge() {
    if (!reportAt) return;
    const s = Math.max(0, Math.round((Date.now() - reportAt) / 1000));
    $('age').textContent = 'last bot report ' + (s < 90 ? s + ' s' : Math.round(s / 60) + ' min') + ' ago';
    if (s > 180) status('off', 'Bot offline · no report for ' + Math.round(s / 60) + ' min');
    else status('on', 'Bot online');
  }
  setInterval(tickAge, 1000);

  async function load() {
    const { data, error } = await sb.rpc('get_dashboard');
    if (error) {
      if (error.code === '42501' || /not_allowed|permission denied/i.test(error.message || '')) {
        const { data: u } = await sb.auth.getUser();
        status('off', 'Not on the allow-list');
        document.querySelectorAll('.tiles, #strategies, .card').forEach((el) => el.classList.add('stale'));
        return notice(`Signed in as ${u?.user?.email || 'this account'}, which isn’t on the allow-list yet. Ask the bot owner to add it, then reload.`);
      }
      if (error.status === 401 || /JWT/i.test(error.message || '')) return sb.auth.signOut();
      status(last ? 'on' : 'off', last ? 'Bot online' : 'Reconnecting');
      return notice(last ? 'Couldn’t reach the database just now. Showing the last numbers; trying again in 15 s.' : 'Couldn’t reach the database yet. Trying again in 15 s.');
    }
    notice(null);
    render(data);
  }
  function startPolling() {
    if (timer) return;
    load();
    timer = setInterval(() => { if (!document.hidden) load(); }, POLL_MS);
  }
  function stopPolling() { clearInterval(timer); timer = null; }
  document.addEventListener('visibilitychange', () => { if (!document.hidden && timer) load(); });

  // ------------------------------------------------------------------ rendering
  function render(d) {
    last = d;
    document.querySelectorAll('.stale').forEach((el) => el.classList.remove('stale'));
    const a = d.account;
    if (a) {
      reportAt = Date.now() - a.age_seconds * 1000;
      tickAge();
      const since = fmtDay.format(new Date(a.since + 'T12:00:00Z'));
      set('t-equity', usd.format(a.equity));
      set('t-open', signed(a.open_pnl), a.open_pnl);
      set('t-today', signed(a.today_pnl), a.today_pnl);
      set('t-growth', pct(a.growth_pct), a.growth_pct);
      set('t-start', usd.format(a.start_balance));
      set('t-since', since);
      set('t-balance', usd.format(a.balance));
      set('t-free', usd.format(a.free_margin ?? a.equity));
      const open = d.positions.length;
      $('take').textContent = `Equity ${usd.format(a.equity)}, ${signed(a.growth)} (${pct(a.growth_pct)}) since ${since}. ` +
        (open ? `${open} position${open > 1 ? 's' : ''} open, ${signed(a.open_pnl)} right now.` : 'No trades open right now.');
    }
    renderCards(d.systems);
    renderEquity(d.equity);
    renderPositions(d.positions);
    renderDaily(d.daily);
    renderTrades(d.trades);
  }

  function renderCards(rows) {
    if (!rows.length) return;
    $('cards').replaceChildren(...rows.map((r) => {
      const c = document.createElement('article'); c.className = 'card';
      const h = document.createElement('div'); h.className = 'card-h';
      const n = document.createElement('b'); n.textContent = r.system;
      const chip = document.createElement('span'); chip.className = 'chip'; chip.textContent = `${r.market} · ${Math.round((r.risk || 0) * 100)}% risk`;
      h.append(n, chip);
      const st = document.createElement('div'); st.className = 'stats';
      const add = (label, text, v) => {
        const s = document.createElement('div'); s.className = 'stat';
        const l = document.createElement('span'); l.className = 'label'; l.textContent = label;
        const val = document.createElement('span'); val.className = 'v'; val.textContent = text; if (v != null) tone(val, v);
        s.append(l, val); st.append(s);
      };
      add('Net closed', signed(r.net), r.net);
      add('Trades', String(r.trades));
      add('Win rate', r.win_rate == null ? '—' : Math.round(r.win_rate * 100) + '%');
      add('Avg win', r.avg_win == null ? '—' : signed(r.avg_win), r.avg_win);
      add('Avg loss', r.avg_loss == null ? '—' : signed(r.avg_loss), r.avg_loss);
      add('Open now', r.open_now ? signed(r.open_pnl) : '—', r.open_now ? r.open_pnl : null);
      c.append(h, st);
      return c;
    }));
  }

  function renderEquity(raw) {
    const box = $('eq-chart');
    const rows = raw.map((r) => ({ t: new Date(r.t), equity: r.equity, balance: r.balance }));
    if (!rows.length) { box.replaceChildren(); return; }
    const W = Math.max(box.clientWidth, 280), H = 220, B = 24;
    const lo = d3.min(rows, (d) => Math.min(d.equity, d.balance)), hi = d3.max(rows, (d) => Math.max(d.equity, d.balance));
    const pad = Math.max((hi - lo) * 0.12, 5);
    const y = d3.scaleLinear([lo - pad, hi + pad], [H - B, 8]).nice(4);
    const fmt = d3.format('$,.0f');
    const L = d3.max(y.ticks(4), (v) => fmt(v).length) * 7.4 + 10;
    const t0 = rows[0].t, t1 = rows[rows.length - 1].t;
    const x = d3.scaleUtc(t0 < t1 ? [t0, t1] : [new Date(+t0 - 36e5), new Date(+t0 + 36e5)], [L, W - 10]);
    const svg = d3.create('svg').attr('viewBox', `0 0 ${W} ${H}`).attr('role', 'img').attr('aria-label', 'Equity over time');
    svg.append('g').selectAll('line').data(y.ticks(4)).join('line').attr('x1', L).attr('x2', W - 10).attr('y1', y).attr('y2', y).attr('stroke', css('--line'));
    svg.append('g').selectAll('text').data(y.ticks(4)).join('text').attr('x', L - 8).attr('y', (v) => y(v) + 4).attr('text-anchor', 'end')
      .attr('fill', css('--muted')).attr('font-size', 11).attr('font-family', css('--num')).text(fmt);
    const xt = x.ticks(Math.max(2, Math.floor(W / 130)));
    svg.append('g').selectAll('text').data(xt).join('text').attr('x', x).attr('y', H - 6).attr('fill', css('--muted')).attr('font-size', 11)
      .attr('text-anchor', (d) => (x(d) - L < 40 ? 'start' : W - 10 - x(d) < 40 ? 'end' : 'middle'))
      .text((d) => (t1 - t0 < 2 * 864e5 ? fmtHM.format(d) : fmtDay.format(d)));
    const gold = css('--gold');
    const g = svg.append('defs').append('linearGradient').attr('id', 'eqf').attr('x1', 0).attr('x2', 0).attr('y1', 0).attr('y2', 1);
    [[0, .26], [.25, .16], [.5, .08], [.75, .03], [1, 0]].forEach(([o, op]) => g.append('stop').attr('offset', o).attr('stop-color', gold).attr('stop-opacity', op));
    svg.append('path').datum(rows).attr('fill', 'url(#eqf)').attr('d', d3.area().x((d) => x(d.t)).y0(H - B).y1((d) => y(d.equity)));
    svg.append('path').datum(rows).attr('fill', 'none').attr('stroke', css('--ref')).attr('stroke-dasharray', '4 4').attr('d', d3.line().x((d) => x(d.t)).y((d) => y(d.balance)));
    svg.append('path').datum(rows).attr('fill', 'none').attr('stroke', gold).attr('stroke-width', 2).attr('stroke-linejoin', 'round').attr('stroke-linecap', 'round')
      .attr('d', d3.line().x((d) => x(d.t)).y((d) => y(d.equity)));
    const end = rows[rows.length - 1];
    svg.append('circle').attr('cx', x(end.t)).attr('cy', y(end.equity)).attr('r', 4).attr('fill', gold);
    const dot = svg.append('circle').attr('r', 4).attr('fill', gold).attr('opacity', 0);
    const tip = document.createElement('div'); tip.className = 'tip'; tip.hidden = true;
    svg.append('rect').attr('x', L).attr('y', 0).attr('width', W - L - 10).attr('height', H - B).attr('fill', 'transparent')
      .on('pointermove', (ev) => {
        const [mx] = d3.pointer(ev);
        const d = rows[d3.leastIndex(rows, (r) => Math.abs(x(r.t) - mx))];
        dot.attr('cx', x(d.t)).attr('cy', y(d.equity)).attr('opacity', 1);
        tip.hidden = false;
        const w = document.createElement('div'); w.className = 'when'; w.textContent = fmtTime.format(d.t);
        const e = document.createElement('div'); e.textContent = 'Equity ' + usd.format(d.equity);
        const b = document.createElement('div'); b.textContent = 'Balance ' + usd.format(d.balance);
        tip.replaceChildren(w, e, b);
        const p = (x(d.t) / W) * box.clientWidth;
        tip.style.left = Math.min(Math.max(p - 75, 0), Math.max(box.clientWidth - 160, 0)) + 'px';
      })
      .on('pointerleave', () => { tip.hidden = true; dot.attr('opacity', 0); });
    box.replaceChildren(svg.node(), tip);
  }

  function rowsInto(tbody, rows, cells) {
    tbody.replaceChildren(...rows.map((r) => {
      const tr = document.createElement('tr');
      cells(r).forEach(([text, right, v, cls]) => {
        const td = document.createElement('td');
        if (cls) { const s = document.createElement('span'); s.className = cls; s.textContent = text; td.append(s); } else td.textContent = text;
        if (right) td.className = 'r';
        if (v != null) tone(td, v);
        tr.append(td);
      });
      return tr;
    }));
  }

  function renderPositions(rows) {
    $('pos-empty').hidden = rows.length > 0;
    $('pos').hidden = rows.length === 0;
    rowsInto($('pos').tBodies[0], rows, (r) => [[r.system], [r.side, 0, null, 'side'], [String(r.leg || '').replace(/^scalp /, '')],
      [(r.volume ?? 0).toFixed(2), 1], [px(r.price_open), 1], [px(r.price_now), 1], [px(r.sl), 1], [px(r.tp), 1], [r.profit == null ? '' : signed(r.profit), 1, r.profit]]);
  }

  function renderTrades(rows) {
    $('tr-empty').hidden = rows.length > 0;
    $('tr').hidden = rows.length === 0;
    rowsInto($('tr').tBodies[0], rows, (r) => [[fmtTime.format(new Date(r.closed))], [r.system], [r.side, 0, null, 'side'],
      [(r.volume ?? 0).toFixed(2), 1], [px(r.price_open), 1], [px(r.price_close), 1], [String(r.minutes), 1], [signed(r.net), 1, r.net]]);
  }

  function renderDaily(raw) {
    const box = $('daily-chart');
    const days = d3.rollups(raw, (v) => ({ net: d3.sum(v, (d) => d.net), parts: v }), (d) => d.day).map(([day, o]) => ({ day, ...o }));
    $('daily-empty').hidden = days.length > 0;
    box.style.minHeight = days.length ? '200px' : '0';
    if (!days.length) { box.replaceChildren(); return; }
    const W = Math.max(box.clientWidth, 280), H = 200, B = 24;
    const fmt = d3.format('$,.0f');
    const ext = d3.extent([0, ...days.map((d) => d.net)]);
    const y = d3.scaleLinear(ext[0] === ext[1] ? [-1, 1] : ext, [H - B, 8]).nice(4);
    const L = d3.max(y.ticks(4), (v) => fmt(v).length) * 7.4 + 10;
    const x = d3.scaleBand(days.map((d) => d.day), [L, W - 8]).padding(0.3);
    const bw = Math.min(x.bandwidth(), 32);
    const svg = d3.create('svg').attr('viewBox', `0 0 ${W} ${H}`).attr('role', 'img').attr('aria-label', 'Daily profit and loss');
    svg.append('g').selectAll('line').data(y.ticks(4)).join('line').attr('x1', L).attr('x2', W - 8).attr('y1', y).attr('y2', y)
      .attr('stroke', (v) => (v === 0 ? css('--ref') : css('--line')));
    svg.append('g').selectAll('text').data(y.ticks(4)).join('text').attr('x', L - 8).attr('y', (v) => y(v) + 4).attr('text-anchor', 'end')
      .attr('fill', css('--muted')).attr('font-size', 11).attr('font-family', css('--num')).text(fmt);
    const tip = document.createElement('div'); tip.className = 'tip'; tip.hidden = true;
    svg.append('g').selectAll('rect').data(days).join('rect')
      .attr('x', (d) => x(d.day) + (x.bandwidth() - bw) / 2).attr('width', bw).attr('rx', 4)
      .attr('y', (d) => y(Math.max(0, d.net))).attr('height', (d) => Math.max(1, Math.abs(y(d.net) - y(0))))
      .attr('fill', (d) => (d.net >= 0 ? css('--gold') : css('--down')))
      .on('pointerenter', (ev, d) => {
        tip.hidden = false;
        const w = document.createElement('div'); w.className = 'when'; w.textContent = fmtDay.format(new Date(d.day + 'T12:00:00Z')) + ' · ' + signed(d.net);
        tip.replaceChildren(w, ...d.parts.map((p) => Object.assign(document.createElement('div'), { textContent: `${p.system} ${signed(p.net)} (${p.trades})` })));
        const p = ((x(d.day) + x.bandwidth() / 2) / W) * box.clientWidth;
        tip.style.left = Math.min(Math.max(p - 100, 0), Math.max(box.clientWidth - 230, 0)) + 'px';
      })
      .on('pointerleave', () => { tip.hidden = true; });
    const every = Math.ceil(days.length / Math.max(2, Math.floor(W / 70)));
    svg.append('g').selectAll('text').data(days.filter((d, i) => i % every === 0)).join('text')
      .attr('x', (d) => x(d.day) + x.bandwidth() / 2).attr('y', H - 6).attr('text-anchor', 'middle').attr('fill', css('--muted')).attr('font-size', 11)
      .text((d) => fmtDay.format(new Date(d.day + 'T12:00:00Z')));
    box.replaceChildren(svg.node(), tip);
  }

  let resizeT;
  addEventListener('resize', () => { clearTimeout(resizeT); resizeT = setTimeout(() => last && render(last), 150); });
  matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => last && render(last));

  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
})();
