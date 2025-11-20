// Tiny platformer engine - behavior-driven tiles
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

// game world constants
const tileSize = 32; // fixed game units
const cols = 100; // wide level (camera will follow)
const rows = 16; // fixed rows

let W = canvas.width, H = canvas.height;

// camera (scales and translates to viewport)
const camera = { x: 0, y: 0, scale: 1 };

function updateCamera() {
  camera.scale = H / (rows * tileSize);
}

function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  W = canvas.width;
  H = canvas.height;
  updateCamera();
}

resizeCanvas();
window.addEventListener('resize', resizeCanvas);

const keyStates = {};
let jumpFrame = 0;

window.addEventListener('keydown', e => {
  // treat multiple keys as the same "jump" input (buffered)
  if (e.key === 'z' || e.key === 'ArrowUp' || e.key === 'w') {
    if (keyStates[e.key] !== true) {
      // jump buffer: store an expiry timestamp (ms)
      jumpFrame = Date.now() + 150; // 150ms buffer
    }
  }
  keyStates[e.key] = true;
});

window.addEventListener('keyup', e => {
  // release tracking for variable jump height
  if (e.key === 'z' || e.key === 'ArrowUp' || e.key === 'w') {
    // if we are moving upward, cut the jump for tighter control
    if (player.vy < 0) {
      player.vy *= player.jumpCutMultiplier;
    }
  }
  keyStates[e.key] = false;
});

// player (in game units)
const player = {
  x: 40, y: 40, w: 25, h: 25,
  vx: 0, vy: 0,
  // tuning
  maxSpeedGround: 4.0,
  maxSpeedAir: 3.0,
  // slip tuning: do NOT increase max ground speed on slip tiles (that made them feel like boosters)
  slipMaxSpeedMult: 1.0,
  accelGround: 0.9,
  frictionGround: 0.8, // how fast vx approaches 0 when no input
  slipFriction: 0.04, // reduced friction when on slip tiles (more slide)
  accelAir: 0.45,
  // slip reduces ground traction (less responsive steering)
  slipAccelMult: 0.6,
  airControlMultiplier: 1.0,
  gravity: 0.55,
  maxFallSpeed: 14,
  jumpPower: 12,
  jumpCutMultiplier: 0.5, // applied when releasing jump mid-ascent

  // quality-of-life jump features (ms)
  coyoteTime: 120,
  coyoteUntil: 0,
  // runtime state
  onGround: false,
  onSlip: false
};

// spawn/respawn
const spawn = { x: 40, y: 40 };
function respawn() {
  player.x = spawn.x;
  player.y = spawn.y;
  player.vx = 0;
  player.vy = 0;
  player.onGround = false;
}

// tiles
const Tile = {
  Empty: 0,
  Solid: 1,
  Kill: 2,
  Slip: 3,
  Unstable: 4
};

const tileProperties = {
  [Tile.Empty]: { color: null, solid: false, behavior: 'none' },
  [Tile.Solid]: { color: [135, 170, 35], solid: true, behavior: 'solid' },
  [Tile.Kill]: { color: [255, 60, 60], solid: false, behavior: 'kill' },
  [Tile.Slip]: { color: [0, 200, 200], solid: true, behavior: 'slip' },
  [Tile.Unstable]: { color: [255, 200, 0], solid: true, behavior: 'unstable' }
};

const level = [];

