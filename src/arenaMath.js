export function coordKey(position) {
  return `${position?.[0]},${position?.[1]}`;
}

export function sameCoord(a, b) {
  return Array.isArray(a) && Array.isArray(b) && a[0] === b[0] && a[1] === b[1];
}

export function isBoostCell(position) {
  return Array.isArray(position) && position[0] % 7 === 0 && position[1] % 7 === 0;
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function collectPositions(arena) {
  if (!arena) {
    return [];
  }

  const groups = [
    arena.plantations,
    arena.enemy,
    arena.mountains,
    arena.cells?.map((cell) => cell.position),
    arena.construction?.map((item) => item.position),
    arena.beavers?.map((item) => item.position),
    arena.meteoForecasts?.map((item) => item.position),
    arena.meteoForecasts?.map((item) => item.nextPosition),
  ];

  return groups
    .flat()
    .filter((position) => Array.isArray(position) && position.length === 2);
}

export function knownBounds(arena) {
  const positions = collectPositions(arena);

  if (!positions.length) {
    return null;
  }

  return positions.reduce(
    (bounds, [x, y]) => ({
      minX: Math.min(bounds.minX, x),
      maxX: Math.max(bounds.maxX, x),
      minY: Math.min(bounds.minY, y),
      maxY: Math.max(bounds.maxY, y),
    }),
    {
      minX: Infinity,
      maxX: -Infinity,
      minY: Infinity,
      maxY: -Infinity,
    },
  );
}

export function fitCamera(arena, width, height) {
  const fallback = {
    x: arena?.size?.[0] ? arena.size[0] / 2 : 0,
    y: arena?.size?.[1] ? arena.size[1] / 2 : 0,
    zoom: 2,
  };

  if (!width || !height) {
    return fallback;
  }

  if (Array.isArray(arena?.size)) {
    const [mapWidth, mapHeight] = arena.size;
    const padding = 12;
    const extentX = Math.max(1, mapWidth + padding * 2);
    const extentY = Math.max(1, mapHeight + padding * 2);
    const zoom = clamp(Math.min(width / extentX, height / extentY), 1.2, 34);

    return {
      x: (mapWidth - 1) / 2,
      y: (mapHeight - 1) / 2,
      zoom,
    };
  }

  const bounds = knownBounds(arena);

  if (!bounds) {
    return fallback;
  }

  const padding = 8;
  const extentX = Math.max(1, bounds.maxX - bounds.minX + 1 + padding * 2);
  const extentY = Math.max(1, bounds.maxY - bounds.minY + 1 + padding * 2);
  const zoom = clamp(Math.min(width / extentX, height / extentY), 1.2, 34);

  return {
    x: (bounds.minX + bounds.maxX) / 2,
    y: (bounds.minY + bounds.maxY) / 2,
    zoom,
  };
}

export function worldToScreen(position, camera, width, height) {
  return {
    x: width / 2 + (position[0] - camera.x) * camera.zoom,
    y: height / 2 + (position[1] - camera.y) * camera.zoom,
  };
}

export function screenToWorld(point, camera, width, height) {
  return [
    Math.round(camera.x + (point.x - width / 2) / camera.zoom),
    Math.round(camera.y + (point.y - height / 2) / camera.zoom),
  ];
}
