import {
    state,
    loadSettings,
    saveSettings,
    resetROISettings,
    resetAllSettings
} from './state.js';
import { AssetManager } from './assets.js';
import { createCVController } from './cv.js';
import { BubblesGame } from './games/bubbles.js';
import { ShipsGame } from './games/ships.js';

const GAMES = {
    bubbles: BubblesGame,
    ships: ShipsGame
};

const gameArea = document.getElementById('gameArea');
const gameCanvas = document.getElementById('gameCanvas');
const overlayCanvas = document.getElementById('overlayCanvas');
const ctx = gameCanvas.getContext('2d');
const overlayCtx = overlayCanvas.getContext('2d');

let spawnTimer = null;
let lastFrameTime = 0;

const cv = createCVController({
    videoEl: document.getElementById('cameraVideo'),
    previewCanvas: document.getElementById('cameraPreviewCanvas'),
    placeholderEl: document.getElementById('cameraPlaceholder'),
    cameraSelectEl: document.getElementById('cameraSelect'),
    gameCanvas,
    onMotionHit: handleInteraction,
    onStatusChange: updateStatus
});

function getActiveGame() {
    return GAMES[state.settings.currentGame] || BubblesGame;
}

function init() {
    loadSettings();
    AssetManager.loadAll();
    resizeCanvases();
    applySettingsToUI();
    cv.populateCameraList();
    bindUIEvents();
    requestAnimationFrame(renderLoop);
}

function resizeCanvases() {
    const rect = gameArea.getBoundingClientRect();
    gameCanvas.width = Math.max(1, Math.floor(rect.width));
    gameCanvas.height = Math.max(1, Math.floor(rect.height));
    overlayCanvas.width = gameCanvas.width;
    overlayCanvas.height = gameCanvas.height;
    initStarfield();
}

function initStarfield() {
    state.stars = [];
    for (let i = 0; i < 85; i++) {
        state.stars.push({
            x: Math.random() * gameCanvas.width,
            y: Math.random() * gameCanvas.height,
            r: 0.8 + Math.random() * 1.8,
            alpha: 0.25 + Math.random() * 0.6,
            speed: 0.15 + Math.random() * 0.45
        });
    }
}

/* === СИНХРОНИЗАЦИЯ UI <-> STATE <-> LOCALSTORAGE === */
function applySettingsToUI() {
    const s = state.settings;
    document.getElementById('mirrorCamera').checked = s.mirrorCamera;
    document.getElementById('roiLeft').value = s.roiLeft;
    document.getElementById('roiRight').value = s.roiRight;
    document.getElementById('roiTop').value = s.roiTop;
    document.getElementById('roiBottom').value = s.roiBottom;
    document.getElementById('sensitivity').value = s.sensitivity;
    document.getElementById('minBlobSize').value = s.minBlobSize;
    document.getElementById('bubbleSpeed').value = s.bubbleSpeed;
    document.getElementById('bubbleSize').value = s.bubbleSize;
    document.getElementById('shipSpeed').value = s.shipSpeed;
    document.getElementById('shipMoveSpeed').value = s.shipMoveSpeed;
    document.getElementById('maxLives').value = s.maxLives;
    document.getElementById('soundEnabled').checked = s.soundEnabled;
    document.getElementById('showMotionOverlay').checked = s.showMotionOverlay;
    document.getElementById('showMotionMask').checked = s.showMotionMask;

    updateSettingLabels();
    applySelectedGameUI(s.currentGame);
    updateHUD();
}

function readSettingsFromUI() {
    const s = state.settings;
    const prevBubbleSpeed = s.bubbleSpeed;
    const prevShipSpeed = s.shipSpeed;

    s.selectedCameraId = document.getElementById('cameraSelect').value;
    s.mirrorCamera = document.getElementById('mirrorCamera').checked;
    s.roiLeft = parseInt(document.getElementById('roiLeft').value, 10);
    s.roiRight = parseInt(document.getElementById('roiRight').value, 10);
    s.roiTop = parseInt(document.getElementById('roiTop').value, 10);
    s.roiBottom = parseInt(document.getElementById('roiBottom').value, 10);
    s.sensitivity = parseInt(document.getElementById('sensitivity').value, 10);
    s.minBlobSize = parseInt(document.getElementById('minBlobSize').value, 10);

    s.bubbleSpeed = parseInt(document.getElementById('bubbleSpeed').value, 10);
    s.bubbleSize = parseInt(document.getElementById('bubbleSize').value, 10);
    s.shipSpeed = parseInt(document.getElementById('shipSpeed').value, 10);
    s.shipMoveSpeed = parseFloat(document.getElementById('shipMoveSpeed').value);
    s.maxLives = Math.max(1, parseInt(document.getElementById('maxLives').value, 10) || 5);

    s.soundEnabled = document.getElementById('soundEnabled').checked;
    s.showMotionOverlay = document.getElementById('showMotionOverlay').checked;
    s.showMotionMask = document.getElementById('showMotionMask').checked;

    if (!state.isGameRunning) {
        state.lives = s.maxLives;
        updateHUD();
    } else if (
        (s.currentGame === 'bubbles' && prevBubbleSpeed !== s.bubbleSpeed) ||
        (s.currentGame === 'ships' && prevShipSpeed !== s.shipSpeed)
    ) {
        restartSpawnTimer();
    }

    updateSettingLabels();
    saveSettings();
}

