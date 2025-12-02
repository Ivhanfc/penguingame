const { execSync } = require('child_process');
const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }
});

// Servir archivos estáticos
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Objeto global de jugadores
const players = {};

io.on('connection', (socket) => {
  console.log('Jugador conectado:', socket.id);

  // Posición inicial (puedes randomizar o poner en un spawn seguro)
  players[socket.id] = {
    x: 200 + Math.random() * 200,
    y: 200,
    state: 'idle',
    flipX: false
  };

  // ENVIAR A TODOS LOS JUGADORES EXISTENTES (incluido el nuevo)
  socket.emit('currentPenguin', players);

  // AVISAR A TODOS LOS DEMÁS que llegó uno nuevo (pero NO al que acaba de entrar)
  socket.broadcast.emit('PenguinJoined', {
    id: socket.id,
    x: players[socket.id].x,
    y: players[socket.id].y,
    state: players[socket.id].state,
    flipX: players[socket.id].flipX

  });
  socket.on("penguinJoin", (data) => {

    // lógica interna de sincronización
    players.push(data);

    // Notifica a TODOS los que están conectados
    io.emit("syncPenguins", players);
  });
  // Recibir movimiento del cliente
  socket.on('playerMovement', (data) => {
    if (!players[socket.id]) return;

    // Actualizar datos del jugador
    players[socket.id].x = data.x;
    players[socket.id].y = data.y;
    players[socket.id].state = data.state || 'idle';
    players[socket.id].flipX = data.flipX ?? false;

    // Enviar a todos los demás jugadores
    socket.broadcast.emit('playerMoved', {
      id: socket.id,
      x: players[socket.id].x,
      y: players[socket.id].y,
      state: players[socket.id].state,
      flipX: players[socket.id].flipX
    });


  });
  // Desconexión
  socket.on('disconnect', () => {
    console.log('Jugador desconectado:', socket.id);
    delete players[socket.id];
    socket.broadcast.emit('playerDisconnected', socket.id);
  });
  socket.on("ChatMessage", (msg) => {
    io.emit("ChatMessage", {
      id: socket.id,
      msgS: msg
    });
  });
});


const PORT = 3000;
server.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});