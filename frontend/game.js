const socket = io();
let scene;
let penguin;
let arrows;
let platforms;

let chatActive = false;
let currentInput = '';
let inputDisplay;

let timemoving = 0;
let idleLimit = false;
let state = "idle";

const players = {};

const config = {
  type: Phaser.AUTO,
  width: 960,
  height: 540,
  backgroundColor: '#BDEFFF',
  render: { pixelArt: true },
  physics: {
    default: 'arcade',
    arcade: { gravity: { y: 300 }, debug: false }
  },
  scene: { preload, create, update }
};

new Phaser.Game(config);

// --------------------------------------------------
// PRELOAD
// --------------------------------------------------
function preload() {
  this.load.spritesheet('penguin', 'images/penguin-sprite.png', {
    frameWidth: 32,
    frameHeight: 32
  });
}

// --------------------------------------------------
// CREATE
// --------------------------------------------------
function create() {
  scene = this;

  createAnimations(this);
  createTerrain(this);
  createMainPlayer(this);
  setupCamera(this);
  setupInput(this);
  setupNetworking(this);
  setupChatDisplay(this);
}

// --------------------------------------------------
// ANIMACIONES
// --------------------------------------------------
function createAnimations(scene) {
  scene.anims.create({
    key: 'walk',
    frames: scene.anims.generateFrameNumbers('penguin', { start: 3, end: 6 }),
    frameRate: 8,
    repeat: -1
  });

  scene.anims.create({
    key: 'idle',
    frames: [{ key: 'penguin', frame: 1 }],
    frameRate: 1,
    repeat: -1
  });

  scene.anims.create({
    key: 'idlelimit',
    frames: scene.anims.generateFrameNumbers('penguin', { start: 16, end: 22 }),
    frameRate: 4,
    repeat: -1
  });
}

// --------------------------------------------------
// TERRENO
// --------------------------------------------------
function createTerrain(scene) {
  platforms = scene.physics.add.staticGroup();

  noise.seed(2);
  const amplitude = 20;
  const baseHeight = 500;
  const frequency = 0.005;

  for (let x = 0; x < 1800; x += 40) {
    const h = Math.floor(noise.perlin2(x * frequency, 0) * amplitude);
    const top = baseHeight - h;

    const col = scene.add.rectangle(x + 20, top + 200, 40, 800, 0xffffff);
    scene.physics.add.existing(col, true);
    platforms.add(col);
  }
}

// --------------------------------------------------
// JUGADOR PRINCIPAL + TEXTOS
// --------------------------------------------------
function createMainPlayer(scene) {
  penguin = scene.physics.add.sprite(200, 200, 'penguin');
  penguin.setCollideWorldBounds(true);
  penguin.setScale(3);
  scene.physics.add.collider(penguin, platforms);

  // --- Username ---
  penguin.usernameText = scene.add.text(
    penguin.x,
    penguin.y - 50,
    socket.id,
    {
      fontFamily: "comic sans ms",
      fontSize: "20px",
      color: "#ffffff",
      stroke: "#000000",
      strokeThickness: 4
    }
  ).setOrigin(0.5).setScrollFactor(1);

  // --- Mensaje chat ---
  penguin.messageText = scene.add.text(
    penguin.x,
    penguin.y - 70,
    '',
    {
      fontFamily: "comic sans ms",
      fontSize: "16px",
      color: "#ffff00",
      stroke: "#000000",
      strokeThickness: 3
    }
  ).setOrigin(0.5).setScrollFactor(1);
}

// --------------------------------------------------
// CÁMARA
// --------------------------------------------------
function setupCamera(scene) {
  scene.cameras.main.startFollow(penguin);
  scene.cameras.main.setBounds(0, 0, 600, 600);
}

// --------------------------------------------------
// INPUT + CHAT
// --------------------------------------------------
function setupInput(scene) {
  arrows = scene.input.keyboard.createCursorKeys();

  scene.input.keyboard.on("keydown", (event) => {
    if (event.key.toUpperCase() === "T" && !chatActive) {
      chatActive = true;
      inputDisplay.setText("Escribe: |");
      return;
    }

    if (!chatActive) return;

    event.preventDefault();

    if (event.key === "Enter") {
      if (currentInput.trim() !== "") {
        socket.emit("ChatMessage", { msg: currentInput.trim() });
      }
      currentInput = "";
      chatActive = false;
      inputDisplay.setText("Escribe aquí (T):");
      return;
    }

    if (event.key === "Backspace") {
      currentInput = currentInput.slice(0, -1);
    } else if (event.key.length === 1) {
      currentInput += event.key;
    }

    inputDisplay.setText("Escribe: " + currentInput + "|");
  });
}

