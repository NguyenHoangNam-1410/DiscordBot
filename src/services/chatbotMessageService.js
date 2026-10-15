"use strict";
const chatbot = require("./chatbotService");

const busy = new Set();

function errorText(result) {
  if (result.error === "DISABLED") return "Chatbot chưa được cấu hình (thiếu khóa OpenAI). Hãy nhờ admin kiểm tra.";
  if (result.error === "TOO_LONG") return `Tin nhắn quá dài (tối đa ${result.max} ký tự).`;
  if (result.error === "LIMIT")
    return `Bạn đã dùng hết **${result.limit} lượt** chat hôm nay. Lượt mới có lại lúc 00:00 giờ Việt Nam.`;
  if (result.error === "FLAGGED") return "Mình không thể trả lời nội dung này.";
  return "Chatbot đang bận, thử lại sau nhé. Lượt của bạn chưa bị trừ.";
}

async function handleChatbotMessage(message) {
  if (!message.guildId || message.author?.bot) return false;
  if (chatbot.getChannelId(message.guildId) !== message.channelId) return false;
  const text = String(message.content || "").trim();
  if (!text || text.startsWith("/") || text.startsWith(process.env.COMMAND_PREFIX || "!")) return false;
  const key = `${message.guildId}:${message.author.id}`;
  if (busy.has(key)) return true; // một yêu cầu một lúc cho mỗi người
  busy.add(key);
  try {
    await message.channel.sendTyping?.().catch(() => null);
    const result = await chatbot.ask({
      guildId: message.guildId,
      userId: message.author.id,
      channelId: message.channelId,
      text,
    });
    const body = result.ok ? `${result.text}\n-# Còn ${result.remaining}/${result.limit} lượt hôm nay` : errorText(result);
    await message.reply({ content: body, allowedMentions: { parse: [], repliedUser: false } });
  } finally {
    busy.delete(key);
  }
  return true;
}

module.exports = { handleChatbotMessage, errorText };