// load level from `level.txt` where characters '0'..'4' map to Tile values
// and '\n' indicates a new row. If fetch fails (e.g. file:// restrictions),
// a simple fallback level will be used.
function parseLevelText(text) {
  // initialize empty rows
  for (let rr = 0; rr < rows; rr++) level[rr] = new Array(cols).fill(Tile.Empty);

  let r = 0, c = 0;
  let skipUntilNewline = false;
  for (let i = 0; i < text.length && r < rows; i++) {
    const ch = text[i];
    // handle CRLF and LF/CR uniformly: treat any '\r' or '\n' as newline
    if (ch === '\n' || ch === '\r') {
      // if CRLF, skip the paired char
      if (ch === '\r' && text[i+1] === '\n') { /* allow loop to hit the '\n' which will also advance */ }
      // end current row and prepare next
      r++; c = 0; skipUntilNewline = false;
      continue;
    }

    if (skipUntilNewline) {
      // currently discarding overflow characters until newline
      continue;
    }

    if (c >= cols) {
      // we've exceeded the allowed columns for this row; ignore characters until newline
      skipUntilNewline = true;
      continue;
    }

    if (ch >= '0' && ch <= '4') {
      level[r][c] = Number(ch);
    } else {
      level[r][c] = Tile.Empty;
    }
    c++;
  }
}

// Embedded level data (from level.txt) to avoid CORS issues when publishing
const levelText = `0000000000000000000000000000000000000000000000000000000000021222222222000000000000000000000000000000
0000000000000000000000000000000000000000000000000000000000001000011100000000001111111100000000000000
0000000000000000000000000000000000000000000000000000200000001000000000000000000000000000000000000000
0000000000000000000000000003300000003333333333333333300000031000000333300000000000000000000000000000
0000000000000000000000000000000000000000020000020000000000001000000000000000000000000000000000000000
0000000000000000000111110000000000000000022222220000000000221000100000000000000000000000000000000000
0000000000000000000000000000000000000000000020000000000000001000000000000000000000000000000000000000
0000000000000000000000000001001000000000000020000000000000002000000000000000000000000000000000000000
0000000000000000000000000002002000000000000020000000000000000000000000100000000000000000000000000000
0000000000000000000000000000000000000000000020003333000000000000000000000000000000000000000000000000
0000000000000000000000033333333333300000000020000000000000002000000000000000000000000000000000000000
0000000000000001001000000000000000000000000020000000000000001000111111100000000000000000000000000000
0000000000100001221000000000000000000000000020000000000010001000000000000000000000000000000000000000
0000000000000001221222222222222222222222222222222222222212221000000000000000000000000000000000000000
1111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111
1111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111`;

// track timers for unstable tiles (key = "r,c" -> expire timestamp)
const unstableTimers = {};

function tileAtPixel(px, py) {
  const c = Math.floor(px / tileSize);
  const r = Math.floor(py / tileSize);
  if (r < 0 || r >= rows || c < 0 || c >= cols) return Tile.Empty;
  // guard if level rows are not initialized for some reason
  if (!level[r]) return Tile.Empty;
  return level[r][c];
}

function rectIntersect(a, b) {
  return !(a.x + a.w <= b.x || a.x >= b.x + b.w || a.y + a.h <= b.y || a.y >= b.y + b.h);
}

// helper: move `current` toward `target` by maxDelta (no overshoot)
function approach(current, target, maxDelta) {
  if (current < target) return Math.min(current + maxDelta, target);
  if (current > target) return Math.max(current - maxDelta, target);
  return current;
}