// --------------------------------------------------
// CHAT DISPLAY
// --------------------------------------------------
function setupChatDisplay(scene) {
  inputDisplay = scene.add.text(
    20,
    20,
    "Escribe aquí (T):",
    {
      fontFamily: "comic sans ms",
      fontSize: "20px",
      color: "#fff",
      backgroundColor: "#333",
      padding: { x: 5, y: 5 }
    }
  ).setScrollFactor(0);
}

// --------------------------------------------------
// RECIBIR MENSAJES
// --------------------------------------------------
socket.on("ChatMessage", (data) => {
  const player = players[data.id] || (data.id === socket.id ? penguin : null);
  if (!player) return;

  player.messageText.setText(data.msg);
  setTimeout(() => {
    player.messageText.setText('');
  }, 3000);
});

// --------------------------------------------------
// NETWORKING
// --------------------------------------------------
function setupNetworking(scene) {
  socket.on("currentPenguin", (allPlayers) => {
    Object.keys(players).forEach(id => {
      if (players[id]) {
        players[id].usernameText.destroy();
        players[id].messageText.destroy();
        players[id].destroy();
        delete players[id];
      }
    });

    for (const id in allPlayers) {
      if (id !== socket.id) {
        createRemotePlayer(allPlayers[id], id);
      }
    }
  });

  socket.on("PenguinJoined", (data) => {
    createRemotePlayer(data, data.id);
  });

  socket.on("playerMoved", (data) => {
    const p = players[data.id];
    if (!p) return;

    p.setPosition(data.x, data.y);
    p.flipX = data.flipX;
    p.anims.play(data.state, true);

    p.usernameText.setPosition(p.x, p.y - 50);
    p.messageText.setPosition(p.x, p.y - 70);
  });

  socket.on("playerDisconnected", (id) => {
    if (players[id]) {
      players[id].usernameText.destroy();
      players[id].messageText.destroy();
      players[id].destroy();
      delete players[id];
    }
  });
}

// --------------------------------------------------
// CREAR JUGADOR REMOTO + TEXTOS
// --------------------------------------------------
function createRemotePlayer(data, id) {
  const p = scene.physics.add.sprite(data.x, data.y, "penguin");
  p.setCollideWorldBounds(true);
  p.setScale(3);
  scene.physics.add.collider(p, platforms);
  p.anims.play(data.state || "idle", true);

  p.usernameText = scene.add.text(
    p.x,
    p.y - 50,
    id,
    {
      fontFamily: "comic sans ms",
      fontSize: "10px",
      color: "#ffffff",
      stroke: "#000000",
      strokeThickness: 4
    }
  ).setOrigin(0.5);

  p.messageText = scene.add.text(
    p.x,
    p.y - 70,
    '',
    { fontFamily: "comic sans ms", fontSize: "12px", color: "#ffff00", stroke: "#000000", strokeThickness: 3 }
  ).setOrigin(0.5);

  players[id] = p;
}

// --------------------------------------------------
// UPDATE
// --------------------------------------------------
function update(time, delta) {

  if (chatActive) {
    penguin.setVelocityX(0);
    penguin.usernameText.setPosition(penguin.x, penguin.y - 50);
    penguin.messageText.setPosition(penguin.x, penguin.y - 70);
    return;
  }

  const velX = penguin.body.velocity.x;

  // movimiento
  if (arrows.left.isDown) {
    penguin.setVelocityX(-100);
    penguin.flipX = true;
    penguin.anims.play("walk", true);
    state = "walk";
  } else if (arrows.right.isDown) {
    penguin.setVelocityX(100);
    penguin.flipX = false;
    penguin.anims.play("walk", true);
    state = "walk";
  } else {
    penguin.setVelocityX(0);
    if (!idleLimit) penguin.anims.play("idle", true);
    state = "idle";
  }

  if (arrows.up.isDown && penguin.body.touching.down) {
    penguin.setVelocityY(-100);
  }

  // idle largo
  if (velX === 0 && penguin.body.touching.down) {
    timemoving += delta;
    if (timemoving > 6000 && !idleLimit) {
      penguin.anims.play("idlelimit", true);
      state = "idlelimit";
      idleLimit = true;
    }
  } else {
    timemoving = 0;
    if (idleLimit) {
      idleLimit = false;
      penguin.anims.play("idle", true);
      state = "idle";
    }
  }

  // mover textos de todos los jugadores
  penguin.usernameText.setPosition(penguin.x, penguin.y - 50);
  penguin.messageText.setPosition(penguin.x, penguin.y - 70);

  for (const id in players) {
    const p = players[id];
    p.usernameText.setPosition(p.x, p.y - 50);
    p.messageText.setPosition(p.x, p.y - 70);
  }

  // emitir movimiento
  socket.emit("playerMovement", {
    x: penguin.x,
    y: penguin.y,
    state,
    flipX: penguin.flipX
  });
}
