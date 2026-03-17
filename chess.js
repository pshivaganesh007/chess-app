// ==================== PIECES & CONSTANTS ====================
const PIECES = {
  wK:'♔', wQ:'♕', wR:'♖', wB:'♗', wN:'♘', wP:'♙',
  bK:'♚', bQ:'♛', bR:'♜', bB:'♝', bN:'♞', bP:'♟'
};
const FILES = ['a','b','c','d','e','f','g','h'];

// ==================== BOARD INIT ====================
function initBoard() {
  const b = Array(64).fill(null);
  const back = ['R','N','B','Q','K','B','N','R'];
  for (let f = 0; f < 8; f++) {
    b[f]      = 'b' + back[f];
    b[8 + f]  = 'bP';
    b[48 + f] = 'wP';
    b[56 + f] = 'w' + back[f];
  }
  return b;
}

// ==================== STATE ====================
let state = {
  board:      initBoard(),
  turn:       'w',
  castling:   { wK:true, wQ:true, bK:true, bQ:true },
  ep:         null,
  halfmove:   0,
  history:    [],
  historyIdx: -1,
  captured:   { w:[], b:[] },
  inCheck:    false,
  gameOver:   false,
  flipped:    false,
  selected:   null,
  legalMoves: [],
  timers:     { w:600, b:600 },
  timerInterval: null,
};

// ==================== HELPERS ====================
const sq    = (r, f) => r * 8 + f;
const row   = s => Math.floor(s / 8);
const col   = s => s % 8;
const color = p => p ? p[0] : null;
const type  = p => p ? p[1] : null;

// ==================== MOVE GENERATION ====================
function pseudoMoves(board, sqIdx, castling, ep) {
  const piece = board[sqIdx];
  if (!piece) return [];
  const c = color(piece), t = type(piece), opp = c === 'w' ? 'b' : 'w';
  const moves = [];
  const r = row(sqIdx), f = col(sqIdx);

  function add(to) {
    const target = board[to];
    if (!target || color(target) === opp) moves.push(to);
  }

  function slide(dr, df) {
    let nr = r + dr, nf = f + df;
    while (nr >= 0 && nr < 8 && nf >= 0 && nf < 8) {
      const to = nr * 8 + nf;
      const t2 = board[to];
      if (t2) { if (color(t2) === opp) moves.push(to); break; }
      moves.push(to);
      nr += dr; nf += df;
    }
  }

  if (t === 'P') {
    const dir   = c === 'w' ? -1 : 1;
    const start = c === 'w' ? 6  : 1;
    const fwd   = r + dir;
    if (fwd >= 0 && fwd < 8) {
      if (!board[fwd * 8 + f]) moves.push(fwd * 8 + f);
      if (r === start && !board[fwd * 8 + f] && !board[(fwd + dir) * 8 + f])
        moves.push((fwd + dir) * 8 + f);
      for (const df of [-1, 1]) {
        const nf2 = f + df;
        if (nf2 >= 0 && nf2 < 8) {
          const to = fwd * 8 + nf2;
          if (board[to] && color(board[to]) === opp) moves.push(to);
          if (ep === to) moves.push(to);
        }
      }
    }
  } else if (t === 'N') {
    for (const [dr, df] of [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]]) {
      const nr = r + dr, nf = f + df;
      if (nr >= 0 && nr < 8 && nf >= 0 && nf < 8) add(nr * 8 + nf);
    }
  } else if (t === 'B') {
    for (const [dr, df] of [[-1,-1],[-1,1],[1,-1],[1,1]]) slide(dr, df);
  } else if (t === 'R') {
    for (const [dr, df] of [[-1,0],[1,0],[0,-1],[0,1]]) slide(dr, df);
  } else if (t === 'Q') {
    for (const d of [[-1,-1],[-1,1],[1,-1],[1,1],[-1,0],[1,0],[0,-1],[0,1]]) slide(d[0], d[1]);
  } else if (t === 'K') {
    for (const [dr, df] of [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]]) {
      const nr = r + dr, nf = f + df;
      if (nr >= 0 && nr < 8 && nf >= 0 && nf < 8) add(nr * 8 + nf);
    }
    // Castling
    const rank = c === 'w' ? 7 : 0;
    if (r === rank && f === 4) {
      if (castling[c+'K'] && !board[rank*8+5] && !board[rank*8+6] && board[rank*8+7] === c+'R')
        moves.push(rank * 8 + 6);
      if (castling[c+'Q'] && !board[rank*8+3] && !board[rank*8+2] && !board[rank*8+1] && board[rank*8] === c+'R')
        moves.push(rank * 8 + 2);
    }
  }
  return moves;
}

