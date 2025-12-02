const socket = io("http://localhost:3000");
const DataManager = Phaser.Data.DataManager;

let scene;
let penguin;
let arrows;
let platforms;
let timemoving = 0;
let timelimit = 6000;
let state;
let idleLimit = false;
let jump = false;
const players = {};
const config = {
  type: Phaser.AUTO,
  width: 1900,
  height: 1000,
  backgroundColor: '#BDEFFF',
  render: {
    pixelArt: true,
    antialiasing: false,
  },
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { y: 300 },
      debug: false
    }
  },
  scene: { preload, create, update }
};
const game = new Phaser.Game(config);

function preload() {
  this.load.spritesheet('penguin', 'frontend/images/penguin-sprite.png', {
    frameWidth: 32,
    frameHeight: 32
  });

}

function create() {
  scene = this;
  this.anims.create({
    key: 'walk',
    frames: this.anims.generateFrameNumbers('penguin', { start: 3, end: 6 }),
    frameRate: 8,
    repeat: -1
  });

  this.anims.create({
    key: 'idle',
    frames: this.anims.generateFrameNumbers('penguin', { start: 1, end: 1 }),
    frameRate: 1,
    repeat: -1
  });
  this.anims.create({
    key: 'idlelimit',
    frames: this.anims.generateFrameNumbers('penguin', { start: 16, end: 22 }),
    frameRate: 4, // velocidad (puedes ajustarla)
    repeat: -1
  });

  platforms = this.physics.add.staticGroup();
  noise.seed(2);
  const amplitude = 20;
  const baseHeight = 500;
  const frequency = 0.005;

  for (let x = 0; x < 800; x += 8) {
    const height = Math.floor(noise.perlin2(x * frequency, 0) * amplitude);
    const topy = baseHeight - height;
    for (let y = topy; y < 600; y += 8) {
      const block = this.add.rectangle(x + 8, y + 8, 8, 8, 0xffffff);
      this.physics.add.existing(block, true);
      platforms.add(block);
    }
  }


  penguin = this.physics.add.sprite(200, 200, 'penguin');
  penguin.setCollideWorldBounds(true);

  this.physics.add.collider(penguin, platforms);
  scene.cameras.main.startFollow(penguin);

  arrows = this.input.keyboard.createCursorKeys();
  this.cameras.main.startFollow(penguin);
  this.cameras.main.setZoom(2);
  this.cameras.main.setBounds(0, 0, 600, 600);

  socket.on("currentPenguin", (allPlayers) => {
    // Limpiar jugadores anteriores (por si recargas)
    Object.keys(players).forEach(id => {
      if (players[id] && id !== socket.id) {
        players[id].destroy();
        delete players[id];
      }
    });

    // Crear todos los jugadores que ya están en el servidor
    for (const id in allPlayers) {
      if (id === socket.id) {
      } else {
        // Otros jugadores
        const other = scene.physics.add.sprite(allPlayers[id].x, allPlayers[id].y, 'penguin');
        other.setCollideWorldBounds(true);
        scene.physics.add.collider(other, platforms);
        other.anims.play(allPlayers[id].state || 'idle', true);
        players[id] = other;
      }
    }
  });

  socket.on("PenguinJoined", (data) => {


    const otherpenguin = scene.physics.add.sprite(data.x, data.y, "penguin");
    otherpenguin.setCollideWorldBounds(true);
    scene.physics.add.collider(otherpenguin, platforms);
    players[data.id] = otherpenguin;
  });

  socket.on("playerMoved", (data) => {
    if (!players[data.id]) return;
    players[data.id].setPosition(data.x, data.y);
    players[data.id].flipX = data.flipX
    players[data.id].anims.play(data.state, true);
  });

  socket.on("playerDisconnected", (id) => {
    if (players[id]) {
      players[id].destroy();
      delete players[id];

    }
  });

  const msg = document.getElementById("message");
  const sendbtn = document.getElementById("SendMessage");
  const chatBox = document.getElementById("Chat");


  // Evitar listeners duplicados
  socket.removeAllListeners("ChatMessage");

  sendbtn.addEventListener("click", () => {

    if (msg.value !== "") {
      console.log(msg.value);
      socket.emit("ChatMessage", {
        msg: msg.value
      });
    }
  });

  socket.on("ChatMessage", (data) => {
    const msgDiv = document.createElement("div");
    const userT = JSON.stringify(data.id);
    const msgT = JSON.stringify(data.msgS);
    msgDiv.textContent = `${userT}: ${msgT}`;
    chatBox.appendChild(msgDiv);
  });
}


function update(time, delta) {
  const velX = penguin.body.velocity.x;

  // Movimiento horizontal
  if (arrows.left.isDown) {
    penguin.setVelocityX(-100);
    penguin.flipX = true;
    if (state !== "walk") penguin.anims.play('walk', true);
    state = "walk";
  } else if (arrows.right.isDown) {
    penguin.setVelocityX(100);
    penguin.flipX = false;
    if (state !== "walk") penguin.anims.play('walk', true);
    state = "walk";
  } else {
    penguin.setVelocityX(0);
    if (!idleLimit && state !== "idle") penguin.anims.play('idle', true);
    state = "idle";
  }

  // Salto
  if (arrows.up.isDown && penguin.body.touching.down) {
    penguin.setVelocityY(-100);
  }



  // Tiempo de quietud
  if (Math.abs(velX) === 0 && penguin.body.touching.down) {
    timemoving += delta;
    if (timemoving > timelimit && !idleLimit) {
      penguin.anims.play('idlelimit', true);
      state = "idlelimit";
      idleLimit = true;
      console.log("pinguino extremadamente quieto");
    }
  } else {
    timemoving = 0;
    if (idleLimit) {
      idleLimit = false; // permite volver a activarse más tarde
      penguin.anims.play('idle', true);
      state = "idle";
    }



  }
  const velY = penguin.body.velocity.y;

  socket.emit("playerMovement", {
    x: penguin.x,
    y: penguin.y,
    state: state,
    flipX: penguin.flipX
  });
}