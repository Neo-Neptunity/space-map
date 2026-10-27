// 容量マップ：フォルダの中身を、大きさに比例した四角で敷き詰める（squarified treemap）
const ep = window.explorerPlus;

document.head.append(Object.assign(document.createElement("link"), { rel: "stylesheet", href: "/__runtime/tui.css" }));
const style = document.createElement("style");
style.textContent = `
  html, body { height: 100%; margin: 0; }
  body { display: flex; flex-direction: column; gap: 6px; padding: 8px; box-sizing: border-box; overflow: hidden; }
  #head { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 12px; }
  #title { font-weight: bold; }
  #total { color: var(--tui-dim); }
  #modes { display: flex; gap: 4px; margin-left: auto; }
  #modes button.on { outline: 1px solid var(--tui-accent); color: var(--tui-accent); }
  #legend { display: flex; flex-wrap: wrap; gap: 4px; }
  .chip { display: inline-flex; align-items: center; gap: 5px; padding: 1px 8px; border: 1px solid var(--tui-line);
    border-radius: 10px; cursor: pointer; user-select: none; font-size: 12px; }
  .chip i { width: 10px; height: 10px; border-radius: 2px; display: inline-block; }
  .chip.on { border-color: var(--tui-accent); }
  .chip small { color: var(--tui-dim); }
  #map { position: relative; flex: 1; min-height: 0; border: 1px solid var(--tui-line); overflow: hidden; }
  .tile { position: absolute; box-sizing: border-box; border: 1px solid rgba(0, 0, 0, .35); overflow: hidden;
    padding: 2px 4px; font-size: 12px; line-height: 1.25; cursor: default; transition: filter .1s, opacity .15s; }
  .tile:hover { filter: brightness(1.25); z-index: 1; }
  .tile.folder { border: 2px solid rgba(255, 255, 255, .35); }
  .tile.sel { outline: 3px solid var(--tui-accent); outline-offset: -3px; z-index: 2; }
  .tile.dim { opacity: .22; }
  .tile.rest { background: repeating-linear-gradient(45deg, transparent 0 6px, var(--tui-line) 6px 7px); color: var(--tui-dim); }
  .tile .n { font-weight: bold; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .tile .s { opacity: .8; white-space: nowrap; }
  .tile img { width: 16px; height: 16px; vertical-align: -3px; margin-right: 3px; }
  #empty { position: absolute; inset: 0; display: grid; place-items: center; color: var(--tui-dim); }
`;
document.head.append(style);
document.body.className = "tui";
document.body.innerHTML = `
  <div id="head">
    <span id="title"></span><span id="total"></span>
    <div id="modes">
      <button class="tui-button" data-mode="type">種類で色分け</button>
      <button class="tui-button" data-mode="age">古さで色分け</button>
    </div>
  </div>
  <div id="legend"></div>
  <div id="map"></div>
  <div class="tui-footer">クリックで選ぶ（Ctrl で複数）・ダブルクリックで開く・右クリックでメニュー・Delete でごみ箱・Backspace で上の階層</div>`;

const $ = (id) => document.getElementById(id);
const mapEl = $("map");

const CATEGORIES = [
  { id: "folder", label: "フォルダ", hue: 210, ext: [] },
  { id: "image", label: "画像", hue: 140, ext: "jpg jpeg png gif webp bmp heic svg tif tiff raw psd".split(" ") },
  { id: "video", label: "動画", hue: 280, ext: "mp4 mkv mov avi wmv webm flv m4v".split(" ") },
  { id: "audio", label: "音楽", hue: 320, ext: "mp3 wav flac m4a aac ogg wma".split(" ") },
  { id: "doc", label: "文書", hue: 45, ext: "pdf doc docx xls xlsx ppt pptx txt md csv rtf odt".split(" ") },
  { id: "archive", label: "圧縮・ディスク", hue: 0, ext: "zip rar 7z tar gz bz2 xz iso vhd vhdx img".split(" ") },
  { id: "code", label: "コード・データ", hue: 180, ext: "js ts jsx tsx py html css json xml yml yaml cs cpp c h java go rs rb php sh ps1 sql log db sqlite".split(" ") },
  { id: "app", label: "アプリ", hue: 25, ext: "exe msi dll bat cmd sys lnk".split(" ") },
  { id: "other", label: "その他", hue: 0, ext: [] },
];
const EXT_TO_CAT = new Map();
for (const c of CATEGORIES) for (const e of c.ext) EXT_TO_CAT.set(e, c);
const catOf = (e) => (e.kind === "folder" ? CATEGORIES[0] : EXT_TO_CAT.get(e.ext) ?? CATEGORIES[CATEGORIES.length - 1]);