function isAttacked(board, sqIdx, byColor) {
  for (let s = 0; s < 64; s++) {
    const p = board[s];
    if (p && color(p) === byColor) {
      const ms = pseudoMoves(board, s, {wK:false, wQ:false, bK:false, bQ:false}, null);
      if (ms.includes(sqIdx)) return true;
    }
  }
  return false;
}

function findKing(board, c) {
  return board.findIndex(p => p === c + 'K');
}

function isInCheck(board, c) {
  const k = findKing(board, c);
  return k >= 0 && isAttacked(board, k, c === 'w' ? 'b' : 'w');
}

function legalMoves(board, from, castling, ep, turn) {
  const piece = board[from];
  if (!piece || color(piece) !== turn) return [];
  const pseudo = pseudoMoves(board, from, castling, ep);
  const legal = [];

  for (const to of pseudo) {
    const nb = [...board];
    const t2 = type(piece);

    // En passant capture
    if (t2 === 'P' && col(to) !== col(from) && !board[to]) {
      nb[turn === 'w' ? to + 8 : to - 8] = null;
    }
    // Castling — also move rook
    if (t2 === 'K') {
      const rank = turn === 'w' ? 7 : 0;
      if (to === rank*8+6) { nb[rank*8+5] = turn+'R'; nb[rank*8+7] = null; }
      if (to === rank*8+2) { nb[rank*8+3] = turn+'R'; nb[rank*8]   = null; }
    }
    nb[to] = nb[from];
    nb[from] = null;
    if (!isInCheck(nb, turn)) legal.push(to);
  }
  return legal;
}

function allLegalMoves(board, castling, ep, turn) {
  const all = [];
  for (let s = 0; s < 64; s++)
    if (board[s] && color(board[s]) === turn)
      for (const to of legalMoves(board, s, castling, ep, turn))
        all.push({ from: s, to });
  return all;
}

// ==================== SAN NOTATION ====================
function toSAN(board, from, to, promo, castling, ep) {
  const piece = board[from];
  const t2    = type(piece);
  const c     = color(piece);
  const captured = board[to] || (t2 === 'P' && col(from) !== col(to) ? true : false);
  let san = '';

  if (t2 === 'K') {
    const rank = c === 'w' ? 7 : 0;
    if (to === rank*8+6) return 'O-O';
    if (to === rank*8+2) return 'O-O-O';
  }
  if (t2 !== 'P') san += t2;
  else if (captured) san += FILES[col(from)];
  if (captured) san += 'x';
  san += FILES[col(to)] + (8 - row(to));
  if (promo) san += '=' + promo;
  return san;
}

// ==================== APPLY MOVE ====================
function applyMove(from, to, promoType) {
  const board  = [...state.board];
  const piece  = board[from];
  const c      = color(piece), t2 = type(piece);
  const capturedList = board[to] ? [...state.captured[c], board[to]] : [...state.captured[c]];
  let epNext = null;
  const newCastling = { ...state.castling };

  // En passant capture
  if (t2 === 'P' && to === state.ep) {
    const capIdx = c === 'w' ? to + 8 : to - 8;
    capturedList.push(board[capIdx]);
    board[capIdx] = null;
  }
  // Set EP flag for double pawn push
  if (t2 === 'P' && Math.abs(row(to) - row(from)) === 2)
    epNext = c === 'w' ? to + 8 : to - 8;

  // Castling — move rook
  if (t2 === 'K') {
    const rank = c === 'w' ? 7 : 0;
    if (to === rank*8+6) { board[rank*8+5] = c+'R'; board[rank*8+7] = null; }
    if (to === rank*8+2) { board[rank*8+3] = c+'R'; board[rank*8]   = null; }
    newCastling[c+'K'] = false;
    newCastling[c+'Q'] = false;
  }
  if (t2 === 'R') {
    if (from === 56) newCastling.wQ = false;
    if (from === 63) newCastling.wK = false;
    if (from === 0)  newCastling.bQ = false;
    if (from === 7)  newCastling.bK = false;
  }

  // Promotion
  const promo = (t2 === 'P' && (row(to) === 0 || row(to) === 7)) ? promoType : null;
  board[to]   = promo ? c + promo : board[from];
  board[from] = null;

  const san       = toSAN(state.board, from, to, promo, state.castling, state.ep);
  const nextTurn  = c === 'w' ? 'b' : 'w';
  const check     = isInCheck(board, nextTurn);
  const allMoves  = allLegalMoves(board, newCastling, epNext, nextTurn);
  let gameOver = false, result = '', resultSub = '';

  if (allMoves.length === 0) {
    gameOver = true;
    if (check) {
      result    = 'Checkmate!';
      resultSub = (c === 'w' ? 'White' : 'Black') + ' wins by checkmate';
    } else {
      result    = 'Stalemate';
      resultSub = 'Draw by stalemate';
    }
  }

  // Snapshot for history
  const snap = {
    board: [...board], turn: nextTurn, castling: { ...newCastling },
    ep: epNext, halfmove: state.halfmove + 1,
    captured_w: [...capturedList],
    captured_b: [...state.captured[c === 'w' ? 'b' : 'w']],
    san, from, to
  };
  state.history.push(snap);
  state.historyIdx = state.history.length - 1;
  state.board      = board;
  state.turn       = nextTurn;
  state.castling   = newCastling;
  state.ep         = epNext;
  state.halfmove++;
  state.captured[c] = capturedList;
  state.inCheck     = check;
  state.gameOver    = gameOver;
  state.selected    = null;
  state.legalMoves  = [];

  renderAll();
  renderMoveList();
  updateStatus();

  if (gameOver) showResult(result, resultSub);
  else startTimer();
}

