import { turnToward } from '../../world/walker.js';

// Should child k be walking towards `target`? Starts once it has fallen `start` behind and
// stops only when within `stop` — the gap between the two keeps it from flipping between the
// walking and standing poses every frame (which looked like a blur of limbs). It keeps pace with
// the parent, hurrying only when left well behind.
function follow(k, target, start, stop) {
  const gap = Math.hypot(k.pos.x - target.x, k.pos.z - target.z);
  k.moving = k.moving ? gap > stop : gap > start;
  k.speed = k.parent.speed * (gap > 3 ? 1.5 : 1.05);
  return k.moving;
}

// One frame of child k tagging along beside its parent (k.parent): through the train door right
// behind them, beside them when there is room, otherwise just behind, taking a proper path round
// walls when it can't cut straight across.
export function stepChild(k, dt, t) {
  const p = k.parent;
  const nav = p.area.nav;
  // On the train with the parent: hidden while riding, stepping through the door right behind them.
  if (p.mode === 'riding' || p.mode === 'waitAlight') {
    k.group.visible = false;
    return;
  }
  if (!k.group.visible) {
    k.pos.copy(p.pos).addScaledVector(p.area.out, 0.6);
    k.path = null;
    k.group.visible = true;
  }
  if (p.mode === 'boarding' || p.mode === 'alighting') {
    k.fixedY = p.fixedY;
    if (follow(k, p.pos, 1.1, 0.8)) k.step(p.pos, dt, t);
    else {
      k.sync();
      k.idle(t);
    }
    return;
  }
  k.fixedY = null;
  // Beside the parent if there is room, otherwise just behind them.
  const sx = Math.cos(p.heading) * 1.1 * k.side, sz = -Math.sin(p.heading) * 1.1 * k.side;
  k.spot.set(p.pos.x + sx, k.pos.y, p.pos.z + sz);
  if (!nav.isFree(k.spot.x, k.spot.z) || !nav.clearLine(p.pos, k.spot)) {
    k.spot.set(p.pos.x - Math.sin(p.heading) * 1.2, k.pos.y, p.pos.z - Math.cos(p.heading) * 1.2);
  }
  let target = k.spot;
  if (!nav.clearLine(k.pos, k.spot)) {
    // Can't cut straight across: follow a proper path to the parent (re-planned every second).
    k.replan = (k.replan ?? 0) - dt;
    if (!k.path || k.replan <= 0) {
      k.path = nav.findPath(k.pos, p.pos, 8000);
      k.pi = 0;
      k.replan = 1;
    }
    if (k.path && k.pi < k.path.length) {
      target = k.path[k.pi];
      if (Math.hypot(target.x - k.pos.x, target.z - k.pos.z) < 0.3) k.pi++;
    } else target = null;
  } else k.path = null;
  if (target && follow(k, target, 0.9, 0.25)) k.step(target, dt, t);
  else {
    k.heading = turnToward(k.heading, p.heading, Math.min(1, dt * 4));
    k.sync();
    k.idle(t);
  }
}
