import { state, addBurstParticles } from '../state.js';
import { AssetManager } from '../assets.js';
import { SoundFX } from '../sound.js';

export const BubblesGame = {
    id: 'bubbles',
    title: '🫧 Лопание пузырей',
    hasLives: false,

    getSpawnInterval() {
        return state.settings.bubbleSpeed;
    },

    spawn(canvas) {
        const baseR = state.settings.bubbleSize * 0.5;
        const radius = baseR * (0.75 + Math.random() * 0.5);
        state.bubbles.push({
            x: radius + Math.random() * (canvas.width - radius * 2),
            y: canvas.height + radius,
            radius,
            speedY: 1.2 + Math.random() * 1.8,
            phase: Math.random() * Math.PI * 2,
            swayAmp: 0.4 + Math.random() * 0.8,
            hue: Math.floor(Math.random() * 360)
        });
    },

    updateAndDraw(ctx, canvas, dt, time) {
        const bubbleSprite = AssetManager.get('bubble');

        for (let i = state.bubbles.length - 1; i >= 0; i--) {
            const b = state.bubbles[i];
            b.y -= b.speedY * dt;
            b.x += Math.sin(time * 0.0025 + b.phase) * b.swayAmp * dt;

            if (b.y + b.radius < -10) {
                state.bubbles.splice(i, 1);
                continue;
            }

            if (bubbleSprite) {
                ctx.drawImage(bubbleSprite, b.x - b.radius, b.y - b.radius, b.radius * 2, b.radius * 2);
            } else {
                const grad = ctx.createRadialGradient(
                    b.x - b.radius * 0.3, b.y - b.radius * 0.3, b.radius * 0.1,
                    b.x, b.y, b.radius
                );
                grad.addColorStop(0, `hsla(${b.hue}, 100%, 88%, 0.85)`);
                grad.addColorStop(0.55, `hsla(${b.hue}, 95%, 60%, 0.45)`);
                grad.addColorStop(1, `hsla(${b.hue}, 90%, 45%, 0.78)`);

                ctx.save();
                ctx.beginPath();
                ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2);
                ctx.fillStyle = grad;
                ctx.fill();
                ctx.lineWidth = 2;
                ctx.strokeStyle = `hsla(${b.hue}, 100%, 85%, 0.75)`;
                ctx.stroke();

                ctx.beginPath();
                ctx.ellipse(
                    b.x - b.radius * 0.32, b.y - b.radius * 0.34,
                    b.radius * 0.24, b.radius * 0.13,
                    -Math.PI / 4, 0, Math.PI * 2
                );
                ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
                ctx.fill();
                ctx.restore();
            }
        }
    },

    handleHit(x, y, hitRadius) {
        let hit = false;
        for (let i = state.bubbles.length - 1; i >= 0; i--) {
            const b = state.bubbles[i];
            if (Math.hypot(x - b.x, y - b.y) <= b.radius + hitRadius * 0.65) {
                addBurstParticles(b.x, b.y, b.hue, 18);
                state.bubbles.splice(i, 1);
                state.score += 10;
                SoundFX.playPop();
                hit = true;
            }
        }
        return hit;
    }
};