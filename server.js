
"use strict";

const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");
const crypto = require("crypto");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  maxHttpBufferSize: 1e5,
  cors: { origin: "*" }
});

const PORT = process.env.PORT || 3000;
const MAX_PLAYERS = 8;
const ROUND_SECONDS = 80;
const MAX_ROUNDS = 5;

const rooms = new Map();

const WORDS = [
  "ELEPHANT", "RAINBOW", "MANGO", "ROCKET",
  "PIZZA", "TIGER", "CASTLE", "CRICKET",
  "BICYCLE", "SUNFLOWER", "UMBRELLA",
  "BUTTERFLY", "AIRPLANE", "CHOCOLATE",
  "MOUNTAIN", "PINEAPPLE", "GUITAR",
  "LANTERN", "DINOSAUR", "WATERFALL"
];

app.use(express.static(__dirname));

app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    service: "DoodleDhamaka",
    rooms: rooms.size
  });
});

function cleanText(value, maxLength = 20) {
  if (typeof value !== "string") return "";
  return value.trim().replace(/\s+/g, " ").slice(0, maxLength);
}

function validRoomCode(value) {
  return typeof value === "string" && /^\d{6}$/.test(value);
}

function makeRoomCode() {
  let code;

  do {
    code = String(crypto.randomInt(100000, 1000000));
  } while (rooms.has(code));

  return code;
}

function publicPlayers(room) {
  return [...room.players.values()].map((player) => ({
    id: player.id,
    name: player.name,
    avatar: player.avatar,
    score: player.score,
    isHost: player.id === room.hostId
  }));
}

function roomSnapshot(room) {
  return {
    code: room.code,
    status: room.status,
    players: publicPlayers(room),
    round: room.round,
    maxRounds: room.maxRounds,
    drawerId: room.drawerId,
    endsAt: room.endsAt,
    wordHint: room.word
      ? room.word.replace(/[A-Z]/g, "_")
      : ""
  };
}

function emitRoom(room, event, payload) {
  io.to(room.code).emit(event, payload);
}

function sendError(socket, message) {
  socket.emit("gameError", { message });
}

function getPlayerRoom(socket) {
  const code = socket.data.roomCode;
  const room = code ? rooms.get(code) : null;

  if (!room || !room.players.has(socket.id)) return null;

  return room;
}

function addSystemMessage(room, message) {
  emitRoom(room, "chatMessage", {
    type: "system",
    message: cleanText(message, 150)
  });
}

function updatePlayers(room) {
  emitRoom(room, "roomUpdate", roomSnapshot(room));
}

function stopTimer(room) {
  if (room.timer) clearTimeout(room.timer);
  room.timer = null;
}

function resetRoom(room) {
  stopTimer(room);
  room.status = "lobby";
  room.round = 0;
  room.drawerId = null;
  room.word = null;
  room.endsAt = null;
  room.lastDrawAt = 0;
  room.strokes = [];
  room.guessed = new Set();
}

function closeRoom(room) {
  stopTimer(room);

  for (const id of room.players.keys()) {
    const playerSocket = io.sockets.sockets.get(id);

    if (playerSocket) {
      playerSocket.leave(room.code);
      delete playerSocket.data.roomCode;
    }
  }

  rooms.delete(room.code);
}

function pickDrawer(room) {
  const players = [...room.players.values()];

  if (!players.length) return null;

  const index = room.round % players.length;
  return players[index].id;
}

function endRound(room) {
  if (!rooms.has(room.code) || room.status !== "playing") return;

  stopTimer(room);

  const answer = room.word;

  emitRoom(room, "roundEnded", {
    word: answer,
    players: publicPlayers(room)
  });

  room.status = "betweenRounds";
  room.word = null;
  room.drawerId = null;
  room.endsAt = null;

  updatePlayers(room);

  room.timer = setTimeout(() => {
    if (!rooms.has(room.code)) return;

    if (room.round >= room.maxRounds) {
      finishGame(room);
    } else {
      startRound(room);
    }
  }, 3500);
}

