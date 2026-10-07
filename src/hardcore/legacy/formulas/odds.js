// Composed once by ./index. Cross-module calls are deferred until the feature is ready.
module.exports = function createModule(dependencies) {
  const {
    GOBLIN_REWARDS,
    REGIONS,
    SHRINE_KINDS,
    SHRINE_EFFECTS,
    SURPRISE_ODDS,
    PORTAL_GOOD_CHANCE,
    PORTAL_GOOD_EFFECTS,
    PORTAL_EFFECT_TEXT,
  } = dependencies;
  const luckyBreakChance = (...args) => dependencies.luckyBreakChance(...args);
  const goblinCatchChance = (...args) =>
    dependencies.goblinCatchChance(...args);
  const goblinEscapeCost = (...args) => dependencies.goblinEscapeCost(...args);
  const taxCost = (...args) => dependencies.taxCost(...args);

  function regionForFloor(floor) {
    return (
      REGIONS.find((region) => floor >= region.start && floor <= region.end) ||
      REGIONS.at(-1)
    );
  }

  function shrineFakeDamage(state) {
    return Math.max(
      SHRINE_EFFECTS.fakeMinDamage,
      Math.floor(state.maxHp * SHRINE_EFFECTS.fakeMaxHpPercent),
    );
  }

  // Bảng kết quả hiển thị cho người chơi, tính theo trạng thái hiện tại của run.
  function shrineOutcomes(state) {
    const chance = 1 / SHRINE_KINDS.length;
    const lethal = state.hp <= shrineFakeDamage(state);
    const rows = {
      healing: {
        tone: "good",
        text: `Hồi đầy HP (+${Math.max(0, state.maxHp - state.hp)} HP)`,
      },
      armor: { tone: "good", text: `+${SHRINE_EFFECTS.armorDefense} DEF` },
      experience: {
        tone: "good",
        text: `Payout +${Math.floor(state.stake * SHRINE_EFFECTS.experiencePercent)} xu (25% tiền cược)`,
      },
      blood: {
        tone: "mixed",
        text: `−${SHRINE_EFFECTS.bloodHp} HP nhưng +${SHRINE_EFFECTS.bloodAttack} ATK (không chết vì Shrine này)`,
      },
      corrupted: {
        tone: "mixed",
        text: `+${SHRINE_EFFECTS.corruptedAttack} ATK nhưng −${SHRINE_EFFECTS.corruptedDefense} DEF`,
      },
      fake: {
        tone: "bad",
        text: `Shrine giả: mất ${shrineFakeDamage(state)} HP${lethal ? " — **đủ để giết bạn ở mức HP hiện tại**" : ""}`,
      },
    };
    return SHRINE_KINDS.map((kind) => ({ kind, chance, ...rows[kind] }));
  }

  // Mỗi mục: một lựa chọn của người chơi và các kết quả có thể xảy ra (chance là xác suất 0–1).
  function surpriseOdds(state, event) {
    const o = SURPRISE_ODDS;
    const pair = (title, goodChance, goodText, badText, mixed = false) => ({
      title,
      outcomes: [
        { tone: "good", chance: goodChance, text: goodText },
        {
          tone: mixed ? "mixed" : "bad",
          chance: 1 - goodChance,
          text: badText,
        },
      ],
    });
    switch (event.kind) {
      case "goblin":
        return [
          pair(
            "Bắt Goblin",
            goblinCatchChance(state),
            `Bắt được: bonus +${Math.floor(state.stake * GOBLIN_REWARDS.bonusRate)} xu (25% cược) và 1 trang bị`,
            `Goblin thoát: trừ một lần 5% payout hiện tại (${goblinEscapeCost(state).toLocaleString("vi-VN")} xu, làm tròn lên)`,
          ),
          {
            title: "Độ hiếm khi bắt thành công",
            outcomes: Object.entries(GOBLIN_REWARDS.rarities).map(
              ([rarity, chance]) => ({
                tone: rarity === "cursed" ? "mixed" : "good",
                chance,
                text: `1 trang bị ${{ rare: "SR", legendary: "SSR", cursed: "UR có lời nguyền" }[rarity]}`,
              }),
            ),
          },
        ];
      case "gambler":
        return [
          pair(
            "Cược 10% hoặc 25% payout",
            o.gamblerWin,
            "Thắng: nhận lại gấp đôi số đã cược",
            "Thua: mất số đã cược",
          ),
        ];
      case "adventurer":
        return [
          {
            title: "Cứu người (mất 2 bình)",
            outcomes: [
              {
                tone: "good",
                chance: o.adventurerRescueCommon,
                text: "Nhận đồ R",
              },
              {
                tone: "good",
                chance: 1 - o.adventurerRescueCommon,
                text: "Nhận đồ SR",
              },
            ],
          },
          pair(
            "Cướp đồ",
            o.adventurerRobLegendary,
            "Nhận đồ SSR",
            "Không có gì xảy ra",
            true,
          ),
        ];
      case "fountain":
        return [
          {
            title: "Uống",
            outcomes: [
              { tone: "good", chance: o.fountainHeal, text: "Hồi đầy HP" },
              { tone: "good", chance: o.fountainMaxHp, text: "+15 HP tối đa" },
              {
                tone: "bad",
                chance: o.fountainMimic,
                text: "Blood Mimic xuất hiện, phải chiến đấu",
              },
            ],
          },
        ];
      case "mirror":
        return [
          pair(
            "Đập gương",
            o.mirrorLucky,
            "+2 LUCK",
            "Mirror Clone sao chép chỉ số của bạn, phải hạ nó để qua tầng",
          ),
        ];
      case "treasure_room":
        return [
          pair(
            "Mỗi hòm (đỏ / xanh / vàng)",
            1 - o.treasureRoomMimic,
            "Phần thưởng: đỏ +5 ATK · xanh +6 DEF, +5 RES · vàng +50% cược, +1 LUCK",
            "Mimic, phải chiến đấu",
          ),
        ];
      case "doors":
        return [
          pair(
            "Cửa sáng",
            o.doorLight,
            "Hồi đầy HP, +1 bình",
            "Mất 20% MAX HP (giữ ít nhất 1 HP)",
          ),
          pair(
            "Cửa vàng",
            o.doorGold,
            "Bonus +50% cược",
            "Golden Door Mimic chặn đường",
          ),
          pair(
            "Cửa đen",
            o.doorDark,
            "Nhận đồ SSR",
            "Premature Rift Boss xuất hiện",
          ),
        ];
      default:
        return null;
    }
  }

  function portalBadEffects(state) {
    return [
      "blood_rift",
      ...(state.energy > 0 ? ["mana_void"] : []),
      ...(state.potions > 0 ? ["shattered_supplies"] : []),
      "payout_corruption",
      "dimensional_curse",
    ];
  }

  // Tỷ lệ từng hiệu ứng Portal tính trước khi roll (lưu cùng Portal để mở lại UI không đổi).
  function portalEffectOdds(state, goodChance = PORTAL_GOOD_CHANCE) {
    const bad = portalBadEffects(state);
    return [
      ...PORTAL_GOOD_EFFECTS.map((effect) => ({
        effect,
        good: true,
        chance: goodChance / PORTAL_GOOD_EFFECTS.length,
      })),
      ...bad.map((effect) => ({
        effect,
        good: false,
        chance: (1 - goodChance) / bad.length,
      })),
    ];
  }

  // Kết quả của bẫy khi bấm "Chấp nhận số phận".
  function trapOdds(state, event) {
    const lucky = luckyBreakChance(state);
    if (event.kind === "tax_collector")
      return [
        { tone: "good", chance: lucky, text: "Lucky Break: tránh được thuế" },
        {
          tone: "bad",
          chance: 1 - lucky,
          text: `Thuế một lần: trừ 15% payout hiện tại (${taxCost(state).toLocaleString("vi-VN")} xu, làm tròn lên); không đổi hệ số payout`,
        },
      ];
    if (event.kind === "potion_thief")
      return state.potions > 0
        ? [
            {
              tone: "good",
              chance: lucky,
              text: "Lucky Break: giữ được bình máu",
            },
            { tone: "bad", chance: 1 - lucky, text: "Bị trộm mất 1 bình máu" },
          ]
        : [
            {
              tone: "mixed",
              chance: 1,
              text: "Không còn bình để mất: không có gì xảy ra",
            },
          ];
    if (event.kind === "wrong_portal") {
      const odds = event.portal?.odds;
      if (!odds) {
        const good = event.portal?.goodChance ?? PORTAL_GOOD_CHANCE;
        return [
          {
            tone: "good",
            chance: good,
            text: "Portal tốt: nhận lợi ích rồi qua tầng",
          },
          {
            tone: "bad",
            chance: 1 - good,
            text: "Portal xấu: chịu penalty, Rift Ambusher Elite đánh phủ đầu",
          },
        ];
      }
      return odds.map((item) => ({
        tone: item.good ? "good" : "bad",
        chance: item.chance,
        text: item.good
          ? PORTAL_EFFECT_TEXT[item.effect]
          : `${PORTAL_EFFECT_TEXT[item.effect]} + Elite đánh phủ đầu`,
      }));
    }
    return null;
  }
  return {
    regionForFloor,
    shrineFakeDamage,
    shrineOutcomes,
    surpriseOdds,
    portalBadEffects,
    portalEffectOdds,
    trapOdds,
  };
};
