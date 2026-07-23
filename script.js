const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

document.getElementById("year").textContent = new Date().getFullYear();

function createAmbientDots() {
  const canvas = document.getElementById("ambient-dots");
  const context = canvas.getContext("2d");
  const spacing = 64;
  const radius = 1.5;
  const pulseDuration = 2150;
  let width = 0;
  let height = 0;
  let dots = [];
  let pulses = [];
  let frame;

  const randomAlpha = () => 0.035 + Math.random() * 0.22;

  function resize() {
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);

    const now = performance.now();
    dots = [];
    for (let y = 32; y < height + spacing; y += spacing) {
      for (let x = 32; x < width + spacing; x += spacing) {
        const alpha = randomAlpha();
        dots.push({
          x,
          y,
          from: alpha,
          to: randomAlpha(),
          startedAt: now - Math.random() * 1800,
          duration: 900 + Math.random() * 2400,
        });
      }
    }
  }

  function draw(now) {
    context.clearRect(0, 0, width, height);
    pulses = pulses.filter((pulse) => now - pulse.startedAt < pulseDuration);

    dots.forEach((dot) => {
      let progress = Math.min(1, (now - dot.startedAt) / dot.duration);
      if (progress >= 1) {
        dot.from = dot.to;
        dot.to = randomAlpha();
        dot.startedAt = now;
        dot.duration = 900 + Math.random() * 2400;
        progress = 0;
      }

      const eased = 0.5 - Math.cos(progress * Math.PI) / 2;
      let alpha = reducedMotion.matches
        ? 0.15
        : dot.from + (dot.to - dot.from) * eased;

      pulses.forEach((pulse) => {
        const pulseProgress = Math.min(1, (now - pulse.startedAt) / pulseDuration);
        const waveRadius = pulseProgress * pulse.maximumRadius;
        const distance = Math.hypot(dot.x - pulse.x, dot.y - pulse.y);
        const ringDistance = Math.abs(distance - waveRadius);
        const ring = Math.exp(-Math.pow(ringDistance / 52, 2));
        const trail = distance < waveRadius
          ? Math.exp(-(waveRadius - distance) / 150) * 0.2
          : 0;
        const fadeProgress = Math.max(0, (pulseProgress - 0.72) / 0.28);
        const envelope = 1 - fadeProgress * fadeProgress * (3 - 2 * fadeProgress);
        alpha += (ring * 0.72 + trail) * envelope;
      });

      context.beginPath();
      context.arc(dot.x, dot.y, radius, 0, Math.PI * 2);
      context.fillStyle = `rgba(255, 255, 255, ${Math.min(alpha, 0.92)})`;
      context.fill();
    });

    if (!reducedMotion.matches) frame = requestAnimationFrame(draw);
  }

  resize();
  draw(performance.now());
  window.addEventListener("resize", resize, { passive: true });
  window.addEventListener("pointerdown", (event) => {
    if (reducedMotion.matches || event.button > 0) return;
    const x = event.clientX;
    const y = event.clientY;
    pulses.push({
      x,
      y,
      startedAt: performance.now(),
      maximumRadius: Math.max(
        Math.hypot(x, y),
        Math.hypot(width - x, y),
        Math.hypot(x, height - y),
        Math.hypot(width - x, height - y),
      ),
    });
    if (pulses.length > 4) pulses.shift();
  }, { passive: true });
  reducedMotion.addEventListener?.("change", () => {
    cancelAnimationFrame(frame);
    draw(performance.now());
  });
}

createAmbientDots();

function updateClock() {
  const time = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Taipei",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date());
  document.getElementById("local-time").textContent = time;
}

updateClock();
window.setInterval(updateClock, 30_000);

const activeScrambles = new WeakMap();
const uppercaseGlyphs = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const lowercaseGlyphs = "abcdefghijklmnopqrstuvwxyz";
const numberGlyphs = "0123456789";

function randomGlyph(character) {
  if (/[A-Z]/.test(character)) {
    return uppercaseGlyphs[Math.floor(Math.random() * uppercaseGlyphs.length)];
  }
  if (/[a-z]/.test(character)) {
    return lowercaseGlyphs[Math.floor(Math.random() * lowercaseGlyphs.length)];
  }
  if (/[0-9]/.test(character)) {
    return numberGlyphs[Math.floor(Math.random() * numberGlyphs.length)];
  }
  return character;
}

function getScrambleNodes(block) {
  const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
      const parent = node.parentElement;
      if (!parent) return NodeFilter.FILTER_REJECT;
      if (parent.closest("[hidden], .terminal-window, .video-shell")) {
        return NodeFilter.FILTER_REJECT;
      }
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  return nodes;
}

function restoreScramble(block) {
  const active = activeScrambles.get(block);
  if (!active) return;
  cancelAnimationFrame(active.frame);
  active.entries.forEach(({ node, original }) => {
    node.nodeValue = original;
  });
  activeScrambles.delete(block);
}

