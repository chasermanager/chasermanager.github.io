"use strict";

/* Personagens fixos: o id (1..25) define o nome e o retrato (img/<id>.webp). */
const NAMES = [
  "Elesis", "Lire", "Arme", "Lass", "Ryan", "Ronan", "Amy", "Jin", "Sieghart", "Mari",
  "Dio", "Zero", "Rey", "Lupus", "Lin", "Azin", "Holy", "Edel", "Veigas", "Decane",
  "Ai", "Kallia", "Uno", "Iris", "Ereb",
];
const SLOTS = NAMES.length;
const MAX_RUNES = 2;
const MAX_TITLES = 3;
const STORAGE_KEY = "chaser-manager-v1";
const SORT_KEY = "chaser-manager-sort";
const FORMAT_VERSION = 6;

const TA_YELLOW = 600000;
const TA_RED = 1000000;

// Pasta de cada tipo de imagem (as imagens são escolhidas dentro dessas pastas).
const FOLDERS = { titles: "titles", runes: "runes", pet: "pets" };
const IMG_RE = /\.(webp|png|jpe?g|gif|avif|svg)$/i;
const PROBE_EXTS = ["webp", "png"]; // plano B sem servidor: 1.webp, 1.png, 2.webp...

const portraitSrc = (id) => `img/${id}.webp`;
const folderSrc = (folder, file) => `${folder}/${encodeURI(file)}`;

/** Ícone do Chaser Level: pasta level/, arquivos Chase_1-99.webp, Chase_100-199.webp ... Chase_900-999.webp. */
function levelSrc(level) {
  level = Math.floor(Number(level));
  if (!(level >= 1)) return "";
  const h = Math.min(9, Math.floor(level / 100)); // acima de 999 usa o último ícone
  return `level/Chase_${h === 0 ? "1-99" : `${h}00-${h}99`}.webp`;
}
const iconSrc = (kind, file) => folderSrc(FOLDERS[kind], file);
const baseName = (file) => file.replace(/\.[^.]+$/, "");

const nameOf = (c) => NAMES[c.id - 1];
const MONTHS = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

/** TA abreviado: 523456 -> "523k", 1250000 -> "1,25M" (o valor exato continua na edição e no tooltip). */
function formatTA(n) {
  if (n < 1000) return String(n);
  if (n < 1e6) {
    const k = Math.round(n / 1000);
    if (k < 1000) return `${k}k`;
  }
  return `${String(Math.round(n / 1e4) / 100).replace(".", ",")}M`;
}

/** Mês e ano de hoje, ex.: "Março de 2026". */
function periodText() {
  const d = new Date();
  return `${MONTHS[d.getMonth()]} de ${d.getFullYear()}`;
}

const taClass = (ta) => (ta >= TA_RED ? "ta-red" : ta >= TA_YELLOW ? "ta-yellow" : "");

/* ---------- Cor de cada personagem (a mesma da planilha) ---------- */

// Mesma ordem de NAMES (por id). Ereb: azul marinho.
const COLORS = [
  "#d36363", "#f1c65e", "#996eae", "#e6eaf2", "#ef8536", "#676bd1", "#ea7fa4", "#c61d19", "#1f1f1f", // Elesis … Sieghart
  "#5c7cc0", "#ad4077", "#dcddc3", "#eb9bad", "#c09591", "#fdfbfa", "#d2c4e0", "#daf6b9",             // Mari … Holy
  "#d5cef8", "#732257", "#b2d2e3", "#5ed8f4", "#fedc54", "#2a282e", "#dbe8e4",                         // Edel … Iris
  "#1b2a5e",                                                                                           // Ereb
];

const MIN_ACCENT_L = 0.25; // luminância mínima da cor de destaque (borda/nome) no fundo escuro

const hexToRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const rgbToHex = (rgb) => "#" + rgb.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");

function luminance([r, g, b]) {
  const f = (v) => { const u = v / 255; return u <= 0.03928 ? u / 12.92 : ((u + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function rgbToHsl([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
  if (d === 0) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [(h * 60 + 360) % 360, s, l];
}

function hslToRgb([h, s, l]) {
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}

/** Cor de destaque: a própria cor; se for escura demais para o tema escuro, é clareada mantendo o matiz. */
function accentOf(hex) {
  const rgb = hexToRgb(hex);
  if (luminance(rgb) >= MIN_ACCENT_L) return hex;
  const [h, s, l0] = rgbToHsl(rgb);
  for (let l = l0; l <= 1; l += 0.01) {
    const out = hslToRgb([h, s, l]);
    if (luminance(out) >= MIN_ACCENT_L) return rgbToHex(out);
  }
  return "#ffffff";
}
const ACCENTS = COLORS.map(accentOf);

/** Cor do card: a escolhida pelo usuário (c.color) ou a padrão do personagem. */
const colorOf = (c) => c.color || COLORS[c.id - 1];
const accentFor = (c) => (c.color ? accentOf(c.color) : ACCENTS[c.id - 1]);
const toneStyle = (c) => `--ch:${colorOf(c)};--ch-accent:${accentFor(c)}`;

/* ---------- Modelo de dados ---------- */

const emptyTitle = () => ({ file: "", name: "" });

function emptyCharacter(id) {
  return {
    id,
    ta: 0,
    epic: false,                                               // Épica +17
    color: "",                                                 // "" = cor padrão do personagem
    runes: Array(MAX_RUNES).fill(""),                          // arquivos em runes/
    titles: Array.from({ length: MAX_TITLES }, emptyTitle),    // arquivo em titles/ OU nome
    pet: "",                                                   // arquivo em pets/
  };
}

function emptyState() {
  return {
    player: { name: "", chaserLevel: 0, cardCollectionLevel: 0, guildPoints: 0, showDate: true, main: 0 },
    characters: Array.from({ length: SLOTS }, (_, i) => emptyCharacter(i + 1)), // ordem = ordem exibida
  };
}

const toInt = (v) => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n > 0 ? n : 0;
};
const toStr = (v) => (v == null ? "" : String(v));

/** Nome de arquivo. Imagens embutidas (data:) de versões antigas são descartadas. */
const fileStr = (v) => (typeof v === "string" && !v.startsWith("data:") ? v.trim() : "");

function padRunes(list) {
  const out = (Array.isArray(list) ? list : []).slice(0, MAX_RUNES).map(fileStr);
  while (out.length < MAX_RUNES) out.push("");
  return out;
}

/** Título: ícone (arquivo em titles/) OU nome. O nome só vale quando não há imagem. */
function parseTitle(t) {
  if (typeof t === "string") return { file: fileStr(t), name: "" };
  if (t && typeof t === "object") {
    const file = fileStr(t.file);
    return { file, name: file ? "" : toStr(t.name) };
  }
  return emptyTitle();
}

function padTitles(list) {
  const out = (Array.isArray(list) ? list : []).slice(0, MAX_TITLES).map(parseTitle);
  while (out.length < MAX_TITLES) out.push(emptyTitle());
  return out;
}

function parseCharacter(id, c) {
  return {
    id,
    ta: toInt(c.ta ?? c.totalAttack), // aceita o nome antigo
    epic: c.epic === true || c.epic === "true",
    runes: padRunes(c.runes),
    titles: padTitles(c.titles),
    pet: fileStr(c.pet),
    color: /^#[0-9a-f]{6}$/i.test(toStr(c.color).trim()) ? toStr(c.color).trim().toLowerCase() : "",
  };
}

/** Converte qualquer objeto vindo de um arquivo em um estado válido. A ordem do arquivo é mantida. */
function normalize(raw) {
  if (!raw || typeof raw !== "object") throw new Error("Arquivo inválido.");
  const p = raw.player ?? {};
  const state = emptyState();

  state.player = {
    name: toStr(p.name),
    chaserLevel: toInt(p.chaserLevel),
    cardCollectionLevel: toInt(p.cardCollectionLevel),
    guildPoints: toInt(p.guildPoints),
    showDate: p.showDate !== false, // padrão: ligado. Mostra mês/ano (capturados na hora de gerar) no Player Card
    main: Number(p.main) >= 1 && Number(p.main) <= SLOTS ? Math.floor(Number(p.main)) : 0, // id do personagem principal
  };

  const seen = new Set();
  const list = [];
  (Array.isArray(raw.characters) ? raw.characters : []).forEach((c, i) => {
    if (!c || typeof c !== "object") return;
    let id = Number(c.id);
    if (!Number.isInteger(id) || id < 1 || id > SLOTS) {
      const byName = NAMES.findIndex((n) => n.toLowerCase() === toStr(c.name).trim().toLowerCase());
      id = byName >= 0 ? byName + 1 : i + 1; // arquivos sem id: usa a posição
    }
    if (id > SLOTS || seen.has(id)) return;
    seen.add(id);
    list.push(parseCharacter(id, c));
  });
  for (let id = 1; id <= SLOTS; id++) if (!seen.has(id)) list.push(emptyCharacter(id));

  state.characters = list;
  return state;
}

/** Formato do arquivo exportado (na ordem personalizada; runas e títulos vazios ficam de fora). */
function serialize(state) {
  return {
    version: FORMAT_VERSION,
    player: { ...state.player },
    characters: state.characters.map((c) => ({
      id: c.id,
      name: nameOf(c),
      ta: c.ta,
      epic: !!c.epic,
      ...(c.color ? { color: c.color } : {}),
      runes: c.runes.filter((r) => r !== ""),
      titles: c.titles.filter((t) => t.file || t.name.trim()).map((t) => ({ file: t.file, name: t.name })),
      pet: c.pet,
    })),
  };
}

/* ---------- Estado, ordenação e persistência ---------- */

const SORT_MODES = ["custom", "taDesc", "taAsc"];
let state = loadFromStorage();
let sortMode = loadSort();
let editing = 0; // id do personagem aberto na janela de edição (0 = nenhum)

function loadFromStorage() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return normalize(JSON.parse(saved));
  } catch (_) { /* começa vazio */ }
  return emptyState();
}

function saveToStorage() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(serialize(state)));
  } catch (_) {
    toast("Não foi possível salvar no navegador.", "error");
  }
}

function loadSort() {
  try {
    const s = localStorage.getItem(SORT_KEY);
    if (SORT_MODES.includes(s)) return s; // "name" (removido) cai no padrão
  } catch (_) { /* usa o padrão */ }
  return "custom";
}

function saveSort() {
  try { localStorage.setItem(SORT_KEY, sortMode); } catch (_) { /* ignora */ }
}

const charById = (id) => state.characters.find((c) => c.id === id);
const byName = (a, b) => nameOf(a).localeCompare(nameOf(b), "pt-BR"); // só desempata TAs iguais