function updateSettingLabels() {
    const s = state.settings;
    document.getElementById('roiLeftVal').textContent = `${s.roiLeft}%`;
    document.getElementById('roiRightVal').textContent = `${s.roiRight}%`;
    document.getElementById('roiTopVal').textContent = `${s.roiTop}%`;
    document.getElementById('roiBottomVal').textContent = `${s.roiBottom}%`;
    document.getElementById('sensitivityVal').textContent = s.sensitivity;
    document.getElementById('minBlobVal').textContent = s.minBlobSize;
    document.getElementById('bubbleSpeedVal').textContent = `${(s.bubbleSpeed / 1000).toFixed(1)}с`;
    document.getElementById('bubbleSizeVal').textContent = `${s.bubbleSize}px`;
    document.getElementById('shipSpeedVal').textContent = `${(s.shipSpeed / 1000).toFixed(1)}с`;
    document.getElementById('shipMoveSpeedVal').textContent = s.shipMoveSpeed;
}

function selectGame(gameId) {
    if (state.isGameRunning) stopGame();
    state.settings.currentGame = gameId;
    saveSettings();
    applySelectedGameUI(gameId);
}

function applySelectedGameUI(gameId) {
    const game = GAMES[gameId] || BubblesGame;
    document.getElementById('btnGameBubbles').classList.toggle('active', game.id === 'bubbles');
    document.getElementById('btnGameShips').classList.toggle('active', game.id === 'ships');
    document.getElementById('bubblesSettings').style.display = game.id === 'bubbles' ? 'block' : 'none';
    document.getElementById('shipsSettings').style.display = game.id === 'ships' ? 'block' : 'none';
    document.getElementById('livesDisplay').style.display = game.hasLives ? 'block' : 'none';
    document.getElementById('gameTitle').textContent = game.title;
}

/* === УПРАВЛЕНИЕ ИГРОЙ === */
function restartSpawnTimer() {
    if (spawnTimer) clearInterval(spawnTimer);
    const game = getActiveGame();
    spawnTimer = setInterval(() => {
        if (state.isGameRunning) game.spawn(gameCanvas);
    }, game.getSpawnInterval());
}

function startGame(hideSidebar = true) {
    if (state.isGameRunning) stopGame();

    document.getElementById('gameOverOverlay').classList.remove('visible');
    if (hideSidebar) document.body.classList.add('fullscreen-game');

    setTimeout(() => {
        resizeCanvases();
        state.isGameRunning = true;
        state.score = 0;
        state.lives = state.settings.maxLives;
        state.bubbles = [];
        state.ships = [];
        state.particles = [];
        updateHUD();
        updateStatus('Игра активна', 'active');

        const game = getActiveGame();
        game.spawn(gameCanvas);
        restartSpawnTimer();
    }, 260);
}

function stopGame() {
    state.isGameRunning = false;
    if (spawnTimer) {
        clearInterval(spawnTimer);
        spawnTimer = null;
    }
    document.body.classList.remove('fullscreen-game');
    document.getElementById('gameOverOverlay').classList.remove('visible');

    state.bubbles = [];
    state.ships = [];
    setTimeout(resizeCanvases, 260);

    updateStatus(
        state.isCameraActive ? 'Камера 720p активна' : 'Система готова',
        state.isCameraActive ? 'active' : ''
    );
}

function restartGame() {
    startGame(document.body.classList.contains('fullscreen-game'));
}

function triggerGameOver() {
    state.isGameRunning = false;
    if (spawnTimer) {
        clearInterval(spawnTimer);
        spawnTimer = null;
    }
    document.getElementById('finalScoreText').textContent = `Ваш счёт: ${state.score}`;
    document.getElementById('gameOverOverlay').classList.add('visible');
    updateStatus('Игра окончена', '');
}

function handleInteraction(x, y, hitRadius = 25) {
    if (!state.isGameRunning) return;
    if (getActiveGame().handleHit(x, y, hitRadius)) {
        updateHUD();
    }
}

/* === ЦИКЛ ОТРИСОВКИ === */
function renderLoop(timestamp) {
    const dt = Math.min(2, (timestamp - (lastFrameTime || timestamp)) / 16.67);
    lastFrameTime = timestamp;

    ctx.clearRect(0, 0, gameCanvas.width, gameCanvas.height);

    const bgImg = AssetManager.get('background');
    if (bgImg) {
        ctx.drawImage(bgImg, 0, 0, gameCanvas.width, gameCanvas.height);
    } else {
        drawStars(dt);
    }

    if (state.isGameRunning) {
        getActiveGame().updateAndDraw(ctx, gameCanvas, dt, timestamp, () => {
            updateHUD();
            if (state.lives <= 0) triggerGameOver();
        });
    }

    updateAndDrawParticles(dt);
    drawDebugOverlay(timestamp);

    requestAnimationFrame(renderLoop);
}

