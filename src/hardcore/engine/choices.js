"use strict";
// Composed once by ./index. Cross-module calls are deferred until the feature is ready.
module.exports = function createModule(dependencies) {
  const { gilded, covenant, stats, memories, paradox, world, mainStat } =
    dependencies;
  const rngesusFleeChance = (...args) =>
    dependencies.rngesusFleeChance(...args);
  const rngesusPrayerChance = (...args) =>
    dependencies.rngesusPrayerChance(...args);
  const payout = (...args) => dependencies.payout(...args);
  const goblinCatchChance = (...args) =>
    dependencies.goblinCatchChance(...args);
  const heal = (...args) => dependencies.heal(...args);
  const purifierCost = (...args) => dependencies.purifierCost(...args);
  const serviceCost = (...args) => dependencies.serviceCost(...args);
  const attackManaGain = (...args) => dependencies.attackManaGain(...args);
  const skillManaCost = (...args) => dependencies.skillManaCost(...args);
  const skillHpCost = (...args) => dependencies.skillHpCost(...args);

  function surpriseActions(state) {
    const e = state.encounter,
      k = e.kind;
    if (k.endsWith("_shop"))
      return e.offers.map((offer, i) => ({
        action: `buy_${i}`,
        label: `${i + 1}. ${offer.item.name} · ${offer.price}${k === "blood_shop" ? " Max HP" : k === "diamond_shop" ? " 💎" : " xu"}`,
        disabled:
          (k === "blood_shop" && state.maxHp <= offer.price) ||
          (k === "payout_shop" && payout(state) < offer.price),
      }));
    if (k === "merchant")
      return e.offers.map((offer, i) => ({
        action: `buy_${i}`,
        label: `${{ potion: "Bình", heal: "Hồi đầy", luck: "Luck +1", item: "Item SR", ticket: "Vé thoát", chest: "Rương · mở ngay" }[offer.key]} · ${offer.price} xu`,
        disabled: payout(state) < offer.price,
      }));
    if (k === "duelist") {
      if (!e.mode)
        return [
          { action: "duel_stat", label: "Đấu thuộc tính" },
          { action: "duel_items", label: "Đấu trang bị" },
        ];
      return ["Búa", "Kéo", "Bao"].map((label, i) => ({
        action: `hand_${i}`,
        label,
      }));
    }
    return (
      {
        healer: [{ action: "event_heal", label: "Hồi máu +1 bình" }],
        goblin: [
          {
            action: "event_catch",
            label: `Bắt · ${Math.round(goblinCatchChance(state) * 100)}%`,
          },
        ],
        blacksmith: [
          {
            action: "event_smith",
            label: `Rèn · ${serviceCost(state, 0.12)} xu`,
            disabled: payout(state) < 1,
          },
        ],
        purifier: [
          {
            action: "event_cleanse",
            label: `Giải toàn bộ · ${purifierCost(state)} xu`,
            disabled: payout(state) < purifierCost(state),
          },
        ],
        sacrifice: [
          {
            action: "event_sacrifice_hp",
            label: "Hiến 20% HP · +6 stat chính",
            disabled: state.hp <= 1 || !memories.canQueue(state),
          },
          {
            action: "event_sacrifice_payout",
            label: "10% payout · +6 VIT",
            disabled: payout(state) < 1 || !memories.canQueue(state),
          },
        ],
        gambler: [
          {
            action: "event_gamble_10",
            label: "Cược 10% payout",
            disabled: payout(state) < 1,
          },
          {
            action: "event_gamble_25",
            label: "Cược 25% payout",
            disabled: payout(state) < 1,
          },
        ],
        adventurer: [
          {
            action: "event_rescue",
            label: "Cứu · 1 bình",
            disabled: state.potions < 1,
          },
          {
            action: "event_rob",
            label: "Cướp · SSR/UR",
            disabled: !memories.canQueue(state),
          },
        ],
        fountain: [{ action: "event_drink", label: "Uống" }],
        horadric: [
          {
            action: "forge_main",
            label: `Chuyển hóa · +6 ${mainStat(state).toUpperCase()}`,
          },
          {
            action: "forge_guard",
            label: `Chuyển hóa · +7 ${(e.forgeStat || "str").toUpperCase()}`,
          },
          { action: "forge_vit", label: "Chuyển hóa · +4 VIT" },
          ...(["legendary", "cursed"].includes(
            state.items.find((x) => x.definition.id === e.targetId)?.rarity,
          )
            ? [{ action: "forge_ticket", label: "Chuyển hóa · Vé thoát" }]
            : []),
        ],
        mirror: [
          { action: "event_mirror_power", label: "+10 stat chính" },
          { action: "event_mirror_guard", label: "+8 VIT, +5 phòng thủ" },
          {
            action: "event_mirror_break",
            label: "Đập gương",
            disabled: !memories.canQueue(state),
          },
        ],
        treasure_room: [
          ...["red", "blue", "gold"].map((color) => ({
            action: `chest_${color}`,
            label: `Mở rương ${{ red: "đỏ", blue: "xanh", gold: "vàng" }[color]}`,
          })),
        ],
        contract: [
          { action: "contract_potion", label: "Không bình → SSR" },
          { action: "contract_skill", label: "Không skill → 50% cược" },
          { action: "contract_defend", label: "Không thủ → +10 stat" },
        ],
        class_shrine: [{ action: "event_class", label: "Nhận phúc class" }],
        doors: [
          { action: "door_light", label: "Cửa sáng · 70%" },
          { action: "door_gold", label: "Cửa vàng · 70%" },
          { action: "door_dark", label: "Cửa tối · 60%" },
        ],
      }[k] || []
    );
  }

  function actions(state) {
    if (state.phase === "boss_chest")
      return [
        { action: "boss_open", label: "Mở rương · SSR 70% / UR 30%" },
        { action: "boss_sell", label: "Bán rương · +100% cược" },
      ];
    if (state.phase === "upgrade")
      return stats.ATTRIBUTES.map((key) => ({
        action: `upgrade_${key}`,
        label: `+5 ${key.toUpperCase()}`,
      }));
    if (state.phase === "paradox" && state.encounter.version === 2)
      return state.encounter.choices.map((id) => ({
        action: "paradox_" + id,
        label: paradox.CATALOG[id].name + " · 5 tầng",
      }));
    if (state.phase === "paradox")
      return [
        { action: "paradox_blood", label: "Máu là tiền · 5 tầng" },
        { action: "paradox_inverse", label: "Ngược đời · 5 tầng" },
      ];
    if (state.phase === "severance") {
      const keys = Object.keys(state.modifiers).filter(
        (key) => key !== "unstable_rift" && state.modifiers[key] > 0,
      );
      return keys.length
        ? keys.map((key) => ({
            action: `sever_${key}`,
            label: `Xóa ${world.RIFT_MODIFIERS[key].name}`,
          }))
        : [
            {
              action: "sever_none",
              label: "Đi tiếp (không có modifier để xóa)",
            },
          ];
    }
    if (state.phase === "summit") return [];
    const e = state.encounter;
    if (gilded.isBoss(e) && e.hp <= 0 && state.hp > 0)
      return [{ action: "ritual_claim", label: "Nhận di vật" }];
    if (e.type === "combat")
      return [
        {
          action: "attack",
          label: `+${attackManaGain(state)} MP`,
        },
        { action: "defend", label: "+1 MP" },
        {
          action: "skill",
          label: `${skillManaCost(state) === 0 ? "" : "−"}${skillManaCost(state)} MP${skillHpCost(state) ? ` · −${skillHpCost(state)} HP` : ""}`,
          disabled:
            state.mana < skillManaCost(state) ||
            state.hp - skillHpCost(state) < 1,
        },
        {
          action: "potion",
          label: `Bình ×${state.potions}`,
          disabled:
            !state.potions ||
            state.hp === state.maxHp ||
            paradox.potionLocked(state) ||
            gilded.potionLocked(state),
        },
      ];
    if (e.type === "surprise")
      return [
        ...surpriseActions(state),
        ...(e.kind === "treasure_room" || (e.kind === "duelist" && e.mode)
          ? []
          : [{ action: "event_skip", label: "Bỏ qua" }]),
      ];
    if (e.type === "trap" && e.kind === "portal")
      return [
        { action: "next", label: "Vào portal" },
        { action: "skip", label: "Bỏ qua" },
        ...(covenant.canEnter(state)
          ? [{ action: "covenant_basement", label: "Xuống tầng hầm · 4 mảnh" }]
          : []),
      ];
    if (e.type === "chest")
      return [
        { action: "inspect", label: "Kiểm tra", disabled: e.inspected },
        { action: "open", label: "Mở hòm" },
        { action: "sell", label: "Bán · 15% cược" },
        ...(e.revealed ? [{ action: "leave", label: "Né Mimic" }] : []),
      ];
    if (e.type === "shrine" && e.kind === "ritual")
      return [
        { action: "ritual_summon", label: "Triệu hồi boss" },
        { action: "skip", label: "Bỏ qua" },
      ];
    if (e.type === "shrine")
      return [
        { action: "touch", label: "Chạm Shrine" },
        { action: "skip", label: "Bỏ qua" },
      ];
    if (e.type === "covenant_blessing")
      return [{ action: "covenant_continue", label: "Tiếp tục khám phá" }];
    if (e.type === "god_rngesus")
      return [{ action: "god_continue", label: "Tiếp tục khám phá" }];
    if (e.type === "rngesus")
      return [
        { action: "fight", label: "Đánh (chết)" },
        {
          action: "flee",
          label: `Chạy · ${Math.round((e.fleeChance ?? rngesusFleeChance(state)) * 100)}%`,
        },
        {
          action: "bribe",
          label: "Hối lộ · 40% payout",
          disabled: payout(state) < 1000,
        },
        {
          action: "pray",
          label: `Cầu nguyện · ${Math.round((e.prayerChance ?? rngesusPrayerChance(state)) * 100)}%`,
        },
      ];
    if (e.type === "echo")
      return [
        { action: "echo_pray", label: "Cầu nguyện · hồi 15% HP" },
        {
          action: "echo_rob",
          label: "Cướp · 50% oán niệm",
          disabled: !memories.canQueue(state),
        },
        { action: "echo_challenge", label: "Khiêu chiến · +25% sức mạnh" },
        { action: "echo_skip", label: "Bỏ đi" },
      ];
    if (e.type === "memory") return memories.actions(state, payout(state));
    return [{ action: "next", label: "Đi tiếp" }];
  }
  return { surpriseActions, actions };
};
