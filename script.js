
/* ==========================================
   DoodleDhamaka - Frontend Game Logic
   Step 3: Local drawing + UI interactions
========================================== */

"use strict";

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const state = {
  playerName: "",
  avatar: "😎",
  roomCode: "",
  isDrawer: true,
  selectedColor: "#171717",
  brushSize: 6,
  eraser: false,
  drawing: false,
  lastPoint: null,
  strokes: [],
  currentStroke: null,
  socket: null,
  soundEnabled: true
};

const loadingScreen = $("#loadingScreen");
const app = $("#app");
const canvas = $("#drawingCanvas");
const ctx = canvas?.getContext("2d");

let toastTimeout;
let localRoundTimer = null;

/* ---------- Startup ---------- */

document.addEventListener("DOMContentLoaded", () => {
  setupCanvas();
  setupAvatars();
  setupColors();
  setupBrushTools();
  setupNavigation();
  setupHomeButtons();
  setupLobbyButtons();
  setupChat();
  setupResults();
  setupSound();

  window.setTimeout(() => {
    loadingScreen?.classList.add("hidden");
    app?.classList.remove("hidden");
  }, 650);

  addChatMessage("Welcome to DoodleDhamaka! 🎨", "system");
});

/* ---------- Helpers ---------- */

function showToast(message, type = "") {
  const toast = $("#toast");
  if (!toast) return;

  toast.textContent = message;
  toast.className = "toast";

  if (type) toast.classList.add(type);

  window.clearTimeout(toastTimeout);
  toastTimeout = window.setTimeout(() => {
    toast.classList.add("hidden");
  }, 2800);
}

function setError(message = "") {
  const el = $("#homeError");
  if (el) el.textContent = message;
}

function getPlayerName() {
  const input = $("#playerName");
  const name = input?.value.trim() || "";

  if (!name) {
    setError("Please enter your player name first.");
    input?.focus();
    return null;
  }

  if (name.length < 2) {
    setError("Name must have at least 2 characters.");
    input?.focus();
    return null;
  }

  state.playerName = name.slice(0, 16);
  setError("");
  return state.playerName;
}

function randomRoomCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function switchScreen(screenId) {
  $$(".screen").forEach((screen) => {
    screen.classList.remove("active");
    screen.classList.add("hidden");
  });

  const target = document.getElementById(screenId);
  if (!target) return;

  target.classList.remove("hidden");
  target.classList.add("active");

  window.scrollTo({ top: 0, behavior: "smooth" });
}

function showModal(id) {
  document.getElementById(id)?.classList.remove("hidden");
}

function hideModal(id) {
  document.getElementById(id)?.classList.add("hidden");
}

/* ---------- Avatars ---------- */

function setupAvatars() {
  const avatarButtons = $$(".avatar-option");

  avatarButtons.forEach((button) => {
    button.addEventListener("click", () => {
      avatarButtons.forEach((item) =>
        item.classList.remove("selected")
      );

      button.classList.add("selected");
      state.avatar = button.dataset.avatar || "😎";

      const preview = $("#avatarPreview");
      if (preview) preview.textContent = state.avatar;
    });
  });
}

/* ---------- Home Buttons ---------- */

function setupHomeButtons() {
  $("#createRoomBtn")?.addEventListener("click", () => {
    if (!getPlayerName()) return;

    state.roomCode = randomRoomCode();
    state.isDrawer = true;

    openLocalLobby();
    showToast("Demo room created. Multiplayer is not connected yet.");
  });

  $("#joinRoomBtn")?.addEventListener("click", () => {
    if (!getPlayerName()) return;

    const code = $("#roomCodeInput")?.value.trim() || "";

    if (!/^\d{6}$/.test(code)) {
      setError("Enter a valid 6-digit room code.");
      return;
    }

    setError("");

    // Local demo cannot join another device's room.
    // A real server will handle this in Step 4.
    showToast(
      "Real online joining will work after the multiplayer server is connected."
    );
  });

  $("#roomCodeInput")?.addEventListener("input", (event) => {
    event.target.value = event.target.value.replace(/\D/g, "").slice(0, 6);
  });

  $("#playerName")?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") $("#createRoomBtn")?.click();
  });
}

/* ---------- Local Demo Lobby ---------- */

