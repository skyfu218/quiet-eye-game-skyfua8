const rounds = [
  {
    name: "安靜基準",
    eyebrow: "BASELINE",
    description: "先守住中央等待點。飛靶會從左或右側隨機升起，出靶後再快速轉移、追蹤與射擊。",
    rule: "不要預猜方向。準星追上飛靶後，持續貼近飛行路徑直到鎖定完成。",
    insight: "這是你的基準。接下來改變的是環境，任務本身並沒有變。",
    distractors: 0,
    pressure: false,
    routine: false,
    lockMs: 620,
  },
  {
    name: "注意力拉鋸",
    eyebrow: "DAN × VAN",
    description: "飛靶與假目標會先後出現。看見突發刺激很正常；真正的選擇是：它是不是本次任務目標？",
    rule: "紅色閃光與假目標都與任務無關。若點擊它們，會記錄一次「注意力被帶走」。",
    insight: "VAN 會提醒你有新刺激；DAN 則幫助你把行動維持在原本目標。注意到，不等於必須跟著行動。",
    distractors: 5,
    pressure: false,
    routine: false,
    lockMs: 700,
  },
  {
    name: "壓力射擊",
    eyebrow: "PRESSURE",
    description: "倒數與催促訊息加入了。你可能會想趕快射擊，但快不一定代表準備好了。",
    rule: "倒數只是壓力刺激，不是射擊命令。過早射擊會降低本階段表現。",
    insight: "壓力可能讓動作提早啟動，縮短準備時間。先辨認「我在急」，才有機會重新選擇。",
    distractors: 6,
    pressure: true,
    routine: false,
    lockMs: 780,
  },
  {
    name: "程序重整",
    eyebrow: "RESET ROUTINE",
    description: "環境同樣有壓力，但這次加入「吸氣、吐氣、鎖定」的固定程序，看看結果有何不同。",
    rule: "每一發都先完成三步程序。它不保證命中，但能為動作建立一段心理緩衝。",
    insight: "固定程序把注意力帶回可控制的線索。比較上一階段，觀察你的穩定與命中是否恢復。",
    distractors: 6,
    pressure: true,
    routine: true,
    lockMs: 650,
  },
];

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const state = {
  round: 0,
  trial: 0,
  trialsPerRound: 3,
  score: 0,
  sound: true,
  active: false,
  locked: false,
  routineDone: false,
  lockStarted: null,
  lockProgress: 0,
  target: { x: 50, y: 42 },
  reticle: { x: 50, y: 65 },
  flight: null,
  launchedAt: null,
  acquiredAt: null,
  results: [],
  roundShots: [],
  distractionHits: 0,
  raf: null,
  timers: [],
  audio: null,
};

