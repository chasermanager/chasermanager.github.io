/* "Be right back": apresentação de slides em tela cheia para o streamer.
 * - Botão "Be right back" abre os slides (tela cheia). Controles aparecem ao mexer o mouse.
 * - "Copiar link p/ OBS" gera um link com os seus dados dentro (#brb=…): cole numa Fonte de Navegador do OBS
 *   (1920×1080). Funciona em qualquer hospedagem estática (ex.: GitHub Pages), sem servidor. */
(() => {
  const KEY = "chaser-manager-brb";
  const PER_SLIDE = 10; // cards por slide (5 + 5), no tamanho original: imagens nítidas, sem ampliar
  const cfg = { secs: 10, msg: "Be right back", transparent: false };
  try { Object.assign(cfg, JSON.parse(localStorage.getItem(KEY) || "{}")); } catch (_) { /* padrão */ }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(cfg)); } catch (_) { /* ignora */ } };

  const root = $("brb"), slidesEl = $("brbSlides"), stage = $("brbStage"), dots = $("brbDots");
  let idx = 0, paused = false, timer = 0, slideStart = 0, remaining = 0, linkMode = false, count = 0;

  const fmt = (n) => Number(n).toLocaleString("pt-BR");
  const nick = () => state.player.name.trim() || "Chaser";

  /* ---------- Slides ---------- */

  function titleSlide() {
    const p = state.player;
    const main = p.main ? charById(p.main) : null;
    const lvl = levelSrc(p.chaserLevel);
    const period = p.showDate ? periodText() : "";
    const stat = (label, value, icon = "") => `<div class="brb-stat"><span>${label}</span><b>${icon}${fmt(value)}</b></div>`;
    return `<section class="brb-slide brb-title" ${main ? `style="${toneStyle(main)}"` : ""}>
      <div class="brb-msg">${esc(cfg.msg)}<i class="brb-dots" aria-hidden="true"><u>.</u><u>.</u><u>.</u></i></div>
      <div class="brb-who">
        ${main ? `<div class="brb-portrait">${portraitHTML(main.id)}</div>` : ""}
        <div class="brb-nick">${esc(nick())}</div>
      </div>
      ${period ? `<div class="brb-period">${esc(period)}</div>` : ""}
      <div class="brb-stats">
        ${stat("Chaser Level", p.chaserLevel, lvl ? `<img src="${esc(lvl)}" alt="" onerror="this.remove()">` : "")}
        ${stat("Card Collection Level", p.cardCollectionLevel)}
        ${stat("Guild Points", p.guildPoints)}
      </div>
    </section>`;
  }

  /** Card virado para baixo que desvira durante o tempo do slide (um de cada vez, da esquerda para a direita). */
  function flipHTML(c, i, n) {
    const f = (0.1 + 0.55 * (i / Math.max(1, n - 1))).toFixed(3); // fração do tempo do slide em que ele desvira (10% a 65%)
    const tilt = ((i * 37) % 7 - 3) * 0.3; // inclinação leve e diferente em cada card (−0,9° a +0,9°)
    const fd = (5.2 + (i * 53) % 30 / 10).toFixed(1); // duração da flutuação 5,2–8,1 s
    return `<div class="flip" style="${toneStyle(c)};--f:${f};--tilt:${tilt.toFixed(1)}deg;--fd:${fd}s;--fo:${(-i * 0.9).toFixed(1)}s">
      <div class="flip-in"><div class="flip-back" aria-hidden="true"></div><div class="flip-front">${cardHTML(c)}</div></div>
    </div>`;
  }

  function cardSlide(group, n, total) {
    return `<section class="brb-slide brb-cards-slide">
      <div class="brb-cards">${group.map((c, i) => flipHTML(c, i, group.length)).join("")}</div>
      <div class="brb-page">${n} / ${total}</div>
    </section>`;
  }

  function build() {
    ranks = computeRanks();
    const list = viewList();
    const groups = [];
    for (let i = 0; i < list.length; i += PER_SLIDE) groups.push(list.slice(i, i + PER_SLIDE));
    slidesEl.innerHTML = titleSlide() + groups.map((g, i) => cardSlide(g, i + 1, groups.length)).join("");
    count = groups.length + 1;
    dots.innerHTML = Array.from({ length: count }, (_, i) => `<i data-i="${i}"></i>`).join("");
    $("brbName").textContent = nick();
    $("brbMsg").textContent = cfg.msg;
    root.style.setProperty("--secs", `${cfg.secs}s`);
    root.classList.toggle("transparent", cfg.transparent);
    document.body.classList.toggle("brb-transparent", cfg.transparent && linkMode);
  }

  /* ---------- Reprodução ---------- */

  function show(i) {
    const prev = slidesEl.children[idx];
    if (prev && prev.classList.contains("on")) { // o slide que sai mantém os cards viradas durante o fade (não "desvira" de volta)
      prev.classList.add("leaving");
      setTimeout(() => prev.classList.remove("leaving"), 1000);
    }
    idx = (i + count) % count;
    [...slidesEl.children].forEach((s, k) => s.classList.toggle("on", k === idx));
    [...dots.children].forEach((d, k) => d.classList.toggle("on", k === idx));
    root.dataset.slide = idx === 0 ? "title" : "cards";
    const bar = $("brbBar");
    bar.classList.remove("run");
    void bar.offsetWidth; // reinicia a barra de progresso
    bar.classList.add("run");
    schedule(cfg.secs * 1000);
  }

  function schedule(ms) {
    clearTimeout(timer);
    slideStart = performance.now();
    remaining = ms;
    if (!paused) timer = setTimeout(() => show(idx + 1), ms);
  }

  function setPaused(p) {
    paused = p;
    root.classList.toggle("paused", p);
    $("brbPlay").textContent = p ? "▶" : "❚❚";
    if (p) { clearTimeout(timer); remaining -= performance.now() - slideStart; }
    else schedule(Math.max(300, remaining));
  }

  /* ---------- Abrir / fechar ---------- */

  function fit() {
    const k = Math.min(innerWidth / 1920, innerHeight / 1080);
    stage.style.transform = `translate(-50%, -50%) scale(${k})`;
  }
  addEventListener("resize", fit);

  function open() {
    $("brbMsgInput").value = cfg.msg;
    $("brbSecs").value = String(cfg.secs);
    $("brbTransparent").checked = cfg.transparent;
    build();
    fit();
    root.hidden = false;
    document.body.classList.add("brb-on");
    paused = false;
    setPaused(false);
    show(0);
    if (!linkMode && root.requestFullscreen) root.requestFullscreen().catch(() => {});
  }

  function close() {
    clearTimeout(timer);
    root.hidden = true;
    document.body.classList.remove("brb-on");
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  }

  /* ---------- Link para o OBS (dados dentro do endereço) ---------- */

  const b64 = {
    enc: (bytes) => { let s = ""; bytes.forEach((b) => { s += String.fromCharCode(b); }); return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); },
    dec: (t) => Uint8Array.from(atob(t.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0)),
  };
  const pipe = async (bytes, stream) => new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer());

  async function encode(obj) {
    let bytes = new TextEncoder().encode(JSON.stringify(obj)), prefix = "j";
    if (window.CompressionStream) { bytes = await pipe(bytes, new CompressionStream("deflate-raw")); prefix = "z"; }
    return prefix + b64.enc(bytes);
  }
  async function decode(text) {
    let bytes = b64.dec(text.slice(1));
    if (text[0] === "z") bytes = await pipe(bytes, new DecompressionStream("deflate-raw"));
    return JSON.parse(new TextDecoder().decode(bytes));
  }

  async function copyLink() {
    const code = await encode({ s: serialize(state), o: sortMode, secs: cfg.secs, msg: cfg.msg, t: cfg.transparent });
    const url = `${location.origin === "null" ? "" : location.origin}${location.pathname}#brb=${code}`;
    try { await navigator.clipboard.writeText(url); toast("Link copiado. No OBS: Fonte > Navegador, cole o link e use 1920×1080.", "ok", 6000); }
    catch (_) { prompt("Copie o link e cole na Fonte de Navegador do OBS (1920×1080):", url); }
  }

  /* ---------- Controles ---------- */

  let idle = 0;
  const wake = () => {
    root.classList.add("active");
    clearTimeout(idle);
    idle = setTimeout(() => { if (!root.contains(document.activeElement) || document.activeElement === document.body) root.classList.remove("active"); }, 2500);
  };
  root.addEventListener("mousemove", wake);
  root.addEventListener("pointerdown", wake);

  $("brbPrev").addEventListener("click", () => show(idx - 1));
  $("brbNext").addEventListener("click", () => show(idx + 1));
  $("brbPlay").addEventListener("click", () => setPaused(!paused));
  $("brbFull").addEventListener("click", () => {
    if (document.fullscreenElement) document.exitFullscreen(); else root.requestFullscreen?.();
  });
  $("brbClose").addEventListener("click", close);
  $("brbLink").addEventListener("click", copyLink);
  dots.addEventListener("click", (e) => { const d = e.target.closest("[data-i]"); if (d) show(Number(d.dataset.i)); });
  $("brbBtn").addEventListener("click", open);

  $("brbMsgInput").addEventListener("input", (e) => { cfg.msg = e.target.value.trim() || "Be right back"; save(); $("brbMsg").textContent = cfg.msg; slidesEl.querySelector(".brb-msg").firstChild.textContent = cfg.msg; });
  $("brbSecs").addEventListener("change", (e) => { cfg.secs = Number(e.target.value) || 10; save(); root.style.setProperty("--secs", `${cfg.secs}s`); show(idx); });
  $("brbTransparent").addEventListener("change", (e) => { cfg.transparent = e.target.checked; save(); root.classList.toggle("transparent", cfg.transparent); });

  addEventListener("keydown", (e) => {
    if (root.hidden || e.target.matches("input, select, textarea")) return;
    if (e.key === "ArrowRight") show(idx + 1);
    else if (e.key === "ArrowLeft") show(idx - 1);
    else if (e.key === " ") { e.preventDefault(); setPaused(!paused); }
    else if (e.key === "f" || e.key === "F") $("brbFull").click();
    else if (e.key === "Escape" && !linkMode && !document.fullscreenElement) close();
  });

  /* ---------- Abertura direta pelo link do OBS ---------- */

  (async () => {
    if (!location.hash.startsWith("#brb=")) return;
    try {
      const data = await decode(location.hash.slice(5));
      linkMode = true;
      state = normalize(data.s); // só em memória: nada é gravado no navegador do OBS
      if (["custom", "taDesc", "taAsc"].includes(data.o)) sortMode = data.o;
      cfg.secs = Number(data.secs) || cfg.secs;
      cfg.msg = String(data.msg || cfg.msg);
      cfg.transparent = !!data.t;
      document.body.classList.add("brb-link");
      root.classList.add("link");
      open();
    } catch (err) {
      toast("Link do Be right back inválido.", "error", 6000);
    }
  })();
})();
