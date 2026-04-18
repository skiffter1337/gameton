import { useEffect, useMemo, useRef, useState } from 'react';
import cockUrl from './assets/cock.png';
import mountainUrl from './assets/mountain.png';
import palmUrl from './assets/palm.png';
import tigerUrl from './assets/tiger.png';
import wolfUrl from './assets/wolf.png';
import {
  clamp,
  coordKey,
  fitCamera,
  isBoostCell,
  sameCoord,
  screenToWorld,
  worldToScreen,
} from './arenaMath.js';

const COLORS = {
  background: '#0D0221',
  sand2: '#10002B',
  grid: 'rgba(8, 247, 254, 0.12)',
  mountain: '#08F7FE',
  mountainDark: '#1A1A2E',
  main: '#FFB703',
  plant: '#00F5D4',
  enemy: '#FF005C',
  construction: '#FF8500',
  beaver: '#39FF14',
  select: '#FFFFFF',
};

const MAX_BASE_CELLS = 5500;
const FRAME_MS = 1000 / 24;
const MAX_DPR = 1.5;
const LABEL_ZOOM = 9;

const UNIT_IMAGE_URLS = {
  enemy: cockUrl,
  beaver: wolfUrl,
  main: tigerUrl,
  mountain: mountainUrl,
  plant: palmUrl,
};

function useCanvasSize(ref) {
  const [size, setSize] = useState({ width: 1, height: 1 });

  useEffect(() => {
    const canvas = ref.current;

    if (!canvas) {
      return undefined;
    }

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      setSize({
        width: Math.max(1, Math.floor(rect.width)),
        height: Math.max(1, Math.floor(rect.height)),
      });
    };

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);

    return () => observer.disconnect();
  }, [ref]);

  return size;
}

function makeLookup(items, getPosition = (item) => item.position) {
  const map = new Map();

  for (const item of items ?? []) {
    const position = getPosition(item);

    if (Array.isArray(position)) {
      map.set(coordKey(position), item);
    }
  }

  return map;
}

function useUnitImages() {
  const [images, setImages] = useState({});

  useEffect(() => {
    let mounted = true;

    for (const [key, url] of Object.entries(UNIT_IMAGE_URLS)) {
      const image = new Image();
      image.src = url;
      image.onload = () => {
        if (mounted) {
          setImages((current) => ({ ...current, [key]: image }));
        }
      };
    }

    return () => {
      mounted = false;
    };
  }, []);

  return images;
}