function openLocalLobby() {
  const code = $("#displayRoomCode");
  const gameCode = $("#gameRoomCode");

  if (code) code.textContent = state.roomCode;
  if (gameCode) gameCode.textContent = state.roomCode;

  const players = $("#lobbyPlayers");

  if (players) {
    players.replaceChildren();

    addPlayerCard(
      players,
      state.playerName,
      state.avatar,
      "Room Host"
    );
  }

  const count = $("#lobbyPlayerCount");
  if (count) count.textContent = "1/8";

  const message = $("#lobbyMessage");
  if (message) {
    message.textContent =
      "Demo Mode: only your local player is available.";
  }

  const startButton = $("#startGameBtn");
  if (startButton) startButton.textContent = "🎨 START DEMO";

  switchScreen("lobbyScreen");
}

function addPlayerCard(container, name, avatar, role) {
  const card = document.createElement("div");
  card.className = "player-card";

  const emoji = document.createElement("span");
  emoji.className = "player-avatar";
  emoji.textContent = avatar;

  const info = document.createElement("div");
  const strong = document.createElement("strong");
  const small = document.createElement("small");

  strong.textContent = name;
  small.textContent = role;

  info.append(strong, small);
  card.append(emoji, info);
  container.appendChild(card);
}

/* ---------- Lobby Buttons ---------- */

function setupLobbyButtons() {
  $("#copyCodeBtn")?.addEventListener("click", async () => {
    if (!state.roomCode) return;

    try {
      await navigator.clipboard.writeText(state.roomCode);
      showToast("Room code copied!", "success");
    } catch {
      showToast("Your room code is " + state.roomCode);
    }
  });

  $("#shareRoomBtn")?.addEventListener("click", async () => {
    const shareData = {
      title: "Join my DoodleDhamaka room",
      text: "Let's play DoodleDhamaka! Room code: " + state.roomCode
    };

    try {
      if (navigator.share) {
        await navigator.share(shareData);
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(
          shareData.text
        );
        showToast("Invite text copied!", "success");
      } else {
        showToast(shareData.text);
      }
    } catch (error) {
      if (error.name !== "AbortError") {
        showToast("Room code: " + state.roomCode);
      }
    }
  });

  $("#startGameBtn")?.addEventListener("click", startLocalDemo);

  $("#leaveLobbyBtn")?.addEventListener("click", returnHome);
  $("#leaveGameBtn")?.addEventListener("click", () => {
    window.clearInterval(localRoundTimer);
    returnHome();
  });
}

/* ---------- Demo Game ---------- */

function startLocalDemo() {
  state.isDrawer = true;

  switchScreen("gameScreen");

  const roundSelect = $("#roundSelect");
  const rounds = Number(roundSelect?.value || 5);

  const timeSelect = $("#timeSelect");
  const seconds = Number(timeSelect?.value || 80);

  const roundDisplay = $("#roundDisplay");
  if (roundDisplay) roundDisplay.textContent = "1 / " + rounds;

  const drawer = $("#drawerName");
  if (drawer) drawer.textContent = state.playerName + " (You)";

  const status = $("#turnStatus");
  if (status) {
    status.textContent =
      "Demo Mode: draw on the canvas below!";
  }

  const hint = $("#wordHint");
  if (hint) hint.textContent = "DEMO";

  resetCanvas();
  addChatMessage(
    "You started a local demo. Online players will be added in the next step.",
    "system"
  );

  startLocalTimer(seconds);
}

function startLocalTimer(seconds) {
  window.clearInterval(localRoundTimer);

  let remaining = seconds;
  const timer = $("#timerDisplay");

  if (timer) timer.textContent = String(remaining);

  localRoundTimer = window.setInterval(() => {
    remaining--;

    if (timer) timer.textContent = String(Math.max(remaining, 0));

    if (remaining <= 0) {
      window.clearInterval(localRoundTimer);
      showToast("Demo timer finished!");
      finishLocalDemo();
    }
  }, 1000);
}

function finishLocalDemo() {
  const word = $("#correctWordDisplay");
  if (word) word.textContent = "Demo Round";

  const scores = $("#roundScores");
  if (scores) {
    scores.textContent = "Online scoring will be added with the server.";
  }

  showModal("roundResultModal");

  window.setTimeout(() => {
    hideModal("roundResultModal");
  }, 2500);
}