function update(dt) {
  const t = Date.now();

  // input
  const inputX = (((keyStates['ArrowRight'] || keyStates['d']) ? 1 : 0) - ((keyStates['ArrowLeft'] || keyStates['a']) ? 1 : 0));

  // keep previous slip state for movement tuning this frame
  const prevOnSlip = player.onSlip;
  // reset slip flag; collideVertical will re-enable it if we land on a slip tile
  player.onSlip = false;

  // determine acceleration (use previous-frame slip state to reduce ground responsiveness)
  const accel = player.onGround ? player.accelGround * (prevOnSlip ? player.slipAccelMult : 1) : player.accelAir;

  // smooth acceleration toward desired velocity (use conservative max based on previous grounded state)
  const desiredVx = inputX * (player.onGround ? player.maxSpeedGround : player.maxSpeedAir);
  player.vx = approach(player.vx, desiredVx, accel * dt);

  // jump (buffered + coyote time)
  if (jumpFrame > t && (player.onGround || t <= player.coyoteUntil)) {
    player.vy = -player.jumpPower;
    player.onGround = false;
    jumpFrame = 0;
    player.coyoteUntil = 0;
  }

  // vertical physics
  player.vy += player.gravity * dt;
  if (player.vy > player.maxFallSpeed) player.vy = player.maxFallSpeed;

  // integrate and resolve collisions
  player.x += player.vx * dt;
  collideHorizontal();
  player.y += player.vy * dt;
  collideVertical();

  // AFTER vertical collision we know whether we're standing on a slip tile.
  // clamp horizontal speed to the correct max (with immediate slip effect)
  const actualMaxSpeed = player.onGround
    ? player.maxSpeedGround * (player.onSlip ? player.slipMaxSpeedMult : 1)
    : player.maxSpeedAir;
  player.vx = Math.max(-actualMaxSpeed, Math.min(actualMaxSpeed, player.vx));

  // re-evaluate horizontal control immediately after landing so slip affects accel
  if (player.onGround) {
    const desiredVx_ground = inputX * player.maxSpeedGround;
    const groundAccel = player.onSlip ? player.accelGround * player.slipAccelMult : player.accelGround;
    player.vx = approach(player.vx, desiredVx_ground, groundAccel * dt);
    // clamp again to the proper max (in case re-eval pushed it over)
    player.vx = Math.max(-actualMaxSpeed, Math.min(actualMaxSpeed, player.vx));
  }

  // apply ground friction using the current slip state so landing on slip tiles slides immediately
  if (inputX === 0 && player.onGround) {
    const groundFriction = player.onSlip ? player.slipFriction : player.frictionGround;
    player.vx = approach(player.vx, 0, groundFriction * dt);
  }

  // unstable tile handling: break tiles whose timer expired
  for (const key in unstableTimers) {
    if (unstableTimers[key] <= t) {
      const [rr, cc] = key.split(',').map(Number);
      if (level[rr] && level[rr][cc] === Tile.Unstable) {
        level[rr][cc] = Tile.Empty;
      }
      delete unstableTimers[key];
    }
  }

  // camera follow (center player horizontally within level bounds)
  camera.x = player.x - (W / camera.scale)/2 + player.w/2;
  camera.x = Math.max(0, Math.min(camera.x, cols*tileSize - (W / camera.scale)));
}

function collideHorizontal() {
  const sign = Math.sign(player.vx) || 1;
  const testX = sign > 0 ? player.x + player.w : player.x;
  const samples = [player.y + 1, player.y + player.h - 1];
  for (let sy of samples) {
    const tileType = tileAtPixel(testX, sy);
    const behavior = tileProperties[tileType] && tileProperties[tileType].behavior;
    if (!behavior || behavior === 'none') continue;
    if (behavior === 'kill') {
      respawn();
      return;
    }
    if (behavior === 'solid' || behavior === 'slip' || behavior === 'unstable') {
      // align player to tile edge
      if (sign > 0) player.x = Math.floor((testX) / tileSize) * tileSize - player.w - 0.001;
      else player.x = (Math.floor(testX / tileSize) + 1) * tileSize + 0.001;
      player.vx = 0;
      return;
    }
  }
}