/** Lista na ordem em que aparece na tela. */
function viewList() {
  const list = [...state.characters];
  if (sortMode === "taDesc") list.sort((a, b) => b.ta - a.ta || byName(a, b));
  else if (sortMode === "taAsc") list.sort((a, b) => a.ta - b.ta || byName(a, b));
  return list;
}

/* Acesso ao arquivo de cada tipo: kind = "runes" | "titles" | "pet" */
function getFile(c, kind, sub) {
  return kind === "pet" ? c.pet : kind === "runes" ? c.runes[sub] : c.titles[sub].file;
}
function setFile(c, kind, sub, file) {
  if (kind === "pet") c.pet = file;
  else if (kind === "runes") c.runes[sub] = file;
  else c.titles[sub] = { file, name: "" }; // escolher/remover imagem descarta o nome
}

/* ---------- DOM ---------- */

const $ = (id) => document.getElementById(id);
const grid = $("characters");
const modal = $("modal");
const modalBody = $("modalBody");
const picker = $("picker");
const pickerGrid = $("pickerGrid");
const toolbar = $("toolbar");
const playerFields = {
  name: $("playerName"),
  chaserLevel: $("chaserLevel"),
  cardCollectionLevel: $("cardCollectionLevel"),
  guildPoints: $("guildPoints"),
};

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));

/** Retrato fixo 80x80; se o arquivo não existir, mostra o número. */
function portraitHTML(id) {
  return `<div class="thumb ${charById(id)?.epic ? "epic" : ""}">
    <img src="${portraitSrc(id)}" width="80" height="80" alt="" draggable="false"
         onerror="this.hidden=true;this.nextElementSibling.hidden=false">
    <span hidden>${id}</span>
  </div>`;
}

/* ---------- Cards (lista principal) ---------- */

const imgTag = (src, w, h, alt = "") =>
  `<img src="${esc(src)}" width="${w}" height="${h}" alt="${esc(alt)}" draggable="false" onerror="this.remove()">`;

function runeBox(file, k) {
  const label = `Runa ${k + 1}`;
  const tip = file ? `${label}: ${baseName(file)}` : `${label} (vazia)`;
  return `<div class="rune ${file ? "filled" : ""}" data-tip="${esc(tip)}">${file ? imgTag(iconSrc("runes", file), 36, 39, baseName(file)) : ""}</div>`;
}

function titleBox(t, k) {
  const label = `Título ${k + 1}`;
  if (t.file) {
    const alt = baseName(t.file);
    return `<div class="title-box filled" data-tip="${esc(`${label}: ${alt}`)}">
      <img src="${iconSrc("titles", t.file)}" width="80" height="80" alt="${esc(alt)}" draggable="false"
           onerror="this.replaceWith(document.createTextNode(this.alt))"></div>`;
  }
  if (t.name.trim()) return `<div class="title-box filled" data-tip="${esc(label)}">${esc(t.name)}</div>`;
  return `<div class="title-box" data-tip="${label} (vazio)"></div>`;
}

function cardHTML(c) {
  const name = nameOf(c);
  const draggable = sortMode === "custom" ? 'draggable="true"' : "";
  const petTip = c.pet ? `Pet: ${baseName(c.pet)}` : "Pet (vazio)";
  const isMain = state.player.main === c.id;
  return `
  <article class="card ${isMain ? "main" : ""}" data-id="${c.id}" ${draggable} style="${toneStyle(c)}" tabindex="0" role="button" aria-label="Editar ${esc(name)}">
    ${isMain ? `<span class="main-badge" data-tip="Personagem principal">★ Principal</span>` : ""}
    ${rankBadgeHTML(c.id)}
    <div class="card-top">
      ${portraitHTML(c.id)}
      <div class="card-info">
        <div class="card-name">${esc(name)}</div>
        <div class="card-ta ${taClass(c.ta)}" data-tip="TA ${c.ta.toLocaleString("pt-BR")}"><span class="ta-label">TA</span><span class="ta-num ${formatTA(c.ta).length >= 5 ? "long" : ""}">${formatTA(c.ta)}</span></div>
        <div class="rune-row">${c.runes.map(runeBox).join("")}</div>
      </div>
      <div class="pet-box ${c.pet ? "filled" : ""}" data-tip="${esc(petTip)}">
        ${c.pet ? imgTag(iconSrc("pet", c.pet), 100, 100, baseName(c.pet)) : ""}
      </div>
    </div>
    <div class="title-row">${c.titles.map(titleBox).join("")}</div>
  </article>`;
}

function renderGrid() {
  hideTip();
  ranks = computeRanks();
  grid.innerHTML = viewList().map(cardHTML).join("");
  updateToolbar();
}

function render() {
  const p = state.player;
  Object.entries(playerFields).forEach(([key, el]) => { el.value = p[key]; });
  $("showDate").checked = p.showDate;
  renderLevelIcon();
  renderMainBtn();
  renderGrid();
}

function updateCard(id) {
  hideTip();
  const el = grid.querySelector(`.card[data-id="${id}"]`);
  if (el) el.outerHTML = cardHTML(charById(id));
}

function renderLevelIcon() {
  const img = $("levelIcon"), src = levelSrc(state.player.chaserLevel);
  img.hidden = !src;
  if (src && img.getAttribute("src") !== src) img.src = src;
  img.onerror = () => { img.hidden = true; };
  img.onload = () => { img.hidden = !src; };
}

// Jogador
Object.entries(playerFields).forEach(([key, el]) => {
  el.addEventListener("input", () => {
    state.player[key] = el.type === "number" ? toInt(el.value) : el.value;
    if (key === "chaserLevel") renderLevelIcon();
    saveToStorage();
  });
});

$("showDate").addEventListener("change", (e) => {
  state.player.showDate = e.target.checked;
  saveToStorage();
});

/* ---------- Ranking de TA (top 3 com estrela) ---------- */

const RANK_COLORS = ["#f2c230", "#c7ced9", "#cd7f32"]; // ouro, prata, bronze
const STAR = "M12 1.5l3.1 6.6 7.2.9-5.3 5 1.4 7.1L12 17.5l-6.4 3.6 1.4-7.1-5.3-5 7.2-.9z";
let ranks = {}; // id -> posição (só quem tem TA > 0)

function computeRanks() {
  const out = {};
  state.characters.filter((c) => c.ta > 0).sort((a, b) => b.ta - a.ta || byName(a, b)).forEach((c, i) => { out[c.id] = i + 1; });
  return out;
}

function rankBadgeHTML(id) {
  const r = ranks[id];
  if (!r) return "";
  const tip = `${r}º maior TA da conta`;
  if (r > 3) return `<span class="rank-badge" data-tip="${tip}">#${r}</span>`;
  return `<span class="rank-badge star" style="--rank:${RANK_COLORS[r - 1]}" data-tip="${tip}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="${STAR}"/><text x="12" y="15.4" text-anchor="middle">${r}</text></svg></span>`;
}

/** Recalcula as posições e troca só as etiquetas (usado enquanto o TA é digitado). */
function refreshRanks() {
  ranks = computeRanks();
  grid.querySelectorAll(".card").forEach((el) => {
    el.querySelector(".rank-badge")?.remove();
    el.insertAdjacentHTML("afterbegin", rankBadgeHTML(Number(el.dataset.id)));
  });
}

/* ---------- Ordenação ---------- */

function updateToolbar() {
  toolbar.querySelectorAll("[data-sort]").forEach((b) => {
    const on = b.dataset.sort === sortMode;
    b.classList.toggle("active", on);
    b.setAttribute("aria-pressed", String(on));
  });
  $("commitSort").hidden = sortMode === "custom";
  $("sortNote").textContent =
    sortMode === "custom"
      ? "Arraste um personagem sobre outro para reorganizar."
      : "Ordenação automática — sua ordem personalizada continua guardada.";
}

toolbar.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-sort]");
  if (!btn) return;
  sortMode = btn.dataset.sort;
  saveSort();
  renderGrid();
});

// Transforma a ordem atual da tela na ordem personalizada
$("commitSort").addEventListener("click", () => {
  state.characters = viewList();
  sortMode = "custom";
  saveToStorage();
  saveSort();
  renderGrid();
  toast("Ordem salva como personalizada.", "ok");
});

/* ---------- Arrastar para reorganizar ---------- */

let dragId = 0;
let overEl = null;

function moveCharacter(fromId, toId) {
  if (fromId === toId) return;
  const arr = state.characters;
  const from = arr.findIndex((c) => c.id === fromId);
  const to = arr.findIndex((c) => c.id === toId);
  if (from < 0 || to < 0) return;
  const [moved] = arr.splice(from, 1);
  arr.splice(to, 0, moved); // ocupa o lugar do personagem alvo
  saveToStorage();
  renderGrid();
}

function endDrag() {
  dragId = 0;
  overEl?.classList.remove("drop-target");
  overEl = null;
  grid.querySelectorAll(".dragging").forEach((el) => el.classList.remove("dragging"));
}

grid.addEventListener("dragstart", (e) => {
  const card = e.target.closest?.(".card");
  if (!card || sortMode !== "custom") { e.preventDefault(); return; }
  dragId = Number(card.dataset.id);
  e.dataTransfer.effectAllowed = "move";
  e.dataTransfer.setData("text/plain", String(dragId));
  requestAnimationFrame(() => card.classList.add("dragging"));
  hideTip();
});

grid.addEventListener("dragover", (e) => {
  if (!dragId) return;
  const card = e.target.closest(".card");
  if (!card) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = "move";
  if (card !== overEl) {
    overEl?.classList.remove("drop-target");
    overEl = Number(card.dataset.id) === dragId ? null : card;
    overEl?.classList.add("drop-target");
  }
});

grid.addEventListener("drop", (e) => {
  if (!dragId) return;
  e.preventDefault();
  const card = e.target.closest(".card");
  const from = dragId;
  endDrag();
  if (card) moveCharacter(from, Number(card.dataset.id));
});

grid.addEventListener("dragend", endDrag);

// Clique no personagem abre a edição
grid.addEventListener("click", (e) => {
  const card = e.target.closest(".card");
  if (card) openEditor(Number(card.dataset.id));
});
grid.addEventListener("keydown", (e) => {
  if (e.key !== "Enter" && e.key !== " ") return;
  const card = e.target.closest(".card");
  if (!card) return;
  e.preventDefault();
  openEditor(Number(card.dataset.id));
});

/* ---------- Janela de edição ---------- */

const SLOT_CLASS = { runes: "rune-slot", titles: "title-slot", pet: "pet-slot" };

