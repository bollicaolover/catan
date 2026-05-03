/**
 * Integración con la plataforma (iframe padre): ocultar chat y historial de jugadas.
 */

export function isPlatformHideChat() {
  try {
    return new URLSearchParams(window.location.search).get('hideChat') === '1';
  } catch {
    return false;
  }
}

export function postPlatformMoveUpdate(playerName, moveDescription) {
  try {
    if (typeof window === 'undefined' || !window.parent || window.parent === window) {
      return;
    }
    window.parent.postMessage(
      {
        type: 'MOVE_UPDATE',
        move: {
          player: playerName,
          move: moveDescription,
          timestamp: Date.now(),
        },
      },
      '*'
    );
  } catch {
    // ignorar (entorno restringido, etc.)
  }
}

function vertexLabel(key) {
  if (!key) return '';
  const m = String(key).match(/v_(-?\d+)_(-?\d+)_(\d+)/);
  return m ? `(${m[1]},${m[2]},v${m[3]})` : key;
}

function edgeLabel(key) {
  if (!key) return '';
  const m = String(key).match(/e_(-?\d+)_(-?\d+)_(\d+)/);
  return m ? `(${m[1]},${m[2]},e${m[3]})` : key;
}

function findVertexChange(prev, next) {
  const keys = new Set([
    ...Object.keys(prev.vertices || {}),
    ...Object.keys(next.vertices || {}),
  ]);
  for (const k of keys) {
    const pv = prev.vertices?.[k];
    const nv = next.vertices?.[k];
    const pb = pv?.building ?? null;
    const nb = nv?.building ?? null;
    const po = pv?.owner;
    const no = nv?.owner;
    if (pb !== nb || po !== no) {
      return { key: k, prev: pv, next: nv };
    }
  }
  return null;
}

function findEdgeChange(prev, next) {
  const keys = new Set([
    ...Object.keys(prev.edges || {}),
    ...Object.keys(next.edges || {}),
  ]);
  for (const k of keys) {
    const pv = prev.edges?.[k];
    const nv = next.edges?.[k];
    const pr = pv?.road;
    const nr = nv?.road;
    const po = pv?.owner;
    const no = nv?.owner;
    if (pr !== nr || po !== no) {
      return { key: k, prev: pv, next: nv };
    }
  }
  return null;
}

/**
 * Infiere un movimiento legible comparando dos vistas públicas de estado.
 * @returns {{ player: string, move: string } | null}
 */
export function describeGameStatePlatformMove(prev, next) {
  if (!prev || !next) return null;

  const vCh = findVertexChange(prev, next);
  if (vCh) {
    const ownerIdx = vCh.next?.owner;
    const name = next.players?.[ownerIdx]?.name ?? '?';
    const loc = vertexLabel(vCh.key);
    if (vCh.prev?.building === 'settlement' && vCh.next?.building === 'city') {
      return { player: name, move: `Mejoró a ciudad en ${loc}` };
    }
    if (vCh.next?.building === 'settlement') {
      return { player: name, move: `Colocó un pueblo en ${loc}` };
    }
  }

  const eCh = findEdgeChange(prev, next);
  if (eCh?.next?.road) {
    const ownerIdx = eCh.next.owner;
    const name = next.players?.[ownerIdx]?.name ?? '?';
    return { player: name, move: `Construyó una carretera en ${edgeLabel(eCh.key)}` };
  }

  if (prev.robber !== next.robber && next.robber != null) {
    const idx = prev.currentPlayerIndex;
    const name = prev.players?.[idx]?.name ?? next.players?.[next.currentPlayerIndex]?.name ?? '?';
    return { player: name, move: 'Movió el ladrón' };
  }

  if (prev.turnPhase === 'roll' && next.turnPhase === 'main' && next.diceRoll) {
    const p = next.players[next.currentPlayerIndex];
    return {
      player: p?.name ?? '?',
      move: `Lanzó los dados: ${next.diceRoll.total} (${next.diceRoll.die1}+${next.diceRoll.die2})`,
    };
  }

  if (prev.turnPhase === 'roll' && next.turnPhase === 'discard' && next.diceRoll?.total === 7) {
    const p = next.players[next.currentPlayerIndex];
    return { player: p?.name ?? '?', move: 'Lanzó 7 — fase de descarte' };
  }

  if (prev.turnPhase === 'discard' && next.turnPhase === 'robber') {
    return null;
  }

  if (prev.turnPhase !== 'robber' && next.turnPhase === 'robber') {
    const p = next.players[next.currentPlayerIndex];
    if (next.diceRoll?.total === 7) {
      return { player: p?.name ?? '?', move: 'Lanzó 7 — mueve el ladrón' };
    }
    return { player: p?.name ?? '?', move: 'Jugó un Caballero — mueve el ladrón' };
  }

  if (prev.phase === 'waiting' && (next.phase === 'setup' || next.phase === 'playing')) {
    const host = next.players?.[0];
    return { player: host?.name ?? 'Anfitrión', move: 'Inició la partida' };
  }

  if (prev.phase === 'setup' && next.phase === 'playing') {
    const p = next.players?.[next.currentPlayerIndex];
    return { player: p?.name ?? '—', move: 'Terminó la colocación inicial' };
  }

  if (next.phase === 'finished' && prev.phase !== 'finished') {
    const w = next.players?.find((p) => p.id === next.winner);
    return { player: w?.name ?? '?', move: '¡Ganó la partida!' };
  }

  if (
    prev.specialBuildingPhase &&
    !next.specialBuildingPhase &&
    prev.phase === 'playing' &&
    next.phase === 'playing'
  ) {
    const p = prev.players?.[prev.currentPlayerIndex];
    return { player: p?.name ?? '?', move: 'Terminó la fase de construcción especial' };
  }

  if (
    prev.phase === 'playing' &&
    next.phase === 'playing' &&
    prev.turnPhase === 'main' &&
    next.turnPhase === 'roll' &&
    prev.currentPlayerIndex !== next.currentPlayerIndex &&
    !next.diceRoll
  ) {
    const p = prev.players[prev.currentPlayerIndex];
    return { player: p?.name ?? '?', move: 'Terminó el turno' };
  }

  return null;
}
