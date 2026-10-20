// network-map-card.js — live eero mesh diagram for Home Assistant (Steve's home, built 2026-10-20).
// Reads sensor.sarnau_network_map (sdominiak1979/home-assistant-eero fork):
//   attributes.eeros   = [{name, model, gateway, status, wired, connection, mesh_bars, clients, ip}]
//   attributes.clients = [{name, ip, mac, eero, band, signal, profile, type}]
// No external libraries. Re-renders only when the sensor changes or the filter changes.

const PROFILE_COLORS = {
  "Smart Home": "#2e9e6a",
  "Unrestricted Devices": "#3b7dd8",
  "TV's": "#8e5bd0",
  "School Laptops": "#d08a1e",
  "Carter": "#d0503c",
  "Chloe": "#d0447f",
  "Cooper": "#c2a30e",
  "Colin": "#1fa3b5",
  "Video Game Consoles": "#6b6bd6",
  "Guests Unrestricted": "#7a8a99",
  "Guest Kids Devices": "#7a8a99",
  "Unassigned": "#9aa3ad",
};
const OTHER = "#9aa3ad";

const ICONS = {
  phone: "📱", tablet: "📱", laptop_computer: "💻", desktop_computer: "🖥️", unknown_computer: "💻",
  television: "📺", media_streamer: "📺", light: "💡", plug: "🔌", digital_assistant: "🔊",
  security_camera: "📷", thermostat: "🌡️", printer: "🖨️", game_console: "🎮", watch: "⌚",
  car: "🚗", refrigerator: "🧊", oven: "🍳", audio: "🎵", smoke_detector: "🔥", hub: "📡",
};

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function sigClass(sig, band) {
  if (band === "wired") return "wired";
  if (sig == null) return "unknown";
  if (sig >= -60) return "good";
  if (sig >= -70) return "ok";
  return "weak";
}

class NetworkMapCard extends HTMLElement {
  setConfig(config) {
    this._cfg = Object.assign({ entity: "sensor.sarnau_network_map", title: "Network map" }, config || {});
    this._q = "";
    this._hide = new Set();
    if (!this.shadowRoot) this.attachShadow({ mode: "open" });
  }

  getCardSize() { return 14; }

  set hass(hass) {
    const st = hass.states[this._cfg.entity];
    if (!st) { this._renderMsg(`Entity ${this._cfg.entity} not found`); return; }
    if (st.last_updated === this._stamp && this._built) return;
    this._stamp = st.last_updated;
    this._attrs = st.attributes;
    this._render();
  }

  _renderMsg(m) {
    this.shadowRoot.innerHTML = `<ha-card><div style="padding:16px">${esc(m)}</div></ha-card>`;
  }

