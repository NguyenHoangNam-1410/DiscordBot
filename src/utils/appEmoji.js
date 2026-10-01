// Emoji tải lên ở Developer Portal → Bot → Emojis (emoji của ứng dụng, dùng được ở mọi server).
// Cú pháp gửi trong tin nhắn/embed: <:tên:id> (hoặc <a:tên:id> nếu là emoji động). Bot tự tra id theo tên khi khởi động.
const registry = new Map();

async function loadApplicationEmojis(client, logger = console) {
  try {
    const emojis = await client.application.emojis.fetch();
    registry.clear();
    for (const emoji of emojis.values())
      registry.set(emoji.name, {
        id: emoji.id,
        name: emoji.name,
        animated: Boolean(emoji.animated),
      });
    logger.info?.({ count: registry.size }, "application emojis loaded");
  } catch (error) {
    logger.warn?.(
      { err: error },
      "cannot load application emojis; falling back to standard emojis",
    );
  }
  return registry.size;
}
// Trả về markup emoji của ứng dụng nếu có, không thì dùng emoji dự phòng (Unicode/shortcode).
function appEmoji(name, fallback = "") {
  const emoji = registry.get(name);
  return emoji
    ? `<${emoji.animated ? "a" : ""}:${emoji.name}:${emoji.id}>`
    : fallback;
}
// Dạng object cho ButtonBuilder.setEmoji / select option; undefined nếu chưa có.
function appEmojiObject(name) {
  const emoji = registry.get(name);
  return emoji
    ? { id: emoji.id, name: emoji.name, animated: emoji.animated }
    : undefined;
}
function setApplicationEmojisForTest(entries) {
  registry.clear();
  for (const [name, id, animated = false] of entries)
    registry.set(name, { id, name, animated });
}

module.exports = {
  loadApplicationEmojis,
  appEmoji,
  appEmojiObject,
  setApplicationEmojisForTest,
};
