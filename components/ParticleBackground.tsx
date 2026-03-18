
import React, { useEffect, useRef } from 'react';
import { SeasonalEffectType } from '../types';

interface ParticleBackgroundProps {
  effect?: SeasonalEffectType;
}

const ParticleBackground: React.FC<ParticleBackgroundProps> = ({ effect = 'nebula' }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let particles: any[] = [];
    let width = window.innerWidth;
    let height = window.innerHeight;

    // --- BASE CLASSES ---

    class BaseParticle {
      x: number;
      y: number;
      size: number;
      speedX: number;
      speedY: number;
      opacity: number;
      color: string;
      rotation: number;
      rotationSpeed: number;

      constructor() {
        this.x = Math.random() * width;
        this.y = Math.random() * height;
        this.size = 0;
        this.speedX = 0;
        this.speedY = 0;
        this.opacity = 1;
        this.color = '#fff';
        this.rotation = Math.random() * 360;
        this.rotationSpeed = (Math.random() - 0.5) * 2;
      }

      update() {
        this.x += this.speedX;
        this.y += this.speedY;
        this.rotation += this.rotationSpeed;

        // Wrap
        if (this.y > height + 20) { this.y = -20; this.x = Math.random() * width; }
        if (this.y < -20) { this.y = height + 20; this.x = Math.random() * width; }
        if (this.x > width + 20) { this.x = -20; }
        if (this.x < -20) { this.x = width + 20; }
      }

      draw() { }
    }

    class EmojiParticle extends BaseParticle {
      emoji: string;

      constructor(emojis: string[]) {
        super();
        this.emoji = emojis[Math.floor(Math.random() * emojis.length)];
        this.size = Math.random() * 20 + 10;
        this.speedY = Math.random() * 1 + 0.5;
        this.speedX = (Math.random() - 0.5) * 0.5;
        this.opacity = Math.random() * 0.5 + 0.3;
      }

      draw() {
        if (!ctx) return;
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate((this.rotation * Math.PI) / 180);
        ctx.globalAlpha = this.opacity;
        ctx.font = `${this.size}px serif`;
        ctx.fillText(this.emoji, -this.size / 2, -this.size / 2);
        ctx.restore();
      }
    }

    // --- SPECIFIC EFFECTS ---

    // 1. NEBULA (Original)
    class NebulaParticle extends BaseParticle {
      constructor() {
        super();
        this.size = Math.random() * 2 + 0.5;
        this.speedY = Math.random() * 0.5 + 0.2;
        this.speedX = (Math.random() - 0.5) * 0.2;
        this.opacity = Math.random() * 0.5 + 0.1;
        const colors = ['#FCA5A5', '#E50914', '#E50914', '#B20710', '#FECACA'];
        this.color = colors[Math.floor(Math.random() * colors.length)];
      }

      draw() {
        if (!ctx) return;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fillStyle = this.color;
        ctx.globalAlpha = this.opacity;
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    }

    class Meteor {
      x: number; y: number; length: number; speed: number; angle: number; opacity: number; dead: boolean;
      constructor() {
        this.x = Math.random() * width + width * 0.5;
        this.y = Math.random() * height * 0.5 - 100;
        this.length = Math.random() * 80 + 20;
        this.speed = Math.random() * 10 + 15;
        this.angle = Math.PI / 4 + (Math.random() - 0.5) * 0.2;
        this.opacity = 1;
        this.dead = false;
      }
      update() {
        this.x -= Math.cos(this.angle) * this.speed;
        this.y += Math.sin(this.angle) * this.speed;
        this.opacity -= 0.01;
        if (this.opacity <= 0) this.dead = true;
      }
      draw() {
        if (!ctx) return;
        const tailX = this.x + Math.cos(this.angle) * this.length;
        const tailY = this.y - Math.sin(this.angle) * this.length;
        const gradient = ctx.createLinearGradient(this.x, this.y, tailX, tailY);
        gradient.addColorStop(0, 'rgba(255, 200, 100, 1)');
        gradient.addColorStop(1, 'rgba(255, 100, 0, 0)');
        ctx.beginPath(); ctx.moveTo(this.x, this.y); ctx.lineTo(tailX, tailY);
        ctx.strokeStyle = gradient; ctx.lineWidth = 2; ctx.stroke();
      }
    }

    // 2. SNOW (Winter / December)
    class SnowParticle extends BaseParticle {
      shape: string;

      constructor() {
        super();
        const shapes = ['❄', '❅', '❆', '•'];
        this.shape = shapes[Math.floor(Math.random() * shapes.length)];
        this.size = Math.random() * 20 + 12;
        this.speedY = Math.random() * 1.5 + 0.5;
        this.speedX = (Math.random() - 0.5) * 1.5;
        this.opacity = Math.random() * 0.6 + 0.2;
      }

      draw() {
        if (!ctx) return;
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate((this.rotation * Math.PI) / 180);
        ctx.globalAlpha = this.opacity;
        ctx.fillStyle = '#ffffff';
        ctx.shadowBlur = 8;
        ctx.shadowColor = 'rgba(255, 255, 255, 0.8)';
        ctx.font = `${this.size}px sans-serif`;
        ctx.fillText(this.shape, -this.size / 2, -this.size / 2);
        ctx.shadowBlur = 0;
        ctx.restore();
      }
    }

    // 3. FIREWORKS (New Year - January)
    class FireworkParticle {
      x: number; y: number; vx: number; vy: number;
      alpha: number; color: string; decay: number;

      constructor(x: number, y: number, color: string) {
        this.x = x;
        this.y = y;
        const angle = Math.random() * Math.PI * 2;
        const speed = Math.random() * 5 + 2;
        this.vx = Math.cos(angle) * speed;
        this.vy = Math.sin(angle) * speed;
        this.alpha = 1;
        this.color = color;
        this.decay = Math.random() * 0.015 + 0.005;
      }

      update() {
        this.vx *= 0.96;
        this.vy *= 0.96;
        this.vy += 0.04;
        this.x += this.vx;
        this.y += this.vy;
        this.alpha -= this.decay;
      }

      draw() {
        if (!ctx || this.alpha <= 0) return;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = this.alpha;
        ctx.strokeStyle = this.color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(this.x, this.y);
        ctx.lineTo(this.x - this.vx * 3, this.y - this.vy * 3);
        ctx.stroke();
        ctx.restore();
      }
    }

    // 4. RAIN / MATRIX
    class RainParticle extends BaseParticle {
      constructor() {
        super();
        this.y = Math.random() * height - height;
        this.speedY = Math.random() * 10 + 15;
        this.size = Math.random() * 15 + 10;
        this.opacity = Math.random() * 0.3 + 0.1;
      }
      update() {
        this.y += this.speedY;
        if (this.y > height) { this.y = -20; this.x = Math.random() * width; }
      }
      draw() {
        if (!ctx) return;
        ctx.beginPath();
        ctx.moveTo(this.x, this.y);
        ctx.lineTo(this.x, this.y + this.size);
        ctx.strokeStyle = effect === 'matrix' ? '#0f0' : '#4a90e2';
        ctx.lineWidth = 1;
        ctx.globalAlpha = this.opacity;
        ctx.stroke();
      }
    }

    // 5. EASTER — Emojis grandes e bonitos de Páscoa com glow
    class EasterEggParticle extends BaseParticle {
      emoji: string;
      glowColor: string;
      wobble: number;
      wobbleSpeed: number;

      constructor() {
        super();
        // Mix de ovos, coelhos e decorações de Páscoa
        const easterItems = [
          { emoji: '🥚', glow: '#FFFACD' },
          { emoji: '🐣', glow: '#FFD700' },
          { emoji: '🐰', glow: '#FFB6C1' },
          { emoji: '🐇', glow: '#DDA0DD' },
          { emoji: '🌷', glow: '#FF69B4' },
          { emoji: '🌸', glow: '#FFB7C5' },
          { emoji: '🦋', glow: '#87CEEB' },
          { emoji: '🎀', glow: '#FF69B4' },
          { emoji: '🧺', glow: '#DEB887' },
          { emoji: '✨', glow: '#FFD700' },
        ];
        const item = easterItems[Math.floor(Math.random() * easterItems.length)];
        this.emoji = item.emoji;
        this.glowColor = item.glow;
        this.size = Math.random() * 22 + 14;  // Emojis grandes
        this.speedY = Math.random() * 0.6 + 0.2;
        this.speedX = (Math.random() - 0.5) * 0.4;
        this.opacity = Math.random() * 0.3 + 0.6;
        this.wobble = Math.random() * Math.PI * 2;
        this.wobbleSpeed = Math.random() * 0.02 + 0.008;
        this.rotationSpeed = (Math.random() - 0.5) * 1;
      }

      update() {
        this.wobble += this.wobbleSpeed;
        this.x += this.speedX + Math.sin(this.wobble) * 0.5;
        this.y += this.speedY;
        this.rotation += this.rotationSpeed;
        if (this.y > height + 40) { this.y = -40; this.x = Math.random() * width; }
      }

      draw() {
        if (!ctx) return;
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate((this.rotation * Math.PI) / 180);
        ctx.globalAlpha = this.opacity;

        // Glow suave atrás do emoji
        ctx.shadowBlur = 12;
        ctx.shadowColor = this.glowColor + '90';

        ctx.font = `${this.size}px serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(this.emoji, 0, 0);

        ctx.shadowBlur = 0;
        ctx.restore();
      }
    }

    // Easter additional: floating flowers & sparkles
    class EasterSparkle extends BaseParticle {
      twinklePhase: number;
      baseOpacity: number;

      constructor() {
        super();
        this.size = Math.random() * 3 + 1;
        this.speedY = Math.random() * 0.3 + 0.1;
        this.speedX = (Math.random() - 0.5) * 0.2;
        this.baseOpacity = Math.random() * 0.5 + 0.2;
        this.opacity = this.baseOpacity;
        this.twinklePhase = Math.random() * Math.PI * 2;
        const colors = ['#FFD700', '#FFB6C1', '#87CEEB', '#98FB98', '#DDA0DD', '#FFFFFF'];
        this.color = colors[Math.floor(Math.random() * colors.length)];
      }

      update() {
        super.update();
        this.twinklePhase += 0.05;
        this.opacity = this.baseOpacity * (0.5 + 0.5 * Math.sin(this.twinklePhase));
      }

      draw() {
        if (!ctx) return;
        ctx.save();
        ctx.globalAlpha = this.opacity;
        ctx.shadowBlur = 10;
        ctx.shadowColor = this.color;

        // 4-point star sparkle
        ctx.translate(this.x, this.y);
        ctx.rotate((this.rotation * Math.PI) / 180);
        ctx.fillStyle = this.color;
        ctx.beginPath();
        for (let i = 0; i < 4; i++) {
          const angle = (i * Math.PI) / 2;
          ctx.lineTo(Math.cos(angle) * this.size, Math.sin(angle) * this.size);
          ctx.lineTo(Math.cos(angle + Math.PI / 4) * this.size * 0.3, Math.sin(angle + Math.PI / 4) * this.size * 0.3);
        }
        ctx.closePath();
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.restore();
      }
    }

    // 6. CARNIVAL (February) — Confetti, sparkles, masks
    class ConfettiParticle extends BaseParticle {
      w: number;
      h: number;
      tilt: number;

      constructor() {
        super();
        const colors = ['#FF1493', '#00FF00', '#FFD700', '#FF4500', '#1E90FF', '#FF69B4', '#00CED1', '#ADFF2F'];
        this.color = colors[Math.floor(Math.random() * colors.length)];
        this.w = Math.random() * 8 + 4;
        this.h = Math.random() * 4 + 2;
        this.tilt = Math.random() * 10 - 5;
        this.speedY = Math.random() * 2 + 1;
        this.speedX = (Math.random() - 0.5) * 2;
        this.opacity = Math.random() * 0.7 + 0.3;
        this.rotationSpeed = (Math.random() - 0.5) * 10;
        this.size = 1;
      }

      draw() {
        if (!ctx) return;
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate((this.rotation * Math.PI) / 180);
        ctx.globalAlpha = this.opacity;
        ctx.fillStyle = this.color;
        ctx.fillRect(-this.w / 2, -this.h / 2, this.w, this.h);
        ctx.restore();
      }
    }

    // 7. VALENTINE (February 14) — Hearts
    // Already exists via EmojiParticle

    // 8. ST PATRICK'S (March) — Shamrocks, gold, green
    class ShamrockParticle extends BaseParticle {
      symbol: string;

      constructor() {
        super();
        const symbols = ['🍀', '☘️', '💰', '🌈', '🪙'];
        this.symbol = symbols[Math.floor(Math.random() * symbols.length)];
        this.size = Math.random() * 18 + 10;
        this.speedY = Math.random() * 0.8 + 0.3;
        this.speedX = (Math.random() - 0.5) * 0.4;
        this.opacity = Math.random() * 0.5 + 0.3;
      }

      draw() {
        if (!ctx) return;
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate((this.rotation * Math.PI) / 180);
        ctx.globalAlpha = this.opacity;
        ctx.shadowBlur = 8;
        ctx.shadowColor = '#00FF0060';
        ctx.font = `${this.size}px serif`;
        ctx.fillText(this.symbol, -this.size / 2, this.size / 2);
        ctx.shadowBlur = 0;
        ctx.restore();
      }
    }

    // 9. SAKURA (Cherry Blossoms - April/Spring)
    class SakuraParticle extends BaseParticle {
      swayPhase: number;
      swaySpeed: number;

      constructor() {
        super();
        this.size = Math.random() * 16 + 8;
        this.speedY = Math.random() * 1 + 0.3;
        this.speedX = Math.random() * 0.5 + 0.2;
        this.opacity = Math.random() * 0.5 + 0.3;
        this.swayPhase = Math.random() * Math.PI * 2;
        this.swaySpeed = Math.random() * 0.02 + 0.01;
        const colors = ['#FFB7C5', '#FF69B4', '#FFD1DC', '#FFC0CB', '#FADADD'];
        this.color = colors[Math.floor(Math.random() * colors.length)];
      }

      update() {
        this.swayPhase += this.swaySpeed;
        this.x += this.speedX + Math.sin(this.swayPhase) * 0.8;
        this.y += this.speedY;
        this.rotation += this.rotationSpeed;
        if (this.y > height + 20) { this.y = -20; this.x = Math.random() * width; }
        if (this.x > width + 20) { this.x = -20; }
      }

      draw() {
        if (!ctx) return;
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate((this.rotation * Math.PI) / 180);
        ctx.globalAlpha = this.opacity;
        ctx.fillStyle = this.color;
        ctx.shadowBlur = 6;
        ctx.shadowColor = this.color + '60';

        // Draw 5-petal flower
        for (let i = 0; i < 5; i++) {
          ctx.beginPath();
          const angle = (i * Math.PI * 2) / 5;
          ctx.ellipse(
            Math.cos(angle) * this.size * 0.3,
            Math.sin(angle) * this.size * 0.3,
            this.size * 0.3, this.size * 0.2,
            angle, 0, Math.PI * 2
          );
          ctx.fill();
        }
        // Center
        ctx.beginPath();
        ctx.arc(0, 0, this.size * 0.12, 0, Math.PI * 2);
        ctx.fillStyle = '#FFD700';
        ctx.fill();

        ctx.shadowBlur = 0;
        ctx.restore();
      }
    }

    // 10. SPRING (Flowers & butterflies - September in BR)
    // Uses EmojiParticle with spring emojis

    // 11. JUNINA (June Festival - Brazil)
    // Uses EmojiParticle

    // 12. MOTHER'S DAY (May)
    // Uses EmojiParticle

    // 13. CHRISTMAS (December - enhanced snow + ornaments)
    class ChristmasParticle extends BaseParticle {
      symbol: string;

      constructor() {
        super();
        const symbols = ['🎄', '⭐', '🎁', '❄', '🔔', '🕯️', '✨'];
        this.symbol = symbols[Math.floor(Math.random() * symbols.length)];
        this.size = Math.random() * 18 + 10;
        this.speedY = Math.random() * 1 + 0.3;
        this.speedX = (Math.random() - 0.5) * 0.5;
        this.opacity = Math.random() * 0.5 + 0.3;
      }

      draw() {
        if (!ctx) return;
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate((this.rotation * Math.PI) / 180);
        ctx.globalAlpha = this.opacity;
        ctx.shadowBlur = 10;
        ctx.shadowColor = '#FFD70060';
        ctx.font = `${this.size}px serif`;
        ctx.fillText(this.symbol, -this.size / 2, this.size / 2);
        ctx.shadowBlur = 0;
        ctx.restore();
      }
    }

    // 14. AURORA (August - Northern Lights style)
    class AuroraWave {
      y: number;
      amplitude: number;
      frequency: number;
      speed: number;
      phase: number;
      color1: string;
      color2: string;
      opacity: number;

      constructor() {
        this.y = Math.random() * height * 0.6 + height * 0.1;
        this.amplitude = Math.random() * 40 + 20;
        this.frequency = Math.random() * 0.005 + 0.002;
        this.speed = Math.random() * 0.02 + 0.005;
        this.phase = Math.random() * Math.PI * 2;
        const colorPairs = [
          ['#00FF88', '#00BFFF'],
          ['#00FFAA', '#E50914'],
          ['#00CED1', '#FF69B4'],
          ['#39FF14', '#00BFFF'],
          ['#7FFFD4', '#DA70D6']
        ];
        const pair = colorPairs[Math.floor(Math.random() * colorPairs.length)];
        this.color1 = pair[0];
        this.color2 = pair[1];
        this.opacity = Math.random() * 0.15 + 0.05;
      }

      update() {
        this.phase += this.speed;
      }

      draw() {
        if (!ctx) return;
        ctx.save();
        ctx.globalAlpha = this.opacity;

        const gradient = ctx.createLinearGradient(0, this.y - 60, 0, this.y + 60);
        gradient.addColorStop(0, 'transparent');
        gradient.addColorStop(0.3, this.color1);
        gradient.addColorStop(0.7, this.color2);
        gradient.addColorStop(1, 'transparent');

        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.moveTo(0, this.y + 60);

        for (let x = 0; x <= width; x += 5) {
          const yOffset = Math.sin(x * this.frequency + this.phase) * this.amplitude
            + Math.sin(x * this.frequency * 2.3 + this.phase * 1.5) * this.amplitude * 0.3;
          ctx.lineTo(x, this.y + yOffset);
        }

        ctx.lineTo(width, this.y + 60);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
    }

    // 15. OCEAN (July)
    class OceanParticle extends BaseParticle {
      bubble: boolean;
      wavePhase: number;

      constructor() {
        super();
        this.bubble = Math.random() > 0.5;
        this.wavePhase = Math.random() * Math.PI * 2;
        if (this.bubble) {
          this.size = Math.random() * 6 + 2;
          this.speedY = -(Math.random() * 1 + 0.3);
          this.opacity = Math.random() * 0.3 + 0.1;
          this.color = '#87CEEB';
        } else {
          this.size = Math.random() * 2 + 1;
          this.speedY = Math.random() * 0.2;
          this.speedX = Math.random() * 0.5 + 0.2;
          this.opacity = Math.random() * 0.4 + 0.1;
          const colors = ['#006994', '#00CED1', '#20B2AA', '#48D1CC', '#40E0D0'];
          this.color = colors[Math.floor(Math.random() * colors.length)];
        }
      }

      update() {
        this.wavePhase += 0.02;
        if (this.bubble) {
          this.x += Math.sin(this.wavePhase) * 0.5;
          this.y += this.speedY;
          if (this.y < -20) { this.y = height + 20; this.x = Math.random() * width; }
        } else {
          this.x += this.speedX + Math.sin(this.wavePhase) * 0.3;
          this.y += this.speedY + Math.cos(this.wavePhase) * 0.2;
          if (this.x > width + 20) { this.x = -20; this.y = Math.random() * height; }
        }
      }

      draw() {
        if (!ctx) return;
        ctx.save();
        ctx.globalAlpha = this.opacity;
        if (this.bubble) {
          ctx.beginPath();
          ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
          ctx.strokeStyle = this.color;
          ctx.lineWidth = 1;
          ctx.stroke();
          // Highlight
          ctx.beginPath();
          ctx.arc(this.x - this.size * 0.3, this.y - this.size * 0.3, this.size * 0.2, 0, Math.PI * 2);
          ctx.fillStyle = '#fff';
          ctx.globalAlpha = this.opacity * 0.5;
          ctx.fill();
        } else {
          ctx.beginPath();
          ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
          ctx.fillStyle = this.color;
          ctx.shadowBlur = 5;
          ctx.shadowColor = this.color;
          ctx.fill();
          ctx.shadowBlur = 0;
        }
        ctx.restore();
      }
    }

    // 16. GALAXY (deep space)
    class GalaxyParticle extends BaseParticle {
      twinklePhase: number;
      isStar: boolean;

      constructor() {
        super();
        this.isStar = Math.random() > 0.3;
        this.twinklePhase = Math.random() * Math.PI * 2;
        if (this.isStar) {
          this.size = Math.random() * 2 + 0.5;
          this.speedX = (Math.random() - 0.5) * 0.05;
          this.speedY = (Math.random() - 0.5) * 0.05;
          this.opacity = Math.random() * 0.7 + 0.3;
          const colors = ['#fff', '#FFD700', '#87CEEB', '#FFB6C1', '#E6E6FA', '#F0E68C'];
          this.color = colors[Math.floor(Math.random() * colors.length)];
        } else {
          // Nebula cloud
          this.size = Math.random() * 60 + 30;
          this.speedX = (Math.random() - 0.5) * 0.02;
          this.speedY = (Math.random() - 0.5) * 0.02;
          this.opacity = Math.random() * 0.03 + 0.01;
          const colors = ['#4B0082', '#8B008B', '#191970', '#0000CD', '#6A0DAD'];
          this.color = colors[Math.floor(Math.random() * colors.length)];
        }
      }

      update() {
        super.update();
        this.twinklePhase += 0.03;
        if (this.isStar) {
          this.opacity = 0.3 + 0.5 * Math.abs(Math.sin(this.twinklePhase));
        }
      }

      draw() {
        if (!ctx) return;
        ctx.save();
        ctx.globalAlpha = this.opacity;
        if (this.isStar) {
          ctx.fillStyle = this.color;
          ctx.shadowBlur = 4;
          ctx.shadowColor = this.color;
          ctx.beginPath();
          ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
          ctx.fill();
        } else {
          const gradient = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, this.size);
          gradient.addColorStop(0, this.color);
          gradient.addColorStop(1, 'transparent');
          ctx.fillStyle = gradient;
          ctx.beginPath();
          ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.shadowBlur = 0;
        ctx.restore();
      }
    }

    // 17. NEON (Cyberpunk glow)
    class NeonParticle extends BaseParticle {
      pulsePhase: number;
      baseSize: number;

      constructor() {
        super();
        this.baseSize = Math.random() * 3 + 1;
        this.size = this.baseSize;
        this.speedX = (Math.random() - 0.5) * 1;
        this.speedY = (Math.random() - 0.5) * 1;
        this.pulsePhase = Math.random() * Math.PI * 2;
        this.opacity = Math.random() * 0.7 + 0.3;
        const colors = ['#FF00FF', '#00FFFF', '#FF1493', '#00FF00', '#FFD700', '#FF4500', '#7B68EE'];
        this.color = colors[Math.floor(Math.random() * colors.length)];
      }

      update() {
        super.update();
        this.pulsePhase += 0.05;
        this.size = this.baseSize * (0.8 + 0.4 * Math.sin(this.pulsePhase));
      }

      draw() {
        if (!ctx) return;
        ctx.save();
        ctx.globalAlpha = this.opacity;
        ctx.shadowBlur = 20;
        ctx.shadowColor = this.color;
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fill();
        // Second glow layer
        ctx.globalAlpha = this.opacity * 0.3;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size * 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.restore();
      }
    }

    // --- INIT LOGIC ---

    let meteors: Meteor[] = [];
    let fireworks: FireworkParticle[] = [];
    let auroraWaves: AuroraWave[] = [];
    // 18. PROSPERITY — Moedas de ouro 3D girando
    class GoldCoinParticle extends BaseParticle {
      spinPhase: number;
      spinSpeed: number;
      wobble: number;
      wobbleSpeed: number;
      shimmerPhase: number;

      constructor() {
        super();
        this.size = Math.random() * 14 + 10;
        this.speedY = Math.random() * 0.8 + 0.3;
        this.speedX = (Math.random() - 0.5) * 0.4;
        this.opacity = Math.random() * 0.3 + 0.65;
        this.spinPhase = Math.random() * Math.PI * 2;
        this.spinSpeed = Math.random() * 0.04 + 0.02;
        this.wobble = Math.random() * Math.PI * 2;
        this.wobbleSpeed = Math.random() * 0.015 + 0.005;
        this.shimmerPhase = Math.random() * Math.PI * 2;
        this.color = '#FFD700';
      }

      update() {
        this.spinPhase += this.spinSpeed;
        this.wobble += this.wobbleSpeed;
        this.shimmerPhase += 0.03;
        this.x += this.speedX + Math.sin(this.wobble) * 0.4;
        this.y += this.speedY;
        if (this.y > height + 40) { this.y = -40; this.x = Math.random() * width; }
      }

      draw() {
        if (!ctx) return;
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.globalAlpha = this.opacity;

        const r = this.size;
        // 3D coin effect: scaleX oscillates to simulate spin
        const scaleX = Math.cos(this.spinPhase);
        ctx.scale(scaleX, 1);

        // Glow
        ctx.shadowBlur = 15;
        ctx.shadowColor = '#FFD70080';

        // Coin body
        const coinGrad = ctx.createRadialGradient(-r * 0.3, -r * 0.3, 0, 0, 0, r);
        coinGrad.addColorStop(0, '#FFF8B0');
        coinGrad.addColorStop(0.3, '#FFD700');
        coinGrad.addColorStop(0.7, '#DAA520');
        coinGrad.addColorStop(1, '#B8860B');
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.fillStyle = coinGrad;
        ctx.fill();

        // Inner ring
        ctx.shadowBlur = 0;
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.82, 0, Math.PI * 2);
        ctx.strokeStyle = '#B8860B';
        ctx.lineWidth = 1;
        ctx.stroke();

        // Dollar sign (only visible when coin faces front)
        if (Math.abs(scaleX) > 0.3) {
          ctx.fillStyle = '#B8860B';
          ctx.font = `bold ${r * 1.1}px serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('$', 0, 1);

          // Light dollar sign overlay
          ctx.fillStyle = '#FFF8B040';
          ctx.fillText('$', -0.5, 0.5);
        }

        // Edge shine (when coin is sideways)
        if (Math.abs(scaleX) < 0.5) {
          ctx.beginPath();
          ctx.rect(-1.5, -r, 3, r * 2);
          const edgeGrad = ctx.createLinearGradient(-1.5, 0, 1.5, 0);
          edgeGrad.addColorStop(0, '#B8860B');
          edgeGrad.addColorStop(0.5, '#FFF8B0');
          edgeGrad.addColorStop(1, '#B8860B');
          ctx.fillStyle = edgeGrad;
          ctx.fill();
        }

        // Animated shimmer
        ctx.globalAlpha = this.opacity * (0.15 + 0.1 * Math.sin(this.shimmerPhase));
        const shimGrad = ctx.createRadialGradient(
          Math.sin(this.shimmerPhase) * r * 0.3, -r * 0.2, 0,
          0, 0, r
        );
        shimGrad.addColorStop(0, '#FFFFFF');
        shimGrad.addColorStop(0.5, '#FFD70030');
        shimGrad.addColorStop(1, 'transparent');
        ctx.fillStyle = shimGrad;
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
      }
    }

    let lastFireworkTime = 0;

    const init = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = width;
      canvas.height = height;
      particles = [];
      fireworks = [];
      meteors = [];
      auroraWaves = [];

      const count = window.innerWidth < 768 ? 30 : 60;

      for (let i = 0; i < count; i++) {
        switch (effect) {
          case 'snow':
            particles.push(new SnowParticle());
            break;
          case 'leaves':
            particles.push(new EmojiParticle(['🍂', '🍁', '🌰', '🌾']));
            break;
          case 'halloween':
            particles.push(new EmojiParticle(['🎃', '👻', '🕸️', '🦇', '💀']));
            break;
          case 'valentine':
            particles.push(new EmojiParticle(['❤️', '💖', '💘', '💋', '🌹']));
            break;
          case 'easter':
            // Mix of decorated eggs, sparkles, and emoji bunnies
            if (i % 3 === 0) {
              particles.push(new EasterEggParticle());
            } else if (i % 3 === 1) {
              particles.push(new EasterSparkle());
            } else {
              particles.push(new EmojiParticle(['🐰', '🐇', '🐣', '🌷', '🌸', '🦋']));
            }
            break;
          case 'summer':
            particles.push(new EmojiParticle(['☀️', '🥥', '🌊', '🕶️', '🌴']));
            break;
          case 'carnival':
            if (i % 2 === 0) {
              particles.push(new ConfettiParticle());
            } else {
              particles.push(new EmojiParticle(['🎭', '🎪', '🎶', '💃', '🪇', '✨']));
            }
            break;
          case 'stpatricks':
            particles.push(new ShamrockParticle());
            break;
          case 'sakura':
            if (i % 3 === 0) {
              particles.push(new SakuraParticle());
            } else {
              particles.push(new EmojiParticle(['🌸', '🎀', '🌺']));
            }
            break;
          case 'spring':
            particles.push(new EmojiParticle(['🌻', '🌷', '🦋', '🐝', '🌼', '🌿', '🐞']));
            break;
          case 'mothersday':
            particles.push(new EmojiParticle(['💐', '🌹', '💖', '👩', '🎀', '🌸', '💝']));
            break;
          case 'junina':
            particles.push(new EmojiParticle(['🌽', '🔥', '🎆', '🏮', '🪗', '🎶', '⭐']));
            break;
          case 'ocean':
            particles.push(new OceanParticle());
            break;
          case 'christmas':
            if (i % 2 === 0) {
              particles.push(new ChristmasParticle());
            } else {
              particles.push(new SnowParticle());
            }
            break;
          case 'aurora':
            // Stars + aurora waves
            particles.push(new GalaxyParticle());
            break;
          case 'galaxy':
            particles.push(new GalaxyParticle());
            break;
          case 'neon':
            particles.push(new NeonParticle());
            break;
          case 'prosperity':
            if (i % 3 === 0) {
              particles.push(new GoldCoinParticle());
            } else {
              particles.push(new EmojiParticle(['💰', '💎', '💵', '🏆', '👑', '🪙', '✨', '💲', '🤑', '💸']));
            }
            break;
          case 'rain':
          case 'matrix':
            particles.push(new RainParticle());
            particles.push(new RainParticle());
            break;
          case 'nebula':
          default:
            particles.push(new NebulaParticle());
            break;
        }
      }

      // Aurora waves
      if (effect === 'aurora') {
        for (let i = 0; i < 5; i++) {
          auroraWaves.push(new AuroraWave());
        }
      }
    };

    const animate = (time: number) => {
      if (!ctx) return;
      ctx.clearRect(0, 0, width, height);

      // Aurora waves behind particles
      if (effect === 'aurora') {
        auroraWaves.forEach(w => { w.update(); w.draw(); });
      }

      // Draw Regular Particles
      particles.forEach(p => {
        p.update();
        p.draw();
      });

      // NEBULA Meteors
      if (effect === 'nebula') {
        if (Math.random() < 0.005) meteors.push(new Meteor());
        meteors = meteors.filter(m => !m.dead);
        meteors.forEach(m => { m.update(); m.draw(); });
      }

      // FIREWORKS
      if (effect === 'fireworks') {
        if (time - lastFireworkTime > (Math.random() * 500 + 300)) {
          const x = Math.random() * (width * 0.8) + (width * 0.1);
          const y = Math.random() * (height * 0.6) + (height * 0.1);
          const colors = ['#FFD700', '#FF0040', '#00FFFF', '#FF00FF', '#FFA500'];
          const color = colors[Math.floor(Math.random() * colors.length)];
          for (let i = 0; i < 80; i++) {
            fireworks.push(new FireworkParticle(x, y, color));
          }
          lastFireworkTime = time;
        }
        fireworks = fireworks.filter(p => p.alpha > 0);
        fireworks.forEach(f => { f.update(); f.draw(); });
      }

      // MATRIX Glitch
      if (effect === 'matrix') {
        ctx.fillStyle = 'rgba(0, 20, 0, 0.1)';
        ctx.fillRect(0, 0, width, height);
      }

      animationFrameId = requestAnimationFrame(animate);
    };

    const handleResize = () => { init(); };

    window.addEventListener('resize', handleResize);
    init();
    animationFrameId = requestAnimationFrame(animate);

    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animationFrameId);
    };
  }, [effect]);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none z-0"
      style={{ mixBlendMode: ['matrix', 'easter', 'halloween', 'christmas', 'carnival', 'stpatricks', 'ocean', 'sakura', 'junina', 'mothersday', 'spring', 'leaves', 'summer', 'valentine', 'prosperity'].includes(effect) ? 'normal' : 'screen' }}
    />
  );
};

export default ParticleBackground;
