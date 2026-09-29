const crypto = require('node:crypto');
const { AsyncLocalStorage } = require('node:async_hooks');
const { MessageFlags } = require('discord.js');
const { db } = require('../db');
const { spendCoins, settleReservedGame, creditCoins } = require('./economyService');
const { getGameBetLimit } = require('./gameBetLimitService');
const { createFairness, fairInt } = require('./fairnessService');
const hardcoreRepository = require('./hardcoreRepository');
const hardcoreView = require('./hardcoreView');
const { chaosLabel } = hardcoreView;
const { clamp, hitChance, defenseReduction, physicalAfterDefense, magicAfterResistance, enemyScale, baseMultiplier, potentialPayout } = require('./hardcoreEngine');

const MIN_BET = 10;
const MAX_BET = 100_000;
const MAX_PAYOUT = 10_000_000;
const MAX_FLOOR = 999;
const COMPLETION_FLOOR = 100;
const STALE_MS = 7 * 24 * 60 * 60 * 1000;

const CLASSES = Object.freeze({
  barbarian: { name: 'Barbarian', emoji: '🪓', hp: 120, damageMin: 15, damageMax: 21, defense: 8, accuracy: 80, evasion: 8, critChance: 0.1, resistance: 5, energy: 3, skill: 'Iron Will' },
  assassin: { name: 'Assassin', emoji: '🗡️', hp: 95, damageMin: 14, damageMax: 20, defense: 5, accuracy: 90, evasion: 18, critChance: 0.18, resistance: 5, energy: 3, skill: 'Shadow Step' },
  sorceress: { name: 'Sorceress', emoji: '🔮', hp: 85, damageMin: 18, damageMax: 25, defense: 3, accuracy: 85, evasion: 10, critChance: 0.12, resistance: 15, energy: 4, skill: 'Arcane Burst' },
});

const ENEMY_NAMES = ['Cave Rat', 'Wild Boar', 'Moon Panther', 'Steel Drone', 'Dark Cultist', 'Lost Soul', 'Storm Shaman', 'Stone Golem', 'Void Spawn', 'Annihilator'];
const BOSS_NAMES = ['Iron Warden', 'Abyss Hydra', 'Fallen King', 'Storm Tyrant', 'Void Queen', 'Ash Colossus', 'Nightmare Weaver', 'Chaos Emperor'];
const ITEMS = Object.freeze({
  common: [
    { name: 'Rusted Edge', attack: 2, text: '+2 sát thương' },
    { name: 'Dented Plate', defense: 2, text: '+2 Defense' },
    { name: 'Red Potion Belt', potions: 1, text: '+1 bình máu' },
    { name: 'Rabbit Foot', luck: 1, text: '+1 Luck' },
  ],
  rare: [
    { name: 'Hunter’s Fang', attack: 4, critChance: 0.04, text: '+4 sát thương, +4% Crit' },
    { name: 'Runed Carapace', defense: 5, resistance: 5, text: '+5 Defense, +5 Resistance' },
    { name: 'Heart of the Wild', maxHp: 22, heal: 22, text: '+22 HP tối đa và hiện tại' },
    { name: 'Lucky Coin', luck: 3, text: '+3 Luck' },
  ],
  legendary: [
    { name: 'One More Hit', escapeTokens: 1, maxHp: 15, heal: 15, text: '+15 HP, nhận 1 Vé Thoát Hiểm' },
    { name: 'The Last Bad Decision', attack: 9, critChance: 0.08, maxHp: -15, text: '+9 sát thương, +8% Crit, −15 HP tối đa' },
    { name: 'Warden’s Bulwark', defense: 10, resistance: 12, text: '+10 Defense, +12 Resistance' },
    { name: 'Eye of RNGesus', luck: 7, attack: 3, text: '+7 Luck, +3 sát thương' },
  ],
  cursed: [
    { name: 'Glass Cannon', attack: 14, defenseSet: 0, text: '+14 sát thương, Defense về 0' },
    { name: 'Schrödinger’s Armor', defense: 12, maxHp: -20, text: '+12 Defense, −20 HP tối đa' },
    { name: 'Goblin’s Debt', luck: 10, bonusPenalty: 0.15, text: '+10 Luck, mất 15% payout hiện tại' },
  ],
});