function startRound(room) {
  if (!rooms.has(room.code)) return;

  stopTimer(room);

  if (room.players.size < 2) {
    resetRoom(room);
    addSystemMessage(room, "Waiting for at least 2 players.");
    updatePlayers(room);
    return;
  }

  room.status = "playing";
  room.round += 1;
  room.drawerId = pickDrawer(room);
  room.word = WORDS[crypto.randomInt(WORDS.length)];
  room.endsAt = Date.now() + ROUND_SECONDS * 1000;
  room.lastDrawAt = 0;
  room.strokes = [];
  room.guessed = new Set();

  emitRoom(room, "roundStarted", {
    round: room.round,
    maxRounds: room.maxRounds,
    drawerId: room.drawerId,
    endsAt: room.endsAt,
    seconds: ROUND_SECONDS
  });

  const drawerSocket = io.sockets.sockets.get(room.drawerId);

  if (drawerSocket) {
    drawerSocket.emit("yourWord", { word: room.word });
  }

  updatePlayers(room);

  room.timer = setTimeout(() => {
    endRound(room);
  }, ROUND_SECONDS * 1000);
}

function finishGame(room) {
  stopTimer(room);

  room.status = "finished";

  const results = publicPlayers(room).sort(
    (a, b) => b.score - a.score
  );

  emitRoom(room, "gameFinished", { players: results });
  updatePlayers(room);
}