// Slot de imagem: clicar abre o seletor com as imagens da pasta do tipo (runes/, titles/ ou pets/)
function slotHTML(kind, sub, label, file, text = "") {
  const has = file !== "";
  const tip = has ? `${label}: ${baseName(file)} (clique para trocar)` : `Clique para escolher a imagem: ${label}`;
  let inner = "+";
  if (has) {
    const alt = baseName(file);
    inner = `<img src="${iconSrc(kind, file)}" alt="${esc(alt)}" draggable="false" onerror="this.replaceWith(document.createTextNode(this.alt))">`;
  } else if (text) {
    inner = `<span class="slot-text">${esc(text)}</span>`;
  }
  return `
  <div class="img-slot ${SLOT_CLASS[kind]} ${has ? "has-image" : ""}" data-kind="${kind}" data-sub="${sub}">
    <button type="button" class="slot-btn" data-action="pick" data-tip="${esc(tip)}" aria-label="${esc(tip)}">${inner}</button>
    ${has ? `<button type="button" class="slot-remove" data-action="remove" data-tip="Remover imagem" aria-label="Remover imagem">×</button>` : ""}
  </div>`;
}

function captionCellHTML(kind, sub, label, file) {
  return `<div class="slot-cell">${slotHTML(kind, sub, label, file)}<span class="cap">${label}</span></div>`;
}

// Título: ícone da pasta titles/; o nome só pode ser digitado quando não há imagem
function titleCellHTML(sub, t) {
  const has = t.file !== "";
  return `
  <div class="title-cell">
    ${slotHTML("titles", sub, `Título ${sub + 1}`, t.file, t.name.trim())}
    <input type="text" data-field="titleName" data-sub="${sub}" maxlength="30"
           placeholder="${has ? "Com imagem" : "Nome"}" value="${esc(t.name)}" ${has ? "disabled" : ""}>
  </div>`;
}

function renderModal() {
  hideTip();
  const c = charById(editing);
  $("modalTitle").textContent = nameOf(c);
  modal.querySelector(".modal-box").style.cssText = toneStyle(c);
  if (hsvId !== c.id) { hsv = hexToHsv(colorOf(c)); hsvId = c.id; }

  modalBody.innerHTML = `
    <div class="char-head">
      ${portraitHTML(c.id)}
      <div class="char-fields">
        <label>TA
          <input type="number" min="0" step="1" data-field="ta" value="${c.ta}" class="${taClass(c.ta)}">
        </label>
        <label class="check"><input type="checkbox" data-field="epic" ${c.epic ? "checked" : ""}> Épica +17</label>
      </div>
    </div>

    <section>
      <h3>Runas (até ${MAX_RUNES})</h3>
      <div class="slot-row">${c.runes.map((f, k) => captionCellHTML("runes", k, `Runa ${k + 1}`, f)).join("")}</div>
    </section>

    <section>
      <h3>Títulos (até ${MAX_TITLES})</h3>
      <div class="title-grid">${c.titles.map((t, k) => titleCellHTML(k, t)).join("")}</div>
    </section>

    <section>
      <h3>Pet</h3>
      <div class="pet-row">${captionCellHTML("pet", 0, "Pet", c.pet)}</div>
    </section>

    ${colorSectionHTML()}`;

  $("cpWheel").querySelector("canvas").getContext("2d").drawImage(wheelCanvas(), 0, 0);
  syncPicker();
}

/* ---------- Cor do card (roda de cores + brilho) ---------- */

let hsv = { h: 0, s: 0, v: 1 }; // h 0-360, s e v 0-1
let hsvId = 0;                  // personagem a que o hsv atual se refere
let wheelCache = null;

function hsvToRgb(h, s, v) {
  const f = (n) => { const k = (n + h / 60) % 6; return (v - v * s * Math.max(0, Math.min(k, 4 - k, 1))) * 255; };
  return [f(5), f(3), f(1)];
}
const hsvToHex = (h, s, v) => rgbToHex(hsvToRgb(h, s, v));

function hexToHsv(hex) {
  const [r, g, b] = hexToRgb(hex).map((x) => x / 255);
  const max = Math.max(r, g, b), d = max - Math.min(r, g, b);
  let h = 0;
  if (d) h = (max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4) * 60;
  return { h: (h + 360) % 360, s: max ? d / max : 0, v: max };
}

/** Roda de matiz (ângulo) e saturação (raio), desenhada uma vez. */
function wheelCanvas() {
  if (wheelCache) return wheelCache;
  const S = 360, R = S / 2;
  const cv = document.createElement("canvas");
  cv.width = cv.height = S;
  const ctx = cv.getContext("2d");
  const img = ctx.createImageData(S, S);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const dx = x + 0.5 - R, dy = y + 0.5 - R, d = Math.hypot(dx, dy);
      if (d > R) continue;
      const h = (Math.atan2(dy, dx) * 180 / Math.PI + 360) % 360;
      const [r, g, b] = hsvToRgb(h, Math.min(d / R, 1), 1);
      const i = (y * S + x) * 4;
      img.data[i] = r; img.data[i + 1] = g; img.data[i + 2] = b;
      img.data[i + 3] = (R - d) * 255; // borda suave
    }
  }
  ctx.putImageData(img, 0, 0);
  return (wheelCache = cv);
}

let cpOpen = false; // seletor de cor visível?

function colorSectionHTML() {
  return `
    <section>
      <button type="button" class="btn cp-toggle ${cpOpen ? "active" : ""}" data-cp="toggle" aria-expanded="${cpOpen}">
        <span class="cp-chip" id="cpChip"></span>Card Color
      </button>
      <div class="cp" id="cpPanel" ${cpOpen ? "" : "hidden"}>
        <div class="cp-wheel" id="cpWheel"><canvas width="360" height="360"></canvas><span class="cp-dot" id="cpDot"></span></div>
        <div class="cp-side">
          <label>Brilho
            <input type="range" class="cp-range" id="cpValue" data-cp="value" min="0" max="100" step="1">
          </label>
          <div class="cp-row">
            <span class="cp-swatch" id="cpSwatch"></span>
            <input type="text" id="cpHex" data-cp="hex" maxlength="7" spellcheck="false" autocomplete="off" aria-label="Cor em hexadecimal">
            <button type="button" class="btn small" data-cp="reset">Cor original</button>
          </div>
        </div>
      </div>
    </section>`;
}

function syncPicker() {
  if (!$("cpWheel")) return;
  const rad = hsv.h * Math.PI / 180;
  const dot = $("cpDot");
  dot.style.left = `${50 + Math.cos(rad) * hsv.s * 50}%`;
  dot.style.top = `${50 + Math.sin(rad) * hsv.s * 50}%`;
  const range = $("cpValue");
  range.value = Math.round(hsv.v * 100);
  range.style.setProperty("--cp-top", hsvToHex(hsv.h, hsv.s, 1));
  const hex = hsvToHex(hsv.h, hsv.s, hsv.v);
  $("cpSwatch").style.background = hex;
  $("cpChip").style.background = hex;
  if (document.activeElement !== $("cpHex")) $("cpHex").value = hex;
}

/** Grava a cor escolhida e atualiza o card e a janela na hora. */
function applyColor(color) {
  const c = charById(editing);
  if (!c) return;
  c.color = color;
  modal.querySelector(".modal-box").style.cssText = toneStyle(c);
  updateCard(editing);
  saveToStorage();
  syncPicker();
}
const applyHsv = () => applyColor(hsvToHex(hsv.h, hsv.s, hsv.v));

let wheelDrag = false;
function wheelPick(e) {
  const r = $("cpWheel").getBoundingClientRect(), R = r.width / 2;
  const dx = e.clientX - r.left - R, dy = e.clientY - r.top - R;
  hsv.h = (Math.atan2(dy, dx) * 180 / Math.PI + 360) % 360;
  hsv.s = Math.min(Math.hypot(dx, dy) / R, 1);
  applyHsv();
}
modalBody.addEventListener("pointerdown", (e) => {
  const wheel = e.target.closest("#cpWheel");
  if (!wheel) return;
  e.preventDefault();
  $("cpHex").blur();
  wheel.setPointerCapture(e.pointerId);
  wheelDrag = true;
  wheelPick(e);
});
modalBody.addEventListener("pointermove", (e) => { if (wheelDrag) wheelPick(e); });
["pointerup", "pointercancel"].forEach((ev) => modalBody.addEventListener(ev, () => { wheelDrag = false; }));

modalBody.addEventListener("input", (e) => {
  const kind = e.target.dataset.cp;
  if (kind === "value") {
    hsv.v = Number(e.target.value) / 100;
    applyHsv();
  } else if (kind === "hex") {
    const m = /^#?([0-9a-f]{6})$/i.exec(e.target.value.trim());
    if (!m) return;
    hsv = hexToHsv(`#${m[1].toLowerCase()}`);
    applyHsv();
  }
});
modalBody.addEventListener("focusout", (e) => { if (e.target.id === "cpHex") syncPicker(); });
modalBody.addEventListener("click", (e) => {
  const toggle = e.target.closest('[data-cp="toggle"]');
  if (toggle) {
    cpOpen = !cpOpen;
    $("cpPanel").hidden = !cpOpen;
    toggle.classList.toggle("active", cpOpen);
    toggle.setAttribute("aria-expanded", String(cpOpen));
    return;
  }
  if (!e.target.closest('[data-cp="reset"]')) return;
  const c = charById(editing);
  hsv = hexToHsv(COLORS[c.id - 1]);
  applyColor("");
});

function openEditor(id) {
  closePicker();
  editing = id;
  hsvId = 0;
  cpOpen = false;
  modal.hidden = false;
  document.body.style.overflow = "hidden";
  renderModal();
}

function closeEditor() {
  closePicker();
  modal.hidden = true;
  editing = 0;
  hsvId = 0;
  document.body.style.overflow = "";
  hideTip();
  if (sortMode !== "custom") renderGrid(); // reaplica a ordenação com os valores novos
}

$("modalClose").addEventListener("click", closeEditor);
modal.addEventListener("mousedown", (e) => { if (e.target === modal) closeEditor(); });
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  if (!$("ad").hidden) closeAd();
  else if (!$("folderPrompt").hidden) $("folderSkip").click();
  else if (!mainPicker.hidden) closeMainPicker();
  else if (!picker.hidden) closePicker();
  else if (!modal.hidden) closeEditor();
});

