/*
 * Pokémon-style battle system. When a chess piece tries to capture another,
 * the two face off in a turn-based battle. Each piece type has a "type", stats,
 * and moves; damage uses a simplified Pokémon formula with type effectiveness.
 *
 * window.ChessBattle.run({ attacker, defender, attackerHuman, defenderHuman })
 *   attacker/defender: { color: 'w'|'b', type: 'p'|'n'|'b'|'r'|'q'|'k' }
 *   returns Promise<boolean> — true if the attacker wins (capture succeeds).
 */
(function (global) {
  'use strict';

  const GLYPHS = {
    wk: '♔', wq: '♕', wr: '♖', wb: '♗', wn: '♘', wp: '♙',
    bk: '♚', bq: '♛', br: '♜', bb: '♝', bn: '♞', bp: '♟',
  };

  // Build a name→move lookup from the external moves.js database.
  // accuracy is stored as 0–100 in moves.js; convert to 0–1 for internal use.
  const MOVES = (function () {
    const map = new Map();
    for (const m of (window.ChessMoves || [])) {
      map.set(m.name, { name: m.name, type: m.type, power: m.power, accuracy: m.accuracy / 100 });
    }
    return map;
  })();

  function lookupMoves(names) {
    return names.map((n) => MOVES.get(n)).filter(Boolean);
  }

  // Per-piece battle profile. Stats are shared across all variants;
  // variantMoves maps each elemental variant to its type, attack moves, and defense moves.
  // Edit moves.js to tune move stats. Edit the name lists below to swap which moves each variant uses.
  const PROFILE = {
    p: {
      name: 'Pawn', hp: 32, atk: 12, def: 9, spd: 8,
      variantMoves: {
        Normal: { type: 'Normal',  moves: ['Tackle', 'Pawn Storm'],    defMoves: ['Brace', 'Last Stand'] },
        Fire:   { type: 'Fire',    moves: ['Ember Charge', 'Pawn Storm'], defMoves: ['Flame Guard', 'Last Stand'] },
        Grass:  { type: 'Grass',   moves: ['Seed Poke', 'Pawn Storm'],  defMoves: ['Thorn Shield', 'Last Stand'] },
      },
    },
    n: {
      name: 'Knight', hp: 46, atk: 18, def: 12, spd: 17,
      variantMoves: {
        Fighting: { type: 'Fighting', moves: ['Fork Strike', 'Gallop'],  defMoves: ['Counter Jab', 'Feint Strike'] },
        Water:    { type: 'Water',    moves: ['Aqua Rush', 'Gallop'],    defMoves: ['Water Parry', 'Feint Strike'] },
        Normal:   { type: 'Normal',   moves: ['Quick Strike', 'Gallop'], defMoves: ['Dodge Roll', 'Feint Strike'] },
      },
    },
    b: {
      name: 'Bishop', hp: 44, atk: 17, def: 11, spd: 19,
      variantMoves: {
        Psychic: { type: 'Psychic', moves: ['Diagonal Slash', 'Pierce'], defMoves: ['Mind Shield', 'Prism Counter'] },
        Grass:   { type: 'Grass',   moves: ['Leaf Slash', 'Pierce'],     defMoves: ['Spore Guard', 'Prism Counter'] },
        Normal:  { type: 'Normal',  moves: ['Swift Strike', 'Pierce'],   defMoves: ['Guard Up', 'Prism Counter'] },
      },
    },
    r: {
      name: 'Rook', hp: 62, atk: 20, def: 18, spd: 6,
      variantMoves: {
        Rock:  { type: 'Rock',  moves: ['Castle Crush', 'Siege Slam'], defMoves: ['Fortify', 'Rampart Smash'] },
        Water: { type: 'Water', moves: ['Tidal Slam', 'Siege Slam'],   defMoves: ['Aqua Barrier', 'Rampart Smash'] },
        Fire:  { type: 'Fire',  moves: ['Blaze Cannon', 'Siege Slam'], defMoves: ['Ember Wall', 'Rampart Smash'] },
      },
    },
    q: {
      name: 'Queen', hp: 82, atk: 26, def: 16, spd: 14,
      variantMoves: {
        Fire:    { type: 'Fire',    moves: ['Royal Flame', 'Court Sweep'],   defMoves: ['Imperial Guard', 'Majestic Counter'] },
        Water:   { type: 'Water',   moves: ['Hydro Surge', 'Court Sweep'],   defMoves: ['Aqua Aura', 'Majestic Counter'] },
        Grass:   { type: 'Grass',   moves: ['Verdant Gale', 'Court Sweep'],  defMoves: ['Petal Veil', 'Majestic Counter'] },
        Dragon:  { type: 'Dragon',  moves: ['Sovereign Fury', 'Court Sweep'], defMoves: ['Dragon Veil', 'Majestic Counter'] },
        Psychic: { type: 'Psychic', moves: ['Psionic Wave', 'Court Sweep'],  defMoves: ['Mental Fortress', 'Majestic Counter'] },
      },
    },
    k: {
      name: 'King', hp: 72, atk: 20, def: 20, spd: 10,
      variantMoves: {
        Dragon: { type: 'Dragon', moves: ["Sovereign's Wrath", 'Royal Decree'], defMoves: ['Royal Defiance', 'Desperate Stand'] },
        Fire:   { type: 'Fire',   moves: ['Royal Inferno', 'Royal Decree'],      defMoves: ['Blazing Guard', 'Desperate Stand'] },
        Normal: { type: 'Normal', moves: ['Rally', 'Royal Decree'],              defMoves: ['Steadfast', 'Desperate Stand'] },
      },
    },
  };

  // Type effectiveness: EFF[attackingType][defendingType] = multiplier (default 1).
  const EFF = {
    Normal:   { Rock: 0.5 },
    Fighting: { Normal: 2, Rock: 2, Psychic: 0.5, Dragon: 0.5 },
    Psychic:  { Fighting: 2, Dragon: 0.5 },
    Rock:     { Fire: 2, Water: 0.5, Fighting: 0.5 },
    Fire:     { Rock: 0.5, Dragon: 0.5, Psychic: 2, Grass: 2, Water: 0.5 },
    Dragon:   { Dragon: 2, Psychic: 2, Fire: 2, Rock: 0.5 },
    Water:    { Fire: 2, Rock: 2, Grass: 0.5, Dragon: 0.5 },
    Grass:    { Water: 2, Rock: 2, Fire: 0.5, Dragon: 0.5 },
  };

  function effectiveness(atkType, defType) {
    return (EFF[atkType] && EFF[atkType][defType]) || 1;
  }

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  // --- DOM ---
  let dom = null;
  function buildDom() {
    if (dom) return dom;
    const overlay = document.createElement('div');
    overlay.id = 'battleOverlay';
    overlay.className = 'overlay battle-overlay';
    overlay.hidden = true;
    overlay.innerHTML = `
      <div class="battle-stage">
        <div class="combatant defender">
          <div class="info">
            <div class="row"><span class="name"></span><span class="type-badge"></span></div>
            <div class="hpbar"><div class="hpfill"></div></div>
            <div class="hptext"></div>
          </div>
          <div class="platform"><div class="sprite"></div></div>
        </div>
        <div class="combatant attacker">
          <div class="platform"><div class="sprite"></div></div>
          <div class="info">
            <div class="row"><span class="name"></span><span class="type-badge"></span></div>
            <div class="hpbar"><div class="hpfill"></div></div>
            <div class="hptext"></div>
          </div>
        </div>
        <div class="battle-panel">
          <div class="battle-msg"></div>
          <div class="battle-menu"></div>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    dom = {
      overlay,
      msg: overlay.querySelector('.battle-msg'),
      menu: overlay.querySelector('.battle-menu'),
      attacker: sideRefs(overlay.querySelector('.attacker')),
      defender: sideRefs(overlay.querySelector('.defender')),
    };
    return dom;
  }
  function sideRefs(el) {
    return {
      root: el,
      name: el.querySelector('.name'),
      type: el.querySelector('.type-badge'),
      hpfill: el.querySelector('.hpfill'),
      hptext: el.querySelector('.hptext'),
      sprite: el.querySelector('.sprite'),
    };
  }

  function makeCombatant(spec, role) {
    const p = PROFILE[spec.type];
    const vm = p.variantMoves[spec.variant] || p.variantMoves[Object.keys(p.variantMoves)[0]];
    const moveNames = role === 'defender' ? vm.defMoves : vm.moves;
    return {
      color: spec.color,
      type: spec.type,
      profile: p,
      role,
      name: (spec.color === 'w' ? 'White ' : 'Black ') + p.name,
      maxhp: p.hp,
      hp: p.hp,
      stats: { ...p, type: vm.type }, // elemental type comes from the variant
      moves: lookupMoves(moveNames),
    };
  }

  function paintSide(ref, c) {
    ref.name.textContent = c.name;
    ref.type.textContent = c.stats.type;
    ref.type.className = 'type-badge type-' + c.stats.type.toLowerCase();
    ref.sprite.textContent = GLYPHS[c.color + c.type];
    ref.sprite.classList.toggle('black-sprite', c.color === 'b');
    updateHp(ref, c);
  }

  function updateHp(ref, c) {
    const pct = Math.max(0, c.hp) / c.maxhp * 100;
    ref.hpfill.style.width = pct + '%';
    ref.hpfill.classList.toggle('low', pct <= 35);
    ref.hpfill.classList.toggle('critical', pct <= 15);
    ref.hptext.textContent = Math.max(0, Math.ceil(c.hp)) + ' / ' + c.maxhp;
  }

  function computeDamage(attacker, defender, move) {
    if (Math.random() > (move.accuracy ?? 1)) return { dmg: 0, eff: 1, crit: false, miss: true };
    const eff = effectiveness(move.type, defender.stats.type);
    const stab = move.type === attacker.stats.type ? 1.5 : 1; // same-type bonus
    const crit = Math.random() < 1 / 12 ? 1.5 : 1;
    const rand = 0.85 + Math.random() * 0.15;
    const ratio = attacker.stats.atk / defender.stats.def;
    const base = move.power * ratio * 0.45 + 2;
    const dmg = Math.max(1, Math.round(base * eff * stab * crit * rand));
    return { dmg, eff, crit: crit > 1, miss: false };
  }

  // The AI picks the move with the best expected damage (factoring in accuracy).
  function pickAiMove(attacker, defender) {
    let best = attacker.moves[0];
    let bestScore = -1;
    for (const m of attacker.moves) {
      const score = m.power * effectiveness(m.type, defender.stats.type) *
        (m.type === attacker.stats.type ? 1.5 : 1) * (m.accuracy ?? 1);
      if (score > bestScore) { bestScore = score; best = m; }
    }
    return best;
  }

  function run(opts) {
    const d = buildDom();
    const attacker = makeCombatant(opts.attacker, 'attacker');
    const defender = makeCombatant(opts.defender, 'defender');

    // The human's piece is always displayed at the bottom (d.attacker slot).
    // If the human is the defender (AI initiated the capture), flip the visual layout.
    const flipDisplay = !opts.attackerHuman && opts.defenderHuman;
    paintSide(d.attacker, flipDisplay ? defender : attacker);
    paintSide(d.defender, flipDisplay ? attacker : defender);
    d.menu.innerHTML = '';
    d.overlay.hidden = false;
    d.overlay.classList.add('show');

    // Speed-based turn order — faster acts first; ties favor the attacker.
    let current = attacker.stats.spd >= defender.stats.spd ? 'attacker' : 'defender';

    const ctx = {
      attacker, defender,
      humans: { attacker: opts.attackerHuman, defender: opts.defenderHuman },
      // Maps logical role → correct DOM ref, accounting for the possible flip.
      domRef: {
        attacker: flipDisplay ? d.defender : d.attacker,
        defender: flipDisplay ? d.attacker : d.defender,
      },
    };

    return new Promise((resolve) => {
      runLoop(d, ctx, current, resolve);
    });
  }

  async function runLoop(d, ctx, current, resolve) {
    const { attacker, defender } = ctx;
    await setMsg(d, `${defender.name} blocks the way! Battle start!`, 900);

    while (true) {
      if (attacker.hp <= 0 || defender.hp <= 0) break;
      const actor = current === 'attacker' ? attacker : defender;
      const target = current === 'attacker' ? defender : attacker;
      const targetRef = ctx.domRef[current === 'attacker' ? 'defender' : 'attacker'];
      const isHuman = ctx.humans[current];

      const isDefending = current === 'defender';
      const move = isHuman ? await chooseMove(d, actor, isDefending) : pickAiMove(actor, target);
      if (!isHuman) {
        await setMsg(d, isDefending
          ? `${actor.name} braces and counters…`
          : `${actor.name} is sizing up the fight…`, 650);
      }

      d.menu.innerHTML = '';
      await setMsg(d, `${actor.name} used ${move.name}!`, 650);

      const { dmg, eff, crit, miss } = computeDamage(actor, target, move);

      if (miss) {
        await setMsg(d, `${actor.name}'s attack missed!`, 900);
      } else {
        target.hp = Math.max(0, target.hp - dmg);
        flash(targetRef);
        updateHp(targetRef, target);
        await sleep(520);

        if (crit) await setMsg(d, 'A critical hit!', 650);
        if (eff > 1) await setMsg(d, "It's super effective!", 700);
        else if (eff < 1) await setMsg(d, "It's not very effective…", 700);

        if (target.hp <= 0) {
          targetRef.root.classList.add('fainted');
          await setMsg(d, `${target.name} fainted!`, 1100);
          break;
        }
      }
      current = current === 'attacker' ? 'defender' : 'attacker';
    }

    const attackerWon = defender.hp <= 0;
    await setMsg(
      d,
      attackerWon ? `${attacker.name} wins the square!` : `${attacker.name} was destroyed!`,
      1000
    );

    d.overlay.classList.remove('show');
    await sleep(180);
    d.overlay.hidden = true;
    d.attacker.root.classList.remove('fainted');
    d.defender.root.classList.remove('fainted');
    resolve(attackerWon);
  }

  function chooseMove(d, actor, isDefending) {
    return new Promise((resolve) => {
      d.menu.innerHTML = '';
      for (const move of actor.moves) {
        const btn = document.createElement('button');
        btn.className = 'move-btn type-border-' + move.type.toLowerCase();
        const accText = move.accuracy != null && move.accuracy < 1
          ? ` · ACC ${Math.round(move.accuracy * 100)}%`
          : '';
        btn.innerHTML = `<span class="move-name">${move.name}</span>` +
          `<span class="move-meta">${move.type} · PWR ${move.power}${accText}</span>`;
        btn.addEventListener('click', () => {
          d.menu.innerHTML = '';
          resolve(move);
        }, { once: true });
        d.menu.appendChild(btn);
      }
      d.msg.textContent = isDefending
        ? `Fight back! What will ${actor.name} do?`
        : `What will ${actor.name} do?`;
    });
  }

  async function setMsg(d, text, hold) {
    d.msg.textContent = text;
    await sleep(hold || 600);
  }

  function flash(ref) {
    ref.sprite.classList.remove('hit');
    void ref.sprite.offsetWidth; // restart animation
    ref.sprite.classList.add('hit');
  }

  global.ChessBattle = { run, PROFILE, effectiveness };
})(typeof window !== 'undefined' ? window : globalThis);
