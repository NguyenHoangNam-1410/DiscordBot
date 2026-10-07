"use strict";
// LR relic catalog. Five relics are active; Veil of the Absolute remains pending.
const { SETS: ROYAL_SETS } = require("./events/royalSets");
function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}
const RELIC_RULES = deepFreeze({
  maxActivePerRun: 1,
  canSwitchDuringRun: false,
  scalesWithLevel: false,
  lifetime: "run",
  countsBeforeActivation: false,
  consumesRevivalTicketSlot: false,
});
const designs = [
  {
    id: "kingslayers_testament",
    name: "Kingslayer's Testament",
    vietnameseName: "Di Chúc Diệt Vương",
    text: "CRIT vật lý của bạn gây DMG ×2,5. Mỗi Boss định kỳ hạ sau khi kích hoạt tăng hệ số thêm 0,1, tối đa ×3,5; không tăng tỷ lệ CRIT, không áp dụng phép, Elite, Mimic hoặc Clone.",
    relicPassive: {
      kind: "bossCritGrowth",
      initialCritMultiplier: 2.5,
      multiplierPerBoss: 0.1,
      maxCritMultiplier: 3.5,
      eligibleBosses: "scheduled",
      countsUniqueEncounters: true,
    },
  },
  {
    id: "astral_singularity",
    name: "Astral Singularity",
    vietnameseName: "Điểm Kỳ Dị Tinh Tú",
    text: "Skill phép của bạn không tiêu hao MP. Khi dùng nội tại này, hiệu ứng chặn phản công từ Skill không thể kích hoạt hai lượt liên tiếp. Vẫn trả chi phí HP và chịu hạn chế Skill, lời nguyền.",
    relicPassive: {
      kind: "freeMagicSkill",
      appliesTo: "magicSkill",
      manaCost: 0,
      skillGuardCooldownActions: 1,
      preservesHpCosts: true,
      preservesSkillRestrictions: true,
    },
  },
  {
    id: "fatebreaker_seal",
    name: "Fatebreaker Seal",
    vietnameseName: "Ấn Phá Mệnh",
    text: "Tỷ lệ gặp RNGesus của bạn về 0% từ lúc kích hoạt đến hết run. Không giải quyết RNGesus đang gặp và không miễn tử vong từ nguồn khác.",
    relicPassive: {
      kind: "preventRngesusEncounter",
      encounterChance: 0,
      resolvesCurrentEncounter: false,
    },
  },
  {
    id: "veil_of_the_absolute",
    name: "Veil of the Absolute",
    vietnameseName: "Màn Chắn Tuyệt Đối",
    text: "Chọn cố định vật lý hoặc phép khi kích hoạt. Trong mỗi combat, bạn miễn hai đòn đầu thuộc loại đã chọn, sau đó nhận ít hơn 50% DMG cùng loại. Không miễn hiến tế HP, chi phí Skill, lời nguyền hoặc tử vong từ event.",
    relicPassive: {
      kind: "typedCombatWard",
      damageTypes: ["physical", "magic"],
      selectionLockedForRun: true,
      immuneHitsPerCombat: 2,
      damageReductionAfterCharges: 0.5,
      appliesTo: "enemyCombatDamage",
    },
  },
  {
    id: "conquerors_covenant",
    name: "Conqueror's Covenant",
    vietnameseName: "Khế Ước Chinh Phạt",
    text: "Mỗi quái hạ sau khi kích hoạt cộng 0,2 điểm % thưởng xu cho bạn, tối đa +100%. Nhân một lần trên thưởng xu trước khi trừ chi phí/tiền phạt; giữ trần payout và không tăng kim cương. Mỗi encounter chỉ tính một lần.",
    relicPassive: {
      kind: "killPayoutGrowth",
      bonusPerKill: 0.002,
      maxBonus: 1,
      countsUniqueEncounters: true,
      application: "grossCoinsBeforeCosts",
      preservesPayoutCap: true,
      affectsDiamonds: false,
    },
  },
  {
    id: "gilded_soul",
    name: "Gilded Soul",
    vietnameseName: "Linh Hồn Hoàng Kim",
    text: "DMG Tấn công/Skill của bạn tăng theo xu có thể rút trong run: đạt 2/5/10/20/40 lần tiền cược thì tăng 10/20/30/40/50%. Chốt mức tăng khi vào combat; không dùng ví xu ngoài run, không cộng thuộc tính cơ bản.",
    relicPassive: {
      kind: "runWealthDamage",
      source: "currentRunPayout",
      normalizeBy: "stake",
      snapshotAt: "combatStart",
      thresholds: [
        {
          stakeMultiple: 2,
          damageBonus: 0.1,
        },
        {
          stakeMultiple: 5,
          damageBonus: 0.2,
        },
        {
          stakeMultiple: 10,
          damageBonus: 0.3,
        },
        {
          stakeMultiple: 20,
          damageBonus: 0.4,
        },
        {
          stakeMultiple: 40,
          damageBonus: 0.5,
        },
      ],
      maxDamageBonus: 0.5,
    },
  },
];
const RELIC_ITEMS = deepFreeze(
  Object.fromEntries(
    designs.map((design) => [
      design.id,
      {
        ...design,
        category: "relic",
        rarity: "limited",
        typeCode: "LR",
        catalogVersion: 1,
        effects: {},
        passive: null,
        curse: null,
        levelable: false,
        randomEligible: false,
        gachaEligible: false,
        shopEligible: false,
        loadoutEligible: false,
        runtimeEnabled: [
          "fatebreaker_seal",
          "conquerors_covenant",
          "gilded_soul",
          "kingslayers_testament",
          "astral_singularity",
        ].includes(design.id),
        acquisition:
          design.id === "fatebreaker_seal"
            ? { kind: "god_rngesus", method: "blessing" }
            : design.id === "conquerors_covenant"
              ? {
                  kind: "mimic_fragments",
                  method: "basement_trial",
                  sources: [
                    "mimic",
                    "ancient_mimic",
                    "blood_mimic",
                    "mirror_clone",
                  ],
                }
              : design.id === "gilded_soul"
                ? { kind: "adventurer_ritual", method: "boss_victory" }
                : ROYAL_SETS[design.id]
                  ? {
                      kind: "royal_invitation",
                      method: "item_set_exchange",
                      setIds: [...ROYAL_SETS[design.id].ids],
                    }
                  : null,
      },
    ]),
  ),
);
module.exports = { RELIC_ITEMS, RELIC_RULES };