const fairStateContext = new AsyncLocalStorage();
function nextFair(maximum, context) {
  const state = fairStateContext.getStore();
  if (!state?.fair?.serverSeed) return null;
  const value = fairInt(state.fair.serverSeed, `hardcore:${context}`, state.fairCounter || 0, maximum);
  state.fairCounter = (state.fairCounter || 0) + 1;
  return value;
}
function randomFloat() { const value = nextFair(1_000_000, 'float'); return (value ?? crypto.randomInt(1_000_000)) / 1_000_000; }
function randomInt(min, max) { const value = nextFair(max - min + 1, 'int'); return min + (value ?? crypto.randomInt(max - min + 1)); }
function pick(items) { const value = nextFair(items.length, 'pick'); return items[value ?? crypto.randomInt(items.length)]; }


function resolvePhysicalAttack(attacker, defender, level, options = {}) {
  const hitRoll = options.hitRoll ?? randomFloat();
  if (hitRoll >= hitChance(attacker.accuracy, defender.evasion)) return { hit: false, crit: false, raw: 0, damage: 0 };
  const base = options.baseDamage ?? randomInt(attacker.damageMin, attacker.damageMax);
  const multiplier = options.multiplier ?? 1;
  const critRoll = options.critRoll ?? randomFloat();
  const crit = critRoll < clamp((attacker.critChance || 0) - (defender.critResistance || 0), 0, 0.75);
  const raw = Math.floor(base * multiplier * (crit ? attacker.critDamage || 1.75 : 1));
  return { hit: true, crit, raw, damage: physicalAfterDefense(raw, defender.defense, level) };
}


function makeEnemy(floor, rank = 'normal', forcedName = null) {
  const rankStats = {
    normal: [1, 1, 1], champion: [1.4, 1.15, 1.4], elite: [2, 1.35, 2],
    boss: [floor <= 10 ? 2.7 : 4, floor <= 10 ? 1.3 : 1.6, 4], mimic: [1.7, 1.25, 1.8], ancient_mimic: [2.8, 1.5, 3],
  }[rank];
  const scale = enemyScale(floor);
  const maxHp = Math.min(1_000_000_000_000, Math.max(10, Math.floor(28 * scale.hp * rankStats[0])));
  const damageMin = Math.min(1_000_000_000_000, Math.max(2, Math.floor(5 * scale.damage * rankStats[1])));
  const damageMax = Math.min(1_000_000_000_000, Math.max(damageMin + 1, Math.floor(9 * scale.damage * rankStats[1])));
  const name = forcedName || (rank === 'boss' ? pick(BOSS_NAMES) : rank.includes('mimic') ? (rank === 'ancient_mimic' ? 'Ancient Mimic' : 'Mimic') : pick(ENEMY_NAMES));
  return {
    type: 'combat', rank, name, hp: maxHp, maxHp, damageMin, damageMax,
    defense: Math.floor(4 + floor * (floor <= 10 ? 2.5 : 5) * (rank === 'boss' ? 1.25 : 1)),
    accuracy: 70 + floor * 3, evasion: 4 + Math.floor(floor / 4), critChance: rank === 'boss' ? 0.1 : 0.05,
    critDamage: 1.5, critResistance: rank === 'boss' ? 0.08 : 0, resistance: Math.min(60, Math.floor(floor * 0.8)),
    magicChance: rank === 'boss' ? 0.35 : rank === 'elite' || rank === 'ancient_mimic' ? 0.2 : 0.05,
    rewardMultiplier: rankStats[2],
  };
}

function chooseRarity(state) {
  if (state.pityRare >= 5) return 'rare';
  const legendaryChance = Math.min(0.35, 0.1 + Math.max(0, state.pityLegendary - 9) * 0.02 + state.luck * 0.002);
  const roll = randomFloat();
  if (roll < legendaryChance) return 'legendary';
  if (roll < legendaryChance + 0.03) return 'cursed';
  if (roll < legendaryChance + 0.25) return 'rare';
  if (roll < legendaryChance + 0.65) return 'common';
  if (roll < 0.95) return 'empty';
  return 'fake_legendary';
}