function drawStars(dt) {
    ctx.save();
    for (const st of state.stars) {
        st.y += st.speed * dt;
        if (st.y > gameCanvas.height) {
            st.y = 0;
            st.x = Math.random() * gameCanvas.width;
        }
        ctx.fillStyle = `rgba(255, 255, 255, ${st.alpha})`;
        ctx.beginPath();
        ctx.arc(st.x, st.y, st.r, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.restore();
}

function updateAndDrawParticles(dt) {
    for (let i = state.particles.length - 1; i >= 0; i--) {
        const p = state.particles[i];
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vx *= 0.96;
        p.vy *= 0.96;
        p.life -= p.decay * dt;

        if (p.life <= 0) {
            state.particles.splice(i, 1);
            continue;
        }

        ctx.fillStyle = `hsla(${p.hue}, 100%, 65%, ${p.life})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * p.life, 0, Math.PI * 2);
        ctx.fill();
    }
}

function drawDebugOverlay(now) {
    overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
    if (!state.settings.showMotionOverlay) return;

    for (const blob of state.motionBlobs) {
        if (now - blob.born > 250) continue;
        overlayCtx.save();
        overlayCtx.beginPath();
        overlayCtx.arc(blob.x, blob.y, blob.radius, 0, Math.PI * 2);
        overlayCtx.strokeStyle = 'rgba(74, 222, 128, 0.85)';
        overlayCtx.lineWidth = 3;
        overlayCtx.stroke();
        overlayCtx.fillStyle = 'rgba(74, 222, 128, 0.18)';
        overlayCtx.fill();
        overlayCtx.restore();
    }
}

/* === СОБЫТИЯ И ГОРЯЧИЕ КЛАВИШИ === */
function bindUIEvents() {
    window.addEventListener('resize', resizeCanvases);

    document.getElementById('btnGameBubbles').addEventListener('click', () => selectGame('bubbles'));
    document.getElementById('btnGameShips').addEventListener('click', () => selectGame('ships'));

    document.getElementById('btnStartCamera').addEventListener('click', cv.startCamera);
    document.getElementById('btnStopCamera').addEventListener('click', cv.stopCamera);

    document.getElementById('btnStartFullscreen').addEventListener('click', () => startGame(true));
    document.getElementById('btnStartWindow').addEventListener('click', () => startGame(false));
    document.getElementById('btnStopGame').addEventListener('click', stopGame);
    document.getElementById('btnToggleFullscreen').addEventListener('click', toggleBrowserFullscreen);

    document.getElementById('btnRestartGame').addEventListener('click', restartGame);
    document.getElementById('btnBackToMenu').addEventListener('click', stopGame);

    document.getElementById('btnResetRoi').addEventListener('click', () => {
        resetROISettings();
        applySettingsToUI();
    });

    document.getElementById('btnResetAllSettings').addEventListener('click', () => {
        resetAllSettings();
        applySettingsToUI();
    });

    const settingInputs = [
        'cameraSelect', 'mirrorCamera',
        'roiLeft', 'roiRight', 'roiTop', 'roiBottom',
        'sensitivity', 'minBlobSize',
        'bubbleSpeed', 'bubbleSize',
        'shipSpeed', 'shipMoveSpeed', 'maxLives',
        'soundEnabled', 'showMotionOverlay', 'showMotionMask'
    ];

    settingInputs.forEach(id => {
        const el = document.getElementById(id);
        const evt = el.type === 'range' ? 'input' : 'change';
        el.addEventListener(evt, readSettingsFromUI);
    });

    gameCanvas.addEventListener('pointerdown', (e) => {
        if (!state.isGameRunning) return;
        const rect = gameCanvas.getBoundingClientRect();
        handleInteraction(e.clientX - rect.left, e.clientY - rect.top, 24);
    });

    window.addEventListener('keydown', (e) => {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;

        if (e.key === 'Escape') {
            stopGame();
        } else if (e.code === 'Space') {
            e.preventDefault();
            if (state.isGameRunning) stopGame();
            else startGame(true);
        } else if (e.key.toLowerCase() === 'f') {
            toggleBrowserFullscreen();
        } else if (e.key.toLowerCase() === 'd') {
            const cb = document.getElementById('showMotionOverlay');
            cb.checked = !cb.checked;
            readSettingsFromUI();
        }
    });
}

function updateHUD() {
    document.getElementById('scoreDisplay').textContent = `Счёт: ${state.score}`;
    document.getElementById('livesDisplay').textContent = `❤️ ${state.lives}`;
}

function updateStatus(text, cssClass = '') {
    const el = document.getElementById('systemStatus');
    el.textContent = text;
    el.className = 'status' + (cssClass ? ` ${cssClass}` : '');
}

function toggleBrowserFullscreen() {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(err => {
            console.warn('Не удалось открыть полноэкранный режим:', err);
        });
    } else {
        document.exitFullscreen();
    }
}

window.addEventListener('DOMContentLoaded', init);