// Campos de texto / número
modalBody.addEventListener("input", (e) => {
  const field = e.target.dataset.field;
  if (!field || !editing) return;
  const c = charById(editing);

  if (field === "epic") return; // tratado no evento "change"
  if (field === "ta") {
    c.ta = toInt(e.target.value);
    e.target.className = taClass(c.ta);
  } else if (field === "titleName") {
    c.titles[Number(e.target.dataset.sub)].name = e.target.value;
  }
  updateCard(editing);
  if (field === "ta") refreshRanks();
  saveToStorage();
});

modalBody.addEventListener("change", (e) => {
  if (e.target.dataset.field !== "epic" || !editing) return;
  const c = charById(editing);
  c.epic = e.target.checked;
  modalBody.querySelector(".char-head .thumb").classList.toggle("epic", c.epic);
  saveToStorage();
  updateCard(editing);
  renderMainBtn();
});

modalBody.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-action]");
  const slot = e.target.closest(".img-slot");
  if (!btn || !slot) return;

  const kind = slot.dataset.kind;
  const sub = Number(slot.dataset.sub);
  if (btn.dataset.action === "pick") {
    openPicker(kind, sub);
  } else if (btn.dataset.action === "remove") {
    setFile(charById(editing), kind, sub, "");
    afterChange(editing);
  }
});

function afterChange(id) {
  saveToStorage();
  updateCard(id);
  if (editing === id) renderModal();
}

/* ---------- Personagem principal (botão + retratos com nome) ---------- */

const mainPicker = $("mainPicker");

function renderMainBtn() {
  const id = state.player.main;
  $("mainBtn").textContent = id ? `Main: ${NAMES[id - 1]}` : "Main";
  $("mainThumb").innerHTML = id ? portraitHTML(id) : "";
}

function openMainPicker() {
  $("mainPickerGrid").innerHTML = NAMES.map((name, i) => {
    const id = i + 1;
    return `<button type="button" class="char-pick ${state.player.main === id ? "active" : ""}" data-id="${id}" style="${toneStyle(charById(id))}">
      ${portraitHTML(id)}<span>${esc(name)}</span></button>`;
  }).join("");
  mainPicker.hidden = false;
}

function closeMainPicker() {
  mainPicker.hidden = true;
}

function setMain(id) {
  state.player.main = id;
  saveToStorage();
  renderMainBtn();
  renderGrid();
  closeMainPicker();
}

$("mainBtn").addEventListener("click", openMainPicker);
$("mainPickerGrid").addEventListener("click", (e) => {
  const btn = e.target.closest(".char-pick");
  if (btn) setMain(state.player.main === Number(btn.dataset.id) ? 0 : Number(btn.dataset.id)); // clicar de novo desmarca
});
$("mainPickerClear").addEventListener("click", () => setMain(0));
$("mainPickerClose").addEventListener("click", closeMainPicker);
mainPicker.addEventListener("mousedown", (e) => { if (e.target === mainPicker) closeMainPicker(); });

/* ---------- Acesso à pasta do app (abrindo o index.html direto, sem servidor) ---------- */
/* Em file:// o navegador não lista pastas nem deixa o canvas exportar imagens carregadas por caminho.
   Solução sem servidor: o usuário escolhe a pasta do app uma vez (Chrome/Edge) e o app lê as imagens dela.
   A escolha fica guardada; em visitas seguintes o navegador só pede para confirmar o acesso. */

let localDir = null;

const idbOpen = () => new Promise((resolve, reject) => {
  const req = indexedDB.open("chaser-manager-fs", 1);
  req.onupgradeneeded = () => req.result.createObjectStore("h");
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
});
async function idbGetDir() {
  try {
    const db = await idbOpen();
    return await new Promise((resolve) => {
      const q = db.transaction("h").objectStore("h").get("dir");
      q.onsuccess = () => resolve(q.result || null);
      q.onerror = () => resolve(null);
    });
  } catch (_) { return null; }
}
async function idbSetDir(handle) {
  try {
    const db = await idbOpen();
    db.transaction("h", "readwrite").objectStore("h").put(handle, "dir");
  } catch (_) { /* sem memória: pede de novo na próxima vez */ }
}

/** true se a pasta do app está disponível. Só faz algo em file://; chamar direto de um clique. */
async function ensureLocalDir() {
  if (localDir) return true;
  if (location.protocol !== "file:" || !window.showDirectoryPicker) return false;
  try {
    const saved = await idbGetDir();
    if (saved && ((await saved.queryPermission({ mode: "read" })) === "granted" ||
                  (await saved.requestPermission({ mode: "read" })) === "granted")) {
      localDir = saved;
      return true;
    }
  } catch (_) { /* escolhe de novo */ }
  toast("Selecione a pasta do Chaser Manager (a que contém o index.html).", "", 6000);
  try {
    localDir = await window.showDirectoryPicker({ id: "chaser-manager", mode: "read" });
    idbSetDir(localDir);
    return true;
  } catch (_) {
    return false; // cancelou
  }
}

async function readLocalFile(src) {
  try {
    const parts = decodeURI(src).split("/").filter(Boolean);
    const name = parts.pop();
    let dir = localDir;
    for (const part of parts) dir = await dir.getDirectoryHandle(part);
    return await (await dir.getFileHandle(name)).getFile();
  } catch (_) {
    return null;
  }
}

/** Lista as imagens de uma subpasta (titles/, runes/ ou pets/) pela pasta escolhida, qualquer nome. */
async function listFromLocalDir(folder) {
  try {
    const dir = await localDir.getDirectoryHandle(folder);
    const names = [];
    for await (const [name, handle] of dir.entries()) {
      if (handle.kind === "file" && IMG_RE.test(name)) names.push(name);
    }
    return names;
  } catch (_) {
    return [];
  }
}

/* ---------- Seletor de imagens (pastas titles/, runes/ e pets/) ---------- */

let pickTarget = null; // { kind, sub }
let pickToken = 0;     // invalida a busca em andamento se o seletor for fechado

