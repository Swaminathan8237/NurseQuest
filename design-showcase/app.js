// NurseQuest Design Showcase Interactive JavaScript

// Sound Synthesizer using Web Audio API (No dependencies!)
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

function playSound(type) {
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }

  const osc = audioCtx.createOscillator();
  const gainNode = audioCtx.createGain();
  osc.connect(gainNode);
  gainNode.connect(audioCtx.destination);

  const now = audioCtx.currentTime;

  if (type === 'click') {
    osc.type = 'sine';
    osc.frequency.setValueAtTime(400, now);
    osc.frequency.exponentialRampToValueAtTime(800, now + 0.1);
    gainNode.gain.setValueAtTime(0.15, now);
    gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
    osc.start(now);
    osc.stop(now + 0.1);
  } else if (type === 'correct') {
    // Pleasant double chime
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(523.25, now); // C5
    osc.frequency.setValueAtTime(659.25, now + 0.08); // E5
    osc.frequency.setValueAtTime(783.99, now + 0.16); // G5
    osc.frequency.setValueAtTime(1046.50, now + 0.24); // C6
    
    gainNode.gain.setValueAtTime(0.2, now);
    gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.4);
    osc.start(now);
    osc.stop(now + 0.4);
  } else if (type === 'incorrect') {
    // Disappointed buzzer downward slide
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(180, now);
    osc.frequency.linearRampToValueAtTime(90, now + 0.25);
    
    gainNode.gain.setValueAtTime(0.2, now);
    gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.28);
    osc.start(now);
    osc.stop(now + 0.28);
  } else if (type === 'level-up') {
    // Magnificent fanfare
    const playNote = (freq, startOffset, duration) => {
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.connect(g);
      g.connect(audioCtx.destination);
      o.type = 'sine';
      o.frequency.setValueAtTime(freq, now + startOffset);
      g.gain.setValueAtTime(0.12, now + startOffset);
      g.gain.exponentialRampToValueAtTime(0.01, now + startOffset + duration);
      o.start(now + startOffset);
      o.stop(now + startOffset + duration);
    };

    playNote(523.25, 0, 0.25);    // C5
    playNote(659.25, 0.1, 0.25);  // E5
    playNote(783.99, 0.2, 0.25);  // G5
    playNote(1046.50, 0.3, 0.5);  // C6
  }
}

// Particle Effect System (Custom Canvas Confetti)
class ParticleSystem {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    if (!this.canvas) return;
    this.ctx = this.canvas.getContext('2d');
    this.particles = [];
    this.active = false;
    
    // Resize handler
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    if (!this.canvas) return;
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }

  spawn(x, y) {
    if (!this.canvas) return;
    const colors = ['#a855f7', '#2dd4bf', '#ec4899', '#10b981', '#f59e0b', '#3b82f6'];
    for (let i = 0; i < 80; i++) {
      this.particles.push({
        x: x,
        y: y,
        vx: (Math.random() - 0.5) * 15,
        vy: (Math.random() - 0.5) * 15 - 5,
        size: Math.random() * 8 + 4,
        color: colors[Math.floor(Math.random() * colors.length)],
        alpha: 1,
        decay: Math.random() * 0.02 + 0.015,
        rotation: Math.random() * Math.PI * 2,
        rotationSpeed: (Math.random() - 0.5) * 0.2
      });
    }
    
    if (!this.active) {
      this.active = true;
      this.animate();
    }
  }

  animate() {
    if (!this.active || !this.canvas) return;
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.25; // gravity
      p.alpha -= p.decay;
      p.rotation += p.rotationSpeed;
      
      if (p.alpha <= 0) {
        this.particles.splice(i, 1);
        continue;
      }
      
      this.ctx.save();
      this.ctx.translate(p.x, p.y);
      this.ctx.rotate(p.rotation);
      this.ctx.fillStyle = p.color;
      this.ctx.globalAlpha = p.alpha;
      this.ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
      this.ctx.restore();
    }
    
    if (this.particles.length > 0) {
      requestAnimationFrame(() => this.animate());
    } else {
      this.active = false;
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }
  }
}

