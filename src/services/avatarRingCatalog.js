// Pure metadata: shared by migrations, achievement rewards and the profile renderer.
const designs = [
  [
    "amazon",
    "Amazon",
    "Mũi Tên Hoàng Kim",
    "🏹",
    "arrows",
    "#246849",
    "#91d9a5",
    "#c9a65d",
  ],
  [
    "barbarian",
    "Barbarian",
    "Lưỡi Rìu Chiến",
    "🪓",
    "axes",
    "#713438",
    "#b9c5d0",
    "#db6662",
  ],
  [
    "assassin",
    "Assassin",
    "Nguyệt Ảnh",
    "🗡️",
    "blades",
    "#383044",
    "#b6a2e5",
    "#796ca5",
  ],
  [
    "sorceress",
    "Sorceress",
    "Tinh Vân",
    "🔮",
    "stars",
    "#254c76",
    "#90dfee",
    "#7489e0",
  ],
  ["druid", "Druid", "Cổ Mộc", "🌿", "leaves", "#4b4b2c", "#96bd70", "#bf935d"],
  [
    "necromancer",
    "Necromancer",
    "Vương Miện Linh Hồn",
    "💀",
    "bones",
    "#463951",
    "#ddd0af",
    "#ac81cf",
  ],
  [
    "paladin",
    "Paladin",
    "Thánh Quang",
    "🛡️",
    "shields",
    "#756037",
    "#ead596",
    "#74b9d1",
  ],
];
const AVATAR_RINGS = Object.freeze(
  designs.map(([classKey, className, title, emoji, motif, ...colors]) =>
    Object.freeze({
      id: "avatar_ring_" + classKey + "_500",
      type: "avatar_ring",
      classKey,
      className,
      name: "Vòng " + className + " · " + title,
      achievementId: "hc_class_" + classKey + "_500",
      emoji,
      motif,
      colors: Object.freeze(colors),
      rarity: "UR",
      achievementOnly: true,
      price: 0,
      shopEligible: false,
      gachaEligible: false,
      stackable: false,
      tradeable: false,
      effect: "profile_avatar_ring",
      description:
        "Vòng avatar vĩnh viễn của " +
        className +
        ". Chỉ nhận qua thành tựu vượt tầng 500 Sinh tồn bằng " +
        className +
        "; trang bị bằng /vatpham sudung.",
    }),
  ),
);
function ringForAchievement(id) {
  return AVATAR_RINGS.find((ring) => ring.achievementId === id) || null;
}
function avatarRingRewardText(rewards) {
  const rings = rewards
    .map((reward) => ringForAchievement(reward.id))
    .filter(Boolean);
  return rings.length
    ? "\n" +
        rings.map((ring) => ring.emoji + " **" + ring.name + "**").join("\n") +
        "\nĐổi vòng bằng /vatpham sudung · Vĩnh viễn, không tiêu hao."
    : "";
}
module.exports = { AVATAR_RINGS, ringForAchievement, avatarRingRewardText };