const DAY = 86_400_000;
const fmtSize = (n) => {
  if (n < 1024) return `${n} B`;
  const u = ["KB", "MB", "GB", "TB"];
  let i = -1;
  do { n /= 1024; i++; } while (n >= 1024 && i < u.length - 1);
  return `${n >= 100 ? n.toFixed(0) : n.toFixed(1)} ${u[i]}`;
};
const fmtAge = (ms) => {
  const d = Math.floor((Date.now() - ms) / DAY);
  if (d < 1) return "今日";
  if (d < 60) return `${d} 日前`;
  if (d < 730) return `${Math.floor(d / 30)} か月前`;
  return `${Math.floor(d / 365)} 年前`;
};

function colorOf(e, mode, dark) {
  const l = dark ? 34 : 62;
  if (mode === "age") {
    if (e.modified == null) return `hsl(0 0% ${l}%)`;
    const days = Math.max(0, (Date.now() - e.modified) / DAY);
    const t = Math.min(1, Math.log1p(days) / Math.log1p(1460)); // 0=最近 … 1=4年以上前
    return `hsl(${Math.round(140 - t * 125)} ${Math.round(55 - t * 15)}% ${l}%)`;
  }
  const c = catOf(e);
  return c.id === "other" ? `hsl(0 0% ${l}%)` : `hsl(${c.hue} 45% ${l}%)`;
}

// squarified treemap：items は { v } の降順
function squarify(items, rect) {
  const total = items.reduce((s, i) => s + i.v, 0);
  if (total <= 0 || rect.w <= 0 || rect.h <= 0) return [];
  const k = (rect.w * rect.h) / total;
  const nodes = items.map((item) => ({ item, a: item.v * k }));
  const out = [];
  let { x, y, w, h } = rect;
  const worst = (row, side) => {
    const s = row.reduce((t, n) => t + n.a, 0);
    let mx = 0, mn = Infinity;
    for (const n of row) { mx = Math.max(mx, n.a); mn = Math.min(mn, n.a); }
    return Math.max((side * side * mx) / (s * s), (s * s) / (side * side * mn));
  };
  let i = 0;
  while (i < nodes.length) {
    const side = Math.min(w, h);
    let row = [nodes[i++]];
    while (i < nodes.length) {
      const next = [...row, nodes[i]];
      if (worst(next, side) > worst(row, side)) break;
      row = next;
      i++;
    }
    const s = row.reduce((t, n) => t + n.a, 0);
    if (w >= h) {
      const cw = s / h;
      let cy = y;
      for (const n of row) { const ch = n.a / cw; out.push({ item: n.item, x, y: cy, w: cw, h: ch }); cy += ch; }
      x += cw; w -= cw;
    } else {
      const rh = s / w;
      let cx = x;
      for (const n of row) { const cw = n.a / rh; out.push({ item: n.item, x: cx, y, w: cw, h: rh }); cx += cw; }
      y += rh; h -= rh;
    }
  }
  return out;
}

// ---- 状態 ----
let folder = null;
let settings = { maxTiles: 250, showHidden: false };
let mode = "type";
let focusCat = null;
const selected = new Set(); // path
let tiles = []; // 描いた直近の { entry, el }
let queued = false;

const sel = () => (folder?.entries ?? []).filter((e) => selected.has(e.path));

function syncStatus() {
  const list = sel();
  const sum = list.reduce((s, e) => s + (e.size ?? 0), 0);
  ep.ui.status(list.length ? `${list.length} 個を選択中 · ${fmtSize(sum)}` : null).catch(() => {});
}