function scrambleBlock(block) {
  if (reducedMotion.matches) return;
  restoreScramble(block);

  const entries = getScrambleNodes(block).map((node) => {
    const original = node.nodeValue;
    return {
      node,
      original,
      characters: Array.from(original),
      revealAt: Array.from(original, (character) => (
        /[A-Za-z0-9]/.test(character) ? 0.28 + Math.random() * 0.62 : 0
      )),
    };
  });
  if (!entries.length) return;

  const startedAt = performance.now();
  const duration = 700;
  let previousTick = 0;
  const active = { entries, frame: 0 };
  activeScrambles.set(block, active);

  function animate(now) {
    const progress = Math.min(1, (now - startedAt) / duration);

    if (now - previousTick >= 32 || progress >= 1) {
      previousTick = now;
      entries.forEach(({ node, original, characters, revealAt }) => {
        if (progress >= 1) {
          node.nodeValue = original;
          return;
        }
        node.nodeValue = characters
          .map((character, index) => (
            progress >= revealAt[index] ? character : randomGlyph(character)
          ))
          .join("");
      });
    }

    if (progress < 1) {
      active.frame = requestAnimationFrame(animate);
    } else {
      activeScrambles.delete(block);
    }
  }

  active.frame = requestAnimationFrame(animate);
}

const revealObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        const wasInView = entry.target.classList.contains("in-view");
        entry.target.classList.add("in-view");
        if (!wasInView) scrambleBlock(entry.target);
      } else {
        entry.target.classList.remove("in-view");
        restoreScramble(entry.target);
      }
    });
  },
  { rootMargin: "-14% 0px -14%", threshold: 0.12 },
);

document.querySelectorAll(".reveal").forEach((element) => revealObserver.observe(element));

window.addEventListener(
  "pointermove",
  (event) => {
    document.documentElement.style.setProperty("--pointer-x", `${event.clientX}px`);
    document.documentElement.style.setProperty("--pointer-y", `${event.clientY}px`);
  },
  { passive: true },
);

function springValue({ from, to, velocity = 0, damping = 1, response = 0.35, update }) {
  if (reducedMotion.matches) {
    update(to);
    return () => {};
  }

  const stiffness = (2 * Math.PI / response) ** 2;
  const dampingCoefficient = 2 * damping * Math.sqrt(stiffness);
  let value = from;
  let currentVelocity = velocity;
  let previousTime = performance.now();
  let frame;
  let cancelled = false;

  const step = (now) => {
    const dt = Math.min((now - previousTime) / 1000, 1 / 30);
    previousTime = now;
    const acceleration = -stiffness * (value - to) - dampingCoefficient * currentVelocity;
    currentVelocity += acceleration * dt;
    value += currentVelocity * dt;
    update(value);

    if (Math.abs(value - to) < 0.0005 && Math.abs(currentVelocity) < 0.005) {
      update(to);
      return;
    }
    if (!cancelled) frame = requestAnimationFrame(step);
  };

  frame = requestAnimationFrame(step);
  return () => {
    cancelled = true;
    cancelAnimationFrame(frame);
  };
}

document.querySelectorAll(".pressable").forEach((element) => {
  let scale = 1;
  let cancelSpring = () => {};

  const setScale = (value) => {
    scale = value;
    element.style.transform = `scale(${value.toFixed(4)})`;
  };

  const settle = (target, damping, response) => {
    cancelSpring();
    cancelSpring = springValue({ from: scale, to: target, damping, response, update: setScale });
  };

  element.addEventListener("pointerdown", (event) => {
    element.setPointerCapture?.(event.pointerId);
    settle(0.965, 1, 0.16);
  });

  const release = () => settle(1, 0.8, 0.34);
  element.addEventListener("pointerup", release);
  element.addEventListener("pointercancel", release);
  element.addEventListener("pointerleave", (event) => {
    if (event.buttons === 0) release();
  });
});