function showScreen(id) {
  $$(".screen").forEach((screen) => screen.classList.toggle("active", screen.id === id));
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function tone(frequency = 440, duration = 0.08, type = "sine", volume = 0.04) {
  if (!state.sound) return;
  try {
    state.audio ||= new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = state.audio.createOscillator();
    const gain = state.audio.createGain();
    oscillator.type = type;
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(volume, state.audio.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, state.audio.currentTime + duration);
    oscillator.connect(gain).connect(state.audio.destination);
    oscillator.start();
    oscillator.stop(state.audio.currentTime + duration);
  } catch (_) {}
}

function toast(message) {
  const el = $("#toast");
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(el._timer);
  el._timer = setTimeout(() => el.classList.remove("show"), 1450);
}

function prepareBrief() {
  const config = rounds[state.round];
  $("#briefRound").textContent = `階段 ${state.round + 1} / ${rounds.length}`;
  $("#briefEyebrow").textContent = config.eyebrow;
  $("#briefTitle").textContent = config.name;
  $("#briefDescription").textContent = config.description;
  $("#briefRule").textContent = config.rule;
  showScreen("briefScreen");
}

function startGame() {
  state.round = 0;
  state.trial = 0;
  state.score = 0;
  state.results = [];
  state.roundShots = [];
  state.distractionHits = 0;
  prepareBrief();
}

function beginRound() {
  state.trial = 0;
  state.roundShots = [];
  state.distractionHits = 0;
  $("#roundLabel").textContent = `階段 ${state.round + 1} · ${rounds[state.round].name}`;
  $("#routinePanel").classList.toggle("hidden", !rounds[state.round].routine);
  showScreen("gameScreen");
  requestAnimationFrame(setupTrial);
}

function clearGameTimers() {
  state.timers.forEach(clearTimeout);
  state.timers = [];
  cancelAnimationFrame(state.raf);
  $("#noiseLayer").innerHTML = "";
  $("#countdownFlash").classList.remove("show");
}

function createFlight() {
  const fromLeft = Math.random() > .5;
  return {
    fromLeft,
    startX: fromLeft ? 4 : 96,
    endX: fromLeft ? 96 : 4,
    baseY: 70 + Math.random() * 8,
    apexY: 18 + Math.random() * 12,
    duration: 5900,
  };
}

function setupTrial() {
  clearGameTimers();
  const config = rounds[state.round];
  state.flight = createFlight();
  state.target = { x: state.flight.startX, y: state.flight.baseY };
  state.reticle = { x: 50, y: 68 };
  state.active = false;
  state.locked = false;
  state.routineDone = !config.routine;
  state.lockStarted = null;
  state.lockProgress = 0;
  state.launchedAt = null;
  state.acquiredAt = null;

  $("#target").classList.remove("in-flight");
  $("#launchGate").className = "launch-gate ready";
  $("#launchGate b").textContent = config.routine ? "先完成程序" : "守住中央，等待出靶";
  updateReticle();
  $("#reticle").classList.remove("locked");
  $("#lockBar").style.width = "0%";
  $("#lockText").textContent = "尋找目標";
  $("#lockTime").textContent = "0.0s";
  $("#fireButton").disabled = true;
  $("#fireHint").textContent = config.routine ? "先完成程序" : "等待出靶";
  $("#trialLabel").textContent = `${state.trial + 1} / ${state.trialsPerRound}`;
  $("#scoreLabel").textContent = state.score;
  const totalTrials = rounds.length * state.trialsPerRound;
  const completed = state.round * state.trialsPerRound + state.trial;
  $("#progressBar").style.width = `${(completed / totalTrials) * 100}%`;
  resetRoutine();
  if (!config.routine) scheduleLaunch();
}

function scheduleLaunch() {
  const delay = 650 + Math.random() * 850;
  state.timers.push(setTimeout(launchTarget, delay));
}

function launchTarget() {
  if (state.active) return;
  const config = rounds[state.round];
  state.active = true;
  state.launchedAt = performance.now();
  $("#target").classList.add("in-flight");
  $("#launchGate").classList.add("launched");
  $("#launchGate b").textContent = state.flight.fromLeft ? "左側出靶" : "右側出靶";
  $("#fireButton").disabled = false;
  $("#fireHint").textContent = "追上飛靶再射擊";
  tone(520, .08, "square", .025);
  createDistractions(config);
  if (config.pressure) runPressure();
  state.raf = requestAnimationFrame(lockLoop);
  state.timers.push(setTimeout(() => {
    if (!state.active) return;
    recordMiss();
  }, state.flight.duration + 180));
}

function updateFlight(timestamp) {
  const progress = Math.min(1, (timestamp - state.launchedAt) / state.flight.duration);
  const eased = progress * progress * (3 - 2 * progress);
  state.target.x = state.flight.startX + (state.flight.endX - state.flight.startX) * eased;
  state.target.y = state.flight.baseY + (state.flight.apexY - state.flight.baseY) * Math.sin(Math.PI * progress);
  $("#target").style.left = `${state.target.x}%`;
  $("#target").style.top = `${state.target.y}%`;
  $("#target").style.setProperty("--flight-tilt", `${state.flight.fromLeft ? -8 : 8}deg`);
  return progress;
}

function updateReticle() {
  $("#reticle").style.left = `${state.reticle.x}%`;
  $("#reticle").style.top = `${state.reticle.y}%`;
}

function setReticleFromPointer(event) {
  if (!state.active) return;
  const rect = $("#arena").getBoundingClientRect();
  state.reticle.x = Math.max(2, Math.min(98, ((event.clientX - rect.left) / rect.width) * 100));
  state.reticle.y = Math.max(2, Math.min(90, ((event.clientY - rect.top) / rect.height) * 100));
  updateReticle();
}

function targetDistance() {
  const arena = $("#arena").getBoundingClientRect();
  const dx = ((state.reticle.x - state.target.x) / 100) * arena.width;
  const dy = ((state.reticle.y - state.target.y) / 100) * arena.height;
  return Math.hypot(dx, dy);
}

function lockLoop(timestamp) {
  if (!state.active) return;
  const config = rounds[state.round];
  const flightProgress = updateFlight(timestamp);
  const distance = targetDistance();
  const inTarget = distance < 38;
  if (!state.acquiredAt && distance < 64) state.acquiredAt = timestamp;
  const routineAllowsLock = state.routineDone;
  if (inTarget && routineAllowsLock) {
    if (!state.lockStarted) state.lockStarted = timestamp;
    const elapsed = timestamp - state.lockStarted;
    state.lockProgress = Math.min(1, elapsed / config.lockMs);
    $("#lockText").textContent = state.lockProgress >= 1 ? "穩定完成" : "保持穩定";
    $("#lockTime").textContent = `${(elapsed / 1000).toFixed(1)}s`;
    $("#lockBar").style.width = `${state.lockProgress * 100}%`;
    if (state.lockProgress >= 1 && !state.locked) {
      state.locked = true;
      $("#reticle").classList.add("locked");
      $("#fireHint").textContent = "準備完成";
      tone(720, .12, "sine", .05);
    }
  } else {
    if (!state.locked) {
      state.lockStarted = null;
      state.lockProgress = 0;
      $("#lockBar").style.width = "0%";
      $("#lockText").textContent = routineAllowsLock ? "追蹤飛靶" : "先完成程序";
      $("#lockTime").textContent = "0.0s";
    }
  }
  if (flightProgress < 1) state.raf = requestAnimationFrame(lockLoop);
}

function createDistractions(config) {
  if (!config.distractors) return;
  for (let i = 0; i < config.distractors; i += 1) {
    const timer = setTimeout(() => {
      if (!state.active) return;
      const el = document.createElement("button");
      const size = 28 + Math.random() * 36;
      el.type = "button";
      const fakeClay = Math.random() > .55;
      el.className = `distractor${fakeClay ? " fake-clay" : Math.random() > .62 ? " salient" : ""}`;
      el.style.width = `${size}px`;
      el.style.height = `${size}px`;
      el.style.left = `${8 + Math.random() * 84}%`;
      el.style.top = `${10 + Math.random() * 69}%`;
      el.setAttribute("aria-label", "無關干擾");
      el.textContent = fakeClay ? "" : Math.random() > .5 ? "!" : "";
      el.addEventListener("pointerdown", (event) => {
        event.stopPropagation();
        state.distractionHits += 1;
        state.lockStarted = null;
        state.locked = false;
        $("#reticle").classList.remove("locked");
        $("#arena").classList.remove("shake");
        void $("#arena").offsetWidth;
        $("#arena").classList.add("shake");
        tone(170, .1, "square", .03);
        toast("注意力被無關刺激帶走了");
        el.remove();
      });
      $("#noiseLayer").append(el);
      state.timers.push(setTimeout(() => el.remove(), 1500 + Math.random() * 900));
    }, 550 + i * 720 + Math.random() * 500);
    state.timers.push(timer);
  }
}

function runPressure() {
  const messages = ["快！", "只剩一發", "別人已完成", "5", "3", "現在射！"];
  messages.forEach((message, index) => {
    state.timers.push(setTimeout(() => {
      if (!state.active) return;
      const flash = $("#countdownFlash");
      flash.textContent = message;
      flash.classList.remove("show");
      void flash.offsetWidth;
      flash.classList.add("show");
      tone(230 + index * 25, .06, "square", .018);
    }, 700 + index * 900));
  });
}

function resetRoutine() {
  $$("#routineSteps li").forEach((li) => li.className = "");
  $("#routineButton").disabled = false;
  $("#routineButton").textContent = "開始程序";
}

function runRoutine() {
  if (state.active || state.routineDone || !rounds[state.round].routine) return;
  const steps = $$("#routineSteps li");
  $("#routineButton").disabled = true;
  const sequence = [0, 900, 1800];
  sequence.forEach((delay, index) => {
    state.timers.push(setTimeout(() => {
      steps.forEach((li, i) => { li.className = i < index ? "done" : i === index ? "active" : ""; });
      $("#routineButton").textContent = ["吸氣…", "慢慢吐氣…", "看向目標…"][index];
      tone(380 + index * 100, .12, "sine", .025);
    }, delay));
  });
  state.timers.push(setTimeout(() => {
    steps.forEach((li) => li.className = "done");
    state.routineDone = true;
    $("#routineButton").textContent = "程序完成";
    $("#fireButton").disabled = false;
    $("#fireHint").textContent = "移動並穩定準星";
    toast("心理緩衝區已建立");
    scheduleLaunch();
  }, 2600));
}

function acquisitionTime() {
  return state.acquiredAt && state.launchedAt ? Math.round(state.acquiredAt - state.launchedAt) : null;
}

function recordMiss() {
  const acquireMs = acquisitionTime();
  state.roundShots.push({ score: 0, early: true, distance: targetDistance(), locked: false, acquireMs, missed: true });
  state.active = false;
  clearGameTimers();
  $("#target").classList.remove("in-flight");
  $("#fireButton").disabled = true;
  $("#fireHint").textContent = "飛靶已離場";
  toast("未及擊發：先找出轉移與追蹤卡點");
  state.timers.push(setTimeout(nextTrial, 850));
}

function fire() {
  if (!state.active || $("#fireButton").disabled) return;
  const distance = targetDistance();
  const early = !state.locked;
  const hitQuality = Math.max(0, Math.round(100 - distance * 1.65));
  const quietBonus = state.locked ? 20 : 0;
  const penalty = early ? 24 : 0;
  const shotScore = Math.max(0, Math.min(100, hitQuality + quietBonus - penalty));
  const acquireMs = acquisitionTime();
  state.score += shotScore;
  state.roundShots.push({ score: shotScore, early, distance, locked: state.locked, acquireMs, missed: false });
  state.active = false;
  clearGameTimers();
  tone(90, .16, "sawtooth", .07);
  $("#arena").classList.remove("shake");
  void $("#arena").offsetWidth;
  $("#arena").classList.add("shake");
  $("#fireButton").disabled = true;
  $("#target").classList.remove("in-flight");
  $("#fireHint").textContent = early ? "過早射擊" : shotScore >= 75 ? "穩定命中" : "完成射擊";
  $("#scoreLabel").textContent = state.score;
  state.timers.push(setTimeout(nextTrial, 700));
}

function nextTrial() {
  state.trial += 1;
  if (state.trial < state.trialsPerRound) {
    setupTrial();
    return;
  }
  finishRound();
}

function finishRound() {
  const config = rounds[state.round];
  const average = Math.round(state.roundShots.reduce((sum, shot) => sum + shot.score, 0) / state.roundShots.length);
  const early = state.roundShots.filter((shot) => shot.early).length;
  const stable = state.roundShots.filter((shot) => shot.locked).length;
  const acquired = state.roundShots.map((shot) => shot.acquireMs).filter((value) => value !== null);
  const acquireMs = acquired.length ? Math.round(acquired.reduce((sum, value) => sum + value, 0) / acquired.length) : null;
  state.results.push({ name: config.name, average, early, stable, distractions: state.distractionHits, acquireMs });
  $("#transitionEyebrow").textContent = `${config.eyebrow} COMPLETE`;
  $("#transitionTitle").textContent = `${config.name}完成`;
  $("#roundSummary").innerHTML = `
    <div><strong>${average}</strong><small>階段表現</small></div>
    <div><strong>${stable}/${state.trialsPerRound}</strong><small>穩定後射擊</small></div>
    <div><strong>${acquireMs === null ? "—" : acquireMs}</strong><small>轉移時間 ms</small></div>`;
  $("#transitionInsight").textContent = config.insight;
  $("#nextRoundButton span:first-child").textContent = state.round === rounds.length - 1 ? "查看我的結果" : "進入下一階段";
  showScreen("transitionScreen");
}

function nextRound() {
  state.round += 1;
  if (state.round >= rounds.length) {
    renderResults();
    return;
  }
  prepareBrief();
}

function clamp(value) { return Math.max(0, Math.min(100, Math.round(value))); }

function renderResults() {
  const [baseline, distraction, pressure, routine] = state.results;
  const overall = clamp(state.results.reduce((sum, item) => sum + item.average, 0) / state.results.length);
  const dan = clamp((baseline.average + distraction.average) / 2 - distraction.distractions * 4);
  const transferSamples = state.results.map((item) => item.acquireMs).filter((value) => value !== null);
  const meanTransfer = transferSamples.length ? transferSamples.reduce((sum, value) => sum + value, 0) / transferSamples.length : 1800;
  const van = clamp(112 - meanTransfer / 22 - (distraction.distractions + pressure.distractions) * 7);
  const qe = clamp((state.results.reduce((sum, item) => sum + item.stable, 0) / (state.trialsPerRound * rounds.length)) * 100);
  const pressureRegulation = clamp(55 + (routine.average - pressure.average) * 1.6 + (pressure.early - routine.early) * 9);
  $("#finalScore").textContent = overall;
  $("#scoreRing").style.setProperty("--score-angle", `${overall * 3.6}deg`);
  $("#scoreCaption").textContent = overall >= 80 ? "穩定而有選擇" : overall >= 60 ? "已能察覺注意力變化" : "再試一次，觀察自己的節奏";
  const metrics = [["dan",dan],["van",van],["qe",qe],["pressure",pressureRegulation]];
  metrics.forEach(([id,value]) => {
    $(`#${id}Value`).textContent = `${value}%`;
    requestAnimationFrame(() => { $(`#${id}Bar`).style.width = `${value}%`; });
  });
  $("#roundBars").innerHTML = state.results.map((item, index) => `
    <div class="bar-item">
      <div class="bar-visual" style="--height:${Math.max(15,item.average)}%"><strong>${item.average}</strong></div>
      <small>${index + 1}. ${item.name}</small>
    </div>`).join("");

  const delta = routine.average - pressure.average;
  if (delta >= 8) {
    $("#learningTitle").textContent = "程序幫你把注意力帶回可控制的事";
    $("#learningText").textContent = `加入賽前程序後，你的表現比壓力階段提高 ${delta} 分。程序不是魔法，而是讓準備、凝視與動作之間重新出現一段緩衝。`;
  } else if (delta <= -8) {
    $("#learningTitle").textContent = "新程序也需要練習，才不會變成另一項負擔";
    $("#learningText").textContent = `加入程序後，表現暫時下降 ${Math.abs(delta)} 分。這不代表程序無效；第一次執行陌生步驟，本身就會占用注意力。`;
  } else {
    $("#learningTitle").textContent = "注意力調節不一定立刻反映在分數上";
    $("#learningText").textContent = `壓力與程序階段相差 ${Math.abs(delta)} 分。除了分數，也回想你是否更清楚自己何時開始急、何時真正準備完成。`;
  }
  showScreen("resultScreen");
}

function moveWithKeyboard(event) {
  if (!state.active) return;
  const delta = event.shiftKey ? 1 : 2.5;
  const moves = { ArrowLeft: [-delta,0], ArrowRight:[delta,0], ArrowUp:[0,-delta], ArrowDown:[0,delta] };
  if (moves[event.key]) {
    event.preventDefault();
    state.reticle.x = Math.max(2, Math.min(98, state.reticle.x + moves[event.key][0]));
    state.reticle.y = Math.max(2, Math.min(90, state.reticle.y + moves[event.key][1]));
    updateReticle();
  }
  if (event.code === "Space") { event.preventDefault(); fire(); }
}

$("#startButton").addEventListener("click", startGame);
$("#demoButton").addEventListener("click", () => $("#infoDialog").showModal());
$("#howButton").addEventListener("click", () => $("#infoDialog").showModal());
$("#beginRoundButton").addEventListener("click", beginRound);
$("#nextRoundButton").addEventListener("click", nextRound);
$("#retryButton").addEventListener("click", startGame);
$("#teacherButton").addEventListener("click", () => $("#teacherDialog").showModal());
$("#routineButton").addEventListener("click", runRoutine);
$("#fireButton").addEventListener("click", fire);
$("#arena").addEventListener("pointerdown", (event) => { $("#arena").setPointerCapture?.(event.pointerId); setReticleFromPointer(event); });
$("#arena").addEventListener("pointermove", (event) => { if (event.buttons || event.pointerType === "touch") setReticleFromPointer(event); });
$("#soundButton").addEventListener("click", () => {
  state.sound = !state.sound;
  $("#soundButton").setAttribute("aria-pressed", String(state.sound));
  $("#soundButton").setAttribute("aria-label", state.sound ? "關閉音效" : "開啟音效");
  $("#soundButton span").textContent = state.sound ? "♪" : "×";
  if (state.sound) tone(540);
});
$("[data-action='home']").addEventListener("click", (event) => { event.preventDefault(); clearGameTimers(); showScreen("startScreen"); });
$$('[data-close-dialog]').forEach((button) => button.addEventListener("click", () => button.closest("dialog").close()));
document.addEventListener("keydown", moveWithKeyboard);

showScreen("startScreen");