function makeChest(state, treasure = false) {
  const mimicRoll = randomFloat();
  const kind = mimicRoll < 0.03 ? 'ancient_mimic' : mimicRoll < 0.15 ? 'mimic' : treasure ? (randomFloat() < 0.35 ? 'legendary' : 'rare') : chooseRarity(state);
  const rarity = ITEMS[kind] ? kind : null;
  return {
    type: 'chest', kind, rarity, item: rarity ? pick(ITEMS[rarity]) : null,
    inspected: false, revealed: false,
    detectionSuccess: randomFloat() < Math.min(0.85, 0.25 + state.luck * 0.03),
  };
}

function rngesusChance(floor) {
  if (floor < 5) return 0;
  if (floor < 10) return 0.003;
  if (floor < 20) return 0.006;
  return 0.01;
}

function rollRngesus(state, rolls = {}) {
  const base = rngesusChance(state.floor);
  if (!base) { state.lastChaosChance = 0; state.lastChaosSpike = false; return false; }
  const volatilityRoll = rolls.volatilityRoll ?? randomFloat();
  const spikeRoll = rolls.spikeRoll ?? randomFloat();
  const severityRoll = rolls.severityRoll ?? randomFloat();
  const encounterRoll = rolls.encounterRoll ?? randomFloat();
  const volatility = 0.25 + volatilityRoll * 2.75;
  const heat = Math.min(0.025, (state.rngesusDry || 0) * 0.0005);
  const spike = spikeRoll < 0.025 ? 0.04 + severityRoll * 0.06 : 0;
  const chance = clamp(base * volatility + heat + spike, 0, 0.12);
  const hit = encounterRoll < chance;
  state.lastChaosChance = chance;
  state.lastChaosSpike = spike > 0;
  state.rngesusDry = hit ? 0 : (state.rngesusDry || 0) + 1;
  return hit;
}

function generateEncounter(state) {
  if (state.floor % 5 === 0) return makeEnemy(state.floor, 'boss');
  if (rollRngesus(state)) return { type: 'rngesus', name: 'RNGesus', fleeSuccess: randomFloat() < 0.65, prayerSuccess: randomFloat() < 0.1, chaosChance: state.lastChaosChance, chaosSpike: state.lastChaosSpike };
  const roll = randomFloat();
  if (roll < 0.55) return makeEnemy(state.floor, 'normal');
  if (roll < 0.67) return makeEnemy(state.floor, 'elite');
  if (roll < 0.77) return makeChest(state);
  if (roll < 0.85) return { type: 'shrine', kind: pick(['healing', 'armor', 'blood', 'experience', 'corrupted', 'fake']) };
  if (roll < 0.9) return makeChest(state, true);
  if (roll < 0.96) return { type: 'trap', kind: pick(['tax_collector', 'potion_thief', 'wrong_portal']) };
  return { type: 'empty' };
}

function applyItem(state, item, rarity = 'common') {
  if (!item) return;
  if (item.attack) { state.damageMin += item.attack; state.damageMax += item.attack; }
  if (item.defense) state.defense += item.defense;
  if (item.defenseSet !== undefined) state.defense = item.defenseSet;
  if (item.resistance) state.resistance = clamp(state.resistance + item.resistance, -50, 75);
  if (item.critChance) state.critChance = Math.min(0.75, state.critChance + item.critChance);
  if (item.luck) state.luck += item.luck;
  if (item.potions) state.potions += item.potions;
  if (item.escapeTokens) state.escapeTokens += item.escapeTokens;
  if (item.maxHp) { state.maxHp = Math.max(20, state.maxHp + item.maxHp); state.hp = Math.min(state.maxHp, Math.max(1, state.hp + (item.heal || Math.max(0, item.maxHp)))); }
  if (item.bonusPenalty) state.payoutFactor *= 1 - item.bonusPenalty;
  state.items.push({ name: item.name, rarity });
  state.items = state.items.slice(-8);
}

function updatePity(state, rarity) {
  if (rarity === 'legendary') state.pityLegendary = 0; else state.pityLegendary += 1;
  if (['rare', 'legendary', 'cursed'].includes(rarity)) state.pityRare = 0; else state.pityRare += 1;
}