/** Lê a listagem de diretório que o servidor devolve para "<pasta>/" (python -m http.server, Live Server, Apache, nginx...). */
async function listFromDirectory(folder) {
  try {
    const res = await fetch(`${folder}/`, { cache: "no-store" });
    if (!res.ok) return [];
    const doc = new DOMParser().parseFromString(await res.text(), "text/html");
    const names = [...doc.querySelectorAll("a[href]")]
      .map((a) => {
        try { return decodeURIComponent(a.getAttribute("href").split(/[?#]/)[0]).split("/").pop(); }
        catch (_) { return ""; }
      })
      .filter((n) => IMG_RE.test(n));
    return [...new Set(names)];
  } catch (_) {
    return [];
  }
}

const imageExists = (src) =>
  new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);
    img.src = src;
  });

/** Último recurso (sem servidor e sem a pasta escolhida): procura 1.webp, 1.png, 2.webp, 2.png... */
async function probeNumbered(folder) {
  const found = [];
  let misses = 0;
  for (let n = 1; n <= 500 && misses < 10; n++) {
    let hit = "";
    for (const ext of PROBE_EXTS) {
      const file = `${n}.${ext}`;
      if (await imageExists(folderSrc(folder, file))) { hit = file; break; }
    }
    if (hit) { found.push(hit); misses = 0; }
    else misses++;
  }
  return found;
}

async function listImages(folder) {
  let files = await listFromDirectory(folder);                // servidor com listagem de pasta
  if (!files.length && localDir) files = await listFromLocalDir(folder); // file:// com a pasta escolhida
  if (!files.length) files = await probeNumbered(folder);     // 1.webp, 2.webp...
  return files.sort((a, b) => a.localeCompare(b, "pt-BR", { numeric: true }));
}

const pickerLabel = (kind, sub) => (kind === "pet" ? "Pet" : kind === "runes" ? `Runa ${sub + 1}` : `Título ${sub + 1}`);

async function openPicker(kind, sub) {
  await ensureLocalDir(); // só age em file://; precisa ser a primeira coisa do clique
  pickTarget = { kind, sub };
  const token = ++pickToken;
  const folder = FOLDERS[kind];
  const current = getFile(charById(editing), kind, sub);
  $("pickerTitle").textContent = pickerLabel(kind, sub);
  pickerGrid.dataset.kind = kind;
  picker.dataset.kind = kind; // o seletor de pets é mais largo (CSS)
  pickerGrid.innerHTML = `<p class="hint">Carregando…</p>`;
  const search = $("pickerSearch");
  search.hidden = kind !== "pet"; // só os pets têm busca por nome
  search.value = "";
  picker.hidden = false;
  if (kind === "pet") search.focus();

  const files = await listImages(folder);
  if (token !== pickToken) return; // seletor foi fechado enquanto buscava

  pickerGrid.innerHTML = files.length
    ? files.map((f) => `
        <button type="button" class="icon-btn ${f === current ? "active" : ""}" data-file="${esc(f)}" data-tip="${esc(baseName(f))}">
          <span class="icon-img"><img src="${folderSrc(folder, f)}" alt="" draggable="false" onerror="this.remove()"></span>
          <span class="icon-name">${esc(baseName(f))}</span>
        </button>`).join("")
    : `<p class="hint">Nenhuma imagem encontrada na pasta <code>${folder}</code>. Use Chrome ou Edge e escolha a pasta do app para listar todas as imagens, com qualquer nome.</p>`;
  if (files.length) pickerGrid.insertAdjacentHTML("beforeend", `<p class="hint" id="pickerNoMatch" hidden>Nenhuma imagem com esse nome.</p>`);
}

$("pickerSearch").addEventListener("input", (e) => {
  const q = e.target.value.trim().toLowerCase();
  let shown = 0;
  pickerGrid.querySelectorAll(".icon-btn").forEach((b) => {
    const hit = !q || baseName(b.dataset.file).toLowerCase().includes(q);
    b.hidden = !hit;
    if (hit) shown++;
  });
  const none = $("pickerNoMatch");
  if (none) none.hidden = shown > 0;
});

function closePicker() {
  pickToken++;
  picker.hidden = true;
  pickTarget = null;
  hideTip();
}

function chooseFile(file) {
  if (!pickTarget || !editing) return;
  const { kind, sub } = pickTarget;
  closePicker();
  setFile(charById(editing), kind, sub, file);
  afterChange(editing);
}

pickerGrid.addEventListener("click", (e) => {
  const btn = e.target.closest(".icon-btn");
  if (btn) chooseFile(btn.dataset.file);
});
$("pickerClear").addEventListener("click", () => chooseFile(""));
$("pickerClose").addEventListener("click", closePicker);
picker.addEventListener("mousedown", (e) => { if (e.target === picker) closePicker(); });

/* ---------- Importar / Exportar ---------- */

async function importFile(file) {
  if (!file) return;
  try {
    state = normalize(JSON.parse(await file.text()));
    saveToStorage();
    render();
    toast(`"${file.name}" importado.`, "ok");
  } catch (err) {
    toast(err instanceof SyntaxError ? "O arquivo não é um JSON válido." : err.message, "error");
  }
}

$("importInput").addEventListener("change", (e) => {
  importFile(e.target.files[0]);
  e.target.value = "";
});

const safeName = () => (state.player.name || "chaser").replace(/[^\w-]+/g, "_");
const periodSuffix = () => {
  const d = new Date();
  return state.player.showDate ? `-${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}` : "";
};

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

$("exportBtn").addEventListener("click", () => {
  const json = JSON.stringify(serialize(state), null, 2);
  downloadBlob(new Blob([json], { type: "application/json" }), `${safeName()}-${localDay()}.json`);
  toast("Arquivo exportado.", "ok");
});

$("resetBtn").addEventListener("click", () => {
  if (!confirm("Apagar todos os dados atuais (inclusive a ordem)?")) return;
  state = emptyState();
  saveToStorage();
  render();
});

// Arrastar o .json para a área do jogador
const dropZone = $("dropZone");
const hasFiles = (e) => e.dataTransfer && e.dataTransfer.types.includes("Files");
["dragenter", "dragover"].forEach((ev) =>
  dropZone.addEventListener(ev, (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    dropZone.classList.add("dragover");
  })
);
["dragleave", "drop"].forEach((ev) =>
  dropZone.addEventListener(ev, (e) => {
    if (!hasFiles(e) && ev === "dragleave") return;
    e.preventDefault();
    dropZone.classList.remove("dragover");
  })
);
dropZone.addEventListener("drop", (e) => {
  if (hasFiles(e)) importFile(e.dataTransfer.files[0]);
});

/* ---------- Tooltip ---------- */

const tooltip = $("tooltip");

function showTip(el) {
  tooltip.textContent = el.dataset.tip;
  tooltip.classList.add("show");
  const r = el.getBoundingClientRect();
  const t = tooltip.getBoundingClientRect();
  const left = Math.min(Math.max(8, r.left + r.width / 2 - t.width / 2), window.innerWidth - t.width - 8);
  let top = r.top - t.height - 8;
  if (top < 8) top = r.bottom + 8;
  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${top}px`;
}
function hideTip() {
  tooltip.classList.remove("show");
}

document.addEventListener("mouseover", (e) => {
  const el = e.target.closest("[data-tip]");
  if (el) showTip(el);
});
document.addEventListener("mouseout", (e) => {
  const el = e.target.closest("[data-tip]");
  if (el && !el.contains(e.relatedTarget)) hideTip();
});

/* ---------- Player Card (imagem PNG) ---------- */

// Mesmas medidas dos cards da tela: retrato 80, runa 36x39, título 80 (3), pet 100.
// No Player Card as linhas alternam 5 e 4 cards (centralizados), para não parecer um calendário.
const PC = {
  cols: 5, cardW: 290, cardH: 209, gap: 20, rowGap: 32, margin: 24, headerH: 120, headerGap: 14, scale: 1.5,
  font: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
};
const PC_COL = {
  bg: "#14161c", panel: "#1d2029", border: "#343949", text: "#e8eaf0", muted: "#9aa1b5",
  yellow: "#f5c542", red: "#ff5a5a", accent: "#6c8cff",
};

const mixHex = (a, b, t) => {
  const A = hexToRgb(a), B = hexToRgb(b);
  return rgbToHex(A.map((v, i) => v * t + B[i] * (1 - t)));
};

function pcPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function pcBox(ctx, x, y, w, h, r, { fill, stroke, dashed } = {}) {
  if (fill) { pcPath(ctx, x, y, w, h, r); ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) {
    pcPath(ctx, x + 0.5, y + 0.5, w - 1, h - 1, Math.max(0, r - 0.5));
    ctx.setLineDash(dashed ? [4, 3] : []);
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

function pcImage(ctx, img, x, y, w, h, r) {
  ctx.save();
  pcPath(ctx, x, y, w, h, r);
  ctx.clip();
  ctx.drawImage(img, x, y, w, h);
  ctx.restore();
}

/** Corta o texto com "…" se passar da largura. */
function pcFit(ctx, text, maxW) {
  if (ctx.measureText(text).width <= maxW) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(t + "…").width > maxW) t = t.slice(0, -1);
  return t + "…";
}

/** Quebra o texto em linhas (inclusive palavras longas demais). */
function pcWrap(ctx, text, maxW) {
  const lines = [];
  let cur = "";
  const flush = () => { if (cur) lines.push(cur); cur = ""; };
  for (const word of text.split(/\s+/).filter(Boolean)) {
    let w = word;
    while (w.length > 1 && ctx.measureText(w).width > maxW) {
      let n = w.length;
      while (n > 1 && ctx.measureText(w.slice(0, n)).width > maxW) n--;
      flush();
      lines.push(w.slice(0, n));
      w = w.slice(n);
    }
    const test = cur ? `${cur} ${w}` : w;
    if (cur && ctx.measureText(test).width > maxW) { flush(); cur = w; } else cur = test;
  }
  flush();
  return lines;
}

/** Slot de imagem: com imagem, com texto (nome do título) ou vazio (tracejado). `outline` contorna o slot preenchido, por fora. */
function pcSlot(ctx, x, y, w, h, r, img, text = "", outline = "") {
  if (img) {
    pcImage(ctx, img, x, y, w, h, r);
    pcBox(ctx, x, y, w, h, r, { stroke: PC_COL.border });
  } else if (text) {
    pcBox(ctx, x, y, w, h, r, { stroke: PC_COL.border });
    ctx.font = `500 11.5px ${PC.font}`;
    ctx.fillStyle = PC_COL.text;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    const lines = pcWrap(ctx, text, w - 10).slice(0, 5);
    const top = y + (h - lines.length * 14) / 2;
    lines.forEach((ln, i) => ctx.fillText(ln, x + w / 2, top + i * 14));
    ctx.textAlign = "left";
  } else {
    pcBox(ctx, x, y, w, h, r, { stroke: PC_COL.border, dashed: true });
    return;
  }
  if (outline) {
    pcPath(ctx, x - 1, y - 1, w + 2, h + 2, r + 1);
    ctx.strokeStyle = outline;
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}

/** Etiqueta "★ PRINCIPAL" sobre a borda superior do card. */
function pcPill(ctx, text, x, y, color) {
  ctx.font = `700 10.5px ${PC.font}`;
  const w = ctx.measureText(text).width + 16;
  pcBox(ctx, x, y, w, 18, 9, { fill: color });
  ctx.fillStyle = "#111";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(text, x + 8, y + 9.5);
}

const STAR_PATH = new Path2D(STAR);

/** Estrela ouro/prata/bronze (top 3) ou "#N" sobre a borda superior direita do card. */
function pcRank(ctx, r, x, y, W) {
  ctx.save();
  if (r <= 3) {
    const size = 30;
    ctx.translate(x + W + 6 - size, y - 16);
    ctx.scale(size / 24, size / 24);
    ctx.fillStyle = RANK_COLORS[r - 1];
    ctx.fill(STAR_PATH);
    ctx.lineJoin = "round";
    ctx.lineWidth = 0.8;
    ctx.strokeStyle = "rgba(0,0,0,.55)";
    ctx.stroke(STAR_PATH);
    ctx.fillStyle = "#111";
    ctx.font = `800 9.5px ${PC.font}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(String(r), 12, 15.4);
  } else {
    const text = `#${r}`;
    ctx.font = `700 11.2px ${PC.font}`;
    const w = Math.max(22, ctx.measureText(text).width + 14);
    const bx = x + W - 12 - w, by = y - 11;
    pcBox(ctx, bx, by, w, 22, 11, { fill: "#262a36" });
    pcBox(ctx, bx, by, w, 22, 11, { stroke: PC_COL.border });
    ctx.fillStyle = PC_COL.muted;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, bx + w / 2, by + 11.5);
  }
  ctx.restore();
}