// ==================== TIMER ====================
function startTimer() {
  if (state.timerInterval) clearInterval(state.timerInterval);
  state.timerInterval = setInterval(() => {
    if (state.gameOver) { clearInterval(state.timerInterval); return; }
    state.timers[state.turn]--;
    renderTimers();
    if (state.timers[state.turn] <= 0) {
      clearInterval(state.timerInterval);
      state.gameOver = true;
      showResult('Time Out!', (state.turn === 'w' ? 'Black' : 'White') + ' wins on time');
    }
  }, 1000);
}

function renderTimers() {
  const fmt = s => { const m = Math.floor(s/60), sec = s%60; return `${m}:${sec < 10 ? '0' : ''}${sec}`; };
  document.getElementById('clock-white').textContent = fmt(state.timers.w);
  document.getElementById('clock-black').textContent = fmt(state.timers.b);
  document.getElementById('timer-white').className = 'timer-block' + (state.turn === 'w' ? ' active' : '');
  document.getElementById('timer-black').className = 'timer-block' + (state.turn === 'b' ? ' active' : '');
}

// ==================== RENDER ====================
function renderAll() {
  const boardEl   = document.getElementById('board');
  boardEl.innerHTML = '';
  const flipped   = state.flipped;
  const lastFrom  = state.historyIdx >= 0 ? state.history[state.historyIdx].from : -1;
  const lastTo    = state.historyIdx >= 0 ? state.history[state.historyIdx].to   : -1;
  const showLegal = document.getElementById('show-legal').checked;
  const showLast  = document.getElementById('show-last').checked;

  for (let display = 0; display < 64; display++) {
    const r = flipped ? 7 - Math.floor(display / 8) : Math.floor(display / 8);
    const f = flipped ? 7 - (display % 8) : display % 8;
    const s = r * 8 + f;
    const light = (r + f) % 2 === 0;

    const div = document.createElement('div');
    div.className  = 'sq ' + (light ? 'light' : 'dark');
    div.dataset.sq = s;

    if (showLast && (s === lastFrom || s === lastTo)) div.classList.add('last-move');
    if (s === state.selected) div.classList.add('selected');
    if (showLegal && state.selected !== null) {
      if (state.legalMoves.includes(s))
        div.classList.add(state.board[s] ? 'legal-capture' : 'legal-target');
    }
    if (state.inCheck && state.board[s] === state.turn + 'K') div.classList.add('in-check');

    if (state.board[s]) {
      const span = document.createElement('span');
      span.className   = 'piece';
      span.textContent = PIECES[state.board[s]];
      div.appendChild(span);
    }
    div.addEventListener('click', () => handleClick(s));
    boardEl.appendChild(div);
  }

  // Rank / file labels
  const rankEl = document.getElementById('rank-labels');
  const fileEl = document.getElementById('file-labels');
  rankEl.innerHTML = ''; fileEl.innerHTML = '';
  for (let i = 0; i < 8; i++) {
    const rs = document.createElement('span');
    rs.textContent = flipped ? i + 1 : 8 - i;
    rankEl.appendChild(rs);
    const fs = document.createElement('span');
    fs.textContent = FILES[flipped ? 7 - i : i];
    fileEl.appendChild(fs);
  }

  // Captured
  document.getElementById('cap-white').innerHTML = state.captured.w.map(p => `<span>${PIECES[p]}</span>`).join('');
  document.getElementById('cap-black').innerHTML = state.captured.b.map(p => `<span>${PIECES[p]}</span>`).join('');
  renderTimers();
}