function setNextEncounter(state, log) {
  if (state.floor >= MAX_FLOOR && state.cleared >= MAX_FLOOR) {
    state.phase = 'summit'; state.encounter = { type: 'summit' }; state.lastLog = log; return;
  }
  state.phase = 'encounter'; state.encounter = generateEncounter(state); state.lastLog = log;
}

function completeFloor(state, log, rewardMultiplier = 1) {
  const clearedFloor = state.floor;
  state.cleared = Math.max(state.cleared, clearedFloor);
  state.bonus += Math.floor(state.stake * 0.01 * rewardMultiplier);
  state.energy = Math.min(state.maxEnergy, state.energy + 1);
  if (clearedFloor % 5 === 0) {
    state.bosses += 1;
    if (clearedFloor <= 10) {
      state.hp = Math.min(state.maxHp, state.hp + Math.max(20, Math.floor(state.maxHp * 0.3)));
      state.potions = Math.min(5, state.potions + 1);
    }
  }
  if (clearedFloor >= COMPLETION_FLOOR) state.completed = true;
  if (clearedFloor >= MAX_FLOOR) { state.floor = MAX_FLOOR; state.phase = 'summit'; state.encounter = { type: 'summit' }; state.lastLog = log; return; }
  state.floor = clearedFloor + 1;
  if (clearedFloor % 5 === 0 || clearedFloor === COMPLETION_FLOOR) {
    state.phase = 'upgrade'; state.encounter = { type: 'upgrade', milestone: clearedFloor };
    state.lastLog = `${log}\n🎁 Chọn một nâng cấp trước tầng ${state.floor}.`;
    return;
  }
  setNextEncounter(state, log);
}

function recordRun(guildId, userId, state, reason) {
  const death = ['death', 'rngesus'].includes(reason) ? 1 : 0;
  const escape = reason === 'cashout' ? 1 : 0;
  const completion = state.completed ? 1 : 0;
  hardcoreRepository.upsertRecord(guildId, userId, { bestFloor: state.cleared, runs: 1, deaths: death, escapes: escape, completions: completion });
}

function getHardcoreRecord(guildId, userId) {
  return hardcoreRepository.getRecord(guildId, userId) || { guild_id: String(guildId), user_id: String(userId), best_floor: 0, runs: 0, deaths: 0, escapes: 0, completions: 0 };
}
function getHardcoreTop(guildId, limit = 10) { return hardcoreRepository.getTop(guildId, limit); }

const getSession = hardcoreRepository.getSession;
const getHardcoreByUser = hardcoreRepository.getByUser;
const parseState = hardcoreRepository.parseState;
const saveState = hardcoreRepository.saveState;
const setMessageId = hardcoreRepository.setMessageId;

const startTx = db.transaction(({ guildId, userId, channelId, stake, classKey, forcedEncounter = null }) => {
  const template = CLASSES[classKey];
  if (!template) throw new Error('INVALID_CLASS');
  if (!Number.isSafeInteger(stake) || stake < MIN_BET || stake > MAX_BET) throw new Error('INVALID_BET');
  const maxBet = getGameBetLimit(guildId, 'hardcore');
  if (stake > maxBet) { const error = new Error('BET_LIMIT'); error.maxBet = maxBet; throw error; }
  if (getHardcoreByUser(guildId, userId)) throw new Error('ACTIVE_SESSION');
  const account = spendCoins({ guildId, userId, amount: stake, reason: 'hardcore:reserve' });
  const state = {
    classKey, className: template.name, stake, floor: 1, cleared: 0, hp: template.hp, maxHp: template.hp,
    damageMin: template.damageMin, damageMax: template.damageMax, defense: template.defense,
    accuracy: template.accuracy, evasion: template.evasion, critChance: template.critChance, critDamage: 1.75,
    resistance: template.resistance, energy: template.energy, maxEnergy: template.energy, potions: 3,
    luck: 0, pityRare: 0, pityLegendary: 0, bosses: 0, bonus: 0, payoutFactor: 1,
    escapeTokens: 0, items: [], completed: false, turn: 0, phase: 'encounter', lastLog: 'Run bắt đầu.',
    rngesusDry: 0, lastChaosChance: 0, lastChaosSpike: false, fair: createFairness(), fairCounter: 0,
  };
  state.encounter = forcedEncounter || fairStateContext.run(state, () => generateEncounter(state));
  const now = Date.now();
  const session = { id: crypto.randomBytes(6).toString('hex'), guild_id: String(guildId), user_id: String(userId), channel_id: String(channelId), message_id: null, created_at: now, updated_at: now };
  hardcoreRepository.insertSession({ ...session, created_at: now, updated_at: now }, state);
  return { session, state, account };
});