/** phase (0..1, opcional): só nos GIFs — faz o brilho do card épico pulsar. Sem phase, a imagem é estática. */
function pcCard(ctx, it, x, y, phase) {
  const { c } = it;
  const W = PC.cardW, H = PC.cardH;
  const CW = W - 18; // largura útil: borda 1px + padding 8px de cada lado
  const tone = colorOf(c), accent = accentFor(c);
  const isMain = state.player.main === c.id;

  // fundo tingido, borda e faixa superior na cor do personagem
  pcBox(ctx, x, y, W, H, 10, { fill: mixHex(tone, PC_COL.panel, 0.14) });
  pcBox(ctx, x, y, W, H, 10, { stroke: isMain ? accent : mixHex(accent, PC_COL.border, 0.55) });
  ctx.save();
  pcPath(ctx, x, y, W, H, 10);
  ctx.clip();
  ctx.fillStyle = accent;
  ctx.fillRect(x, y, W, c.epic ? 6 : 4); // épica: faixa superior 2px mais grossa
  ctx.restore();

  if (c.epic) { // épica: linha dupla à esquerda, à direita e embaixo (o topo não duplica)
    const m = 4, r = 7, top = y + 7;
    ctx.save();
    pcPath(ctx, x, y, W, H, 10);
    ctx.clip();
    ctx.beginPath();
    ctx.moveTo(x + m, top);
    ctx.lineTo(x + m, y + H - m - r);
    ctx.arcTo(x + m, y + H - m, x + m + r, y + H - m, r);
    ctx.lineTo(x + W - m - r, y + H - m);
    ctx.arcTo(x + W - m, y + H - m, x + W - m, y + H - m - r, r);
    ctx.lineTo(x + W - m, top);
    ctx.strokeStyle = accent;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
  }

  const cx = x + 9, cy = y + 12; // início do conteúdo (borda 1px + padding 8; topo: faixa 4px + padding 8)

  if (c.epic && phase != null) { // GIF: halo pulsando em volta do retrato (igual à tela: só por fora), recortado ao card
    const k = 0.5 + 0.5 * Math.sin(phase * 2 * Math.PI); // 0..1
    ctx.save();
    pcPath(ctx, x, y, W, H, 10);
    ctx.clip();
    ctx.shadowColor = accent;
    for (const [blur, lw, alpha] of [[8 + 6 * k, 2 + k, 0.55 + 0.45 * k], [16 + 12 * k, 3 + 2 * k, 0.3 + 0.7 * k]]) {
      ctx.shadowBlur = blur;
      ctx.lineWidth = lw;
      ctx.globalAlpha = alpha;
      pcPath(ctx, cx - 1, cy - 1, 82, 82, 9);
      ctx.strokeStyle = accent;
      ctx.stroke();
    }
    ctx.restore();
    pcBox(ctx, cx, cy, 80, 80, 8, { fill: mixHex(tone, PC_COL.panel, 0.14) }); // apaga o brilho que entrou no retrato
  }

  // retrato 80x80
  if (it.portrait) pcImage(ctx, it.portrait, cx, cy, 80, 80, 8);
  else {
    ctx.font = `600 16px ${PC.font}`;
    ctx.fillStyle = PC_COL.muted;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(c.id), cx + 40, cy + 40);
    ctx.textAlign = "left";
  }
  pcBox(ctx, cx, cy, 80, 80, 8, { stroke: c.epic && phase != null ? accent : PC_COL.border }); // épica no GIF: borda sempre na cor
  // nome
  const ix = cx + 88, infoW = CW - 88 - 108;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.font = `600 15.2px ${PC.font}`;
  ctx.fillStyle = accent;
  ctx.fillText(pcFit(ctx, nameOf(c), infoW), ix, cy + 3);

  // TA abreviado (500k) com número grande
  const taColor = c.ta >= TA_RED ? PC_COL.red : c.ta >= TA_YELLOW ? PC_COL.yellow : PC_COL.muted;
  ctx.textBaseline = "alphabetic";
  ctx.font = `600 12px ${PC.font}`;
  ctx.fillStyle = taColor;
  ctx.fillText("TA", ix, cy + 46);
  const labelW = ctx.measureText("TA").width + 4;
  const taText = formatTA(c.ta);
  let taSize = 22.4;
  ctx.font = `700 ${taSize}px ${PC.font}`;
  while (taSize > 14 && labelW + ctx.measureText(taText).width > infoW) { taSize -= 0.8; ctx.font = `700 ${taSize}px ${PC.font}`; }
  ctx.fillText(taText, ix + labelW, cy + 46);
  ctx.textBaseline = "top";

  // runas 36x39
  it.runes.forEach((img, i) => pcSlot(ctx, ix + i * 40, cy + 54, 36, 39, 5, img));

  // pet 100x100
  pcSlot(ctx, cx + CW - 100, cy, 100, 100, 8, it.pet);

  // títulos 80x80 (ícone, ou o nome quando não há imagem), distribuídos na largura do card
  const tg = (CW - MAX_TITLES * 80) / (MAX_TITLES - 1);
  c.titles.forEach((t, i) => pcSlot(ctx, cx + i * (80 + tg), cy + 108, 80, 80, 8, it.titles[i], t.name.trim(), accent));

  if (isMain) pcPill(ctx, "★ PRINCIPAL", x + 12, y - 9, accent);
  if (ranks[c.id]) pcRank(ctx, ranks[c.id], x, y, W);
}

function pcHeader(ctx, x, y, w, h, main, levelImg) {
  pcBox(ctx, x, y, w, h, 10, { fill: PC_COL.panel });
  pcBox(ctx, x, y, w, h, 10, { stroke: PC_COL.border });
  ctx.save();
  pcPath(ctx, x, y, w, h, 10);
  ctx.clip();
  ctx.fillStyle = PC_COL.accent;
  ctx.fillRect(x, y, w, 4);
  ctx.restore();

  const p = state.player;
  const stats = [
    ["Chaser Level", p.chaserLevel],
    ["Card Collection Level", p.cardCollectionLevel],
    ["Guild Points", p.guildPoints],
  ];
  const statW = 190, statGap = 20, statsW = stats.length * statW + (stats.length - 1) * statGap;
  const sx = x + w - 24 - statsW;

  // personagem principal (à esquerda dos números)
  const MW = 232;
  const mx = sx - 32 - MW;
  let nameRight = sx - 24;
  if (main) {
    nameRight = mx - 28;
    const { c, portrait } = main;
    const accent = accentFor(c);
    ctx.fillStyle = PC_COL.border;
    ctx.fillRect(mx - 14, y + 28, 1, h - 52);

    if (portrait) pcImage(ctx, portrait, mx, y + 24, 72, 72, 8);
    pcBox(ctx, mx, y + 24, 72, 72, 8, { stroke: accent });

    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.font = `600 11px ${PC.font}`;
    ctx.fillStyle = PC_COL.muted;
    ctx.fillText("MAIN", mx + 84, y + 36);
    ctx.font = `700 24px ${PC.font}`;
    ctx.fillStyle = accent;
    ctx.fillText(pcFit(ctx, nameOf(c), MW - 84), mx + 84, y + 54);
  }

  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.font = `600 12px ${PC.font}`;
  ctx.fillStyle = PC_COL.muted;
  ctx.fillText("PLAYER CARD", x + 24, y + 22);
  const period = p.showDate ? periodText() : "";
  if (period) {
    const lw = ctx.measureText("PLAYER CARD").width;
    ctx.font = `700 13px ${PC.font}`;
    ctx.fillStyle = PC_COL.accent;
    ctx.fillText(period.toUpperCase(), x + 24 + lw + 12, y + 21.5);
  }

  ctx.font = `700 38px ${PC.font}`;
  ctx.fillStyle = p.name.trim() ? PC_COL.text : PC_COL.muted;
  ctx.fillText(pcFit(ctx, p.name.trim() || "Sem nome", nameRight - (x + 24)), x + 24, y + 42);

  stats.forEach(([label, value], i) => {
    const bx = sx + i * (statW + statGap);
    if (i > 0) {
      ctx.fillStyle = PC_COL.border;
      ctx.fillRect(bx - statGap / 2, y + 28, 1, h - 52);
    }
    ctx.font = `500 13px ${PC.font}`;
    ctx.fillStyle = PC_COL.muted;
    ctx.fillText(label, bx, y + 34);
    let nx = bx;
    if (i === 0 && levelImg) { // ícone do nível à esquerda do número
      const k = Math.min(40 / levelImg.naturalHeight, 56 / levelImg.naturalWidth);
      const iw = levelImg.naturalWidth * k, ih = levelImg.naturalHeight * k;
      ctx.drawImage(levelImg, bx, y + 54 + (38 - ih) / 2, iw, ih);
      nx = bx + iw + 10;
    }
    ctx.font = `700 32px ${PC.font}`;
    ctx.fillStyle = PC_COL.text;
    ctx.fillText(Number(value).toLocaleString("pt-BR"), nx, y + 56);
  });
}

/** Capa do tópico (1ª mensagem): o Discord mostra como imagem grande e, na lista do fórum, como miniatura quadrada
 *  recortada no centro — por isso tudo que importa fica na faixa central (400 de largura). */
function drawCover(ctx, w, h, main, levelImg) {
  const p = state.player;
  const accent = main ? accentFor(main.c) : PC_COL.accent;
  ctx.fillStyle = PC_COL.bg;
  ctx.fillRect(0, 0, w, h);
  const glow = ctx.createRadialGradient(w / 2, 120, 10, w / 2, 120, 340);
  glow.addColorStop(0, mixHex(accent, PC_COL.bg, 0.45));
  glow.addColorStop(1, PC_COL.bg);
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = accent;
  ctx.fillRect(0, 0, w, 5);

  ctx.textAlign = "center";
  ctx.textBaseline = "top";

  // retrato do personagem principal, grande
  const S = 172, px = (w - S) / 2, py = 34;
  if (main) {
    ctx.save();
    ctx.shadowColor = accent;
    ctx.shadowBlur = 26;
    pcBox(ctx, px, py, S, S, 18, { fill: PC_COL.panel });
    ctx.restore();
    if (main.portrait) pcImage(ctx, main.portrait, px, py, S, S, 18);
    pcPath(ctx, px - 1.5, py - 1.5, S + 3, S + 3, 19);
    ctx.strokeStyle = accent;
    ctx.lineWidth = 3;
    ctx.stroke();
  }

  // identificação
  const period = p.showDate ? periodText() : "";
  const tag = ["PLAYER CARD", period].filter(Boolean).join("  ·  ").toUpperCase();
  ctx.font = `700 14px ${PC.font}`;
  ctx.fillStyle = PC_COL.muted;
  ctx.fillText(tag, w / 2, 228);

  const nick = p.name.trim() || "Sem nome", maxW = 380;
  let size = 46;
  ctx.font = `700 ${size}px ${PC.font}`;
  while (size > 28 && ctx.measureText(nick).width > maxW) { size -= 2; ctx.font = `700 ${size}px ${PC.font}`; }
  ctx.fillStyle = p.name.trim() ? PC_COL.text : PC_COL.muted;
  ctx.fillText(pcFit(ctx, nick, maxW), w / 2, 252 + (46 - size) / 2);

  // Chaser Level (com ícone) e Main
  const lv = Number(p.chaserLevel).toLocaleString("pt-BR");
  ctx.font = `700 38px ${PC.font}`;
  const lw = ctx.measureText(lv).width;
  let iw = 0, ih = 0;
  if (levelImg) {
    const k = Math.min(46 / levelImg.naturalHeight, 56 / levelImg.naturalWidth);
    iw = levelImg.naturalWidth * k; ih = levelImg.naturalHeight * k;
  }
  const rowW = (iw ? iw + 10 : 0) + lw, rx = (w - rowW) / 2, ry = 322;
  if (levelImg) ctx.drawImage(levelImg, rx, ry + (46 - ih) / 2, iw, ih);
  ctx.textAlign = "left";
  ctx.fillStyle = PC_COL.text;
  ctx.fillText(lv, rx + (iw ? iw + 10 : 0), ry + 2);
  ctx.textAlign = "center";
  ctx.font = `600 13px ${PC.font}`;
  ctx.fillStyle = PC_COL.muted;
  ctx.fillText("CHASER LEVEL", w / 2, ry + 52);
}