io.on("connection", (socket) => {
  socket.emit("connected", {
    id: socket.id,
    message: "Connected to DoodleDhamaka server"
  });

  socket.on("createRoom", (data = {}) => {
    if (socket.data.roomCode) {
      return sendError(socket, "Leave your current room first.");
    }

    const name = cleanText(data.name, 16);
    const avatar = cleanText(data.avatar, 8) || "😎";

    if (name.length < 2) {
      return sendError(socket, "Enter a name with at least 2 characters.");
    }

    const code = makeRoomCode();

    const room = {
      code,
      hostId: socket.id,
      players: new Map(),
      status: "lobby",
      round: 0,
      maxRounds: MAX_ROUNDS,
      drawerId: null,
      word: null,
      endsAt: null,
      timer: null,
      lastDrawAt: 0,
      strokes: [],
      guessed: new Set()
    };

    room.players.set(socket.id, {
      id: socket.id,
      name,
      avatar,
      score: 0
    });

    rooms.set(code, room);
    socket.join(code);
    socket.data.roomCode = code;

    socket.emit("roomCreated", roomSnapshot(room));
    updatePlayers(room);

    addSystemMessage(room, `${name} created the room.`);
  });

  socket.on("joinRoom", (data = {}) => {
    if (socket.data.roomCode) {
      return sendError(socket, "Leave your current room first.");
    }

    const code = cleanText(data.code, 6);
    const name = cleanText(data.name, 16);
    const avatar = cleanText(data.avatar, 8) || "😎";

    if (!validRoomCode(code)) {
      return sendError(socket, "Room code must have 6 digits.");
    }

    if (name.length < 2) {
      return sendError(socket, "Enter a valid player name.");
    }

    const room = rooms.get(code);

    if (!room) return sendError(socket, "Room not found.");

    if (room.status !== "lobby") {
      return sendError(socket, "This game has already started.");
    }

    if (room.players.size >= MAX_PLAYERS) {
      return sendError(socket, "This room is full.");
    }

    room.players.set(socket.id, {
      id: socket.id,
      name,
      avatar,
      score: 0
    });

    socket.join(code);
    socket.data.roomCode = code;

    socket.emit("roomJoined", roomSnapshot(room));
    updatePlayers(room);

    addSystemMessage(room, `${name} joined the room.`);
  });

  socket.on("startGame", () => {
    const room = getPlayerRoom(socket);

    if (!room) return sendError(socket, "Join a room first.");

    if (room.hostId !== socket.id) {
      return sendError(socket, "Only the host can start the game.");
    }

    if (room.status !== "lobby") {
      return sendError(socket, "The game has already started.");
    }

    if (room.players.size < 2) {
      return sendError(socket, "At least 2 players are required.");
    }

    const rounds = room.maxRounds;

    for (const player of room.players.values()) {
      player.score = 0;
    }

    room.round = 0;
    room.maxRounds = rounds;

    addSystemMessage(room, "The game is starting!");
    startRound(room);
  });

  socket.on("draw", (data = {}) => {
    const room = getPlayerRoom(socket);

    if (
      !room ||
      room.status !== "playing" ||
      room.drawerId !== socket.id
    ) return;

    // Simple rate limit to discourage flooding.
    const now = Date.now();

    if (now - room.lastDrawAt < 12) return;

    room.lastDrawAt = now;

    const stroke = data.stroke;

    if (!stroke || typeof stroke !== "object") return;

    const color = cleanText(stroke.color, 7);

    if (!/^#[0-9a-fA-F]{6}$/.test(color)) return;

    const size = Number(stroke.size);

    if (!Number.isFinite(size) || size < 1 || size > 30) return;

    if (!Array.isArray(stroke.points)) return;
    if (stroke.points.length < 1 || stroke.points.length > 100) return;

    const points = [];

    for (const point of stroke.points) {
      const x = Number(point.x);
      const y = Number(point.y);

      if (
        !Number.isFinite(x) ||
        !Number.isFinite(y) ||
        x < 0 || x > 1000 ||
        y < 0 || y > 1000
      ) return;

      points.push({ x, y });
    }

    const cleanStroke = {
      color,
      size,
      points
    };

    room.strokes.push(cleanStroke);

    // Keep late join/reconnect drawing history bounded.
    if (room.strokes.length > 500) {
      room.strokes.shift();
    }

    socket.to(room.code).emit("draw", {
      stroke: cleanStroke
    });
  });

  socket.on("clearCanvas", () => {
    const room = getPlayerRoom(socket);

    if (
      !room ||
      room.status !== "playing" ||
      room.drawerId !== socket.id
    ) return;

    room.strokes = [];
    emitRoom(room, "canvasCleared", {});
  });

  socket.on("undoStroke", () => {
    const room = getPlayerRoom(socket);

    if (
      !room ||
      room.status !== "playing" ||
      room.drawerId !== socket.id
    ) return;

    room.strokes.pop();
    emitRoom(room, "canvasHistory", {
      strokes: room.strokes
    });
  });

  socket.on("chatMessage", (data = {}) => {
    const room = getPlayerRoom(socket);

    if (!room) return;

    const message = cleanText(data.message, 120);

    if (!message) return;

    const player = room.players.get(socket.id);

    if (room.status === "playing" && socket.id === room.drawerId) {
      return sendError(socket, "The drawer cannot send guesses.");
    }

    if (room.status === "playing" && room.guessed.has(socket.id)) {
      return sendError(socket, "You have already guessed correctly.");
    }

    if (
      room.status === "playing" &&
      room.word &&
      message.toUpperCase() === room.word
    ) {
      const points = Math.max(
        50,
        Math.floor(((room.endsAt - Date.now()) / (ROUND_SECONDS * 1000)) * 500)
      );

      player.score += points;
      room.guessed.add(socket.id);

      emitRoom(room, "correctGuess", {
        playerId: socket.id,
        name: player.name,
        points,
        players: publicPlayers(room)
      });

      socket.emit("guessResult", {
        correct: true,
        word: room.word,
        points
      });

      updatePlayers(room);

      const eligibleGuessers = [...room.players.keys()].filter(
        (id) => id !== room.drawerId
      );

      if (eligibleGuessers.every((id) => room.guessed.has(id))) {
        endRound(room);
      }

      return;
    }

    // Do not expose the answer through chat messages.
    emitRoom(room, "chatMessage", {
      type: "chat",
      playerId: socket.id,
      name: player.name,
      message
    });
  });

  socket.on("leaveRoom", () => {
    const room = getPlayerRoom(socket);

    if (!room) return;

    removePlayer(room, socket);
  });

  socket.on("disconnect", () => {
    const room = getPlayerRoom(socket);

    if (room) removePlayer(room, socket);
  });
});

function removePlayer(room, socket) {
  const player = room.players.get(socket.id);

  if (!player) return;

  room.players.delete(socket.id);
  socket.leave(room.code);
  delete socket.data.roomCode;

  addSystemMessage(room, `${player.name} left the room.`);

  if (room.players.size === 0) {
    closeRoom(room);
    return;
  }

  if (room.hostId === socket.id) {
    room.hostId = room.players.keys().next().value;
    addSystemMessage(room, "A new host has been assigned.");
  }

  if (room.status === "playing") {
    // Restart the round if the drawer disconnects.
    if (room.drawerId === socket.id) {
      room.strokes = [];
      startRound(room);
    } else {
      const remainingGuessers = [...room.players.keys()].filter(
        (id) => id !== room.drawerId
      );

      if (remainingGuessers.every((id) => room.guessed.has(id))) {
        endRound(room);
      }
    }
  }

  updatePlayers(room);
}

server.listen(PORT, "0.0.0.0", () => {
  console.log(`DoodleDhamaka server running on port ${PORT}`);
});