function startHardcore(args) { return startTx(args); }

function finishRun(session, state, reason) {
  let payout = reason === 'cashout' || reason === 'summit' ? potentialPayout(state) : 0;
  const outcome = payout > state.stake ? 'win' : payout === state.stake ? 'draw' : 'loss';
  const account = settleReservedGame({ guildId: session.guild_id, userId: session.user_id, payout, stake: state.stake, game: 'hardcore', outcome,
    operationId: `settle:hardcore:${session.id}`, countGame: reason !== 'forfeit' });
  recordRun(session.guild_id, session.user_id, state, reason);
  hardcoreRepository.deleteSession(session.id);
  return { reason, payout, outcome, balance: account.balance, achievements: account.unlockedAchievements, experienceGained: account.experienceGained, levelUps: account.levelUps, bonusDrops: account.bonusDrops };
}
function forceEndHardcoreSession(id, guildId, adminId, { label = 'admin-refund', forfeit = false } = {}) {
  return db.transaction(() => {
    const session = hardcoreRepository.getActiveSession(id, guildId); if (!session) return null;
    const state = parseState(session);
    if (!forfeit) creditCoins({ guildId: session.guild_id, userId: session.user_id, amount: state.stake,
      reason: `hardcore:${label}:${adminId}:${session.id}`, operationId: `refund:hardcore-admin:${session.id}:${session.user_id}` });
    if (forfeit) recordRun(session.guild_id, session.user_id, state, 'forfeit');
    hardcoreRepository.deleteSession(session.id);
    return { session, state, participants: [session.user_id], forfeited: forfeit ? state.stake : 0 };
  })();
}

function enemyTurn(state, defend = false, dodge = false) {
  const enemy = state.encounter;
  if (dodge) return '💨 Bạn né hoàn toàn đòn phản công.';
  const defender = { defense: defend ? Math.floor(state.defense * 1.5) : state.defense, evasion: state.evasion, critResistance: 0 };
  if (randomFloat() < enemy.magicChance) {
    if (randomFloat() >= hitChance(enemy.accuracy, state.evasion)) return '💨 Phép của quái đánh trượt.';
    const raw = randomInt(enemy.damageMin, enemy.damageMax);
    let damage = magicAfterResistance(raw, state.resistance);
    if (defend) damage = Math.max(1, Math.floor(damage * 0.8));
    state.hp = Math.max(0, state.hp - damage);
    return `🔮 Bạn nhận **${damage} magic damage**.`;
  }
  const hit = resolvePhysicalAttack(enemy, defender, state.floor);
  if (!hit.hit) return '💨 Quái đánh trượt.';
  let damage = hit.damage;
  if (defend && randomFloat() < 0.2) damage = Math.max(1, Math.floor(damage * 0.5));
  state.hp = Math.max(0, state.hp - damage);
  return `${hit.crit ? '💢 Critical! ' : ''}Bạn nhận **${damage} damage**.`;
}