/* ---------- Drawing Canvas ---------- */

function setupCanvas() {
  if (!canvas || !ctx) return;

  canvas.style.touchAction = "none";

  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  canvas.addEventListener("pointerdown", beginStroke);
  canvas.addEventListener("pointermove", continueStroke);

  window.addEventListener("pointerup", endStroke);
  window.addEventListener("pointercancel", endStroke);

  // Prevent a long touch from opening the browser menu.
  canvas.addEventListener("contextmenu", (event) => {
    event.preventDefault();
  });

  resetCanvas();
}

function getCanvasPoint(event) {
  const rect = canvas.getBoundingClientRect();

  return {
    x: (event.clientX - rect.left) * (canvas.width / rect.width),
    y: (event.clientY - rect.top) * (canvas.height / rect.height)
  };
}

function beginStroke(event) {
  if (!canvas || !ctx) return;
  if (!state.isDrawer) return;

  if (event.pointerType === "mouse" && event.button !== 0) return;

  event.preventDefault();

  try {
    canvas.setPointerCapture(event.pointerId);
  } catch {}

  state.drawing = true;
  state.lastPoint = getCanvasPoint(event);

  state.currentStroke = {
    color: state.eraser ? "#ffffff" : state.selectedColor,
    size: state.brushSize,
    points: [{ ...state.lastPoint }]
  };

  drawDot(state.lastPoint, state.currentStroke);
}

function continueStroke(event) {
  if (!state.drawing || !state.currentStroke) return;

  event.preventDefault();

  const point = getCanvasPoint(event);
  const stroke = state.currentStroke;

  ctx.beginPath();
  ctx.strokeStyle = stroke.color;
  ctx.lineWidth = stroke.size;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  ctx.moveTo(state.lastPoint.x, state.lastPoint.y);
  ctx.lineTo(point.x, point.y);
  ctx.stroke();

  stroke.points.push({ ...point });
  state.lastPoint = point;
}

function endStroke() {
  if (!state.drawing) return;

  state.drawing = false;

  if (state.currentStroke) {
    state.strokes.push(state.currentStroke);
  }

  state.currentStroke = null;
  state.lastPoint = null;
}

function drawDot(point, stroke) {
  ctx.beginPath();
  ctx.fillStyle = stroke.color;
  ctx.arc(point.x, point.y, stroke.size / 2, 0, Math.PI * 2);
  ctx.fill();
}

function redrawCanvas() {
  if (!ctx || !canvas) return;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  state.strokes.forEach((stroke) => {
    if (!stroke.points.length) return;

    ctx.beginPath();
    ctx.strokeStyle = stroke.color;
    ctx.lineWidth = stroke.size;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    const first = stroke.points[0];

    if (stroke.points.length === 1) {
      drawDot(first, stroke);
      return;
    }

    ctx.moveTo(first.x, first.y);

    for (let i = 1; i < stroke.points.length; i++) {
      ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
    }

    ctx.stroke();
  });
}

