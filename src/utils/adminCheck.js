const { PermissionFlagsBits } = require("discord.js");

// Admin = có trong ADMIN_USER_ID hoặc có quyền Administrator trong server.
function isAdminInteraction(interaction) {
  const ids = String(process.env.ADMIN_USER_ID || "")
    .split(/[,;\n]/)
    .map((id) => id.trim())
    .filter(Boolean);
  return (
    ids.includes(interaction.user.id) ||
    Boolean(interaction.memberPermissions?.has(PermissionFlagsBits.Administrator))
  );
}

module.exports = { isAdminInteraction };