function playerAttack(state, action) {
  const enemy = state.encounter;
  if (action === 'defend') { state.energy = Math.min(state.maxEnergy, state.energy + 1); return { log: '🛡️ Bạn thủ thế và hồi 1 năng lượng.', defend: true }; }
  if (action === 'potion') {
    if (state.potions <= 0) throw new Error('NO_POTION');
    if (state.hp >= state.maxHp) throw new Error('FULL_HP');
    const healed = Math.min(state.maxHp - state.hp, Math.max(20, Math.floor(state.maxHp * 0.35)));
    state.potions -= 1; state.hp += healed;
    return { log: `🧪 Hồi **${healed} HP**.`, defend: false };
  }
  let attack;
  let dodge = false;
  if (action === 'skill') {
    if (state.energy < 2) throw new Error('NO_ENERGY');
    state.energy -= 2;
    if (state.classKey === 'sorceress') {
      const raw = Math.floor(randomInt(state.damageMin, state.damageMax) * 2.1);
      attack = { hit: true, crit: false, damage: magicAfterResistance(raw, enemy.resistance) };
    } else if (state.classKey === 'assassin') {
      attack = resolvePhysicalAttack(state, enemy, state.floor, { multiplier: 1.3 }); dodge = true;
    } else attack = resolvePhysicalAttack(state, enemy, state.floor, { multiplier: 1.65 });
  } else {
    attack = resolvePhysicalAttack(state, enemy, state.floor);
    state.energy = Math.min(state.maxEnergy, state.energy + 1);
  }
  if (!attack.hit) return { log: '💨 Đòn đánh của bạn trượt.', dodge };
  enemy.hp = Math.max(0, enemy.hp - attack.damage);
  const skill = action === 'skill' ? `✨ ${CLASSES[state.classKey].skill}: ` : '⚔️ ';
  return { log: `${skill}${attack.crit ? 'Critical! ' : ''}Gây **${attack.damage} damage**.`, dodge };
}

function applyShrine(state, kind) {
  if (kind === 'healing') { const heal = state.maxHp - state.hp; state.hp = state.maxHp; return `💚 Healing Shrine hồi ${heal} HP.`; }
  if (kind === 'armor') { state.defense += 3; return '🛡️ Armor Shrine: +3 Defense.'; }
  if (kind === 'blood') { state.hp = Math.max(1, state.hp - 15); state.damageMin += 4; state.damageMax += 4; return '🩸 Mất 15 HP, +4 sát thương.'; }
  if (kind === 'experience') { state.bonus += Math.floor(state.stake * 0.25); return '✨ Payout tạm thời tăng thêm 25% tiền cược.'; }
  if (kind === 'corrupted') { state.damageMin += 7; state.damageMax += 7; state.defense = Math.max(0, state.defense - 4); return '☣️ +7 sát thương, −4 Defense.'; }
  const damage = Math.max(10, Math.floor(state.maxHp * 0.3)); state.hp = Math.max(0, state.hp - damage); return `🤡 Shrine giả gây ${damage} damage.`;
}

