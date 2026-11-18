import { state, addBurstParticles } from '../state.js';
import { AssetManager } from '../assets.js';
import { SoundFX } from '../sound.js';

export const ShipsGame = {
    id: 'ships',
    title: '🚀 Космические захватчики',
    hasLives: true,

    getSpawnInterval() {
        return state.settings.shipSpeed;
    },

    spawn(canvas) {
        const fromLeft = Math.random() > 0.5;
        const size = 46 + Math.random() * 18;
        state.ships.push({
            x: fromLeft ? -size : canvas.width + size,
            y: 110 + Math.random() * Math.max(100, canvas.height - 200),
            size,
            vx: (fromLeft ? 1 : -1) * (state.settings.shipMoveSpeed + Math.random() * 1.2),
            wobblePhase: Math.random() * Math.PI * 2
        });
    },

    updateAndDraw(ctx, canvas, dt, time, onLifeLost) {
        const shipSprite = AssetManager.get('ship');

        for (let i = state.ships.length - 1; i >= 0; i--) {
            const s = state.ships[i];
            s.x += s.vx * dt;
            s.y += Math.sin(time * 0.004 + s.wobblePhase) * 0.8 * dt;

            if ((s.vx > 0 && s.x > canvas.width + s.size) || (s.vx < 0 && s.x < -s.size)) {
                state.ships.splice(i, 1);
                state.lives--;
                onLifeLost();
                if (state.lives <= 0) return;
                continue;
            }

            ctx.save();
            ctx.translate(s.x, s.y);
            if (s.vx < 0) ctx.scale(-1, 1);

            if (shipSprite) {
                ctx.drawImage(shipSprite, -s.size * 0.6, -s.size * 0.6, s.size * 1.2, s.size * 1.2);
            } else {
                const r = s.size * 0.55;
                const flameLen = r * (0.7 + Math.random() * 0.5);

                ctx.fillStyle = '#fb923c';
                ctx.beginPath();
                ctx.moveTo(-r * 0.85, -r * 0.25);
                ctx.lineTo(-r * 0.85 - flameLen, 0);
                ctx.lineTo(-r * 0.85, r * 0.25);
                ctx.closePath();
                ctx.fill();

                const bodyGrad = ctx.createLinearGradient(-r, -r, r, r);
                bodyGrad.addColorStop(0, '#f43f5e');
                bodyGrad.addColorStop(1, '#9f1239');
                ctx.fillStyle = bodyGrad;
                ctx.beginPath();
                ctx.moveTo(r * 1.15, 0);
                ctx.lineTo(-r * 0.85, -r * 0.72);
                ctx.lineTo(-r * 0.45, 0);
                ctx.lineTo(-r * 0.85, r * 0.72);
                ctx.closePath();
                ctx.fill();

                ctx.fillStyle = '#38bdf8';
                ctx.beginPath();
                ctx.ellipse(r * 0.15, 0, r * 0.32, r * 0.18, 0, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.restore();
        }
    },

    handleHit(x, y, hitRadius) {
        let hit = false;
        for (let i = state.ships.length - 1; i >= 0; i--) {
            const s = state.ships[i];
            if (Math.hypot(x - s.x, y - s.y) <= s.size * 0.75 + hitRadius * 0.65) {
                addBurstParticles(s.x, s.y, 28, 26);
                state.ships.splice(i, 1);
                state.score += 25;
                SoundFX.playExplosion();
                hit = true;
            }
        }
        return hit;
    }
};