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

  function setupContext(draft) {
    return {
      gameplayVersion: useV2() ? 2 : 1,
      balance: getAccount(draft.guildId, draft.userId).balance,
      maxBet: Math.min(MAX_BET, getGameBetLimit(draft.guildId, "hardcore")),
    };
  }

  function setupPayload(draft) {
    const context = setupContext(draft);
    return context.gameplayVersion === 2 &&
      ["loadout", "review"].includes(draft.stage)
      ? hardcoreInventoryView.setupPayload(draft, context)
      : hardcoreView.hardcoreSetupPayload(draft, CLASSES, context);
  }

  function closedSetup(content) {
    return {
      content,
      embeds: [],
      components: [],
      allowedMentions: { parse: [] },
    };
  }

  function closeSetup(draft) {
    clearTimeout(draft.timer);
    setupDrafts.delete(draft.id);
  }

  function touchSetup(draft) {
    clearTimeout(draft.timer);
    draft.expiresAt = Date.now() + SETUP_IDLE_MS;
    draft.timer = setTimeout(() => {
      if (!setupDrafts.has(draft.id) || draft.busy) return;
      closeSetup(draft);
      draft
        .edit?.(
          closedSetup(
            "Bảng chuẩn bị đã hết hạn. Dùng `/sinhton batdau` để chọn lại.",
          ),
        )
        .catch(() => {});
    }, SETUP_IDLE_MS);
    draft.timer.unref?.();
  }

  async function openHardcoreSetup(interaction, initial = {}) {
    if (!interaction.guildId)
      return interaction.reply({
        content: "Game chỉ dùng được trong server.",
        flags: MessageFlags.Ephemeral,
      });
    if (!(await requireGameChannel(interaction, "hardcore"))) return null;
    if (getHardcoreByUser(interaction.guildId, interaction.user.id))
      return interaction.reply({
        content:
          "Bạn đang có một run chưa kết thúc. Dùng `/sinhton tieptuc` để tiếp tục.",
        flags: MessageFlags.Ephemeral,
      });
    for (const previous of setupDrafts.values()) {
      if (
        previous.guildId === interaction.guildId &&
        previous.userId === interaction.user.id
      ) {
        if (previous.busy)
          return interaction.reply({
            content: "Run đang được khởi tạo. Vui lòng chờ một chút.",
            flags: MessageFlags.Ephemeral,
          });
        closeSetup(previous);
        previous
          .edit?.(closedSetup("Đã mở bảng chuẩn bị mới."))
          .catch(() => {});
      }
    }
    const draft = {
      id: crypto.randomBytes(6).toString("hex"),
      guildId: interaction.guildId,
      userId: interaction.user.id,
      playerName:
        interaction.member?.displayName ||
        interaction.user.globalName ||
        interaction.user.username ||
        interaction.user.id,
      channelId: interaction.channelId,
      classKey: Object.hasOwn(CLASSES, initial.classKey)
        ? initial.classKey
        : null,
      stake:
        Number.isSafeInteger(initial.stake) &&
        initial.stake >= MIN_BET &&
        initial.stake <= MAX_BET
          ? initial.stake
          : null,
      stage: "class",
      itemIds: [],
      ticketIds: [],
      itemFilter: "all",
      itemPage: 0,
      version: 0,
      busy: false,
      messageId: null,
    };
    setupDrafts.set(draft.id, draft);
    try {
      const response = await interaction.reply({
        ...setupPayload(draft),
        flags: MessageFlags.Ephemeral,
        withResponse: true,
      });
      const message =
        response?.resource?.message || (response?.id ? response : null);
      draft.messageId = message?.id || null;
      draft.edit =
        typeof interaction.editReply === "function"
          ? (payload) => interaction.editReply(payload)
          : (payload) => message.edit(payload);
      if (setupDrafts.get(draft.id) !== draft) {
        await draft.edit(closedSetup("Đã mở bảng chuẩn bị mới."));
        return null;
      }
      touchSetup(draft);
      return draft;
    } catch (error) {
      closeSetup(draft);
      throw error;
    }
  }

  async function refreshSetup(interaction, draft, notice = null) {
    draft.version += 1;
    touchSetup(draft);
    if (!interaction.deferred && !interaction.replied)
      await interaction.deferUpdate();
    draft.edit = (payload) => interaction.editReply(payload);
    await draft.edit(setupPayload(draft));
    if (notice)
      await interaction.followUp({
        content: notice,
        flags: MessageFlags.Ephemeral,
      });
  }

  function setupError(error) {
    if (
      ["INVALID_LOADOUT", "INSUFFICIENT_HARDCORE_ITEMS"].includes(error.message)
    )
      return "Đồ hoặc vé đã chọn không còn đủ trong túi. Hãy quay lại chọn đồ.";
    return error.message === "ACTIVE_SESSION"
      ? "Bạn đang có một run chưa kết thúc. Dùng `/sinhton tieptuc`."
      : error.message === "BET_LIMIT"
        ? `Giới hạn cược hiện tại là **${formatCoins(error.maxBet)} xu**. Hãy nhập lại mức cược.`
        : error.code === "INSUFFICIENT_FUNDS"
          ? "Số dư hiện tại không đủ. Hãy nhập mức cược nhỏ hơn."
          : error.code === "ACTIVE_BLACKJACK_TABLE"
            ? "Bạn đang ở bàn Xì dách. Hãy kết thúc ván đó trước."
            : error.message === "INVALID_BET"
              ? `Nhập số nguyên từ ${MIN_BET} đến ${formatCoins(MAX_BET)} xu.`
              : "Chưa thể bắt đầu run. Hãy thử lại.";
  }
  return {
    setupContext,
    setupPayload,
    closedSetup,
    closeSetup,
    touchSetup,
    openHardcoreSetup,
    refreshSetup,
    setupError,
  };
};
