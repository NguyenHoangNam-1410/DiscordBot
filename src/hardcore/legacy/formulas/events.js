// Composed once by ./index. Cross-module calls are deferred until the feature is ready.
module.exports = function createModule(dependencies) {
  const { MERCHANT_OFFERS } = dependencies;
  const goblinCatchChance = (...args) =>
    dependencies.goblinCatchChance(...args);
  const potentialPayout = (...args) => dependencies.potentialPayout(...args);

  function serviceCost(state, service) {
    return Math.ceil(
      potentialPayout(state) * (service === "blacksmith" ? 0.12 : 0.2),
    );
  }

  function itemEffects(definition) {
    if (definition?.effects) return definition.effects;
    return definition || {};
  }

  function itemCurse(definition) {
    if (definition?.curse) return definition.curse.effects;
    // Saved equipment predates separate buff/curse definitions.
    const effects = {};
    for (const [key, value] of Object.entries(definition || {})) {
      if (
        key === "defenseSet" ||
        key === "bonusPenalty" ||
        (typeof value === "number" && value < 0)
      )
        effects[key] = value;
    }
    return effects;
  }

  function classShrineActive(state) {
    return Boolean(
      state.classShrine &&
      !state.classShrine.consumed &&
      state.floor >= state.classShrine.from &&
      state.floor <= state.classShrine.until,
    );
  }

  function surpriseOptions(state) {
    const event = state.encounter;
    const option = (action, label, disabled = false) => ({
      action,
      label,
      disabled,
    });
    const paid = (action, label, rate) => {
      const cost = Math.ceil(potentialPayout(state) * rate);
      return option(
        action,
        `${label} · ${cost.toLocaleString("vi-VN")} xu`,
        potentialPayout(state) <= 0 || potentialPayout(state) < cost,
      );
    };
    switch (event.kind) {
      case "healer":
        return [option("event_accept", "Nhận hồi phục")];
      case "goblin":
        return [
          option(
            "event_catch",
            `Bắt Goblin ${Math.round(goblinCatchChance(state) * 100)}%`,
          ),
        ];
      case "blacksmith":
        return [paid("event_forge", "Rèn +1 level", 0.12)];
      case "purifier":
        return [paid("event_cleanse", "Gỡ 1 lớp nguyền", 0.2)];
      case "sacrifice":
        return [
          option(
            "event_blood",
            "Hiến 20% HP · +3 ATK",
            state.hp <= Math.floor(state.maxHp * 0.2),
          ),
          paid("event_gold", "+3 DEF", 0.1),
        ];
      case "gambler":
        return [
          paid("event_bet10", "Cược 10%", 0.1),
          paid("event_bet25", "Cược 25%", 0.25),
        ];
      case "adventurer":
        return [
          option("event_rescue", "Cứu người · 2 bình", state.potions < 2),
          option("event_rob", "Cướp đồ · 25% SSR"),
        ];
      case "fountain":
        return [option("event_drink", "Uống")];
      case "horadric":
        return [
          option("event_grind_attack", "Đổi 1 level → +3 ATK"),
          option("event_grind_defense", "Đổi 1 level → +4 DEF"),
          option("event_grind_hp", "Đổi 1 level → +10 MAX HP / hồi 10"),
          option(
            "event_grind_ticket",
            "Đổi 1 level → +1 Vé thoát",
            !["legendary", "cursed"].includes(event.targetRarity),
          ),
        ];
      case "merchant":
        return event.offers.map((key) =>
          paid(
            `event_buy_${key}`,
            MERCHANT_OFFERS[key].label,
            MERCHANT_OFFERS[key].rate,
          ),
        );
      case "mirror":
        return [
          option(
            "event_mirror_damage",
            "−10% HP · +10% ATK",
            state.hp <= Math.floor(state.maxHp * 0.1),
          ),
          option("event_mirror_guard", "+8 DEF · −2 ATK"),
          option("event_break", "Đập gương"),
        ];
      case "treasure_room":
        return [
          option("event_chest_red", "Hòm đỏ"),
          option("event_chest_blue", "Hòm xanh"),
          option("event_chest_gold", "Hòm vàng"),
        ];
      case "contract":
        return [
          option("event_contract_potion", "Không dùng bình"),
          option("event_contract_skill", "Không dùng skill"),
          option("event_contract_defend", "Không phòng thủ"),
        ];
      case "class_shrine":
        return [option("event_bless", "Nhận chúc phúc")];
      case "doors":
        return [
          option("event_door_light", "Cửa sáng · 70%"),
          option("event_door_gold", "Cửa vàng · 70%"),
          option("event_door_dark", "Cửa đen · 60%"),
        ];
      default:
        return [option("explore", "Khám phá")];
    }
  }

  function forgeTarget(state) {
    const rarity = { common: 1, rare: 2, legendary: 3, cursed: 4 };
    return (
      (state.items || [])
        .filter(
          (item) =>
            rarity[item.rarity] &&
            item.definition &&
            Object.values(itemEffects(item.definition)).some(
              (value) => typeof value === "number" && value > 0,
            ),
        )
        .sort(
          (a, b) => rarity[b.rarity] - rarity[a.rarity] || a.level - b.level,
        )[0] || null
    );
  }

  function curseTarget(state) {
    return (
      (state.items || []).find(
        (item) =>
          item.rarity === "cursed" &&
          Object.keys(itemCurse(item.definition)).length > 0 &&
          item.level > (item.cleansedLevels || 0),
      ) || null
    );
  }
  return {
    serviceCost,
    itemEffects,
    itemCurse,
    classShrineActive,
    surpriseOptions,
    forgeTarget,
    curseTarget,
  };
};
