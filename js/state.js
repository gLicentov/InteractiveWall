export const CV_WIDTH = 320;
export const CV_HEIGHT = 180;

const STORAGE_KEY = 'lumoplay_wall_settings_v1';

export const DEFAULT_SETTINGS = {
    currentGame: 'bubbles',
    selectedCameraId: '',
    mirrorCamera: true,
    roiLeft: 0,
    roiRight: 0,
    roiTop: 0,
    roiBottom: 0,
    sensitivity: 6,
    minBlobSize: 35,
    bubbleSpeed: 1200,
    bubbleSize: 60,
    shipSpeed: 1800,
    shipMoveSpeed: 3.5,
    maxLives: 5,
    soundEnabled: true,
    showMotionOverlay: true,
    showMotionMask: false
};

export const state = {
    isGameRunning: false,
    isCameraActive: false,
    score: 0,
    lives: DEFAULT_SETTINGS.maxLives,
    bubbles: [],
    ships: [],
    particles: [],
    stars: [],
    motionBlobs: [],
    settings: { ...DEFAULT_SETTINGS }
};

export function loadSettings() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return;
        const parsed = JSON.parse(raw);
        state.settings = { ...DEFAULT_SETTINGS, ...parsed };
        state.lives = state.settings.maxLives;
    } catch (err) {
        console.warn('Не удалось загрузить настройки из localStorage:', err);
        state.settings = { ...DEFAULT_SETTINGS };
    }
}

export function saveSettings() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state.settings));
    } catch (err) {
        console.warn('Не удалось сохранить настройки в localStorage:', err);
    }
}

export function resetROISettings() {
    state.settings.roiLeft = 0;
    state.settings.roiRight = 0;
    state.settings.roiTop = 0;
    state.settings.roiBottom = 0;
    saveSettings();
}

export function resetAllSettings() {
    state.settings = { ...DEFAULT_SETTINGS };
    state.lives = state.settings.maxLives;
    saveSettings();
}

export function addBurstParticles(x, y, hue, count) {
    for (let i = 0; i < count; i++) {
        const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.4;
        const speed = 2 + Math.random() * 6;
        state.particles.push({
            x,
            y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            r: 2.5 + Math.random() * 4.5,
            life: 1,
            decay: 0.025 + Math.random() * 0.025,
            hue: hue + (Math.random() * 40 - 20)
        });
    }
}