"use strict";
// Composed once by ./index. Cross-module calls are deferred until the feature is ready.
module.exports = function createModule(dependencies) {
  const {
    covenant,
    gilded,
    stats,
    core,
    E,
    eventIcon,
    treasureChestIcon,
    rarityLabel,
    percent,
    money,
    STAT_SEPARATOR,
  } = dependencies;
  const chestPityText = (...args) => dependencies.chestPityText(...args);

  function rngesusLabel(state) {
    const chance = state.encounter.encounterChance ?? state.lastChaosChance;
    return Number.isFinite(chance) && chance > 0 && chance <= 1
      ? `RNGesus (${(chance * 100).toLocaleString("vi-VN", { maximumFractionDigits: 2 })}%)`
      : "RNGesus";
  }

  function randomEventText(s) {
    const e = s.encounter;
    const heading = (name, intro) =>
      `${eventIcon(["surprise", "trap"].includes(e.type) ? e.kind : e.type)} **${name}:** (${intro})`;
    const option = (name, outcomes) =>
      `**${name}**\n${outcomes.map(([chance, text]) => `- ${chance ? `**${chance}:** ` : ""}${text}`).join("\n")}`;
    const show = (name, intro, options) =>
      [heading(name, intro), ...options].join("\n\n") + grudgeInfo;
    const attr = (key, n) =>
      `${E[key]} **${key.toUpperCase()}** ${n > 0 ? "+" : ""}${n}`;
    const grudgeInfo =
      e.type === "surprise" && e.kind === "adventurer"
        ? "\n**Cướp còn tạo Dấu ấn oán hận** riêng trong Rift: từ tầng cướp +10, Shrine thêm nhánh nghi lễ 1/7 để triệu hồi boss nhận Gilded Soul [LR]. Hậu quả cướp cũ giữ nguyên."
        : "";
    if (e.type === "chest") {
      const labels = {
        ancient_mimic: "Chiến đấu Ancient Mimic (Tinh anh).",
        mimic: "Chiến đấu Mimic.",
        legendary: "Nhận đồ [SSR].",
        cursed: "Nhận [UR]: trang bị có nguyền hoặc Vé thoát.",
        rare: "Nhận đồ [SR].",
        common: "Nhận đồ [R].",
        empty: "Hòm trống.",
        fake: "SSR giả, không có công dụng.",
      };
      const odds = e.odds || core.chestOdds(s, e.name === "Treasure Chest");
      return show(
        e.name,
        e.revealed
          ? "Đã phát hiện Mimic."
          : "Mở để nhận đồ hoặc gặp nguy hiểm; trùng tên tăng level.",
        [
          option(
            "Mở hòm",
            e.revealed
              ? [["100%", "Chiến đấu Mimic đã phát hiện."]]
              : Object.entries(odds)
                  .filter(([, p]) => p > 0)
                  .map(([key, p]) => [percent(p), labels[key]]),
          ),
          `**Kiểm tra:** ${percent(e.detectionChance)} phát hiện nếu có Mimic; không phát hiện chưa chắc an toàn.\n**Bán:** bonus +15% cược.\n${chestPityText(s, e)}`,
        ],
      );
    }
    if (e.type === "shrine" && e.kind === "ritual") return gilded.details(s);
    if (e.type === "shrine")
      return show(
        "Shrine",
        e.branchCount === 7
          ? "Dấu ấn đã đến hạn: 7 nhánh ngang nhau (1/7 ≈ 14,3%); nhánh Nghi lễ Oán Hận triệu hồi boss nhận Gilded Soul [LR]. Xem Rift."
          : "Chạm để nhận một hiệu ứng; 6 loại có tỷ lệ bằng nhau, mỗi loại 1/6 ≈ 16,7%.",
        [
          option("Chạm Shrine", [
            [null, `**Healing:** hồi đầy ${E.hp} HP/${E.mana} MP.`],
            [
              null,
              `**Armor:** +5 vào một thuộc tính: ${stats.ATTRIBUTES.map((key) => `${E[key]} ${key.toUpperCase()}`).join(" / ")} (mỗi chỉ số 25%).`,
            ],
            [
              null,
              `${E.backpack} **Treasure:** nhận 1 vật phẩm ngẫu nhiên: **R 50% / SR 30% / SSR 15% / UR 5%**. Tỷ lệ cố định, không chịu LUCK/pity; UR có thể là trang bị hoặc Vé thoát.`,
            ],
            [null, "**Experience:** bonus +25% cược."],
            [
              null,
              `**Corrupted:** ${attr(e.powerStat || stats.mainStat(s), 12)}, ${attr("vit", -8)}.`,
            ],
            [
              null,
              `**Fake:** bẫy gây sát thương bằng 30% Max ${E.hp} HP (mức bẫy tối thiểu 10), nhưng luôn chừa ít nhất **1 HP**.`,
            ],
          ]),
          "**Bỏ qua:** đi tiếp, không nhận hiệu ứng.",
        ],
      );
    if (e.type === "rngesus") {
      const chance = e.fleeChance ?? core.rngesusFleeChance(s);
      return show(
        rngesusLabel(s),
        "Không thể đánh bại hoặc rút thưởng tại đây. Mỗi lần chọn bỏ chạy giảm 5 điểm % cho lần sau, thấp nhất 75%; chọn hành động khác giữ nguyên tỷ lệ.",
        [
          option("Bỏ chạy", [
            [percent(chance), "Thoát an toàn."],
            ...(chance < 1
              ? [
                  [
                    percent(1 - chance),
                    `Tự dùng ${E.ticket} **Vé thoát ×1** nếu còn; hết vé thì tử trận.`,
                  ],
                ]
              : []),
          ]),
          option("Cầu nguyện", [
            [
              percent(e.prayerChance ?? core.rngesusPrayerChance(s)),
              "Sống và nhận **1 vật phẩm UR**: trang bị có nguyền hoặc Vé thoát.",
            ],
            [
              percent(1 - (e.prayerChance ?? core.rngesusPrayerChance(s))),
              `Tử trận; Lost Adventurer hoặc ${E.reviveTicket} **Vé hồi sinh** cứu nếu còn.`,
            ],
          ]),
          "**Hối lộ:** cần payout ≥1.000 xu, trừ một lần 40% payout hiện tại để thoát. **Đánh:** chết.",
        ],
      );
    }
    if (e.type === "echo")
      return show(
        e.name,
        "Mộ mất quyền nhận sau 30 phút không thao tác; đồ chỉ được tiết lộ khi nhận.",
        [
          `Class **${e.echo.profile.classKey}** · tử trận tầng ${e.echo.floor} · ${e.echo.kills} mạng.`,
          `**Cầu nguyện:** hồi 15% Max ${E.hp} HP và 15% Max ${E.mana} MP (làm tròn lên), giữ mộ.`,
          option("Cướp mộ", [
            ["50%", "Nhận một món đồ, đi tiếp an toàn."],
            ["50%", "Nhận một món đồ; xem **Rift** để đọc Oán niệm."],
          ]),
          "**Khiêu chiến:** quái mạnh hơn 25%; hạ mới nhận loot. **Bỏ đi:** giữ mộ.",
        ],
      );
    if (e.type === "trap") {
      if (e.kind === "portal")
        return show(
          "Wrong Portal",
          percent(e.goodChance ?? 0.5) +
            " tốt / " +
            percent(1 - (e.goodChance ?? 0.5)) +
            " xấu. Các kết quả trong mỗi nhóm có tỷ lệ bằng nhau; Lucky Break không áp dụng.",
          [
            option("Vào portal · kết quả tốt", [
              [
                percent((e.goodChance ?? 0.5) / 3),
                `+10 ${E.hp} Max HP, hồi đầy ${E.hp} HP/${E.mana} MP, +1 ${E.potion} bình máu.`,
              ],
              [percent((e.goodChance ?? 0.5) / 3), "Bonus +50% cược."],
              [
                percent((e.goodChance ?? 0.5) / 3),
                `${attr("str", 6)}${STAT_SEPARATOR}${attr("ene", 6)}${STAT_SEPARATOR}${attr("luck", 1)}.`,
              ],
            ]),
            option("Vào portal · kết quả xấu (Elite đánh phủ đầu sau đó)", [
              [
                percent((1 - (e.goodChance ?? 0.5)) / (s.floor === 1 ? 4 : 5)),
                `Mất 15% Max ${E.hp} HP, giữ ít nhất 1.`,
              ],
              [
                percent((1 - (e.goodChance ?? 0.5)) / (s.floor === 1 ? 4 : 5)),
                `${E.mana} MP về 0.`,
              ],
              [
                percent((1 - (e.goodChance ?? 0.5)) / (s.floor === 1 ? 4 : 5)),
                `Mất tối đa 2 ${E.potion} bình máu.`,
              ],
              ...(s.floor === 1
                ? []
                : [
                    [
                      percent((1 - (e.goodChance ?? 0.5)) / 5),
                      "Trừ một lần 10% payout hiện tại.",
                    ],
                  ]),
              [
                percent((1 - (e.goodChance ?? 0.5)) / (s.floor === 1 ? 4 : 5)),
                `${attr("str", -5)}, ${attr("ene", -5)}.`,
              ],
            ]),
            "**Bỏ qua:** vượt tầng, không nhận thưởng hoặc chịu hiệu ứng của portal, không gặp Elite đánh phủ đầu. Tiên tri (nếu có) đánh dấu nút **Vào portal**.",
            ...(covenant.canEnter(s)
              ? [
                  "🗝️ **Cửa thứ ba · Tầng hầm:** đủ bốn mảnh, bảo đảm mở cửa, không roll thêm. Đánh Covenant Guardian (Tinh anh, HP ×1,25, DMG ×1,10 so với cùng tầng/Rift), bạn hành động trước. Thắng mới tiêu thụ mảnh và nhận **Conqueror’s Covenant [LR]** cùng phước lành hồi đầy HP/MP, giải mọi nguyền UR, xóa ấn Rift; giữ Paradox/Contract. Chỉ một nội tại LR hoạt động/run. Vào portal thường hoặc bỏ qua vẫn giữ mảnh để dùng ở portal sau.",
                ]
              : []),
          ],
        );
      const lucky = Math.min(0.3, s.luck * 0.015);
      return show(e.name, `${E.luck} Luck ${s.luck} quyết định Lucky Break.`, [
        option("Chấp nhận số phận", [
          [percent(lucky), "Lucky Break: tránh bẫy."],
          [
            percent(1 - lucky),
            e.kind === "tax"
              ? `Trừ một lần **15% payout hiện tại** (${money(core.taxCost(s))} ${E.coin}); làm tròn lên 1 xu.`
              : `Mất 1 ${E.potion} bình máu nếu đang có.`,
          ],
        ]),
      ]);
    }
    if (e.type !== "surprise") return null;
    const main = stats.mainStat(s);
    switch (e.kind) {
      case "goblin": {
        const chance = core.goblinCatchChance(s);
        return show(
          e.name,
          `Đuổi bắt để lấy xu và trang bị; tỷ lệ đã tính ${E.luck} LUCK và ${E.goblinChance} buff bắt Goblin.`,
          [
            option("Bắt", [
              [
                percent(chance),
                `Bonus **+25% cược** và **1 ${E.backpack} trang bị**.`,
              ],
              [
                percent(1 - chance),
                `Goblin thoát: trừ một lần **5% payout hiện tại** (${money(core.goblinEscapeCost(s))} ${E.coin}, làm tròn lên 1 xu).`,
              ],
            ]),
            option(
              "Độ hiếm khi bắt thành công",
              Object.entries(core.GOBLIN_REWARDS.rarities).map(
                ([rarity, odds]) => [
                  percent(odds),
                  `1 ${E.backpack} vật phẩm **[${rarityLabel(rarity)}]**${rarity === "cursed" ? ": trang bị có nguyền hoặc Vé thoát" : ""}.`,
                ],
              ),
            ),
          ],
        );
      }
      case "gambler":
        return show(e.name, "Trả khoản cược trước khi phân thắng thua.", [
          ...[10, 25].map((n) =>
            option(`Cược ${n}% payout`, [
              ["50%", "Bonus trước lời nguyền bằng 2 lần khoản đã đặt."],
              ["50%", "Mất khoản đã đặt, không nhận bonus."],
            ]),
          ),
        ]);
      case "adventurer":
        return show(e.name, "Cứu hoặc cướp để nhận trang bị.", [
          option(`Cứu · trả 1 ${E.potion} bình máu`, [
            ["70%", "Nhận đồ [R]."],
            ["30%", "Nhận đồ [SR]."],
          ]),
          option("Cướp", [
            ["75%", "Nhận đồ [SSR]."],
            ["25%", "Nhận đồ [UR], kèm curse."],
          ]),
          "Xem **Rift** để đọc Ân nghĩa và Truy nã.",
        ]);
      case "fountain":
        return show(e.name, "Uống để hồi phục hoặc gặp Blood Mimic.", [
          option("Uống", [
            [
              percent(e.healThreshold ?? 0.6),
              `Hồi đầy ${E.hp} HP/${E.mana} MP.`,
            ],
            [
              percent((e.goodThreshold ?? 0.85) - (e.healThreshold ?? 0.6)),
              `+15 ${E.hp} Max HP; hồi 15 ${E.hp} HP và ${E.mana} MP theo tỷ lệ 15/Max HP mới (làm tròn lên).`,
            ],
            [
              percent(1 - (e.goodThreshold ?? 0.85)),
              "Chiến đấu Blood Mimic (Tinh anh).",
            ],
          ]),
        ]);
      case "mirror":
        return show(e.name, "Nhận sức mạnh hoặc phá gương để thử vận may.", [
          `**Sức mạnh:** ${attr(main, 10)}.`,
          `**Phòng thủ:** ${attr("vit", 8)}; ${attr("str", 5)} hoặc ${attr("dex", 5)} (50/50).`,
          "**Đập gương:** xem **Rift** để đọc kết quả và Dư âm gương.",
        ]);
      case "doors":
        return show(
          e.name,
          "Chọn một cửa; có thể nhận thưởng hoặc gặp nguy hiểm.",
          [
            option("Cửa sáng", [
              [
                percent(e.doorChances?.light ?? 0.7),
                `Hồi đầy ${E.hp} HP/${E.mana} MP, +1 ${E.potion} bình máu (tối đa ${s.maxPotions}).`,
              ],
              [
                percent(1 - (e.doorChances?.light ?? 0.7)),
                `Mất 20% Max ${E.hp} HP, giữ ít nhất 1.`,
              ],
            ]),
            option("Cửa vàng", [
              [percent(e.doorChances?.gold ?? 0.7), "Bonus +50% cược."],
              [percent(1 - (e.doorChances?.gold ?? 0.7)), "Chiến đấu Mimic."],
            ]),
            option("Cửa tối", [
              [percent(e.doorChances?.dark ?? 0.6), "Nhận đồ [SSR]."],
              [
                percent(1 - (e.doorChances?.dark ?? 0.6)),
                "Chiến đấu Premature Rift Boss.",
              ],
            ]),
          ],
        );
      case "treasure_room": {
        const reward = {
          red: `${E.attack} **Vật lý** +5${STAT_SEPARATOR}${E.magic} **Phép** +5.`,
          blue: `${E.defense} **DEF** +6${STAT_SEPARATOR}${E.res} **RES** +5%.`,
          gold: `Bonus +50% cược${STAT_SEPARATOR}${attr("luck", 1)}.`,
        };
        return show(
          e.name,
          "Chọn mở một trong ba rương; không được soi hoặc bỏ qua. Mỗi rương có 1/3 khả năng gặp Mimic, 2/3 nhận thưởng bên dưới.",
          [
            ...Object.entries(reward).map(([color, text]) => {
              return option(
                `${treasureChestIcon(color)} Mở rương ${{ red: "đỏ", blue: "xanh", gold: "vàng" }[color]}`,
                [[null, text]],
              );
            }),
          ],
        );
      }
      case "duelist":
        return show(
          e.name,
          "Oẳn tù tì; mỗi ván thắng, hòa, thua có tỷ lệ ngang nhau (1/3).",
          [
            option("Đấu thuộc tính · một ván", [
              [
                null,
                `**Thắng:** Búa ${attr("str", 6)} / Kéo ${attr("dex", 6)} / Bao ${attr("ene", 6)}.`,
              ],
              [
                null,
                "**Hòa/thua:** trừ ngẫu nhiên tối đa 6 điểm thuộc tính, mỗi chỉ số giữ ít nhất 1.",
              ],
            ]),
            option("Đấu trang bị · thắng 3/5 ván, tỷ lệ lúc bắt đầu", [
              ["≈21%", "Thắng thử thách: đồ [SSR] 75% / [UR] 25%."],
              ["≈79%", "Mất một món R/SR/SSR đã khóa; giữ đồ UR."],
            ]),
            ...(e.mode
              ? [
                  `**Tiến trình:** ván ${Math.min(5, e.round + 1)}/5 · đã thắng ${e.wins}.`,
                ]
              : []),
          ],
        );
      default:
        return null;
    }
  }
  return { rngesusLabel, randomEventText };
};