function collideVertical() {
  const sign = Math.sign(player.vy) || 1;
  const testY = sign > 0 ? player.y + player.h : player.y;
  const samples = [player.x + 1, player.x + player.w - 1];
  player.onGround = false;
  for (let sx of samples) {
    const tileType = tileAtPixel(sx, testY);
    const behavior = tileProperties[tileType] && tileProperties[tileType].behavior;
    if (!behavior || behavior === 'none') continue;

    // compute tile cell coords
    const c = Math.floor(sx / tileSize);
    const r = Math.floor(testY / tileSize);

    if (behavior === 'kill') {
      respawn();
      return;
    }

    if (behavior === 'solid' || behavior === 'slip' || behavior === 'unstable') {
      if (sign > 0) {
        // landed on top of tile
        player.y = Math.floor((testY) / tileSize) * tileSize - player.h - 0.001;
        player.onGround = true;

        player.vy = 0;

        // remember slip for movement tuning
        player.onSlip = (behavior === 'slip');
        // refresh coyote window when we touched ground
        player.coyoteUntil = Date.now() + player.coyoteTime;

        if (behavior === 'unstable') {
          const key = `${r},${c}`;
          if (!unstableTimers[key]) {
            // break after 500ms
            unstableTimers[key] = Date.now() + 500;
          }
        }
      } else {
        // hit bottom of tile
        player.y = (Math.floor(testY / tileSize) + 1) * tileSize + 0.001;
        player.vy = 0;
      }
      return;
    }
  }
}

let last = 0;
function loop(t) {
  const dt = Math.min(16, t - last) / (1000/60) || 1;
  last = t;
  update(dt);

  // render background
  ctx.fillStyle = '#77D';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.scale(camera.scale, camera.scale);
  ctx.translate(-camera.x, -camera.y);

  // draw grid (optional)
  ctx.strokeStyle = '#66D';
  ctx.lineWidth = 1 / camera.scale;
  const left = Math.floor(camera.x / tileSize);
  const top = Math.floor(camera.y / tileSize);
  const right = left + Math.ceil(W / camera.scale / tileSize) + 1;
  const bottom = top + Math.ceil(H / camera.scale / tileSize) + 1;
  for (let c = left; c <= right; c++) {
    const x = c * tileSize;
    ctx.beginPath();
    ctx.moveTo(x, top * tileSize);
    ctx.lineTo(x, bottom * tileSize);
    ctx.stroke();
  }
  for (let r = top; r <= bottom; r++) {
    const y = r * tileSize;
    ctx.beginPath();
    ctx.moveTo(left * tileSize, y);
    ctx.lineTo(right * tileSize, y);
    ctx.stroke();
  }

  // draw tiles
  for (let r=0; r<rows; r++){
    for (let c=0; c<cols; c++){
      const tileType = level[r][c];
      if (tileType !== Tile.Empty) {
        const props = tileProperties[tileType];
        const color = props && props.color;
        if (color) {
          ctx.fillStyle = `rgb(${color[0]}, ${color[1]}, ${color[2]})`;
          ctx.fillRect(c*tileSize, r*tileSize, tileSize, tileSize);
          ctx.strokeStyle = '#0004';
          ctx.strokeRect(c*tileSize, r*tileSize, tileSize, tileSize);
        }
      }
    }
  }

  // draw player (simple rectangle)
  ctx.fillStyle = '#d33';
  ctx.fillRect(player.x, player.y, player.w, player.h);
  ctx.strokeStyle = '#0008';
  ctx.strokeRect(player.x, player.y, player.w, player.h);

  ctx.restore();

  requestAnimationFrame(loop);
}

function showLevelLoadedMessage() {
  const msg = document.createElement('div');
  msg.textContent = 'Level loaded!';
  msg.style.position = 'fixed';
  msg.style.top = '16px';
  msg.style.left = '50%';
  msg.style.transform = 'translateX(-50%)';
  msg.style.background = '#222d';
  msg.style.color = '#fff';
  msg.style.fontSize = '20px';
  msg.style.padding = '8px 24px';
  msg.style.borderRadius = '8px';
  msg.style.zIndex = '9999';
  document.body.appendChild(msg);
  setTimeout(() => msg.remove(), 1200);
}

(async function init() {
  try {
    parseLevelText(levelText);
    showLevelLoadedMessage();
  } catch (err) {
    console.error('Failed to parse level data.', err);
    throw err;
  }
  updateCamera();
  requestAnimationFrame(loop);
})();