/** Header compacto (proporção ~2,5:1) para o Discord: a versão larga da imagem única ficava com texto minúsculo. */
function pcHeaderCompact(ctx, x, y, w, h, main, levelImg) {
  pcBox(ctx, x, y, w, h, 10, { fill: PC_COL.panel });
  pcBox(ctx, x, y, w, h, 10, { stroke: PC_COL.border });
  ctx.save();
  pcPath(ctx, x, y, w, h, 10);
  ctx.clip();
  ctx.fillStyle = PC_COL.accent;
  ctx.fillRect(x, y, w, 4);
  ctx.restore();

  const p = state.player;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";

  // Main (canto direito)
  const MX = x + w - 24 - 190;
  let nameRight = x + w - 24;
  if (main) {
    nameRight = MX - 20;
    const { c, portrait } = main;
    const accent = accentFor(c);
    if (portrait) pcImage(ctx, portrait, MX, y + 24, 72, 72, 8);
    pcBox(ctx, MX, y + 24, 72, 72, 8, { stroke: accent });
    ctx.font = `600 12px ${PC.font}`;
    ctx.fillStyle = PC_COL.muted;
    ctx.fillText("MAIN", MX + 84, y + 40);
    ctx.font = `700 24px ${PC.font}`;
    ctx.fillStyle = accent;
    ctx.fillText(pcFit(ctx, nameOf(c), 190 - 84), MX + 84, y + 58);
  }

  // título e nickname
  ctx.font = `600 13px ${PC.font}`;
  ctx.fillStyle = PC_COL.muted;
  ctx.fillText("PLAYER CARD", x + 24, y + 26);
  const period = p.showDate ? periodText() : "";
  if (period) {
    const lw = ctx.measureText("PLAYER CARD").width;
    ctx.font = `700 14px ${PC.font}`;
    ctx.fillStyle = PC_COL.accent;
    ctx.fillText(period.toUpperCase(), x + 24 + lw + 12, y + 25.5);
  }
  const nick = p.name.trim() || "Sem nome", nickW = nameRight - (x + 24);
  let nickSize = 42;
  ctx.font = `700 ${nickSize}px ${PC.font}`;
  while (nickSize > 28 && ctx.measureText(nick).width > nickW) { nickSize -= 2; ctx.font = `700 ${nickSize}px ${PC.font}`; }
  ctx.fillStyle = p.name.trim() ? PC_COL.text : PC_COL.muted;
  ctx.fillText(pcFit(ctx, nick, nickW), x + 24, y + 48 + (42 - nickSize) / 2);

  // linha divisória e números
  ctx.fillStyle = PC_COL.border;
  ctx.fillRect(x + 24, y + 112, w - 48, 1);
  const stats = [["Chaser Level", p.chaserLevel], ["Card Collection Level", p.cardCollectionLevel], ["Guild Points", p.guildPoints]];
  const colW = (w - 48) / stats.length;
  stats.forEach(([label, value], i) => {
    const bx = x + 24 + i * colW;
    ctx.font = `500 14px ${PC.font}`;
    ctx.fillStyle = PC_COL.muted;
    ctx.fillText(label, bx, y + 128);
    let nx = bx;
    if (i === 0 && levelImg) {
      const k = Math.min(48 / levelImg.naturalHeight, 60 / levelImg.naturalWidth);
      const iw = levelImg.naturalWidth * k, ih = levelImg.naturalHeight * k;
      ctx.drawImage(levelImg, bx, y + 150 + (44 - ih) / 2, iw, ih);
      nx = bx + iw + 10;
    }
    ctx.font = `700 32px ${PC.font}`;
    ctx.fillStyle = PC_COL.text;
    ctx.fillText(Number(value).toLocaleString("pt-BR"), nx, y + 154);
  });
}

/** Linhas de 5 cards. Devolve [índice inicial, quantidade] de cada linha. */
function pcRows(n) {
  const rows = [];
  for (let i = 0; i < n; i += PC.cols) rows.push([i, Math.min(PC.cols, n - i)]);
  return rows;
}

/** Carrega as imagens de todos os cards (retratos, runas, títulos, pets) e o ícone de level. */
async function loadCardData(list) {
  const cache = new Map();
  const load = (src) => {
    if (!cache.has(src)) {
      cache.set(src, (async () => {
        let url = src;
        if (localDir) { // aberto via file://: lê o arquivo da pasta escolhida (blob não "contamina" o canvas)
          const blob = await readLocalFile(src);
          if (!blob) return null;
          url = URL.createObjectURL(blob);
        }
        return new Promise((resolve) => {
          const img = new Image();
          img.onload = () => resolve(img);
          img.onerror = () => resolve(null); // arquivo ausente: o slot sai vazio
          img.src = url;
        });
      })());
    }
    return cache.get(src);
  };
  const maybe = (kind, file) => (file ? load(iconSrc(kind, file)) : null);

  const lvl = levelSrc(state.player.chaserLevel);
  const levelImg = lvl ? await load(lvl) : null;
  const items = await Promise.all(list.map(async (c) => ({
    c,
    portrait: await load(portraitSrc(c.id)),
    runes: await Promise.all(c.runes.map((f) => maybe("runes", f))),
    titles: await Promise.all(c.titles.map((t) => maybe("titles", t.file))),
    pet: await maybe("pet", c.pet),
  })));
  return { items, levelImg };
}

/** Monta o canvas do Player Card com os personagens na ordem em que aparecem na tela. */
async function buildPlayerCard() {
  ranks = computeRanks();
  const { items, levelImg } = await loadCardData(viewList());

  const { cols, cardW, cardH, gap, rowGap, margin, headerH, headerGap, scale } = PC;
  const rows = pcRows(items.length);
  const shift = (cardW + gap) / 2; // linhas ímpares deslocadas meio card (escalonado, não vira grade de calendário)
  const innerW = cols * cardW + (cols - 1) * gap;
  const width = margin * 2 + innerW + (rows.length > 1 ? shift : 0);
  const height = margin * 2 + headerH + headerGap + rows.length * cardH + (rows.length - 1) * rowGap;

  const canvas = document.createElement("canvas");
  canvas.width = width * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext("2d");
  ctx.scale(scale, scale);

  ctx.fillStyle = PC_COL.bg;
  ctx.fillRect(0, 0, width, height);

  pcHeader(ctx, margin, margin, width - margin * 2, headerH, items.find((it) => it.c.id === state.player.main), levelImg);
  rows.forEach(([start, count], r) => {
    const x0 = margin + (r % 2 ? shift : 0);
    const y0 = margin + headerH + headerGap + r * (cardH + rowGap);
    for (let k = 0; k < count; k++) pcCard(ctx, items[start + k], x0 + k * (cardW + gap), y0);
  });
  return canvas;
}

