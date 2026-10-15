"use strict";
const chatbot = require("./chatbotService");

const busy = new Set();
const inflight = new Map(); // messageId -> AbortController

// Người dùng xóa tin nhắn khi bot đang xử lý: hủy ngay yêu cầu để không tốn thêm token.
function cancelForDeletedMessage(messageId) {
  const controller = inflight.get(String(messageId));
  if (!controller) return false;
  controller.abort();
  return true;
}

function errorText(result) {
  if (result.error === "DISABLED") return "Chatbot chưa được cấu hình (thiếu khóa OpenAI). Hãy nhờ admin kiểm tra.";
  if (result.error === "TOO_LONG") return `Tin nhắn quá dài (tối đa ${result.max} ký tự).`;
  if (result.error === "LIMIT")
    return `Bạn đã dùng hết **${result.limit} lượt** chat hôm nay. Lượt mới có lại lúc 00:00 giờ Việt Nam.`;
  if (result.error === "FLAGGED") return "Mình không thể trả lời nội dung này.";
  if (result.status === 429) return "Chatbot đang quá tải hoặc hết hạn mức, thử lại sau ít phút nhé. Lượt của bạn chưa bị trừ.";
  return "Chatbot đang bận, thử lại sau nhé. Lượt của bạn chưa bị trừ.";
}

async function handleChatbotMessage(message, logger = console) {
  if (!message.guildId || message.author?.bot) return false;
  if (chatbot.getChannelId(message.guildId) !== message.channelId) return false;
  const text = String(message.content || "").trim();
  if (!text || text.startsWith("/") || text.startsWith(process.env.COMMAND_PREFIX || "!")) return false;
  const key = `${message.guildId}:${message.author.id}`;
  if (busy.has(key)) return true; // một yêu cầu một lúc cho mỗi người
  busy.add(key);
  const controller = new AbortController();
  inflight.set(String(message.id), controller);
  try {
    await message.channel.sendTyping?.().catch(() => null);
    const result = await chatbot.ask({
      guildId: message.guildId,
      userId: message.author.id,
      channelId: message.channelId,
      text,
      signal: controller.signal,
    });
    if (result.error === "CANCELLED" || controller.signal.aborted) return true; // tin gốc đã bị xóa
    if (result.error === "API")
      logger.warn?.(
        { status: result.status, detail: result.detail, body: result.body },
        "chatbot provider request failed",
      );
    const body = result.ok ? `${result.text}\n-# Còn ${result.remaining}/${result.limit} lượt hôm nay` : errorText(result);
    const payload = { content: body, allowedMentions: { parse: [], repliedUser: false } };
    // Tin gốc có thể bị xóa ngay lúc trả lời: không để lỗi tham chiếu làm hỏng cả luồng.
    await message.reply({ ...payload, failIfNotExists: false }).catch((error) => {
      logger.warn?.({ err: error }, "chatbot reply failed");
    });
  } finally {
    inflight.delete(String(message.id));
    busy.delete(key);
  }
  return true;
}

module.exports = { handleChatbotMessage, cancelForDeletedMessage, errorText };