function render() {
  queued = false;
  if (!folder) return;
  const dark = ep.theme === "dark";
  const all = folder.entries.filter((e) => settings.showHidden || !e.hidden);
  const sized = all.filter((e) => (e.size ?? 0) > 0).sort((a, b) => b.size - a.size);
  const pending = all.filter((e) => e.kind === "folder" && e.size == null).length;
  const total = sized.reduce((s, e) => s + e.size, 0);

  $("title").textContent = folder.name || folder.path;
  $("total").textContent = `合計 ${fmtSize(total)} · ${all.length} 件` + (pending ? ` · フォルダ ${pending} 個を計算中…` : "");
  for (const b of document.querySelectorAll("#modes button")) b.classList.toggle("on", b.dataset.mode === mode);

  // 凡例（種類ごとの合計）
  const sums = new Map();
  for (const e of sized) sums.set(catOf(e).id, (sums.get(catOf(e).id) ?? 0) + e.size);
  const legend = $("legend");
  legend.replaceChildren();
  if (mode === "type") {
    for (const c of CATEGORIES) {
      if (!sums.has(c.id)) continue;
      const chip = document.createElement("span");
      chip.className = "chip" + (focusCat === c.id ? " on" : "");
      const dot = document.createElement("i");
      dot.style.background = c.id === "other" ? "gray" : `hsl(${c.hue} 45% ${dark ? 34 : 62}%)`;
      const small = document.createElement("small");
      small.textContent = fmtSize(sums.get(c.id));
      chip.append(dot, c.label, small);
      chip.onclick = () => { focusCat = focusCat === c.id ? null : c.id; scheduleRender(); };
      legend.append(chip);
    }
  } else {
    legend.textContent = "緑＝最近さわった → 赤茶＝4年以上さわっていない（大きくて古いものが整理の候補です）";
    legend.style.color = "var(--tui-dim)";
  }
  if (mode === "type") legend.style.color = "";

  mapEl.replaceChildren();
  tiles = [];
  if (!sized.length) {
    const empty = document.createElement("div");
    empty.id = "empty";
    empty.textContent = pending ? "大きさを計算中…" : "容量のあるものがありません";
    mapEl.append(empty);
    syncStatus();
    return;
  }

  const shown = sized.slice(0, settings.maxTiles);
  const rest = sized.slice(settings.maxTiles);
  const items = shown.map((entry) => ({ entry, v: entry.size }));
  if (rest.length) items.push({ rest, v: rest.reduce((s, e) => s + e.size, 0) });

  const W = mapEl.clientWidth, H = mapEl.clientHeight;
  const frag = document.createDocumentFragment();
  for (const t of squarify(items, { x: 0, y: 0, w: W, h: H })) {
    if (t.w < 3 || t.h < 3) continue;
    const el = document.createElement("div");
    el.className = "tile";
    Object.assign(el.style, { left: `${t.x}px`, top: `${t.y}px`, width: `${t.w}px`, height: `${t.h}px` });
    if (t.item.rest) {
      el.classList.add("rest");
      el.title = `その他 ${t.item.rest.length} 件 · ${fmtSize(t.item.v)}\n（設定の「描く四角の最大数」を増やすと個別に出ます）`;
      el.textContent = t.w > 70 && t.h > 20 ? `その他 ${t.item.rest.length} 件` : "";
      frag.append(el);
      continue;
    }
    const e = t.item.entry;
    const cat = catOf(e);
    el.style.background = colorOf(e, mode, dark);
    el.style.color = dark ? "#f2f2f2" : "#111";
    if (e.kind === "folder") el.classList.add("folder");
    if (selected.has(e.path)) el.classList.add("sel");
    if (focusCat && mode === "type" && cat.id !== focusCat) el.classList.add("dim");
    el.title = `${e.name}\n${fmtSize(e.size)}（${((e.size / total) * 100).toFixed(1)}%）` +
      (e.modified != null ? `\n最終更新：${fmtAge(e.modified)}` : "");
    if (t.w > 56 && t.h > 20) {
      const n = document.createElement("div");
      n.className = "n";
      if (e.iconUrl && t.w > 90) {
        const img = document.createElement("img");
        img.src = e.iconUrl;
        n.append(img);
      }
      n.append(e.name);
      el.append(n);
      if (t.h > 38) {
        const s = document.createElement("div");
        s.className = "s";
        s.textContent = fmtSize(e.size);
        el.append(s);
      }
    }
    el.onclick = (ev) => {
      if (ev.ctrlKey || ev.shiftKey) {
        if (!selected.delete(e.path)) selected.add(e.path);
      } else {
        const only = selected.size === 1 && selected.has(e.path);
        selected.clear();
        if (!only) selected.add(e.path);
      }
      scheduleRender();
    };
    el.ondblclick = () => ep.open(e, { from: el.getBoundingClientRect() }).catch(fail);
    el.oncontextmenu = async (ev) => {
      ev.preventDefault();
      if (!selected.has(e.path)) { selected.clear(); selected.add(e.path); scheduleRender(); }
      try {
        await ep.showMenu({ x: ev.clientX, y: ev.clientY, items: sel().length ? sel() : [e] });
      } catch (err) { fail(err); }
    };
    frag.append(el);
    tiles.push({ entry: e, el });
  }
  mapEl.append(frag);
  syncStatus();
}