$("cardBtn").addEventListener("click", async () => {
  const btn = $("cardBtn");
  const label = btn.textContent;

  if (location.protocol === "file:" && !localDir) {
    if (!window.showDirectoryPicker) {
      toast("Para gerar a imagem sem servidor, abra o app no Chrome ou Edge.", "error", 6000);
      return;
    }
    if (!(await ensureLocalDir())) return; // cancelou
  }

  btn.disabled = true;
  btn.textContent = "Gerando…";
  try {
    const canvas = await buildPlayerCard();
    const blob = await new Promise((resolve, reject) => {
      try { canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Não foi possível gerar a imagem."))), "image/webp", 0.9); }
      catch (err) { reject(err); }
    });
    downloadBlob(blob, `${safeName()}-player-card${periodSuffix()}.${blob.type === "image/webp" ? "webp" : "png"}`); // WebP é bem mais leve; PNG só se o navegador não suportar
    toast("Imagem gerada.", "ok");
  } catch (err) {
    toast(
      err && err.name === "SecurityError"
        ? "O navegador bloqueou as imagens. Use Chrome/Edge e escolha a pasta do app quando solicitado."
        : err.message,
      "error",
      8000
    );
  } finally {
    btn.disabled = false;
    btn.textContent = label;
  }
});

/* ---------- Pacote para o Discord: capa, header e folhas de 6 cards (1 imagem por mensagem) ---------- */

const DISCORD = { perPost: 6, frames: 12, delay: 90 }; // 6 cards por imagem (3 por linha × 2). Imagem única: sem corte de grade nem ordem de anexos

const canvasToBlob = (cv, type = "image/png") =>
  new Promise((resolve, reject) => cv.toBlob((b) => (b ? resolve(b) : reject(new Error("Não foi possível gerar a imagem."))), type));

function newPcCanvas(w, h, scale = PC.scale, scaleY = scale) {
  const cv = document.createElement("canvas");
  cv.width = Math.round(w * scale);
  cv.height = Math.round(h * scaleY);
  const ctx = cv.getContext("2d", { willReadFrequently: true });
  ctx.scale(scale, scaleY); // fundo transparente: assume a cor do tema do Discord
  return { cv, ctx };
}

/** Folha com vários cards numa imagem só (3 por linha). Uma imagem única é exibida inteira pelo Discord (sem recorte de
 *  grade e sem depender da ordem dos anexos). Com phase (0..1), o halo dos retratos épicos pulsa nesse ponto do ciclo. */
const SHEET = { cols: 3, gapX: 14, gapY: 21, top: 18, side: 16, bottom: 8, px: 1400 }; // 930×465 lógicos -> 1400×700 px (2:1 exato)

function drawSheet(group, phase) {
  const { cols, gapX, gapY, top, side, bottom } = SHEET;
  // sempre o tamanho de uma folha cheia (3×2): o Discord exibe todas na mesma escala, mesmo a última, com menos cards
  const nc = cols, nr = Math.ceil(DISCORD.perPost / cols);
  const w = side * 2 + nc * PC.cardW + (nc - 1) * gapX;
  const h = top + nr * PC.cardH + (nr - 1) * gapY + bottom;
  // proporção exata 2:1: ao reduzir para a caixa do chat, largura e altura continuam inteiras (evita o 1px de reamostragem que embaça)
  const { cv, ctx } = newPcCanvas(w, h, SHEET.px / w, SHEET.px / 2 / h);
  group.forEach((it, i) => pcCard(ctx, it, side + (i % cols) * (PC.cardW + gapX), top + Math.floor(i / cols) * (PC.cardH + gapY), phase));
  return { cv, ctx };
}

const GIF_KEY = [255, 0, 255]; // cor-chave que vira o índice transparente do GIF

/** GIF pulsante com fundo transparente. Paleta única (não pisca de cor) com uma rampa reservada p/ o halo de cada épico. */
function sheetToGif(group) {
  const n = DISCORD.frames;
  const frames = [];
  for (let i = 0; i < n; i++) frames.push(drawSheet(group, i / n));
  const rgbaOf = (f) => f.ctx.getImageData(0, 0, f.cv.width, f.cv.height).data;
  const keyed = (data) => { // RGBA -> RGB; pixels (quase) transparentes viram a cor-chave
    const out = new Uint8ClampedArray(data.length);
    for (let i = 0; i < data.length; i += 4) {
      const solid = data[i + 3] >= 128;
      out[i] = solid ? data[i] : GIF_KEY[0]; out[i + 1] = solid ? data[i + 1] : GIF_KEY[1]; out[i + 2] = solid ? data[i + 2] : GIF_KEY[2]; out[i + 3] = 255;
    }
    return out;
  };
  const a = keyed(rgbaOf(frames[0])), b = keyed(rgbaOf(frames[Math.round(n * 0.25)])); // seno em 0.25 = brilho máximo
  const sample = new Uint8ClampedArray(a.length * 2);
  sample.set(a, 0); sample.set(b, a.length);
  const epics = group.filter((it) => it.c.epic);
  const ramp = Math.max(4, Math.min(16, Math.floor(80 / Math.max(1, epics.length)))); // cores reservadas por épico
  const palette = gifenc.quantize(sample, 255 - ramp * epics.length);
  for (const it of epics) {
    const fill = mixHex(colorOf(it.c), PC_COL.panel, 0.14), accent = accentFor(it.c);
    for (let r = 1; r <= ramp; r++) palette.push(hexToRgb(mixHex(accent, fill, r / ramp)));
  }
  palette.push(GIF_KEY.slice());
  const gif = gifenc.GIFEncoder();
  frames.forEach((f, i) => {
    const index = gifenc.applyPalette(keyed(rgbaOf(f)), palette);
    gif.writeFrame(index, f.cv.width, f.cv.height, {
      palette: i === 0 ? palette : undefined, delay: DISCORD.delay, transparent: true, transparentIndex: palette.length - 1, dispose: 2,
    });
  });
  gif.finish();
  return new Blob([gif.bytes()], { type: "image/gif" });
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** .zip simples, sem compressão (as imagens já são comprimidas). files: [{ name, bytes }] */
function makeZip(files) {
  const enc = new TextEncoder();
  const d = new Date();
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
  const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  const parts = [], central = [];
  let offset = 0;
  for (const f of files) {
    const name = enc.encode(f.name), crc = crc32(f.bytes);
    const head = new DataView(new ArrayBuffer(30));
    head.setUint32(0, 0x04034b50, true); head.setUint16(4, 20, true); head.setUint16(6, 0x0800, true); // UTF-8
    head.setUint16(10, time, true); head.setUint16(12, date, true);
    head.setUint32(14, crc, true); head.setUint32(18, f.bytes.length, true); head.setUint32(22, f.bytes.length, true);
    head.setUint16(26, name.length, true);
    parts.push(new Uint8Array(head.buffer), name, f.bytes);

    const cen = new DataView(new ArrayBuffer(46));
    cen.setUint32(0, 0x02014b50, true); cen.setUint16(4, 20, true); cen.setUint16(6, 20, true); cen.setUint16(8, 0x0800, true);
    cen.setUint16(12, time, true); cen.setUint16(14, date, true);
    cen.setUint32(16, crc, true); cen.setUint32(20, f.bytes.length, true); cen.setUint32(24, f.bytes.length, true);
    cen.setUint16(28, name.length, true); cen.setUint32(42, offset, true);
    central.push(new Uint8Array(cen.buffer), name);
    offset += 30 + name.length + f.bytes.length;
  }
  const cenSize = central.reduce((a, p) => a + p.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
  end.setUint32(12, cenSize, true); end.setUint32(16, offset, true);
  return new Blob([...parts, ...central, new Uint8Array(end.buffer)], { type: "application/zip" });
}

/** Tamanhos das postagens. O Discord monta grades uniformes com 2, 4, 6 ou 9 imagens; 7 e 8 destacam a primeira, então evita. */
function chunkSizes(n, per) {
  const sizes = [];
  while (n > 0) {
    let take = Math.min(per, n);
    if (take === 7) take = 6;
    else if (take === 8) take = 4;
    sizes.push(take);
    n -= take;
  }
  return sizes;
}

/** Gera as imagens e devolve [{ name, bytes }]: 00-capa, 01-header e 02… com os cards (6 por imagem, 3 por linha). */
async function buildDiscordPack(onProgress = () => {}) {
  ranks = computeRanks();
  const { items, levelImg } = await loadCardData(viewList());
  const main = items.find((it) => it.c.id === state.player.main);
  const tick = () => new Promise((r) => setTimeout(r, 0)); // deixa a página respirar entre as imagens
  const toBytes = async (blob) => new Uint8Array(await blob.arrayBuffer());
  const out = [];

  const groups = [];
  let at = 0;
  for (const size of chunkSizes(items.length, DISCORD.perPost)) { groups.push(items.slice(at, at + size)); at += size; }
  const total = groups.length + 2;

  { // capa da 1ª mensagem do tópico
    // 1100×682 px = 550×341 na caixa do chat (e 400×248 na caixa antiga): larguras e alturas inteiras, sem reamostragem de 1px
    const W = 640, H = 396.8;
    const { cv, ctx } = newPcCanvas(W, H, 1100 / W, 682 / H);
    drawCover(ctx, W, H, main, levelImg);
    out.push({ name: "00-capa.png", bytes: await toBytes(await canvasToBlob(cv)) });
    onProgress(1, total);
  }
  { // header do jogador
    // 1100×440 px (2,5:1) = 550×220 na caixa do chat (400×160 na antiga)
    const p = 8, w = 560, h = 214.4;
    const { cv, ctx } = newPcCanvas(w + p * 2, h + p * 2, 1100 / (w + p * 2), 440 / (h + p * 2));
    pcHeaderCompact(ctx, p, p, w, h, main, levelImg);
    out.push({ name: "01-header.png", bytes: await toBytes(await canvasToBlob(cv)) });
    onProgress(2, total);
  }
  let first = 1;
  for (let g = 0; g < groups.length; g++) {
    await tick();
    const group = groups[g];
    const epic = group.some((it) => it.c.epic);
    const blob = epic ? sheetToGif(group) : await canvasToBlob(drawSheet(group).cv);
    const range = group.length > 1 ? `${String(first).padStart(2, "0")}-${String(first + group.length - 1).padStart(2, "0")}` : String(first).padStart(2, "0");
    out.push({ name: `${String(g + 2).padStart(2, "0")}-cards-${range}.${epic ? "gif" : "png"}`, bytes: await toBytes(blob) });
    first += group.length;
    onProgress(g + 3, total);
  }
  return out;
}

$("discordBtn").addEventListener("click", async () => {
  const btn = $("discordBtn");
  const label = btn.textContent;

  if (location.protocol === "file:" && !localDir) {
    if (!window.showDirectoryPicker) {
      toast("Para gerar as imagens sem servidor, abra o app no Chrome ou Edge.", "error", 6000);
      return;
    }
    if (!(await ensureLocalDir())) return;
  }

  btn.disabled = true;
  try {
    const files = await buildDiscordPack((i, n) => { btn.textContent = `Gerando ${i}/${n}…`; });
    downloadBlob(makeZip(files), `${safeName()}-discord${periodSuffix()}.zip`);
    toast(`Pacote gerado: ${files.length} imagens, uma por mensagem, na ordem dos números.`, "ok", 6000);
  } catch (err) {
    toast(
      err && err.name === "SecurityError"
        ? "O navegador bloqueou as imagens. Use Chrome/Edge e escolha a pasta do app quando solicitado."
        : err.message,
      "error",
      8000
    );
  } finally {
    btn.disabled = false;
    btn.textContent = label;
  }
});

/* ---------- 5 cards por linha ---------- */

// Largura mínima de um card (retrato 80 + runas 76 + pet 100 + espaços + padding) e quantidade de colunas.
const CARD_MIN = 290;
const GRID_GAP = 20;
const GRID_COLS = 5;

/** Se a tela for menor que 5 cards, reduz o zoom da grade para manter 5 por linha. */
function fitGrid() {
  const avail = grid.parentElement.clientWidth;
  const need = GRID_COLS * CARD_MIN + (GRID_COLS - 1) * GRID_GAP;
  const narrow = avail < 700; // celular: volta para colunas automáticas, sem zoom
  grid.classList.toggle("narrow", narrow);
  grid.style.zoom = narrow || avail >= need ? "" : String(avail / need);
}
new ResizeObserver(fitGrid).observe(grid.parentElement);

/* ---------- Aviso ---------- */

let toastTimer;
function toast(msg, type = "", ms = 3000) {
  const el = $("toast");
  el.textContent = msg;
  el.className = `toast show ${type}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), ms);
}

render();

/* ---------- Abertura: pedido da pasta, propaganda do dia e faixa de mensagens ---------- */

const AD_KEY = "chaser-manager-ad-day";
const AD_DELAY = 2000; // ms depois do passo da pasta

/** O navegador só abre o seletor de pasta após um clique, então o pedido é um aviso com botão. */
async function folderStep() {
  if (location.protocol !== "file:" || !window.showDirectoryPicker || localDir) return;
  try { // acesso já concedido antes: segue sem perguntar
    const saved = await idbGetDir();
    if (saved && (await saved.queryPermission({ mode: "read" })) === "granted") { localDir = saved; return; }
  } catch (_) { /* pergunta abaixo */ }

  const box = $("folderPrompt");
  box.hidden = false;
  await new Promise((resolve) => {
    const done = () => {
      box.hidden = true;
      $("folderPick").onclick = $("folderSkip").onclick = null;
      resolve();
    };
    $("folderPick").onclick = async () => { await ensureLocalDir(); done(); };
    $("folderSkip").onclick = done;
  });
}

const localDay = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

function maybeShowAd() {
  let last = "";
  try { last = localStorage.getItem(AD_KEY) || ""; } catch (_) { /* sem storage: mostra */ }
  if (last === localDay()) return;
  try { localStorage.setItem(AD_KEY, localDay()); } catch (_) { /* ignora */ }
  $("ad").hidden = false;
  $("adClose").focus();
}

function closeAd() {
  $("ad").hidden = true;
  startTicker();
}
$("adClose").addEventListener("click", closeAd);

/** Duas mensagens em sequência, cada uma levando 8s para cruzar a tela da direita para a esquerda. */
function startTicker() {
  const bar = $("ticker"), msg = $("tickerMsg");
  const name = state.player.name.trim() || "Chaser";
  const texts = [
    "Não seja um cansado, compre as poções na loja de poções!",
    `${name} conseguiu aprimorar para +18 o/ o/ o/`,
  ];
  let i = 0;
  const next = () => {
    if (i >= texts.length) { bar.hidden = true; msg.classList.remove("run"); return; }
    msg.classList.remove("run");
    msg.textContent = texts[i++];
    void msg.offsetWidth; // reinicia a animação
    msg.classList.add("run");
  };
  msg.onanimationend = next;
  bar.hidden = false;
  next();
}

(async function startup() {
  if (location.hash.startsWith("#brb=")) return; // link do Be right back (OBS): sem propaganda nem pedido de pasta
  await folderStep();
  setTimeout(maybeShowAd, AD_DELAY);
})();