const actionTx = db.transaction(({ sessionId, userId, expectedTurn, action }) => {
  const session = getSession(sessionId);
  if (!session || session.user_id !== String(userId)) throw new Error('INVALID_SESSION');
  const state = parseState(session);
  return fairStateContext.run(state, () => {
  if (state.turn !== expectedTurn) throw new Error('STALE_ACTION');
  state.turn += 1;
  if (action === 'retreat') return { settled: true, state, result: finishRun(session, state, state.cleared > 0 ? 'cashout' : 'forfeit') };
  if (state.phase === 'summit') return { settled: true, state, result: finishRun(session, state, 'summit') };

  if (state.phase === 'upgrade') {
    if (action === 'upgrade_attack') { state.damageMin += 3; state.damageMax += 3; state.lastLog = '⚔️ +3 sát thương.'; }
    else if (action === 'upgrade_hp') { state.maxHp += 20; state.hp = Math.min(state.maxHp, state.hp + 20); state.lastLog = '❤️ +20 HP tối đa và hiện tại.'; }
    else if (action === 'upgrade_defense') { state.defense += 4; state.lastLog = '🛡️ +4 Defense.'; }
    else if (action === 'upgrade_luck') { state.luck += 2; state.lastLog = '🍀 +2 Luck.'; }
    else throw new Error('INVALID_ACTION');
    setNextEncounter(state, `${state.lastLog}\nBạn tiến vào tầng ${state.floor}.`);
  } else if (state.encounter.type === 'combat') {
    if (!['attack', 'defend', 'skill', 'potion'].includes(action)) throw new Error('INVALID_ACTION');
    const acted = playerAttack(state, action);
    let log = acted.log;
    if (state.encounter.hp <= 0) {
      const enemy = state.encounter;
      completeFloor(state, `${log}\n🏆 Đã hạ **${enemy.name}**.`, enemy.rewardMultiplier);
    } else {
      log += `\n${enemyTurn(state, acted.defend, acted.dodge)}`;
      state.lastLog = log;
      if (state.hp <= 0) return { settled: true, state, result: finishRun(session, state, 'death') };
    }
  } else if (state.encounter.type === 'chest') {
    const chest = state.encounter;
    if (action === 'inspect') {
      if (chest.inspected) throw new Error('ALREADY_INSPECTED');
      chest.inspected = true;
      if (['mimic', 'ancient_mimic'].includes(chest.kind) && chest.detectionSuccess) { chest.revealed = true; state.lastLog = '👁️ Bạn phát hiện chiếc hòm đang thở. Đây là Mimic!'; }
      else state.lastLog = '🔍 Không phát hiện điều gì bất thường.';
    } else if (action === 'leave') {
      if (!chest.revealed) throw new Error('INVALID_ACTION');
      completeFloor(state, '🚪 Bạn tránh được Mimic và đi tiếp.', 0);
    } else if (action === 'sell') {
      state.bonus += Math.floor(state.stake * 0.15);
      completeFloor(state, '💰 Bán hòm, cộng 15% tiền cược vào payout.', 0.5);
    } else if (action === 'open') {
      if (['mimic', 'ancient_mimic'].includes(chest.kind)) {
        state.encounter = makeEnemy(state.floor, chest.kind);
        state.lastLog = `😈 Chiếc hòm hóa thành **${state.encounter.name}**!`;
      } else if (chest.kind === 'empty') {
        updatePity(state, 'empty'); completeFloor(state, '📦 Hòm hoàn toàn trống.', 0);
      } else if (chest.kind === 'fake_legendary') {
        updatePity(state, 'empty'); completeFloor(state, '🟠 Ánh sáng Legendary bùng lên rồi tắt; đây là đồ giả không có chỉ số.', 0);
      } else {
        applyItem(state, chest.item, chest.rarity); updatePity(state, chest.rarity);
        completeFloor(state, `🎁 Nhận **${chest.item.name}** (${chest.rarity}): ${chest.item.text}.`, chest.rarity === 'legendary' ? 2 : 1);
      }
    } else throw new Error('INVALID_ACTION');
  } else if (state.encounter.type === 'shrine') {
    if (action === 'ignore') completeFloor(state, '🚶 Bạn bỏ qua Shrine.', 0);
    else if (action === 'touch') {
      const log = applyShrine(state, state.encounter.kind);
      if (state.hp <= 0) return { settled: true, state, result: finishRun(session, state, 'death') };
      completeFloor(state, log, 0.5);
    } else throw new Error('INVALID_ACTION');
  } else if (state.encounter.type === 'empty') {
    if (action !== 'continue') throw new Error('INVALID_ACTION');
    completeFloor(state, '🕳️ Căn phòng không có gì. Đúng nghĩa không có gì.', 0);
  } else if (state.encounter.type === 'trap') {
    if (action !== 'continue') throw new Error('INVALID_ACTION');
    const kind = state.encounter.kind;
    if (kind === 'tax_collector') {
      state.payoutFactor *= 0.85;
      completeFloor(state, '🧾 Tax Collector thu 15% payout vì lý do: “quy định là quy định”.', 0);
    } else if (kind === 'potion_thief') {
      const stolen = state.potions > 0 ? 1 : 0;
      state.potions = Math.max(0, state.potions - stolen);
      completeFloor(state, stolen ? '🦹 Kẻ trộm lấy mất 1 bình máu rồi biến mất.' : '🦹 Kẻ trộm kiểm tra túi đồ rỗng và tỏ vẻ thất vọng.', 0);
    } else {
      setNextEncounter(state, `🌀 Wrong Portal đưa bạn quay lại chính tầng ${state.floor}. Quái mới đã được roll lại.`);
    }
  } else if (state.encounter.type === 'rngesus') {
    const event = state.encounter;
    if (action === 'fight') return { settled: true, state, result: finishRun(session, state, 'rngesus') };
    if (action === 'flee') {
      if (!event.fleeSuccess) return { settled: true, state, result: finishRun(session, state, 'rngesus') };
      completeFloor(state, '🏃 Bạn thoát khỏi RNGesus với đôi chân run rẩy.', 0);
    } else if (action === 'bribe') {
      state.payoutFactor *= 0.6; completeFloor(state, '💸 RNGesus nhận 40% payout và cho bạn đi.', 0);
    } else if (action === 'pray') {
      if (!event.prayerSuccess) return { settled: true, state, result: finishRun(session, state, 'rngesus') };
      const item = pick(ITEMS.legendary); applyItem(state, item, 'legendary'); updatePity(state, 'legendary');
      completeFloor(state, `🙏 RNGesus cười và ném cho bạn **${item.name}**.`, 2);
    } else if (action === 'escape_token') {
      if (state.escapeTokens <= 0) throw new Error('NO_TOKEN');
      state.escapeTokens -= 1; completeFloor(state, '🪞 Vé Thoát Hiểm vỡ vụn và đưa bạn tới tầng tiếp theo.', 0);
    } else throw new Error('INVALID_ACTION');
  } else throw new Error('INVALID_ACTION');

  saveState(session, state);
  return { settled: false, state, result: null };
  });
});