function renderMoveList() {
  const el = document.getElementById('move-list');
  el.innerHTML = '';
  for (let i = 0; i < state.history.length; i += 2) {
    const rowEl = document.createElement('div');
    rowEl.className = 'move-row';
    const numEl = document.createElement('span');
    numEl.className   = 'move-num';
    numEl.textContent = (i / 2 + 1) + '.';
    rowEl.appendChild(numEl);
    for (let j = 0; j < 2; j++) {
      const idx  = i + j;
      const span = document.createElement('span');
      span.className   = 'move-san' + (idx === state.historyIdx ? ' current' : '');
      span.textContent = state.history[idx] ? state.history[idx].san : '';
      span.addEventListener('click', () => jumpTo(idx));
      rowEl.appendChild(span);
    }
    el.appendChild(rowEl);
  }
  el.scrollTop = el.scrollHeight;
}

function updateStatus() {
  const el = document.getElementById('status-bar');
  if (state.gameOver) return;
  let txt = (state.turn === 'w' ? 'White' : 'Black') + ' to move';
  if (state.inCheck) txt += ' — Check!';
  el.textContent = txt;
}

// ==================== INTERACTION ====================
function handleClick(s) {
  if (state.gameOver) return;
  if (state.historyIdx < state.history.length - 1) return; // browsing history

  const piece = state.board[s];

  if (state.selected !== null) {
    if (state.legalMoves.includes(s)) {
      const movPiece = state.board[state.selected];
      if (type(movPiece) === 'P' && (row(s) === 0 || row(s) === 7)) {
        if (document.getElementById('auto-queen').checked) {
          applyMove(state.selected, s, 'Q');
        } else {
          openPromoModal(state.selected, s, color(movPiece));
        }
      } else {
        applyMove(state.selected, s, null);
      }
      return;
    }
    if (piece && color(piece) === state.turn) {
      state.selected  = s;
      state.legalMoves = legalMoves(state.board, s, state.castling, state.ep, state.turn);
      renderAll();
      return;
    }
    state.selected  = null;
    state.legalMoves = [];
    renderAll();
    return;
  }

  if (piece && color(piece) === state.turn) {
    state.selected  = s;
    state.legalMoves = legalMoves(state.board, s, state.castling, state.ep, state.turn);
  }
  renderAll();
}

// ==================== PROMOTION ====================
function openPromoModal(from, to, c) {
  const modal   = document.getElementById('promo-modal');
  const choices = document.getElementById('promo-choices');
  choices.innerHTML = '';
  for (const t2 of ['Q','R','B','N']) {
    const div = document.createElement('div');
    div.className   = 'promo-piece';
    div.textContent = PIECES[c + t2];
    div.onclick     = () => { modal.classList.remove('open'); applyMove(from, to, t2); };
    choices.appendChild(div);
  }
  modal.classList.add('open');
}

// ==================== RESULT BANNER ====================
function showResult(title, sub) {
  clearInterval(state.timerInterval);
  document.getElementById('result-title').textContent = title;
  document.getElementById('result-sub').textContent   = sub;
  document.getElementById('result-banner').classList.add('open');
}

// ==================== HISTORY NAVIGATION ====================
function jumpTo(idx) {
  if (idx < 0 || idx >= state.history.length) return;
  const snap  = state.history[idx];
  state.board = [...snap.board];
  state.historyIdx = idx;
  renderAll();
  renderMoveList();
}

// ==================== NEW GAME ====================
function newGame() {
  clearInterval(state.timerInterval);
  document.getElementById('result-banner').classList.remove('open');
  state.board      = initBoard();
  state.turn       = 'w';
  state.castling   = { wK:true, wQ:true, bK:true, bQ:true };
  state.ep         = null;
  state.halfmove   = 0;
  state.history    = [];
  state.historyIdx = -1;
  state.captured   = { w:[], b:[] };
  state.inCheck    = false;
  state.gameOver   = false;
  state.selected   = null;
  state.legalMoves = [];
  state.timers     = { w:600, b:600 };
  renderAll();
  renderMoveList();
  updateStatus();
}

// ==================== CONTROL BINDINGS ====================
document.getElementById('prev-btn').onclick  = () => jumpTo(state.historyIdx - 1);
document.getElementById('next-btn').onclick  = () => jumpTo(state.historyIdx + 1);
document.getElementById('start-btn').onclick = () => { if (state.history.length > 0) jumpTo(0); };
document.getElementById('end-btn').onclick   = () => jumpTo(state.history.length - 1);
document.getElementById('flip-btn').onclick  = () => { state.flipped = !state.flipped; renderAll(); };
document.getElementById('new-game-btn').onclick = newGame;
document.getElementById('show-legal').onchange  = renderAll;
document.getElementById('show-last').onchange   = renderAll;

// ==================== INIT ====================
renderAll();
updateStatus();