// Global particle emitter
let emitter;
window.addEventListener('DOMContentLoaded', () => {
  if (document.getElementById('confetti-canvas')) {
    emitter = new ParticleSystem('confetti-canvas');
  }
  
  // XP progression animation on load
  const xpBar = document.querySelector('.progress-bar-fill');
  if (xpBar) {
    const targetWidth = xpBar.style.width || '78%';
    xpBar.style.width = '0%';
    setTimeout(() => {
      xpBar.style.transition = 'width 1.5s cubic-bezier(0.25, 1, 0.5, 1)';
      xpBar.style.width = targetWidth;
    }, 200);
  }
  
  // Initialize quiz functionality if on page
  initQuiz();
});

// Sound toggle functionality
let soundEnabled = true;
const soundToggleBtn = document.getElementById('sound-toggle');
if (soundToggleBtn) {
  soundToggleBtn.addEventListener('click', () => {
    soundEnabled = !soundEnabled;
    const icon = soundToggleBtn.querySelector('.material-symbols-outlined');
    if (icon) {
      icon.textContent = soundEnabled ? 'volume_up' : 'volume_off';
    }
    soundToggleBtn.classList.toggle('btn-secondary', soundEnabled);
    soundToggleBtn.classList.toggle('btn-danger', !soundEnabled);
    if (soundEnabled) playSound('click');
  });
}