const fail = (err) => { if (err?.code !== "denied") ep.ui.toast(`失敗しました：${err?.message ?? err}`).catch(() => {}); };

function scheduleRender() {
  if (queued) return;
  queued = true;
  requestAnimationFrame(render);
}

async function trashSelected() {
  const list = sel();
  if (!list.length) return;
  try {
    await ep.trash(list);
    selected.clear();
  } catch (err) { fail(err); }
}

// ---- 入力 ----
mapEl.addEventListener("click", (ev) => {
  if (ev.target === mapEl || ev.target.id === "empty") { selected.clear(); scheduleRender(); }
});
mapEl.addEventListener("contextmenu", async (ev) => {
  if (ev.target !== mapEl) return;
  ev.preventDefault();
  try {
    await ep.showMenu({ x: ev.clientX, y: ev.clientY, items: [], extra: [{ id: "up", label: "上の階層へ" }] })
      .then((r) => r.chosen === "up" && ep.navigateUp());
  } catch (err) { fail(err); }
});
document.addEventListener("keydown", (ev) => {
  if (ev.ctrlKey || ev.altKey) return;
  if (ev.key === "Delete") trashSelected();
  else if (ev.key === "Backspace") ep.navigateUp().catch(fail);
  else if (ev.key === "Escape") { selected.clear(); focusCat = null; scheduleRender(); }
  else if (ev.key === "Enter") {
    const first = tiles.find((t) => selected.has(t.entry.path));
    if (first) ep.open(first.entry, { from: first.el.getBoundingClientRect() }).catch(fail);
  }
});
for (const b of document.querySelectorAll("#modes button")) {
  b.onclick = () => setMode(b.dataset.mode);
}
function setMode(m) {
  mode = m;
  ep.storage.set("mode", m).catch(() => {});
  scheduleRender();
}
new ResizeObserver(scheduleRender).observe(mapEl);

// ---- 本体とのやりとり ----
await ep.ready();
mode = (await ep.storage.get("mode")) === "age" ? "age" : "type";
settings = { ...settings, ...(await ep.settings.get()) };
ep.onSettings((next) => { settings = { ...settings, ...next }; scheduleRender(); });
ep.onTheme(scheduleRender);

await ep.commands.set([
  { id: "type", label: "容量マップ：種類で色分け" },
  { id: "age", label: "容量マップ：古さで色分け" },
  { id: "up", label: "容量マップ：上の階層へ" },
]);
ep.onCommand((id) => {
  if (id === "up") ep.navigateUp().catch(fail);
  else setMode(id);
});

ep.onFolder((next) => {
  // 同じフォルダの中身の更新なら選択を保つ（フォルダの大きさが後から届くたびに来る）
  if (!folder || folder.path !== next.path) { selected.clear(); focusCat = null; }
  else {
    const live = new Set(next.entries.map((e) => e.path));
    for (const p of [...selected]) if (!live.has(p)) selected.delete(p);
  }
  folder = next;
  scheduleRender();
});
