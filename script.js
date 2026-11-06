/* ====================================================================
 *  AI Smart Security Patrol Car v2 - Dashboard logic
 *  Adds: GPS handling, SMS sending, environmental + motion + GSM polling
 * ==================================================================== */
(function () {
  "use strict";

  const GW = (function () {
    const params = new URLSearchParams(location.search);
    const host = params.get("gw") || location.hostname || "192.168.4.1";
    const port = params.get("port") || location.port || "80";
    const proto = location.protocol === "https:" ? "https" : "http";
    return `${proto}://${host}${port && port !== "80" ? ":" + port : ""}`;
  })();

  const POLL = { status: 1000, logs: 2000, settings: 10000 };
  const $ = (id) => document.getElementById(id);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  function toast(msg, kind = "") {
    const t = $("toast");
    t.textContent = msg;
    t.className = "toast show " + kind;
    clearTimeout(toast._t);
    toast._t = setTimeout(() => (t.className = "toast " + kind), 2500);
  }

  async function getJSON(path) {
    const r = await fetch(GW + path);
    if (!r.ok) throw new Error(`GET ${path} -> ${r.status}`);
    return r.json();
  }
  async function postJSON(path, body) {
    const r = await fetch(GW + path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body || {}),
    });
    if (!r.ok) throw new Error(`POST ${path} -> ${r.status}`);
    return r.json();
  }

  async function sendCmd(cmd, extra = {}) {
    try {
      await postJSON("/command", Object.assign({ cmd }, extra));
      toast(`Sent: ${cmd}`, "ok");
    } catch (e) {
      toast(`Command failed: ${e.message}`, "crit");
    }
  }
  window.PatrolCar = { sendCmd, toast, GW };

  function setModeUI(mode) {
    for (const btn of $$(".mode-toggle button")) {
      btn.classList.toggle("active", btn.dataset.mode === mode);
    }
  }

  // ----------------------------------------------------------------
  // Settings
  // ----------------------------------------------------------------
  async function loadSettings() {
    try {
      const j = await getJSON("/settings");
      $("setSsid").value = j.ssid || "";
      $("setPass").value = j.password || "";
      $("setName").value = j.robotName || "";
      $("setSpeed").value = j.speed || 180;
      $("setCamHost").value = j.camHost || "";
      $("setCamPort").value = j.camPort || 81;
      $("setCamRes").value = j.camResolution ?? 2;
      $("setFaceConf").value = j.faceConfidence ?? 0.55;
      $("setWarn").value = j.warnDist || 25;
      $("setDanger").value = j.dangerDist || 15;
      $("setAlarmSens").value = j.alarmSensitivity || 5;
      $("setAlertPhone").value = j.alertPhone || "";
      $("alertPhone").textContent = j.alertPhone || "(not set)";
      $("robotName").textContent = (j.robotName || "PatrolCar-01") + " · v2";
      $("spdSlider").value = j.speed || 180;
      $("spdVal").textContent = j.speed || 180;
      const url = `http://${j.camHost}:${j.camPort}/stream`;
      $("camStream").src = url;
      $("camInfo").textContent = `${j.camHost}:${j.camPort}`;
      $("camBadge").textContent = "CAM ONLINE";
      $("camBadge").className = "badge badge-ok";
    } catch (e) {
      toast("Settings load failed: " + e.message, "crit");
    }
  }

  async function saveSettings() {
    const o = {
      ssid: $("setSsid").value,
      password: $("setPass").value,
      robotName: $("setName").value,
      speed: +$("setSpeed").value,
      camHost: $("setCamHost").value,
      camPort: +$("setCamPort").value,
      camResolution: +$("setCamRes").value,
      faceConfidence: +$("setFaceConf").value,
      warnDist: +$("setWarn").value,
      dangerDist: +$("setDanger").value,
      alarmSensitivity: +$("setAlarmSens").value,
      alertPhone: $("setAlertPhone").value,
    };
    try {
      await postJSON("/settings", o);
      toast("Settings saved", "ok");
      $("alertPhone").textContent = o.alertPhone || "(not set)";
    } catch (e) {
      toast("Save failed: " + e.message, "crit");
    }
  }

  // ----------------------------------------------------------------
  // SMS
  // ----------------------------------------------------------------
  async function sendSms() {
    const phone = $("smsPhone").value || $("alertPhone").textContent;
    if (!phone || phone === "(not set)") {
      toast("Enter a phone number first", "crit");
      return;
    }
    try {
      const r = await postJSON("/sms", {
        phone,
        message: "Test from " + ($("robotName").textContent),
      });
      toast(r.ok ? "SMS sent to " + phone : "SMS failed", r.ok ? "ok" : "crit");
    } catch (e) {
      toast("SMS error: " + e.message, "crit");
    }
  }

  // ----------------------------------------------------------------
  // Status polling
  // ----------------------------------------------------------------
  async function pollStatus() {
    try {
      const t0 = performance.now();
      const j = await getJSON("/status");
      const t1 = performance.now();
      $("latency").textContent = `${Math.round(t1 - t0)} ms`;

      // Core telemetry
      $("batPct").textContent = j.batteryPct ?? "--";
      $("batV").textContent = j.batteryV != null ? Number(j.batteryV).toFixed(2) : "--";
      const pct = j.batteryPct || 0;
      $("batBar").style.width = pct + "%";
      $("batBar").parentElement.classList.toggle("low", pct < 25);

      $("dist").textContent = j.distance ?? "--";
      $("distBar").style.width = Math.min(100, (j.distance || 0) / 2) + "%";

      $("spd").textContent = j.speed ?? "--";
      $("mode").textContent = j.mode || "--";
      setModeUI(j.mode);
      $("uptime").textContent = j.uptime ? formatUptime(j.uptime) : "--";
      $("alarmLvl").textContent = j.alarmLevel ?? "--";

      const age = j.statusAgeMs || 99999;
      if (age < 3000) {
        $("sysStatus").textContent = "ONLINE";
        $("sysDot").className = "dot";
      } else if (age < 6000) {
        $("sysStatus").textContent = "STALE";
        $("sysDot").className = "dot warn";
      } else {
        $("sysStatus").textContent = "OFFLINE";
        $("sysDot").className = "dot crit";
      }

      // Environmental
      $("temp").innerHTML = (j.temperature ?? "--") + "<small>°C</small>";
      $("hum").innerHTML = (j.humidity ?? "--") + "<small>%</small>";
      $("gasPct").textContent = j.gasPct ?? "--";
      $("gasRaw").textContent = j.gasRaw ?? "--";
      $("flamePct").textContent = j.flamePct ?? "--";
      $("flameRaw").textContent = j.flameRaw ?? "--";

      const gasBar = $("gasBar");
      gasBar.querySelector("i").style.width = (j.gasPct || 0) + "%";
      gasBar.className = "bar" + (j.gasWarning ? " danger" : "");
      $("gasStatus").textContent = j.gasWarning ? "WARNING" : "OK";
      $("gasStatus").style.color = j.gasWarning ? "var(--crit)" : "var(--ok)";

      const flameBar = $("flameBar");
      flameBar.querySelector("i").style.width = (j.flamePct || 0) + "%";
      flameBar.className = "bar" + (j.flameWarning ? " danger" : "");
      $("flameStatus").textContent = j.flameWarning ? "FLAME!" : "CLEAR";
      $("flameStatus").style.color = j.flameWarning ? "var(--crit)" : "var(--ok)";

      // Motion
      $("motionVal").textContent = j.motion ? "YES" : "no";
      $("motionVal").className = "val " + (j.motion ? "warn" : "");
      $("motionCount").textContent = j.motionCount || 0;
      $("soundVal").textContent = j.soundEvents ?? "--";

      // GPS
      $("gpsLat").textContent = j.gpsValid ? Number(j.gpsLat).toFixed(6) : "-- no fix --";
      $("gpsLon").textContent = j.gpsValid ? Number(j.gpsLon).toFixed(6) : "-- no fix --";
      $("gpsSats").textContent = j.gpsSats ?? "--";
      $("gpsSpd").textContent = (j.gpsSpeed ?? 0).toFixed(1);
      $("gpsTime").textContent = j.gpsTime || "--";
      $("gpsDate").textContent = j.gpsDate || "--";
      if (j.gpsValid) {
        $("gpsMapLink").href = `https://www.google.com/maps?q=${j.gpsLat},${j.gpsLon}`;
      }

      // GSM
      $("gsmReady").textContent = j.gsmReady ? "READY" : "OFFLINE";
      $("gsmReady").className = "val " + (j.gsmReady ? "ok" : "crit");
      $("gsmReg").textContent = j.gsmRegistered ? "REGISTERED" : "SEARCHING";
      $("gsmReg").className = "val " + (j.gsmRegistered ? "ok" : "warn");
      $("gsmSig").textContent = j.gsmSignal ?? "--";

      // Hazard banner
      const hazards = [];
      if (j.gasWarning) hazards.push("GAS");
      if (j.flameWarning) hazards.push("FLAME");
      if (j.aiUnknown) hazards.push("UNKNOWN FACE");
      if (j.alarmLevel >= 3) hazards.push("ALARM LVL " + j.alarmLevel);
      if (hazards.length) {
        $("hazardBanner").textContent = "⚠ ACTIVE HAZARDS: " + hazards.join(" · ");
        $("hazardBanner").classList.add("show");
      } else {
        $("hazardBanner").classList.remove("show");
      }

      // AI
      $("aiFaces").textContent = j.facesTotal ?? 0;
      $("aiUnknown").textContent = j.unknownTotal ?? 0;
      $("aiFps").textContent = j.fps ? Number(j.fps).toFixed(1) : "0";
      $("aiConf").textContent = j.lastConfidence ? Number(j.lastConfidence).toFixed(2) : "--";

      // Camera card alarm highlight
      $("camCard").classList.toggle("alarm-active", !!j.aiUnknown || j.alarmLevel >= 4);
    } catch (e) {
      $("sysStatus").textContent = "OFFLINE";
      $("sysDot").className = "dot crit";
    }
  }

  function formatUptime(ms) {
    const s = Math.floor(ms / 1000);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m ${sec}s`;
    return `${sec}s`;
  }

  // ----------------------------------------------------------------
  // Logs
  // ----------------------------------------------------------------
  async function pollLogs() {
    try {
      const j = await getJSON("/logs");
      const html = j
        .map((l) => {
          let cls = "";
          const lo = l.toLowerCase();
          if (lo.includes("alert") || lo.includes("unknown") || lo.includes("fail") || lo.includes("flame"))
            cls = "crit";
          else if (lo.includes("warn") || lo.includes("error")) cls = "warn";
          else if (lo.includes("ready") || lo.includes("ok") || lo.includes("sent")) cls = "ok";
          return `<div class="${cls}">${escapeHtml(l)}</div>`;
        })
        .reverse()
        .join("");
      $("logs").innerHTML = html;
    } catch (e) {}
  }

  function escapeHtml(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  // ----------------------------------------------------------------
  // Camera snapshot / restart
  // ----------------------------------------------------------------
  async function snapshot() {
    try {
      const j = await getJSON("/camera");
      window.open(j.snapshotUrl + "?_=" + Date.now(), "_blank");
    } catch (e) {
      toast("Snapshot failed: " + e.message, "crit");
    }
  }

  async function restartCam() {
    toast("Restarting camera...");
    try {
      const j = await getJSON("/camera");
      const url = j.snapshotUrl.replace("/capture", "/restart");
      await fetch(url);
      toast("Camera restart signal sent", "ok");
    } catch (e) {
      toast("Camera restart failed", "crit");
    }
  }

  // ----------------------------------------------------------------
  // Speed slider
  // ----------------------------------------------------------------
  let spdTimer = null;
  function setSpeed(v) {
    $("spdVal").textContent = v;
    clearTimeout(spdTimer);
    spdTimer = setTimeout(() => sendCmd("speed", { value: +v }), 150);
  }

  // ----------------------------------------------------------------
  // Keyboard
  // ----------------------------------------------------------------
  const keyMap = {
    ArrowUp: "forward", KeyW: "forward",
    ArrowDown: "backward", KeyS: "backward",
    ArrowLeft: "left", KeyA: "left",
    ArrowRight: "right", KeyD: "right",
    Space: "stop",
  };
  document.addEventListener("keydown", (e) => {
    if (e.target.tagName === "INPUT" || e.target.tagName === "SELECT") return;
    const cmd = keyMap[e.code];
    if (!cmd) return;
    e.preventDefault();
    sendCmd(cmd);
  });

  // ----------------------------------------------------------------
  // Wiring
  // ----------------------------------------------------------------
  function wireUI() {
    $$("[data-cmd]").forEach((btn) =>
      btn.addEventListener("click", () => sendCmd(btn.dataset.cmd))
    );
    $$(".mode-toggle button").forEach((btn) =>
      btn.addEventListener("click", () => sendCmd(btn.dataset.mode))
    );
    $("btnSnapshot").addEventListener("click", snapshot);
    $("btnRestartCam").addEventListener("click", restartCam);
    $("btnTestAlarm").addEventListener("click", () => sendCmd("alarm", { level: 3 }));
    $("btnEStop").addEventListener("click", () => {
      sendCmd("e_stop");
      $("camCard").classList.add("alarm-active");
      setTimeout(() => $("camCard").classList.remove("alarm-active"), 3000);
    });
    $("btnRestart").addEventListener("click", () => sendCmd("restart"));
    $("btnSaveSettings").addEventListener("click", saveSettings);
    $("btnSendSms").addEventListener("click", sendSms);
    $("spdSlider").addEventListener("input", (e) => setSpeed(e.target.value));
  }

  function boot() {
    wireUI();
    loadSettings();
    pollStatus();
    pollLogs();
    setInterval(pollStatus, POLL.status);
    setInterval(pollLogs, POLL.logs);
    setInterval(loadSettings, POLL.settings);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