  _render() {
    const a = this._attrs || {};
    const eeros = (a.eeros || []).slice();
    const clients = (a.clients || []).slice();
    const q = this._q.trim().toLowerCase();

    // Group clients by eero; keep eero order (gateway first).
    // Order eeros as a tree: gateway first, then its mesh children depth-first.
    const kids = (n) => eeros.filter((e) => !e.gateway && e.upstream === n).map((e) => e.name).sort();
    const order = [];
    const walk = (n, depth) => { order.push([n, depth]); kids(n).forEach((k) => walk(k, depth + 1)); };
    const gwe = eeros.find((e) => e.gateway);
    if (gwe) walk(gwe.name, 0);
    eeros.forEach((e) => { if (!order.find((o) => o[0] === e.name)) order.push([e.name, 1]); });
    const names = eeros.length ? order.map((o) => o[0]) : [...new Set(clients.map((c) => c.eero))];
    const byEero = Object.fromEntries(names.map((n) => [n, []]));
    for (const c of clients) {
      const p = c.profile || "Unassigned";
      if (this._hide.has(p)) continue;
      if (q && ![c.name, c.ip, c.mac, p, c.band].some((x) => String(x || "").toLowerCase().includes(q))) continue;
      (byEero[c.eero] = byEero[c.eero] || []).push(c);
    }
    const profiles = [...new Set(clients.map((c) => c.profile || "Unassigned"))].sort();
    const gw = eeros.find((e) => e.gateway);
    const total = clients.length;
    const weak = clients.filter((c) => sigClass(c.signal, c.band) === "weak").length;

    const eeroBox = (e) => {
      const n = (byEero[e.name] || []).length;
      const bars = e.mesh_bars != null ? "▮".repeat(e.mesh_bars) + "▯".repeat(Math.max(0, 5 - e.mesh_bars)) : "";
      const link = e.gateway ? "gateway · wired to modem" : (e.wired ? `wired to ${e.upstream || "mesh"}` : `via ${e.upstream || "mesh"} · ${e.mesh_radio || "wireless"} ${bars}`);
      const ok = (e.status || "").toLowerCase() === "green";
      return `<div class="eero ${e.gateway ? "gw" : ""}">
        <div class="eero-name"><span class="dot ${ok ? "ok" : "bad"}"></span>${esc(e.name)}</div>
        <div class="eero-sub">${esc(e.model || "")} · ${esc(link)}</div>
        <div class="eero-sub">${n} shown${e.clients != null ? ` of ${e.clients}` : ""} devices</div>
      </div>`;
    };

    const chip = (c) => {
      const p = c.profile || "Unassigned";
      const col = PROFILE_COLORS[p] || OTHER;
      const sc = sigClass(c.signal, c.band);
      const icon = ICONS[c.type] || "•";
      const tip = `${c.name}\nIP ${c.ip || "–"}\nMAC ${c.mac}\n${c.band || "?"}${c.signal != null ? ` · ${c.signal} dBm` : ""}\nProfile: ${p}`;
      return `<div class="chip" style="border-left-color:${col}" title="${esc(tip)}">
        <span class="ic">${icon}</span>
        <span class="nm">${esc(c.name)}</span>
        <span class="band b${(c.band || "").replace(/[^0-9]/g, "").slice(0, 1) || "w"}">${c.band === "wired" ? "LAN" : esc((c.band || "").replace(" GHz", ""))}</span>
        <span class="sig ${sc}">${c.band === "wired" ? "wired" : (c.signal != null ? c.signal : "")}</span>
      </div>`;
    };

    // Mesh diagram: Internet -> gateway -> wireless children (from eero's upstream node).
    const meshSvg = (() => {
      if (!eeros.length) return "";
      const W = 900, rowH = 70, boxW = 150, boxH = 34;
      const depthOf = Object.fromEntries(order.map((o) => [o[0], o[1]]));
      const levels = {};
      order.forEach(([n, d]) => (levels[d] = levels[d] || []).push(n));
      const maxD = Math.max(...Object.keys(levels).map(Number));
      const pos = {};
      Object.entries(levels).forEach(([d, ns]) => {
        ns.forEach((n, i) => { pos[n] = { x: (W / (ns.length + 1)) * (i + 1), y: 30 + (Number(d) + 1) * rowH }; });
      });
      const H = 30 + (maxD + 2) * rowH;
      const inet = { x: pos[gwe ? gwe.name : names[0]].x, y: 30 };
      let lines = "", nodes = "";
      if (gwe) {
        const g = pos[gwe.name];
        lines += `<line x1="${inet.x}" y1="${inet.y + boxH / 2}" x2="${g.x}" y2="${g.y - boxH / 2}" class="wan"/>`;
        lines += `<text x="${inet.x + 8}" y="${(inet.y + g.y) / 2 + 4}" class="lbl">wired · modem</text>`;
      }
      eeros.forEach((e) => {
        if (e.gateway || !e.upstream || !pos[e.upstream] || !pos[e.name]) return;
        const a = pos[e.upstream], b = pos[e.name];
        lines += `<line x1="${a.x}" y1="${a.y + boxH / 2}" x2="${b.x}" y2="${b.y - boxH / 2}" class="${e.wired ? "wan" : "mesh"}"/>`;
        lines += `<text x="${(a.x + b.x) / 2 + 6}" y="${(a.y + b.y) / 2 + 4}" class="lbl">${e.wired ? "wired" : esc(e.mesh_radio || "wireless")} ${e.mesh_bars != null ? "▮".repeat(e.mesh_bars) : ""}</text>`;
      });
      nodes += `<g><rect x="${inet.x - 60}" y="${inet.y - boxH / 2}" width="120" height="${boxH}" rx="17" class="inet"/><text x="${inet.x}" y="${inet.y + 5}" class="nt w">🌐 Internet</text></g>`;
      eeros.forEach((e) => {
        const p = pos[e.name]; if (!p) return;
        const n = (byEero[e.name] || []).length;
        nodes += `<g><rect x="${p.x - boxW / 2}" y="${p.y - boxH / 2}" width="${boxW}" height="${boxH}" rx="10" class="node ${e.gateway ? "gwn" : ""}"/>
          <text x="${p.x}" y="${p.y - 1}" class="nt">${esc(e.name)}</text>
          <text x="${p.x}" y="${p.y + 12}" class="ns">${e.gateway ? "gateway · " : ""}${n} devices</text></g>`;
      });
      return `<svg viewBox="0 0 ${W} ${H}" class="mesh-svg" preserveAspectRatio="xMidYMid meet">${lines}${nodes}</svg>`;
    })();

    const cols = names.map((n) => {
      const e = eeros.find((x) => x.name === n) || { name: n };
      const list = (byEero[n] || []).sort((x, y) => (x.profile || "").localeCompare(y.profile || "") || (x.name || "").localeCompare(y.name || ""));
      return `<div class="col ${e.gateway ? "gwcol" : ""}">
        <div class="stem"></div>
        ${eeroBox(e)}
        <div class="list">${list.map(chip).join("") || `<div class="empty">no devices</div>`}</div>
      </div>`;
    }).join("");

    const legend = profiles.map((p) => {
      const off = this._hide.has(p);
      const n = clients.filter((c) => (c.profile || "Unassigned") === p).length;
      return `<button class="lg ${off ? "off" : ""}" data-p="${esc(p)}"><span class="sw" style="background:${PROFILE_COLORS[p] || OTHER}"></span>${esc(p)} <span class="cnt">${n}</span></button>`;
    }).join("");

    this.shadowRoot.innerHTML = `
      <style>
        :host { display:block; }
        ha-card { padding:16px; }
        .top { display:flex; align-items:center; gap:12px; flex-wrap:wrap; margin-bottom:12px; }
        h2 { margin:0; font-size:20px; font-weight:500; flex:1 1 auto; }
        .stats { color:var(--secondary-text-color); font-size:13px; }
        input { font:inherit; padding:6px 10px; border-radius:8px; border:1px solid var(--divider-color);
                background:var(--card-background-color); color:var(--primary-text-color); min-width:220px; }
        .legend { display:flex; flex-wrap:wrap; gap:6px; margin-bottom:16px; }
        .lg { display:inline-flex; align-items:center; gap:6px; font:inherit; font-size:12px; cursor:pointer;
              padding:3px 8px; border-radius:12px; border:1px solid var(--divider-color);
              background:transparent; color:var(--primary-text-color); }
        .lg.off { opacity:.35; text-decoration:line-through; }
        .sw { width:10px; height:10px; border-radius:50%; display:inline-block; }
        .cnt { color:var(--secondary-text-color); }
        .internet { display:flex; flex-direction:column; align-items:center; }
        .node-net { padding:6px 16px; border-radius:16px; background:var(--primary-color); color:var(--text-primary-color, #fff);
                    font-weight:500; font-size:14px; }
        .vline { width:2px; height:18px; background:var(--divider-color); }
        .grid { display:grid; grid-template-columns:repeat(${Math.max(names.length, 1)}, minmax(200px, 1fr)); gap:14px; }
        .mesh-svg { width:100%; max-height:300px; display:block; margin:0 auto 12px; }
        .mesh-svg .wan { stroke:var(--primary-color); stroke-width:3; }
        .mesh-svg .mesh { stroke:var(--secondary-text-color); stroke-width:2; stroke-dasharray:6 5; }
        .mesh-svg .lbl { font-size:12px; fill:var(--secondary-text-color); }
        .mesh-svg .inet { fill:var(--primary-color); }
        .mesh-svg .node { fill:var(--secondary-background-color); stroke:var(--divider-color); }
        .mesh-svg .gwn { stroke:var(--primary-color); stroke-width:2; }
        .mesh-svg .nt { font-size:13px; font-weight:600; text-anchor:middle; fill:var(--primary-text-color); }
        .mesh-svg .nt.w { fill:var(--text-primary-color, #fff); }
        .mesh-svg .ns { font-size:10.5px; text-anchor:middle; fill:var(--secondary-text-color); }
        .band { font-size:10px; padding:0 4px; border-radius:4px; border:1px solid var(--divider-color); color:var(--secondary-text-color); }
        .band.b2 { border-color:#c2a30e; color:#a8890a; } .band.b5 { border-color:#3b7dd8; color:#3b7dd8; } .band.b6 { border-color:#8e5bd0; color:#8e5bd0; }
        .col { display:flex; flex-direction:column; align-items:stretch; }
        .stem { display:none; }
        .eero { border:1px solid var(--divider-color); border-radius:12px; padding:8px 10px; margin-bottom:8px;
                background:var(--secondary-background-color); }
        .eero.gw { border-color:var(--primary-color); }
        .eero-name { font-weight:600; font-size:15px; display:flex; align-items:center; gap:6px; }
        .eero-sub { font-size:12px; color:var(--secondary-text-color); }
        .dot { width:8px; height:8px; border-radius:50%; display:inline-block; }
        .dot.ok { background:#2e9e6a; } .dot.bad { background:#d0503c; }
        .list { display:flex; flex-direction:column; gap:4px; }
        .chip { display:flex; align-items:center; gap:6px; font-size:12.5px; padding:4px 6px;
                border-radius:6px; border-left:4px solid; background:var(--card-background-color);
                box-shadow:0 0 0 1px var(--divider-color) inset; }
        .ic { width:18px; text-align:center; }
        .nm { flex:1 1 auto; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .sig { font-size:11px; font-variant-numeric:tabular-nums; padding:0 4px; border-radius:4px; }
        .sig.good { color:#2e9e6a; } .sig.ok { color:#c2a30e; }
        .sig.weak { color:#fff; background:#d0503c; } .sig.wired { color:var(--secondary-text-color); }
        .empty { font-size:12px; color:var(--secondary-text-color); padding:4px; }
        .foot { margin-top:12px; font-size:12px; color:var(--secondary-text-color); }
        @media (max-width: 700px) { .grid { grid-template-columns:1fr; border-top:none; } .stem { display:none; } }
      </style>
      <ha-card>
        <div class="top">
          <h2>${esc(this._cfg.title)}</h2>
          <span class="stats">${total} devices connected · ${weak} with weak signal${gw ? ` · gateway: ${esc(gw.name)}` : ""}</span>
          <input id="q" placeholder="Filter: name, IP, MAC, profile…" value="${esc(this._q)}">
        </div>
        <div class="legend">${legend}</div>
        ${meshSvg}
        <div class="grid">${cols}</div>
        <div class="foot">Left color = eero profile. Badge = Wi-Fi band (2.4 / 5 GHz, LAN = cable). Dashed lines = wireless mesh links between eeros. Number = Wi-Fi signal in dBm (green ≥ −60, amber ≥ −70, red = weak). Hover a device for IP and MAC. Click a profile to hide or show it.</div>
      </ha-card>`;
    this._built = true;

    const inp = this.shadowRoot.getElementById("q");
    inp.addEventListener("input", (ev) => {
      this._q = ev.target.value;
      const pos = ev.target.selectionStart;
      this._render();
      const ni = this.shadowRoot.getElementById("q");
      ni.focus();
      ni.setSelectionRange(pos, pos);
    });
    this.shadowRoot.querySelectorAll(".lg").forEach((b) =>
      b.addEventListener("click", () => {
        const p = b.dataset.p;
        if (this._hide.has(p)) this._hide.delete(p); else this._hide.add(p);
        this._render();
      })
    );
  }
}

customElements.define("network-map-card", NetworkMapCard);
window.customCards = window.customCards || [];
window.customCards.push({ type: "network-map-card", name: "Network map", description: "eero mesh with connected devices" });
