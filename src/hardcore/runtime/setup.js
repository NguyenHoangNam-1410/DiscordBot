// Composed once by ./index. Cross-module calls are deferred until the feature is ready.
module.exports = function createModule(dependencies) {
  const {
    crypto,
    MessageFlags,
    formatCoins,
    getAccount,
    getGameBetLimit,
    getGameChannel,
    requireGameChannel,
    godReveal,
    hardcoreView,
    hardcoreInventory,
    hardcoreInventoryView,
    useV2,
    MIN_BET,
    MAX_BET,
    CLASSES,
    getHardcoreByUser,
    setMessageId,
    SETUP_IDLE_MS,
    setupDrafts,
  } = dependencies;
  const startHardcore = (...args) => dependencies.startHardcore(...args);
  const forceEndHardcoreSession = (...args) =>
    dependencies.forceEndHardcoreSession(...args);
  const hardcoreEmbed = (...args) => dependencies.hardcoreEmbed(...args);
  const hardcoreRows = (...args) => dependencies.hardcoreRows(...args);

  const setupContext = (...args) => dependencies.setupContext(...args);
  const setupPayload = (...args) => dependencies.setupPayload(...args);
  const closedSetup = (...args) => dependencies.closedSetup(...args);
  const closeSetup = (...args) => dependencies.closeSetup(...args);
  const touchSetup = (...args) => dependencies.touchSetup(...args);
  const openHardcoreSetup = (...args) =>
    dependencies.openHardcoreSetup(...args);
  const refreshSetup = (...args) => dependencies.refreshSetup(...args);
  const setupError = (...args) => dependencies.setupError(...args);
  async function handleHardcoreSetup(interaction, logger = console) {
    const [prefix, id, rawVersion, action] = interaction.customId.split(":");
    const draft = setupDrafts.get(id);
    if (!draft || draft.expiresAt <= Date.now()) {
      if (draft && !draft.busy) {
        closeSetup(draft);
        draft
          .edit?.(
            closedSetup(
              "Bảng chuẩn bị đã hết hạn. Dùng `/sinhton batdau` để chọn lại.",
            ),
          )
          .catch(() => {});
      }
      return interaction.reply({
        content: "Bảng chuẩn bị đã hết hạn. Dùng `/sinhton batdau` để mở lại.",
        flags: MessageFlags.Ephemeral,
      });
    }
    if (
      draft.userId !== interaction.user.id ||
      draft.guildId !== interaction.guildId ||
      draft.channelId !== interaction.channelId
    )
      return interaction.reply({
        content: "Đây là bảng chuẩn bị của người chơi khác.",
        flags: MessageFlags.Ephemeral,
      });
    if (
      (draft.messageId && draft.messageId !== interaction.message?.id) ||
      draft.busy
    )
      return interaction.reply({
        content: "Bảng này không còn nhận thao tác hoặc đang khởi tạo run.",
        flags: MessageFlags.Ephemeral,
      });
    if (draft.version !== Number(rawVersion))
      return refreshSetup(
        interaction,
        draft,
        "Lựa chọn đã thay đổi. Hãy dùng các nút mới nhất.",
      );

    if (
      prefix === "hardcore-setup-modal" &&
      action === "bet" &&
      draft.stage === "class"
    ) {
      const raw = interaction.fields.getTextInputValue("amount").trim();
      const stake = Number(raw);
      const context = setupContext(draft);
      if (
        !/^\d+$/.test(raw) ||
        !Number.isSafeInteger(stake) ||
        stake < MIN_BET ||
        stake > context.maxBet
      )
        return refreshSetup(
          interaction,
          draft,
          `Số xu phải là số nguyên từ **${MIN_BET} đến ${formatCoins(context.maxBet)}**. Hãy nhập lại.`,
        );
      if (stake > context.balance)
        return refreshSetup(
          interaction,
          draft,
          "Không đủ xu cho mức cược này. Hãy nhập mức cược nhỏ hơn hoặc xem số dư qua /hoso.",
        );
      draft.stake = stake;
      return refreshSetup(interaction, draft);
    }
    if (action === "class" && draft.stage === "class") {
      const classKey = interaction.values?.[0];
      if (!Object.hasOwn(CLASSES, classKey))
        return refreshSetup(interaction, draft, "Nhân vật không hợp lệ.");
      draft.classKey = classKey;
      return refreshSetup(interaction, draft);
    }
    if (action === "bet" && draft.stage === "class") {
      touchSetup(draft);
      return interaction.showModal(
        hardcoreView.hardcoreBetModal(draft, setupContext(draft).maxBet),
      );
    }
    if (action === "cancel") {
      closeSetup(draft);
      return interaction.update(closedSetup("Đã hủy chuẩn bị run."));
    }
    if (useV2()) {
      if (action === "class_back" && draft.stage === "loadout") {
        draft.stage = "class";
        return refreshSetup(interaction, draft);
      }
      if (
        (action === "next" && draft.stage === "class") ||
        (action === "loadout_back" && draft.stage === "review")
      ) {
        if (!Object.hasOwn(CLASSES, draft.classKey) || draft.stake == null)
          return refreshSetup(
            interaction,
            draft,
            "Hãy chọn nhân vật và nhập xu trước.",
          );
        draft.stage = "loadout";
        return refreshSetup(interaction, draft);
      }
      if (draft.stage === "loadout") {
        const values = interaction.values || [];
        if (action === "tickets") {
          if (
            values.length > 3 ||
            new Set(values).size !== values.length ||
            values.some(
              (id) =>
                !hardcoreInventory
                  .inventory(draft.guildId, draft.userId, "ticket")
                  .some((item) => item.id === id),
            )
          )
            return refreshSetup(
              interaction,
              draft,
              "Vé không hợp lệ hoặc không còn trong túi.",
            );
          draft.ticketIds = values;
        } else if (action === "item_filter") {
          if (!["all", "UR", "SSR", "SR", "R"].includes(values[0]))
            return refreshSetup(interaction, draft, "Bộ lọc không hợp lệ.");
          draft.itemFilter = values[0];
          draft.itemPage = 0;
        } else if (["items_prev", "items_next"].includes(action)) {
          const page = hardcoreInventoryView.loadoutPage(draft);
          draft.itemPage = Math.max(
            0,
            Math.min(
              page.pages - 1,
              page.page + (action === "items_next" ? 1 : -1),
            ),
          );
        } else if (action === "items") {
          const page = hardcoreInventoryView.loadoutPage(draft);
          const ids = new Set(page.items.map((item) => item.id));
          const next = [
            ...draft.itemIds.filter((id) => !ids.has(id)),
            ...values,
          ];
          if (
            values.some((id) => !ids.has(id)) ||
            new Set(next).size !== next.length ||
            next.length > 5
          )
            return refreshSetup(
              interaction,
              draft,
              "Chỉ mang tối đa 5 món khác nhau. Bỏ chọn món trước khi thêm.",
            );
          draft.itemIds = next;
        } else if (action === "review") {
          try {
            hardcoreInventory.checkStock(draft.guildId, draft.userId, draft);
          } catch (error) {
            return refreshSetup(interaction, draft, setupError(error));
          }
          draft.stage = "review";
        } else
          return refreshSetup(interaction, draft, "Lựa chọn không hợp lệ.");
        return refreshSetup(interaction, draft);
      }
      if (action === "start" && draft.stage !== "review")
        return refreshSetup(
          interaction,
          draft,
          "Hãy chọn đồ và xem chỉ số trước khi bắt đầu.",
        );
    }
    if (action !== "start")
      return refreshSetup(interaction, draft, "Lựa chọn không hợp lệ.");
    if (!Object.hasOwn(CLASSES, draft.classKey) || draft.stake == null)
      return refreshSetup(
        interaction,
        draft,
        "Hãy chọn nhân vật và nhập số xu trước khi bắt đầu.",
      );
    const channel = getGameChannel(draft.guildId, "hardcore");
    if (!channel || channel.channel_id !== draft.channelId) {
      closeSetup(draft);
      return interaction.update(
        closedSetup(
          "Kênh Sinh tồn đã thay đổi. Hãy dùng `/sinhton batdau` tại kênh được cấu hình.",
        ),
      );
    }
    draft.busy = true;
    clearTimeout(draft.timer);
    try {
      await interaction.deferUpdate();
    } catch (error) {
      draft.busy = false;
      touchSetup(draft);
      throw error;
    }
    let started;
    try {
      started = startHardcore({
        guildId: draft.guildId,
        userId: draft.userId,
        channelId: draft.channelId,
        stake: draft.stake,
        classKey: draft.classKey,
        playerName: draft.playerName,
        loadout: { itemIds: draft.itemIds, ticketIds: draft.ticketIds },
      });
    } catch (error) {
      draft.busy = false;
      return refreshSetup(interaction, draft, setupError(error));
    }
    let message;
    try {
      const initialGodFrame = godReveal.frame(started.state, draft.userId);
      message = await interaction.channel.send(
        initialGodFrame || {
          embeds: [
            hardcoreEmbed(
              started.state,
              draft.userId,
              null,
              started.session.id,
            ),
          ],
          components: hardcoreRows(started.session.id, started.state),
          allowedMentions: { parse: [] },
        },
      );
      setMessageId(started.session.id, message.id);
      if (initialGodFrame) {
        await godReveal.play(
          started.session.id,
          started.state,
          draft.userId,
          (payload) => message.edit(payload),
          { logger },
        );
        await message.edit({
          content: "",
          embeds: [
            hardcoreEmbed(
              started.state,
              draft.userId,
              null,
              started.session.id,
            ),
          ],
          components: hardcoreRows(started.session.id, started.state),
          allowedMentions: { parse: [] },
        });
      }
    } catch (error) {
      if (started.state.encounter.type === "god_rngesus") {
        // Never discard this rare, already-persisted blessing because Discord could not publish it.
        closeSetup(draft);
        logger.warn?.(
          { err: error, sessionId: started.session.id },
          "God blessing saved; initial panel could not publish",
        );
        await interaction.editReply(
          closedSetup(
            "Phước lành God of RNGesus và run đã được lưu. Discord chưa hiển thị được bảng; dùng /sinhton tieptuc để tiếp tục.",
          ),
        );
        return started;
      }
      forceEndHardcoreSession(started.session.id, draft.guildId, draft.userId, {
        label: "setup-ui-failed",
      });
      if (message) await message.edit({ components: [] }).catch(() => {});
      draft.busy = false;
      logger.warn?.(
        { err: error, sessionId: started.session.id },
        "hardcore setup could not publish run",
      );
      return refreshSetup(
        interaction,
        draft,
        "Không thể đăng bảng game; đã hoàn lại cược, đồ và vé. Bạn có thể thử Bắt đầu lần nữa.",
      );
    }
    closeSetup(draft);
    try {
      await interaction.editReply(
        closedSetup(
          `Đã bắt đầu **${CLASSES[draft.classKey].name}** với **${formatCoins(draft.stake)} xu**.\n${message.url ? `[Mở bảng Sinh tồn](${message.url})` : `Mã ván: ${started.session.id}`}`,
        ),
      );
    } catch (error) {
      logger.warn?.(
        { err: error, sessionId: started.session.id },
        "hardcore setup confirmation could not update",
      );
      await interaction.followUp({
        content:
          "Run đã bắt đầu trong kênh. Dùng `/sinhton tieptuc` nếu cần mở lại bảng.",
        flags: MessageFlags.Ephemeral,
      });
    }
    return started;
  }
  return { handleHardcoreSetup };
};
