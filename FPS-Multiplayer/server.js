
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }
});

app.use(express.static("public"));

const players = {};
const MAX_HP = 500;
const DAMAGE = 25;
const MAX_SHOOT_DISTANCE = 35;
const SHOOT_COOLDOWN = 250;
const RESPAWN_DELAY = 3000;

const colors = [
  "#3498db",
  "#e74c3c",
  "#2ecc71",
  "#f1c40f",
  "#9b59b6",
  "#e67e22"
];

function publicPlayer(player) {
  return {
    x: player.x,
    y: player.y,
    z: player.z,
    yaw: player.yaw,
    color: player.color,
    hp: player.hp,
    alive: player.alive
  };
}

function sendPlayers() {
  io.emit("playersState", players);
}

io.on("connection", (socket) => {
  console.log("Người chơi tham gia:", socket.id);

  players[socket.id] = {
    x: Math.random() * 12 - 6,
    y: 0,
    z: Math.random() * 12 - 6,
    yaw: 0,
    color: colors[Math.floor(Math.random() * colors.length)],
    hp: MAX_HP,
    alive: true,
    lastShot: 0,
    respawnTimer: null
  };

  socket.emit("currentPlayers", players);

  socket.broadcast.emit("playerJoined", {
    id: socket.id,
    player: publicPlayer(players[socket.id])
  });

  socket.on("move", (data) => {
    const player = players[socket.id];
    if (!player || !player.alive || !data) return;

    if (
      !Number.isFinite(data.x) ||
      !Number.isFinite(data.y) ||
      !Number.isFinite(data.z) ||
      !Number.isFinite(data.yaw)
    ) {
      return;
    }

    player.x = Math.max(-80, Math.min(80, data.x));
    player.y = Math.max(0, Math.min(20, data.y));
    player.z = Math.max(-80, Math.min(80, data.z));
    player.yaw = data.yaw;

    socket.broadcast.emit("playerMoved", {
      id: socket.id,
      x: player.x,
      y: player.y,
      z: player.z,
      yaw: player.yaw
    });
  });

  // Bắn một người chơi khác.
  // Client gửi: socket.emit("shoot", { targetId: id })
  socket.on("shoot", (data) => {
    const shooter = players[socket.id];
    if (!shooter || !shooter.alive || !data) return;

    const now = Date.now();

    // Giới hạn tốc độ bắn
    if (now - shooter.lastShot < SHOOT_COOLDOWN) return;
    shooter.lastShot = now;

    const targetId = data.targetId;

    if (
      typeof targetId !== "string" ||
      targetId === socket.id
    ) {
      return;
    }

    const target = players[targetId];

    if (!target || !target.alive) return;

    // Kiểm tra khoảng cách giữa hai người chơi
    const dx = target.x - shooter.x;
    const dy = target.y - shooter.y;
    const dz = target.z - shooter.z;
    const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

    if (distance > MAX_SHOOT_DISTANCE) {
      socket.emit("shotResult", {
        hit: false,
        reason: "too_far"
      });
      return;
    }

    // Kiểm tra mục tiêu nằm gần hướng ngắm của người bắn.
    // Công thức này giả định camera Three.js nhìn về -Z khi yaw = 0.
    const targetYaw = Math.atan2(-dx, -dz);
    let angleDifference = targetYaw - shooter.yaw;

    while (angleDifference > Math.PI) {
      angleDifference -= Math.PI * 2;
    }
    while (angleDifference < -Math.PI) {
      angleDifference += Math.PI * 2;
    }

    if (Math.abs(angleDifference) > 0.22) {
      socket.emit("shotResult", {
        hit: false,
        reason: "miss"
      });
      return;
    }

    // Áp dụng sát thương
    target.hp = Math.max(0, target.hp - DAMAGE);

    const eliminated = target.hp === 0;

    if (eliminated) {
      target.alive = false;

      if (target.respawnTimer) {
        clearTimeout(target.respawnTimer);
      }

      target.respawnTimer = setTimeout(() => {
        const current = players[targetId];
        if (!current) return;

        current.hp = MAX_HP;
        current.alive = true;
        current.x = Math.random() * 12 - 6;
        current.y = 0;
        current.z = Math.random() * 12 - 6;
        current.yaw = 0;
        current.respawnTimer = null;

        io.emit("playerRespawned", {
          id: targetId,
          player: publicPlayer(current)
        });

        sendPlayers();
      }, RESPAWN_DELAY);
    }

    // Thông báo kết quả cho toàn phòng
    io.emit("playerDamaged", {
      shooterId: socket.id,
      targetId,
      damage: DAMAGE,
      hp: target.hp,
      eliminated
    });

    // Gửi trạng thái HP và trạng thái sống/chết mới nhất
    io.emit("playerHealth", {
      id: targetId,
      hp: target.hp,
      alive: target.alive
    });

    socket.emit("shotResult", {
      hit: true,
      targetId,
      damage: DAMAGE,
      hp: target.hp,
      eliminated
    });

    console.log(
      `${socket.id} bắn ${targetId}: -${DAMAGE} HP; còn ${target.hp} HP`
    );
  });

  socket.on("disconnect", () => {
    const player = players[socket.id];

    if (player?.respawnTimer) {
      clearTimeout(player.respawnTimer);
    }

    delete players[socket.id];

    io.emit("playerLeft", socket.id);

    console.log("Người chơi rời game:", socket.id);
  });
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, "0.0.0.0", () => {
  console.log(`FPS Multiplayer đang chạy tại cổng ${PORT}`);
});