function playHardcore(args) { return actionTx(args); }

function hardcoreEmbed(state, userId, result = null, sessionId = null) { return hardcoreView.hardcoreEmbed(state, userId, result, CLASSES, sessionId); }
function hardcoreRows(sessionId, state, disabled = false) { return hardcoreView.hardcoreRows(sessionId, state, disabled, CLASSES); }

async function handleHardcoreButton(interaction) {
  const [, sessionId, rawTurn, action] = interaction.customId.split(':');
  const session = getSession(sessionId);
  if (!session || session.guild_id !== interaction.guildId || session.channel_id !== interaction.channelId) return interaction.reply({ content: 'Lượt Sinh tồn đã kết thúc hoặc nút không còn hợp lệ.', flags: MessageFlags.Ephemeral });
  if (session.user_id !== interaction.user.id) return interaction.reply({ content: 'Đây là lượt Sinh tồn của người chơi khác.', flags: MessageFlags.Ephemeral });
  try {
    const played = playHardcore({ sessionId, userId: interaction.user.id, expectedTurn: Number(rawTurn), action });
    return interaction.update({ embeds: [hardcoreEmbed(played.state, interaction.user.id, played.result, sessionId)], components: hardcoreRows(sessionId, played.state, played.settled), allowedMentions: { parse: [] } });
  } catch (error) {
    const content = error.message === 'STALE_ACTION' ? 'Nút này thuộc lượt cũ. Hãy dùng các nút mới nhất.'
      : error.message === 'NO_ENERGY' ? 'Không đủ năng lượng dùng kỹ năng.'
        : error.message === 'NO_POTION' ? 'Bạn đã hết bình máu.'
          : error.message === 'FULL_HP' ? 'HP đang đầy.'
            : error.message === 'ALREADY_INSPECTED' ? 'Bạn đã kiểm tra hòm này.'
              : error.message === 'NO_TOKEN' ? 'Bạn không có Vé Thoát Hiểm.' : 'Không thể thực hiện lựa chọn này.';
    return interaction.reply({ content, flags: MessageFlags.Ephemeral });
  }
}

function cleanupStaleHardcoreSessions(now = Date.now()) {
  const rows = hardcoreRepository.listStale(now - STALE_MS);
  const cleanup = db.transaction(() => {
    for (const session of rows) {
      const state = parseState(session);
      settleReservedGame({ guildId: session.guild_id, userId: session.user_id, payout: 0, stake: state.stake, game: 'hardcore', outcome: 'loss',
        operationId: `settle:hardcore:${session.id}`, countGame: false });
      recordRun(session.guild_id, session.user_id, state, 'forfeit');
      hardcoreRepository.deleteSession(session.id);
    }
  });
  cleanup();
  return rows.length;
}

module.exports = {
  MIN_BET, MAX_BET, MAX_PAYOUT, MAX_FLOOR, COMPLETION_FLOOR, CLASSES, ITEMS,
  hitChance, defenseReduction, physicalAfterDefense, magicAfterResistance, resolvePhysicalAttack,
  enemyScale, makeEnemy, rngesusChance, rollRngesus, chaosLabel, baseMultiplier, potentialPayout, generateEncounter,
  startHardcore, playHardcore, getHardcoreByUser, setMessageId, hardcoreEmbed, hardcoreRows, forceEndHardcoreSession,
  handleHardcoreButton, getHardcoreRecord, getHardcoreTop, cleanupStaleHardcoreSessions,
};