// Interactive Quiz System
function initQuiz() {
  const choices = document.querySelectorAll('.choice-card');
  const overlayCorrect = document.querySelector('.correct-overlay');
  const overlayIncorrect = document.querySelector('.incorrect-overlay');
  const continueBtn = document.getElementById('quiz-continue-btn');
  const currentXpEl = document.getElementById('player-xp');
  const levelBadge = document.getElementById('player-level');
  
  let answered = false;
  let timerInterval;
  let timeRemaining = 100; // Percentage

  // Timer animation
  const timerFill = document.querySelector('.quiz-timer-fill');
  if (timerFill) {
    timerInterval = setInterval(() => {
      if (answered) {
        clearInterval(timerInterval);
        return;
      }
      timeRemaining -= 1;
      timerFill.style.width = `${timeRemaining}%`;
      
      if (timeRemaining <= 30) {
        timerFill.classList.add('warning');
      }
      
      if (timeRemaining <= 0) {
        clearInterval(timerInterval);
        // Time out
        handleAnswer(null, false);
      }
    }, 150); // 15 seconds total
  }

  choices.forEach(choice => {
    choice.addEventListener('click', (e) => {
      if (answered) return;
      
      // Visual click feedback
      if (soundEnabled) playSound('click');
      
      const isCorrect = choice.dataset.correct === 'true';
      handleAnswer(choice, isCorrect);
    });
  });

  function handleAnswer(selectedChoice, isCorrect) {
    answered = true;
    clearInterval(timerInterval);
    
    // Highlight choice
    if (selectedChoice) {
      if (isCorrect) {
        selectedChoice.classList.add('correct');
        if (soundEnabled) playSound('correct');
        if (emitter) {
          const rect = selectedChoice.getBoundingClientRect();
          emitter.spawn(rect.left + rect.width/2, rect.top + rect.height/2);
        }
        
        // Show correct overlay
        if (overlayCorrect) overlayCorrect.style.display = 'flex';
        
        // Dynamic XP gain representation
        updateXPGain(150);
      } else {
        selectedChoice.classList.add('incorrect');
        if (soundEnabled) playSound('incorrect');
        // Also highlight correct answer
        choices.forEach(c => {
          if (c.dataset.correct === 'true') {
            c.classList.add('correct');
          }
        });
        
        // Show incorrect overlay
        if (overlayIncorrect) overlayIncorrect.style.display = 'flex';
      }
    } else {
      // Time-out: show correct answer
      if (soundEnabled) playSound('incorrect');
      choices.forEach(c => {
        if (c.dataset.correct === 'true') {
          c.classList.add('correct');
        }
      });
      if (overlayIncorrect) {
        const title = overlayIncorrect.querySelector('h3');
        const desc = overlayIncorrect.querySelector('p');
        if (title) title.textContent = "Time's Up!";
        if (desc) desc.textContent = "Try to analyze the clinical symptoms faster next time.";
        overlayIncorrect.style.display = 'flex';
      }
    }
    
    if (continueBtn) {
      continueBtn.style.display = 'inline-flex';
    }
  }

  function updateXPGain(xpAmount) {
    if (!currentXpEl) return;
    
    let currentXp = 4200;
    const targetXp = currentXp + xpAmount;
    
    // Trigger Level Up if overflow
    const shouldLevelUp = targetXp >= 5000;
    
    const xpInterval = setInterval(() => {
      currentXp += 5;
      if (currentXp >= targetXp) {
        clearInterval(xpInterval);
        currentXp = targetXp;
        
        if (shouldLevelUp) {
          triggerLevelUp();
        }
      }
      
      // Update UI numbers
      currentXpEl.textContent = `${currentXp} / 5000`;
      
      // Update UI bar
      const xpPercent = (currentXp / 5000) * 100;
      const heroXpBar = document.querySelector('.hero-xp-card .progress-bar-fill');
      if (heroXpBar) {
        heroXpBar.style.width = `${xpPercent}%`;
      }
    }, 15);
  }

  function triggerLevelUp() {
    if (soundEnabled) playSound('level-up');
    
    // Level badge upgrade
    if (levelBadge) {
      levelBadge.textContent = '43';
      levelBadge.style.transform = 'scale(1.4)';
      levelBadge.style.transition = 'transform 0.3s ease';
      setTimeout(() => {
        levelBadge.style.transform = 'scale(1)';
      }, 500);
    }
    
    // Create animated level-up toast
    const toast = document.createElement('div');
    toast.style.cssText = `
      position: fixed;
      bottom: 2rem;
      right: 2rem;
      background: linear-gradient(135deg, var(--secondary) 0%, var(--primary) 100%);
      color: #000;
      padding: 1.25rem 2rem;
      border-radius: var(--radius-lg);
      box-shadow: 0 10px 30px rgba(45, 212, 191, 0.4);
      z-index: 1000;
      font-family: var(--font-display);
      font-weight: 900;
      display: flex;
      align-items: center;
      gap: 1rem;
      animation: toastIn 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275);
    `;
    toast.innerHTML = `
      <span class="material-symbols-outlined" style="font-variation-settings: 'FILL' 1;">workspace_premium</span>
      <div>
        <div style="font-size: 1.1rem; line-height: 1;">RANK PROMOTED!</div>
        <div style="font-size: 0.8rem; font-weight: 500; opacity: 0.8;">Level 43: Chief Intern</div>
      </div>
    `;
    
    document.body.appendChild(toast);
    
    // Confetti shower
    if (emitter) {
      emitter.spawn(window.innerWidth / 4, window.innerHeight / 2);
      emitter.spawn(3 * window.innerWidth / 4, window.innerHeight / 2);
    }
    
    setTimeout(() => {
      toast.style.animation = 'toastOut 0.5s forwards';
      setTimeout(() => toast.remove(), 500);
    }, 4000);
  }
}

// Add stylesheet for keyframes dynamically
const style = document.createElement('style');
style.textContent = `
  @keyframes toastIn {
    from { opacity: 0; transform: translateY(50px) scale(0.9); }
    to { opacity: 1; transform: translateY(0) scale(1); }
  }
  @keyframes toastOut {
    from { opacity: 1; transform: translateY(0) scale(1); }
    to { opacity: 0; transform: translateY(20px) scale(0.9); }
  }
`;
document.head.appendChild(style);