function createEventPortrait() {
  const canvas = document.getElementById("event-canvas");
  if (!canvas || canvas.closest("[hidden]")) return;
  const context = canvas.getContext("2d");
  const field = canvas.parentElement;
  const sourcePoints = (window.PORTRAIT_EDGE_POINTS || []).map(([x, y, strength]) => ({ x, y, strength }));
  let width = 0;
  let height = 0;
  let particles = [];
  let frame;

  function buildPortrait() {
    const points = width < 420 ? sourcePoints.slice(0, 680) : sourcePoints;
    const renderSize = Math.min(width * 0.88, height * 0.96);
    const originX = (width - renderSize) / 2;
    const originY = (height - renderSize) / 2;

    const edge = points.map((point) => ({
      x: originX + point.x * renderSize,
      y: originY + point.y * renderSize,
      phase: Math.random() * Math.PI * 2,
      speed: 0.9 + Math.random() * 2.8,
      size: point.strength > 520 ? 1.65 : 1.15,
      polarity: Math.random() > 0.18,
      halo: false,
    }));

    const halo = Array.from({ length: Math.round(edge.length * 0.2) }, () => {
      const source = edge[Math.floor(Math.random() * edge.length)];
      const angle = Math.random() * Math.PI * 2;
      return {
        ...source,
        x: source.x + Math.cos(angle) * (2 + Math.random() * 9),
        y: source.y + Math.sin(angle) * (2 + Math.random() * 9),
        phase: Math.random() * Math.PI * 2,
        speed: 1.8 + Math.random() * 3.5,
        size: Math.random() > 0.85 ? 1.8 : 1,
        orbit: angle,
        drift: 1 + Math.random() * 2.5,
        halo: true,
      };
    });

    particles = [...edge, ...halo];
  }

  function resize() {
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    width = field.clientWidth;
    height = field.clientHeight;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    buildPortrait();
  }

  function draw(now) {
    const time = now / 1000;
    context.clearRect(0, 0, width, height);

    particles.forEach((point) => {
      const wave = (Math.sin(time * point.speed + point.phase) + 1) / 2;
      const flash = Math.pow(wave, point.halo ? 5 : 2.4);
      const opacity = point.halo ? 0.03 + flash * 0.42 : 0.32 + flash * 0.68;
      const driftX = point.halo ? Math.cos(point.orbit + time * 0.3) * point.drift : 0;
      const driftY = point.halo ? Math.sin(point.orbit + time * 0.24) * point.drift : 0;
      context.fillStyle = point.polarity
        ? `rgba(245,245,243,${opacity})`
        : `rgba(255,46,0,${opacity})`;
      context.fillRect(point.x + driftX, point.y + driftY, point.size, point.size);
    });

    if (!reducedMotion.matches) frame = requestAnimationFrame(draw);
  }

  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(field);
  resize();
  draw(performance.now());

  reducedMotion.addEventListener?.("change", () => {
    cancelAnimationFrame(frame);
    draw(performance.now());
  });
}

createEventPortrait();

function createTerminalCarousels() {
  document.querySelectorAll("[data-terminal-carousel]").forEach((carousel) => {
    const slides = [...carousel.querySelectorAll(".terminal-slide")];
    const pagination = [...carousel.querySelectorAll(".terminal-pagination i")];
    const path = carousel.querySelector("[data-terminal-path]");
    const count = carousel.querySelector("[data-terminal-count]");
    const command = carousel.querySelector("[data-terminal-command]");
    const previous = carousel.querySelector("[data-terminal-prev]");
    const next = carousel.querySelector("[data-terminal-next]");
    let activeIndex = 0;
    let timer;
    let isHovering = false;
    let hasFocus = false;

    function showSlide(index) {
      activeIndex = (index + slides.length) % slides.length;
      slides.forEach((slide, slideIndex) => {
        const isActive = slideIndex === activeIndex;
        slide.classList.toggle("is-active", isActive);
        slide.setAttribute("aria-hidden", String(!isActive));
      });
      pagination.forEach((dot, dotIndex) => dot.classList.toggle("is-active", dotIndex === activeIndex));

      const activeSlide = slides[activeIndex];
      path.textContent = activeSlide.dataset.path;
      command.textContent = activeSlide.dataset.command;
      count.textContent = `${String(activeIndex + 1).padStart(2, "0")} / ${String(slides.length).padStart(2, "0")}`;
    }

    function stopAutoplay() {
      window.clearInterval(timer);
      timer = undefined;
    }

    function startAutoplay() {
      stopAutoplay();
      if (reducedMotion.matches || document.hidden || isHovering || hasFocus) return;
      timer = window.setInterval(() => showSlide(activeIndex + 1), 4200);
    }

    previous.addEventListener("click", () => {
      showSlide(activeIndex - 1);
      startAutoplay();
    });
    next.addEventListener("click", () => {
      showSlide(activeIndex + 1);
      startAutoplay();
    });

    carousel.addEventListener("pointerenter", () => {
      isHovering = true;
      stopAutoplay();
    });
    carousel.addEventListener("pointerleave", () => {
      isHovering = false;
      startAutoplay();
    });
    carousel.addEventListener("focusin", () => {
      hasFocus = true;
      stopAutoplay();
    });
    carousel.addEventListener("focusout", (event) => {
      if (carousel.contains(event.relatedTarget)) return;
      hasFocus = false;
      startAutoplay();
    });
    document.addEventListener("visibilitychange", startAutoplay);
    reducedMotion.addEventListener?.("change", startAutoplay);

    showSlide(0);
    startAutoplay();
  });
}

createTerminalCarousels();