function resetCanvas() {
  if (!canvas || !ctx) return;

  state.drawing = false;
  state.lastPoint = null;
  state.currentStroke = null;
  state.strokes = [];

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

/* ---------- Drawing Tools ---------- */

function setupColors() {
  $$(".color-swatch").forEach((button) => {
    button.addEventListener("click", () => {
      $$(".color-swatch").forEach((item) =>
        item.classList.remove("active")
      );

      button.classList.add("active");
      state.selectedColor = button.dataset.color || "#171717";
      state.eraser = false;

      $("#eraserBtn")?.classList.remove("active");
      $("#brushBtn")?.classList.add("active");
    });
  });
}

function setupBrushTools() {
  $("#brushSize")?.addEventListener("input", (event) => {
    state.brushSize = Number(event.target.value);
  });

  $("#brushBtn")?.addEventListener("click", () => {
    state.eraser = false;
    $("#brushBtn")?.classList.add("active");
    $("#eraserBtn")?.classList.remove("active");
  });

  $("#eraserBtn")?.addEventListener("click", () => {
    state.eraser = true;
    $("#eraserBtn")?.classList.add("active");
    $("#brushBtn")?.classList.remove("active");
  });

  $("#clearCanvasBtn")?.addEventListener("click", () => {
    if (!state.isDrawer) return;
    resetCanvas();
    showToast("Canvas cleared!");
  });

  $("#undoBtn")?.addEventListener("click", () => {
    if (!state.isDrawer || !state.strokes.length) return;

    state.strokes.pop();
    redrawCanvas();
  });
}

/* ---------- Chat UI ---------- */

function setupChat() {
  $("#guessForm")?.addEventListener("submit", (event) => {
    event.preventDefault();

    const input = $("#guessInput");
    const message = input?.value.trim();

    if (!message) return;

    addChatMessage(state.playerName || "You", "chat", message);
    input.value = "";

    showToast(
      "Demo chat only. Real guesses need the multiplayer server."
    );
  });
}

function addChatMessage(name, type = "chat", message = "") {
  const container = $("#chatMessages");
  if (!container) return;

  const row = document.createElement("div");
  row.className = "chat-message";

  if (type === "system") {
    row.classList.add("system");
    row.textContent = name;
  } else {
    const strong = document.createElement("strong");
    strong.textContent = name + ": ";

    const text = document.createElement("span");
    text.textContent = message;

    row.append(strong, text);
  }

  container.appendChild(row);
  container.scrollTop = container.scrollHeight;
}

/* ---------- Results & Navigation ---------- */

function setupResults() {
  $("#playAgainBtn")?.addEventListener("click", () => {
    hideModal("roundResultModal");
    openLocalLobby();
  });

  $("#backHomeBtn")?.addEventListener("click", returnHome);

  $("#homeLogo")?.addEventListener("click", (event) => {
    event.preventDefault();
    returnHome();
  });
}

function setupNavigation() {
  // Screen navigation is controlled through game buttons.
}

function returnHome() {
  window.clearInterval(localRoundTimer);

  hideModal("wordModal");
  hideModal("roundResultModal");

  state.roomCode = "";
  state.isDrawer = true;

  switchScreen("homeScreen");
}

/* ---------- Sound Toggle ---------- */

function setupSound() {
  $("#soundBtn")?.addEventListener("click", () => {
    state.soundEnabled = !state.soundEnabled;

    const button = $("#soundBtn");
    if (button) {
      button.textContent = state.soundEnabled ? "🔊" : "🔇";
    }

    showToast(
      state.soundEnabled
        ? "Sound enabled."
        : "Sound muted. Game sounds are not added yet."
    );
  });
}

/*
  MULTIPLAYER STATUS

  This version is a local demo.
  It does not yet connect players across devices.

  In the backend step we will add:
  - Socket.IO connection
  - Server-generated room codes
  - Real player synchronization
  - Shared drawing strokes
  - Server-validated guesses and scores
  - Authoritative round timer
*/
// DoodleDhamaka multiplayer connection test
const multiplayerSocket = io();

multiplayerSocket.on("connect", () => {
  console.log("Multiplayer connected:", multiplayerSocket.id);
});

multiplayerSocket.on("connected", (data) => {
  console.log(data.message);
});

multiplayerSocket.on("gameError", (data) => {
  console.error("Game error:", data.message);
});

/* DoodleDhamaka — Multiplayer Room Integration */

const ddSocket = window.multiplayerSocket || io();

let ddCurrentRoom = null;

function ddGetPlayerName() {
  const input = document.getElementById("playerName");
  return input ? input.value.trim() : "";
}

function ddGetAvatar() {
  const selected = document.querySelector(".avatar-option.selected");
  return selected?.dataset.avatar || "😎";
}

function ddShowError(message) {
  const error = document.getElementById("homeError");

  if (error) {
    error.textContent = message;
    error.classList.remove("hidden");
  } else {
    alert(message);
  }
}

function ddHideError() {
  const error = document.getElementById("homeError");
  if (error) {
    error.textContent = "";
    error.classList.add("hidden");
  }
}

function ddShowScreen(screenId) {
  document.querySelectorAll(".screen").forEach((screen) => {
    screen.classList.remove("active");
    screen.classList.add("hidden");
  });

  const screen = document.getElementById(screenId);

  if (screen) {
    screen.classList.remove("hidden");
    screen.classList.add("active");
  }
}

function ddCreateRoom() {
  ddHideError();

  const name = ddGetPlayerName();

  if (name.length < 2) {
    ddShowError("Please enter a name with at least 2 characters.");
    return;
  }

  ddSocket.emit("createRoom", {
    name,
    avatar: ddGetAvatar()
  });
}

function ddJoinRoom() {
  ddHideError();

  const name = ddGetPlayerName();
  const codeInput = document.getElementById("roomCodeInput");
  const code = codeInput ? codeInput.value.trim() : "";

  if (name.length < 2) {
    ddShowError("Please enter a name with at least 2 characters.");
    return;
  }

  if (!/^\d{6}$/.test(code)) {
    ddShowError("Please enter a valid 6-digit room code.");
    return;
  }

  ddSocket.emit("joinRoom", {
    name,
    avatar: ddGetAvatar(),
    code
  });
}

function ddRenderRoom(room) {
  ddCurrentRoom = room;

  const codeElements = [
    document.getElementById("displayRoomCode"),
    document.getElementById("gameRoomCode")
  ];

  codeElements.forEach((element) => {
    if (element) element.textContent = room.code;
  });

  const count = document.getElementById("lobbyPlayerCount");
  if (count) count.textContent = room.players.length;

  const list = document.getElementById("lobbyPlayers");

  if (list) {
    list.replaceChildren();

    room.players.forEach((player) => {
      const item = document.createElement("div");
      item.className = "lobby-player";

      const avatar = document.createElement("span");
      avatar.textContent = player.avatar || "😎";

      const name = document.createElement("span");
      name.textContent = player.name;

      const role = document.createElement("span");
      role.textContent = player.isHost ? "HOST" : "";

      item.append(avatar, name, role);
      list.appendChild(item);
    });
  }

  const startButton = document.getElementById("startGameBtn");

  if (startButton) {
    const myPlayer = room.players.find(
      (player) => player.id === ddSocket.id
    );

    startButton.disabled =
      !myPlayer?.isHost || room.players.length < 2;
  }

  const message = document.getElementById("lobbyMessage");

  if (message) {
    message.textContent =
      room.players.length < 2
        ? "Share the room code and wait for another player."
        : "Players ready! The host can start the game.";
  }

  ddShowScreen("lobbyScreen");
}

ddSocket.on("roomCreated", ddRenderRoom);
ddSocket.on("roomJoined", ddRenderRoom);
ddSocket.on("roomUpdate", (room) => {
  if (ddCurrentRoom && room.code === ddCurrentRoom.code) {
    ddRenderRoom(room);
  }
});

ddSocket.on("gameError", (data) => {
  ddShowError(data.message || "Something went wrong.");
});

const ddCreateButton = document.getElementById("createRoomBtn");
if (ddCreateButton) {
  ddCreateButton.addEventListener("click", ddCreateRoom);
}

const ddJoinButton = document.getElementById("joinRoomBtn");
if (ddJoinButton) {
  ddJoinButton.addEventListener("click", ddJoinRoom);
}

const ddCopyButton = document.getElementById("copyCodeBtn");
if (ddCopyButton) {
  ddCopyButton.addEventListener("click", async () => {
    if (!ddCurrentRoom) return;

    try {
      await navigator.clipboard.writeText(ddCurrentRoom.code);
      alert("Room code copied!");
    } catch {
      alert("Your room code is: " + ddCurrentRoom.code);
    }
  });
}

const ddLeaveButton = document.getElementById("leaveLobbyBtn");
if (ddLeaveButton) {
  ddLeaveButton.addEventListener("click", () => {
    ddSocket.emit("leaveRoom");
    ddCurrentRoom = null;
    ddShowScreen("homeScreen");
  });
}

const ddStartButton = document.getElementById("startGameBtn");
if (ddStartButton) {
  ddStartButton.addEventListener("click", () => {
    ddSocket.emit("startGame");
  });
}

ddSocket.on("roundStarted", (data) => {
  const round = document.getElementById("roundDisplay");
  if (round) {
    round.textContent = `${data.round} / ${data.maxRounds}`;
  }

  ddShowScreen("gameScreen");
});

console.log("DoodleDhamaka room integration loaded.");