function drawText(ctx, text, x, y, size, color = '#FFFFFF', align = 'center') {
  ctx.save();
  ctx.font = `400 ${size}px "Renegado Condensed", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
  ctx.restore();
}

function drawRoundRect(ctx, left, top, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);

  ctx.beginPath();
  ctx.moveTo(left + r, top);
  ctx.lineTo(left + width - r, top);
  ctx.quadraticCurveTo(left + width, top, left + width, top + r);
  ctx.lineTo(left + width, top + height - r);
  ctx.quadraticCurveTo(left + width, top + height, left + width - r, top + height);
  ctx.lineTo(left + r, top + height);
  ctx.quadraticCurveTo(left, top + height, left, top + height - r);
  ctx.lineTo(left, top + r);
  ctx.quadraticCurveTo(left, top, left + r, top);
  ctx.closePath();
}

function drawBadge(ctx, text, x, y, color, size = 1) {
  const height = clamp(18 * size, 16, 28);
  const width = Math.max(height + 8, text.length * height * 0.55 + 14);
  const left = x - width / 2;
  const top = y - height / 2;

  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = 12;
  drawRoundRect(ctx, left, top, width, height, 6);
  ctx.fillStyle = 'rgba(5, 1, 10, .9)';
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  drawText(ctx, text, x, y + 0.5, clamp(height * 0.52, 9, 13), '#FFFFFF');
  ctx.restore();
}

function canDrawImage(image) {
  return image?.complete && image.naturalWidth > 0;
}

function drawUnitImage(ctx, image, x, y, size, color) {
  if (!canDrawImage(image)) {
    return false;
  }

  const half = size / 2;

  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = 18;
  ctx.beginPath();
  ctx.arc(x, y, half * 0.74, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(5, 1, 10, .62)';
  ctx.fill();
  ctx.clip();
  ctx.drawImage(image, x - half, y - half, size, size);
  ctx.restore();

  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.shadowColor = color;
  ctx.shadowBlur = 10;
  ctx.beginPath();
  ctx.arc(x, y, half * 0.74, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  return true;
}

function drawCaption(ctx, text, x, y, zoom, color) {
  if (zoom < LABEL_ZOOM) {
    return;
  }

  const fontSize = clamp(zoom * 0.32, 10, 13);
  const width = Math.max(38, text.length * fontSize * 0.58 + 14);
  const height = fontSize + 8;

  ctx.save();
  drawRoundRect(ctx, x - width / 2, y - height / 2, width, height, 6);
  ctx.fillStyle = 'rgba(13, 2, 33, .72)';
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.stroke();
  drawText(ctx, text, x, y + 0.5, fontSize, '#FFFFFF');
  ctx.restore();
}

function drawRoundedCell(ctx, x, y, size, radius) {
  const half = size / 2;
  const left = x - half;
  const top = y - half;
  const r = Math.min(radius, half);

  ctx.beginPath();
  ctx.moveTo(left + r, top);
  ctx.lineTo(left + size - r, top);
  ctx.quadraticCurveTo(left + size, top, left + size, top + r);
  ctx.lineTo(left + size, top + size - r);
  ctx.quadraticCurveTo(left + size, top + size, left + size - r, top + size);
  ctx.lineTo(left + r, top + size);
  ctx.quadraticCurveTo(left, top + size, left, top + size - r);
  ctx.lineTo(left, top + r);
  ctx.quadraticCurveTo(left, top, left + r, top);
  ctx.closePath();
}

function drawProgressRing(ctx, x, y, radius, percent, color, lineWidth = 3) {
  const start = -Math.PI / 2;
  const end = start + Math.PI * 2 * clamp(percent, 0, 1);

  ctx.save();
  ctx.lineWidth = lineWidth;
  ctx.strokeStyle = 'rgba(255,255,255,.16)';
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 14;
  ctx.beginPath();
  ctx.arc(x, y, radius, start, end);
  ctx.stroke();
  ctx.restore();
}

function drawRangeSquare(ctx, position, radius, camera, width, height, color) {
  const topLeft = worldToScreen(
    [position[0] - radius - 0.5, position[1] - radius - 0.5],
    camera,
    width,
    height,
  );
  const bottomRight = worldToScreen(
    [position[0] + radius + 0.5, position[1] + radius + 0.5],
    camera,
    width,
    height,
  );

  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.setLineDash([7, 7]);
  ctx.strokeRect(topLeft.x, topLeft.y, bottomRight.x - topLeft.x, bottomRight.y - topLeft.y);
  ctx.restore();
}

function drawBaseCell(ctx, screen, zoom, position) {
  const size = clamp(zoom * 0.9, 5, 34);

  drawRoundedCell(ctx, screen.x, screen.y, size, Math.min(5, size * 0.22));
  ctx.fillStyle = isBoostCell(position) ? 'rgba(255, 183, 3, .14)' : COLORS.sand2;
  ctx.fill();

  if (isBoostCell(position) && zoom > 9) {
    ctx.strokeStyle = 'rgba(255, 183, 3, .52)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}

function drawSparseGrid(ctx, minX, maxX, minY, maxY, camera, width, height, arena) {
  const step = camera.zoom < 5 ? 7 : camera.zoom < 7 ? 5 : 2;
  const startX = Math.ceil(minX / step) * step;
  const startY = Math.ceil(minY / step) * step;

  ctx.save();
  ctx.strokeStyle = camera.zoom < 7 ? 'rgba(8, 247, 254, 0.05)' : COLORS.grid;
  ctx.lineWidth = 1;

  for (let x = startX; x <= maxX + 1; x += step) {
    const a = worldToScreen([x - 0.5, minY - 0.5], camera, width, height);
    const b = worldToScreen([x - 0.5, maxY + 0.5], camera, width, height);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }

  for (let y = startY; y <= maxY + 1; y += step) {
    const a = worldToScreen([minX - 0.5, y - 0.5], camera, width, height);
    const b = worldToScreen([maxX + 0.5, y - 0.5], camera, width, height);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }

  if (arena?.size) {
    const topLeft = worldToScreen([-0.5, -0.5], camera, width, height);
    const bottomRight = worldToScreen(
      [arena.size[0] - 0.5, arena.size[1] - 0.5],
      camera,
      width,
      height,
    );
    ctx.strokeStyle = 'rgba(255, 0, 92, .42)';
    ctx.lineWidth = 2;
    ctx.strokeRect(topLeft.x, topLeft.y, bottomRight.x - topLeft.x, bottomRight.y - topLeft.y);
  }

  ctx.restore();
}

function drawMountain(ctx, screen, zoom, unitImages) {
  const size = clamp(zoom * 0.98, 8, 40);
  const half = size / 2;

  ctx.save();
  ctx.shadowColor = 'rgba(5,1,10,.35)';
  ctx.shadowBlur = 10;
  ctx.fillStyle = COLORS.mountainDark;
  ctx.beginPath();
  ctx.moveTo(screen.x - half, screen.y + half);
  ctx.lineTo(screen.x - half * 0.12, screen.y - half);
  ctx.lineTo(screen.x + half, screen.y + half);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = COLORS.mountain;
  ctx.beginPath();
  ctx.moveTo(screen.x - half * 0.12, screen.y - half);
  ctx.lineTo(screen.x + half * 0.25, screen.y + half);
  ctx.lineTo(screen.x + half, screen.y + half);
  ctx.closePath();
  ctx.fill();

  const imageSize = clamp(zoom * 1.35, 24, 50);
  const imageDrawn = drawUnitImage(ctx, unitImages?.mountain, screen.x, screen.y, imageSize, COLORS.mountain);

  if (!imageDrawn) {
    drawBadge(ctx, 'MT', screen.x, screen.y, COLORS.mountain, clamp(zoom * 0.055, 0.9, 1.25));
  }

  drawCaption(ctx, 'Mountain', screen.x, screen.y + clamp(zoom * 0.95, 16, 28), zoom, COLORS.mountain);
  ctx.restore();
}

function drawTerraformCell(ctx, screen, zoom, progress) {
  const size = clamp(zoom * 0.86, 6, 34);
  const ratio = clamp((Number(progress) || 0) / 100, 0, 1);

  ctx.save();
  ctx.shadowColor = `rgba(0, 245, 212, ${0.24 + ratio * 0.42})`;
  ctx.shadowBlur = 18 * ratio;
  drawRoundedCell(ctx, screen.x, screen.y, size, Math.min(6, size * 0.26));

  const gradient = ctx.createRadialGradient(screen.x, screen.y, 1, screen.x, screen.y, size * 0.75);
  gradient.addColorStop(0, `rgba(57, 255, 20, ${0.42 + ratio * 0.34})`);
  gradient.addColorStop(0.56, `rgba(0, 245, 212, ${0.16 + ratio * 0.3})`);
  gradient.addColorStop(1, `rgba(247, 37, 133, ${0.08 + ratio * 0.22})`);
  ctx.fillStyle = gradient;
  ctx.fill();

  if (zoom > 11) {
    ctx.strokeStyle = `rgba(0, 245, 212, ${0.24 + ratio * 0.4})`;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  ctx.restore();
}

function drawConstruction(ctx, item, camera, width, height, time) {
  const screen = worldToScreen(item.position, camera, width, height);
  const zoom = camera.zoom;
  const size = clamp(zoom * 0.78, 9, 34);
  const progress = clamp((Number(item.progress) || 0) / 50, 0, 1);

  ctx.save();
  ctx.translate(screen.x, screen.y);
  ctx.rotate(Math.sin(time * 0.002 + item.position[0]) * 0.04);
  ctx.strokeStyle = COLORS.construction;
  ctx.lineWidth = 2;
  ctx.shadowColor = 'rgba(255, 133, 0, .65)';
  ctx.shadowBlur = 12;
  ctx.strokeRect(-size / 2, -size / 2, size, size);
  ctx.beginPath();
  ctx.moveTo(-size / 2, size / 2);
  ctx.lineTo(size / 2, -size / 2);
  ctx.moveTo(-size / 2, -size / 2);
  ctx.lineTo(size / 2, size / 2);
  ctx.stroke();
  ctx.restore();

  ctx.save();
  ctx.fillStyle = 'rgba(5,1,10,.55)';
  ctx.fillRect(screen.x - size / 2, screen.y + size * 0.62, size, 4);
  ctx.fillStyle = COLORS.construction;
  ctx.fillRect(screen.x - size / 2, screen.y + size * 0.62, size * progress, 4);
  drawBadge(ctx, 'BLD', screen.x, screen.y, COLORS.construction, clamp(zoom * 0.055, 0.9, 1.25));
  drawCaption(ctx, 'Build', screen.x, screen.y + clamp(zoom * 0.95, 16, 28), zoom, COLORS.construction);
  ctx.restore();
}

function drawPlantation(ctx, item, camera, width, height, time, actionRange, selected, unitImages) {
  const screen = worldToScreen(item.position, camera, width, height);
  const zoom = camera.zoom;
  const radius = clamp(zoom * 0.33, 5, 15);
  const color = item.isMain ? COLORS.main : COLORS.plant;
  const pulse = Math.sin(time * 0.004 + item.position[0] * 0.3) * 0.5 + 0.5;

  if (selected || item.isMain) {
    drawRangeSquare(
      ctx,
      item.position,
      actionRange ?? 2,
      camera,
      width,
      height,
      item.isMain ? 'rgba(255, 183, 3, .58)' : 'rgba(0, 245, 212, .34)',
    );
  }

  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = 18 + pulse * 12;
  ctx.fillStyle = item.isMain ? 'rgba(255, 183, 3, .24)' : 'rgba(0, 245, 212, .2)';
  ctx.beginPath();
  ctx.arc(screen.x, screen.y, radius * (2.2 + pulse * 0.24), 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = item.isIsolated ? '#FF3C38' : color;
  ctx.beginPath();
  for (let i = 0; i < 6; i += 1) {
    const angle = Math.PI / 6 + (Math.PI * 2 * i) / 6;
    const px = screen.x + Math.cos(angle) * radius * 1.35;
    const py = screen.y + Math.sin(angle) * radius * 1.35;

    if (i === 0) {
      ctx.moveTo(px, py);
    } else {
      ctx.lineTo(px, py);
    }
  }
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = item.isMain ? '#FFB703' : '#08F7FE';
  ctx.lineWidth = 1.5;
  if (item.isIsolated) {
    ctx.setLineDash([4, 4]);
  }
  ctx.stroke();
  ctx.restore();

  drawProgressRing(ctx, screen.x, screen.y, radius * 1.85, (Number(item.hp) || 0) / 50, color, 2.3);

  const imageKey = item.isMain ? 'main' : 'plant';
  const imageSize = clamp(zoom * 1.35, 24, item.isMain ? 54 : 46);
  const imageDrawn = drawUnitImage(ctx, unitImages?.[imageKey], screen.x, screen.y, imageSize, color);

  if (!imageDrawn) {
    drawBadge(
      ctx,
      item.isMain ? 'HQ' : 'PL',
      screen.x,
      screen.y,
      color,
      clamp(zoom * 0.058, 0.9, 1.3),
    );
  }

  drawCaption(
    ctx,
    item.isMain ? 'Control' : 'Plant',
    screen.x,
    screen.y + clamp(zoom * 0.95, 16, 30),
    zoom,
    color,
  );
}

function drawEnemy(ctx, item, camera, width, height, time, unitImages) {
  const screen = worldToScreen(item.position, camera, width, height);
  const radius = clamp(camera.zoom * 0.32, 5, 14);
  const pulse = Math.sin(time * 0.005 + item.position[1]) * 0.5 + 0.5;

  ctx.save();
  ctx.shadowColor = COLORS.enemy;
  ctx.shadowBlur = 18;
  ctx.fillStyle = `rgba(255, 0, 92, ${0.24 + pulse * 0.16})`;
  ctx.beginPath();
  ctx.arc(screen.x, screen.y, radius * 2.1, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = COLORS.enemy;
  ctx.beginPath();
  ctx.moveTo(screen.x, screen.y - radius * 1.6);
  ctx.lineTo(screen.x + radius * 1.35, screen.y + radius);
  ctx.lineTo(screen.x - radius * 1.35, screen.y + radius);
  ctx.closePath();
  ctx.fill();
  const imageSize = clamp(camera.zoom * 1.35, 24, 48);
  const imageDrawn = drawUnitImage(ctx, unitImages?.enemy, screen.x, screen.y, imageSize, COLORS.enemy);

  if (!imageDrawn) {
    drawBadge(ctx, 'EN', screen.x, screen.y, COLORS.enemy, clamp(camera.zoom * 0.058, 0.9, 1.3));
  }

  drawCaption(ctx, 'Enemy', screen.x, screen.y + clamp(camera.zoom * 0.95, 16, 28), camera.zoom, COLORS.enemy);
  ctx.restore();
}

function drawBeaver(ctx, item, camera, width, height, time, unitImages) {
  const screen = worldToScreen(item.position, camera, width, height);
  const radius = clamp(camera.zoom * 0.38, 6, 16);
  const wobble = Math.sin(time * 0.006 + item.position[0]) * 2;

  ctx.save();
  ctx.shadowColor = COLORS.beaver;
  ctx.shadowBlur = 20;
  ctx.fillStyle = 'rgba(57, 255, 20, .24)';
  ctx.beginPath();
  ctx.arc(screen.x, screen.y, radius * 2.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = COLORS.beaver;
  ctx.beginPath();
  ctx.arc(screen.x, screen.y + wobble, radius * 1.25, 0, Math.PI * 2);
  ctx.fill();
  drawProgressRing(ctx, screen.x, screen.y + wobble, radius * 1.85, (Number(item.hp) || 0) / 100, COLORS.beaver, 2.3);
  const imageSize = clamp(camera.zoom * 1.42, 25, 50);
  const imageDrawn = drawUnitImage(
    ctx,
    unitImages?.beaver,
    screen.x,
    screen.y + wobble,
    imageSize,
    COLORS.beaver,
  );

  if (!imageDrawn) {
    drawBadge(ctx, 'BEV', screen.x, screen.y + wobble, COLORS.beaver, clamp(camera.zoom * 0.058, 0.9, 1.3));
  }

  drawCaption(ctx, 'Beaver', screen.x, screen.y + wobble + clamp(camera.zoom * 0.95, 16, 28), camera.zoom, COLORS.beaver);
  ctx.restore();
}

function drawArrow(ctx, from, to, color) {
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  const head = 8;

  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(to.x, to.y);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(to.x, to.y);
  ctx.lineTo(to.x - Math.cos(angle - Math.PI / 6) * head, to.y - Math.sin(angle - Math.PI / 6) * head);
  ctx.lineTo(to.x - Math.cos(angle + Math.PI / 6) * head, to.y - Math.sin(angle + Math.PI / 6) * head);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawStormTrail(ctx, trail, camera, width, height) {
  if (!trail || trail.length < 2) {
    return;
  }

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  for (let i = 1; i < trail.length; i += 1) {
    const from = worldToScreen(trail[i - 1], camera, width, height);
    const to = worldToScreen(trail[i], camera, width, height);
    const alpha = 0.12 + (i / trail.length) * 0.28;

    ctx.strokeStyle = `rgba(255, 110, 199, ${alpha})`;
    ctx.lineWidth = 2 + (i / trail.length) * 2;
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
  }

  ctx.restore();
}

function drawStorm(ctx, storm, camera, width, height, time, turnProgress, trail) {
  if (!Array.isArray(storm.position)) {
    return;
  }

  const hasNext = Array.isArray(storm.nextPosition) && !storm.forming;
  const progress = hasNext ? clamp(turnProgress, 0, 1) : 0;
  const visualPosition = hasNext
    ? [
        storm.position[0] + (storm.nextPosition[0] - storm.position[0]) * progress,
        storm.position[1] + (storm.nextPosition[1] - storm.position[1]) * progress,
      ]
    : storm.position;
  const screen = worldToScreen(visualPosition, camera, width, height);
  const startScreen = worldToScreen(storm.position, camera, width, height);
  const radius = Math.max(8, (Number(storm.radius) || 0) * camera.zoom);
  const phase = time * 0.0013;

  drawStormTrail(ctx, trail, camera, width, height);

  ctx.save();
  ctx.strokeStyle = storm.forming ? 'rgba(255, 183, 3, .32)' : 'rgba(255, 0, 92, .58)';
  ctx.fillStyle = storm.forming ? 'rgba(255, 183, 3, .08)' : 'rgba(255, 0, 92, .14)';
  ctx.lineWidth = 2;
  ctx.setLineDash(storm.forming ? [8, 10] : []);
  ctx.beginPath();
  ctx.arc(screen.x, screen.y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.setLineDash([]);
  for (let i = 0; i < 12; i += 1) {
    const angle = phase + (Math.PI * 2 * i) / 12;
    const waveRadius = radius * (0.2 + (i % 4) * 0.17);
    const x = screen.x + Math.cos(angle) * waveRadius;
    const y = screen.y + Math.sin(angle * 1.4) * waveRadius;
    ctx.strokeStyle = `rgba(8, 247, 254, ${0.13 + (i % 3) * 0.06})`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(x, y, Math.max(6, radius * 0.08), angle, angle + Math.PI * 1.2);
    ctx.stroke();
  }

  if (hasNext) {
    const next = worldToScreen(storm.nextPosition, camera, width, height);
    const dx = next.x - startScreen.x;
    const dy = next.y - startScreen.y;
    const length = Math.hypot(dx, dy);
    const visibleLength = Math.max(length, 34);
    const direction = length > 0 ? { x: dx / length, y: dy / length } : { x: 1, y: 0 };
    const visibleEnd = {
      x: screen.x + direction.x * visibleLength,
      y: screen.y + direction.y * visibleLength,
    };

    drawArrow(ctx, screen, visibleEnd, 'rgba(255, 183, 3, .92)');
    ctx.setLineDash([4, 5]);
    ctx.strokeStyle = 'rgba(8, 247, 254, .78)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(next.x, next.y, 7, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    drawCaption(
      ctx,
      `next ${storm.nextPosition[0]},${storm.nextPosition[1]}`,
      visibleEnd.x,
      visibleEnd.y - 18,
      Math.max(camera.zoom, LABEL_ZOOM),
      '#08F7FE',
    );
  }

  drawBadge(ctx, 'STORM', screen.x, screen.y, COLORS.enemy, clamp(camera.zoom * 0.06, 1, 1.6));
  drawCaption(ctx, 'Storm', screen.x, screen.y + clamp(camera.zoom * 1.2, 18, 36), camera.zoom, COLORS.enemy);
  ctx.restore();
}

function drawDraftPath(ctx, path, camera, width, height) {
  if (!path?.length) {
    return;
  }

  ctx.save();
  ctx.strokeStyle = 'rgba(255, 255, 255, .78)';
  ctx.lineWidth = 2;
  ctx.setLineDash([7, 7]);
  ctx.beginPath();
  path.forEach((position, index) => {
    const screen = worldToScreen(position, camera, width, height);

    if (index === 0) {
      ctx.moveTo(screen.x, screen.y);
    } else {
      ctx.lineTo(screen.x, screen.y);
    }
  });
  ctx.stroke();
  ctx.setLineDash([]);

  path.forEach((position, index) => {
    const screen = worldToScreen(position, camera, width, height);
    ctx.fillStyle = 'rgba(255,255,255,.92)';
    ctx.beginPath();
    ctx.arc(screen.x, screen.y, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#05010A';
    ctx.font = '400 12px "Renegado Condensed", system-ui';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(index + 1), screen.x, screen.y);
  });
  ctx.restore();
}

function drawSelection(ctx, position, camera, width, height, color) {
  if (!position) {
    return;
  }

  const screen = worldToScreen(position, camera, width, height);
  const size = clamp(camera.zoom * 0.98, 9, 36);

  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.setLineDash([5, 5]);
  ctx.strokeRect(screen.x - size / 2, screen.y - size / 2, size, size);
  ctx.restore();
}

function drawArena(
  ctx,
  arena,
  camera,
  width,
  height,
  selectedCell,
  hoverCell,
  draftPath,
  time,
  turnProgress,
  stormTrails,
  unitImages,
) {
  ctx.clearRect(0, 0, width, height);

  const background = ctx.createLinearGradient(0, 0, width, height);
  background.addColorStop(0, COLORS.background);
  background.addColorStop(0.44, '#10002B');
  background.addColorStop(0.72, '#3A0CA3');
  background.addColorStop(1, '#05010A');
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, width, height);

  const zoom = camera.zoom;
  const minX = Math.floor(camera.x - width / 2 / zoom) - 2;
  const maxX = Math.ceil(camera.x + width / 2 / zoom) + 2;
  const minY = Math.floor(camera.y - height / 2 / zoom) - 2;
  const maxY = Math.ceil(camera.y + height / 2 / zoom) + 2;
  const visibleCellCount = Math.max(0, maxX - minX + 1) * Math.max(0, maxY - minY + 1);
  const drawDetailedBase = zoom >= 8 && visibleCellCount <= MAX_BASE_CELLS;

  if (drawDetailedBase) {
    ctx.save();
    for (let x = minX; x <= maxX; x += 1) {
      for (let y = minY; y <= maxY; y += 1) {
        if (arena?.size && (x < 0 || y < 0 || x >= arena.size[0] || y >= arena.size[1])) {
          continue;
        }

        const screen = worldToScreen([x, y], camera, width, height);
        drawBaseCell(ctx, screen, zoom, [x, y]);
      }
    }
    ctx.restore();
  } else {
    drawSparseGrid(ctx, minX, maxX, minY, maxY, camera, width, height, arena);
  }

  if (drawDetailedBase && zoom > 8) {
    ctx.save();
    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;

    for (let x = minX; x <= maxX + 1; x += 1) {
      const a = worldToScreen([x - 0.5, minY - 0.5], camera, width, height);
      const b = worldToScreen([x - 0.5, maxY + 0.5], camera, width, height);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }

    for (let y = minY; y <= maxY + 1; y += 1) {
      const a = worldToScreen([minX - 0.5, y - 0.5], camera, width, height);
      const b = worldToScreen([maxX + 0.5, y - 0.5], camera, width, height);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    ctx.restore();
  }

  for (const cell of arena?.cells ?? []) {
    const screen = worldToScreen(cell.position, camera, width, height);
    drawTerraformCell(ctx, screen, zoom, cell.terraformationProgress);
  }

  for (const position of arena?.mountains ?? []) {
    const screen = worldToScreen(position, camera, width, height);
    drawMountain(ctx, screen, zoom, unitImages);
  }

  for (const storm of (arena?.meteoForecasts ?? []).filter((item) => item.kind === 'sandstorm')) {
    drawStorm(ctx, storm, camera, width, height, time, turnProgress, stormTrails.get(storm.id));
  }

  for (const item of arena?.construction ?? []) {
    drawConstruction(ctx, item, camera, width, height, time);
  }

  for (const item of arena?.beavers ?? []) {
    drawBeaver(ctx, item, camera, width, height, time, unitImages);
  }

  for (const item of arena?.enemy ?? []) {
    drawEnemy(ctx, item, camera, width, height, time, unitImages);
  }

  for (const item of arena?.plantations ?? []) {
    drawPlantation(
      ctx,
      item,
      camera,
      width,
      height,
      time,
      arena?.actionRange,
      sameCoord(selectedCell, item.position),
      unitImages,
    );
  }

  for (const forecast of (arena?.meteoForecasts ?? []).filter((item) => item.kind === 'earthquake')) {
    const alpha = forecast.turnsUntil === 0 ? 0.55 : 0.2;
    ctx.save();
    ctx.strokeStyle = `rgba(255, 183, 3, ${alpha})`;
    ctx.lineWidth = 7;
    ctx.strokeRect(5, 5, width - 10, height - 10);
    drawBadge(ctx, 'EQ', width - 38, 36, COLORS.main, 1.2);
    ctx.restore();
  }

  drawDraftPath(ctx, draftPath, camera, width, height);
  drawSelection(ctx, selectedCell, camera, width, height, COLORS.select);
  drawSelection(ctx, hoverCell, camera, width, height, 'rgba(255, 183, 3, .7)');
}

export function ArenaCanvas({
  arena,
  selectedCell,
  hoverCell,
  draftPath,
  cameraSignal,
  onCellClick,
  onHoverCell,
}) {
  const canvasRef = useRef(null);
  const size = useCanvasSize(canvasRef);
  const unitImages = useUnitImages();
  const [camera, setCamera] = useState({ x: 0, y: 0, zoom: 18 });
  const cameraRef = useRef(camera);
  const dragRef = useRef(null);
  const fittedRef = useRef(false);
  const lastCameraSignalRef = useRef(cameraSignal);
  const lastFitSizeRef = useRef('');
  const lastMapSizeRef = useRef('');
  const hoverKeyRef = useRef('');
  const turnTimingRef = useRef({
    receivedAt: performance.now(),
    nextTurnInMs: 1000,
    turnMs: 1000,
    turnNo: null,
  });
  const stormTrailsRef = useRef(new Map());

  const lookups = useMemo(
    () => ({
      plantations: makeLookup(arena?.plantations),
      enemies: makeLookup(arena?.enemy),
      beavers: makeLookup(arena?.beavers),
      constructions: makeLookup(arena?.construction),
      mountains: makeLookup(arena?.mountains, (item) => item),
    }),
    [arena],
  );

  useEffect(() => {
    cameraRef.current = camera;
  }, [camera]);

  useEffect(() => {
    if (!arena) {
      return;
    }

    const nextTurnInMs = Math.max(0, Number(arena.nextTurnIn) * 1000 || 0);
    turnTimingRef.current = {
      receivedAt: performance.now(),
      nextTurnInMs,
      turnMs: Math.max(1000, nextTurnInMs),
      turnNo: arena.turnNo,
    };

    const nextTrails = new Map(stormTrailsRef.current);

    for (const storm of (arena.meteoForecasts ?? []).filter((item) => item.kind === 'sandstorm')) {
      if (!Array.isArray(storm.position)) {
        continue;
      }

      const trail = nextTrails.get(storm.id) ?? [];
      const last = trail[trail.length - 1];

      if (!last || last[0] !== storm.position[0] || last[1] !== storm.position[1]) {
        nextTrails.set(storm.id, [...trail, storm.position].slice(-28));
      }
    }

    stormTrailsRef.current = nextTrails;

    const signalChanged = lastCameraSignalRef.current !== cameraSignal;
    const fitSize = `${size.width}x${size.height}`;
    const mapSize = Array.isArray(arena.size) ? `${arena.size[0]}x${arena.size[1]}` : '';
    const viewportChanged = lastFitSizeRef.current !== fitSize;
    const mapChanged = lastMapSizeRef.current !== mapSize;

    if (
      (!fittedRef.current || signalChanged || viewportChanged || mapChanged) &&
      size.width > 10 &&
      size.height > 10
    ) {
      setCamera(fitCamera(arena, size.width, size.height));
      fittedRef.current = true;
      lastCameraSignalRef.current = cameraSignal;
      lastFitSizeRef.current = fitSize;
      lastMapSizeRef.current = mapSize;
    }
  }, [arena, cameraSignal, size.width, size.height]);

  useEffect(() => {
    const canvas = canvasRef.current;

    if (!canvas) {
      return undefined;
    }

    const ctx = canvas.getContext('2d');
    const ratio = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    let frame = 0;
    let lastDraw = 0;
    let cancelled = false;
    canvas.width = Math.floor(size.width * ratio);
    canvas.height = Math.floor(size.height * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);

    const render = (time) => {
      if (!lastDraw || time - lastDraw >= FRAME_MS) {
        const timing = turnTimingRef.current;
        const elapsed = performance.now() - timing.receivedAt;
        const remaining = Math.max(0, timing.nextTurnInMs - elapsed);
        const turnProgress = clamp(1 - remaining / timing.turnMs, 0, 1);

        drawArena(
          ctx,
          arena,
          cameraRef.current,
          size.width,
          size.height,
          selectedCell,
          hoverCell,
          draftPath,
          time,
          turnProgress,
          stormTrailsRef.current,
          unitImages,
        );
        lastDraw = time;
      }
      frame = requestAnimationFrame(render);
    };

    const start = () => {
      if (!cancelled) {
        frame = requestAnimationFrame(render);
      }
    };

    if (document.fonts?.load) {
      document.fonts.load('24px "Renegado Condensed"').finally(start);
    } else {
      start();
    }

    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
    };
  }, [arena, draftPath, hoverCell, selectedCell, size.height, size.width, unitImages]);

  const eventPoint = (event) => {
    const rect = canvasRef.current.getBoundingClientRect();

    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
  };

  const emitHover = (position) => {
    const nextKey = position ? coordKey(position) : '';

    if (hoverKeyRef.current !== nextKey) {
      hoverKeyRef.current = nextKey;
      onHoverCell(position);
    }
  };

  const updateHover = (event) => {
    const point = eventPoint(event);
    const position = screenToWorld(point, cameraRef.current, size.width, size.height);

    if (
      arena?.size &&
      (position[0] < 0 ||
        position[1] < 0 ||
        position[0] >= arena.size[0] ||
        position[1] >= arena.size[1])
    ) {
      emitHover(null);
      return;
    }

    emitHover(position);
  };

  const onPointerDown = (event) => {
    canvasRef.current.setPointerCapture(event.pointerId);
    const point = eventPoint(event);
    dragRef.current = {
      pointerId: event.pointerId,
      start: point,
      camera: cameraRef.current,
      moved: false,
    };
  };

  const onPointerMove = (event) => {
    updateHover(event);

    if (!dragRef.current) {
      return;
    }

    const point = eventPoint(event);
    const dx = point.x - dragRef.current.start.x;
    const dy = point.y - dragRef.current.start.y;

    if (Math.abs(dx) + Math.abs(dy) > 3) {
      dragRef.current.moved = true;
    }

    setCamera({
      ...dragRef.current.camera,
      x: dragRef.current.camera.x - dx / dragRef.current.camera.zoom,
      y: dragRef.current.camera.y - dy / dragRef.current.camera.zoom,
    });
  };

  const onPointerUp = (event) => {
    const drag = dragRef.current;
    dragRef.current = null;

    if (!drag?.moved) {
      const point = eventPoint(event);
      const position = screenToWorld(point, cameraRef.current, size.width, size.height);

      if (
        !arena?.size ||
        (position[0] >= 0 &&
          position[1] >= 0 &&
          position[0] < arena.size[0] &&
          position[1] < arena.size[1])
      ) {
        onCellClick(position);
      }
    }
  };

  const onWheel = (event) => {
    event.preventDefault();
    event.stopPropagation();
    const point = eventPoint(event);
    const before = screenToWorld(point, cameraRef.current, size.width, size.height);
    const nextZoom = clamp(cameraRef.current.zoom * (event.deltaY > 0 ? 0.88 : 1.14), 1.2, 48);
    const next = {
      ...cameraRef.current,
      zoom: nextZoom,
    };
    const after = screenToWorld(point, next, size.width, size.height);

    setCamera({
      ...next,
      x: next.x + before[0] - after[0],
      y: next.y + before[1] - after[1],
    });
  };

  useEffect(() => {
    const canvas = canvasRef.current;

    if (!canvas) {
      return undefined;
    }

    canvas.addEventListener('wheel', onWheel, { passive: false });

    return () => {
      canvas.removeEventListener('wheel', onWheel);
    };
  });

  return (
    <canvas
      ref={canvasRef}
      className="arena-canvas"
      role="img"
      aria-label="DatsSol map visualization"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => {
        dragRef.current = null;
      }}
      onMouseLeave={() => emitHover(null)}
      data-own={lookups.plantations.size}
      data-enemy={lookups.enemies.size}
      data-beavers={lookups.beavers.size}
      data-construction={lookups.constructions.size}
      data-mountains={lookups.mountains.size}
    />
  );
}
