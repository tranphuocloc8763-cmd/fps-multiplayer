
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));

const players = {};
const colors = [
  "#3498db",
  "#e74c3c",
  "#2ecc71",
  "#f1c40f",
  "#9b59b6",
  "#e67e22"
];

io.on("connection", (socket) => {
  console.log("Người chơi tham gia:", socket.id);

  // Tạo vị trí xuất phát ngẫu nhiên
  players[socket.id] = {
    x: Math.random() * 12 - 6,
    y: 0,
    z: Math.random() * 12 - 6,
    yaw: 0,
    color: colors[
      Math.floor(Math.random() * colors.length)
    ]
  };

  // Gửi danh sách người chơi hiện tại cho người mới
  socket.emit("currentPlayers", players);

  // Thông báo người chơi mới cho mọi người khác
  socket.broadcast.emit("playerJoined", {
    id: socket.id,
    player: players[socket.id]
  });

  // Nhận vị trí và hướng nhìn từ người chơi
  socket.on("move", (data) => {
    if (!players[socket.id]) return;

    if (
      !Number.isFinite(data.x) ||
      !Number.isFinite(data.y) ||
      !Number.isFinite(data.z) ||
      !Number.isFinite(data.yaw)
    ) {
      return;
    }

    // Giới hạn vị trí trong map
    players[socket.id].x = Math.max(-24, Math.min(24, data.x));
    players[socket.id].y = Math.max(0, Math.min(20, data.y));
    players[socket.id].z = Math.max(-24, Math.min(24, data.z));
    players[socket.id].yaw = data.yaw;

    // Phát vị trí cho những người chơi khác
    socket.broadcast.emit("playerMoved", {
      id: socket.id,
      x: players[socket.id].x,
      y: players[socket.id].y,
      z: players[socket.id].z,
      yaw: players[socket.id].yaw
    });
  });

  // Xóa người chơi khi ngắt kết nối
  socket.on("disconnect", () => {
    delete players[socket.id];

    io.emit("playerLeft", socket.id);

    console.log("Người chơi rời game:", socket.id);
  });
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, "0.0.0.0", () => {
  console.log(`FPS Multiplayer đang chạy tại cổng ${PORT}`);
});