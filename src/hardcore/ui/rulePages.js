"use strict";
const { EmbedBuilder } = require("discord.js");

// Leave room for the caller's page footer; count emoji markup, not its visual width.
const PAGE_TEXT_LIMIT = 5900;
const FIELD_TEXT_LIMIT = 1024;
const FIELD_COUNT_LIMIT = 25;

function splitValue(text) {
  const chunks = [];
  while (text.length > FIELD_TEXT_LIMIT) {
    const newline = text.lastIndexOf("\n", FIELD_TEXT_LIMIT - 1);
    const space = text.lastIndexOf(" ", FIELD_TEXT_LIMIT - 1);
    let end =
      newline >= 0 ? newline + 1 : space >= 0 ? space + 1 : FIELD_TEXT_LIMIT;
    // A long unbroken line can contain Unicode or a custom emoji at the boundary.
    if (
      /[\uD800-\uDBFF]/.test(text[end - 1]) &&
      /[\uDC00-\uDFFF]/.test(text[end])
    )
      end -= 1;
    for (const match of text.matchAll(/<a?:\w+:\d+>/g)) {
      if (match.index < end && match.index + match[0].length > end) {
        end = match.index;
        break;
      }
      if (match.index >= end) break;
    }
    chunks.push(text.slice(0, end));
    text = text.slice(end);
  }
  if (text) chunks.push(text);
  return chunks;
}

function splitRuleFields(fields) {
  return fields.flatMap((field) =>
    splitValue(field.value).map((value) => ({ ...field, value })),
  );
}

function embedTextLength(embed) {
  return (
    (embed.title || "").length +
    (embed.description || "").length +
    (embed.author?.name || "").length +
    (embed.footer?.text || "").length +
    (embed.fields || []).reduce(
      (sum, field) => sum + field.name.length + field.value.length,
      0,
    )
  );
}

function paginateRuleEmbed(embed) {
  const { fields = [], ...base } = embed.data || embed;
  const baseLength = embedTextLength(base);
  const pages = [];
  let pageFields = [];
  let length = baseLength;
  for (const field of splitRuleFields(fields)) {
    const fieldLength = field.name.length + field.value.length;
    if (
      pageFields.length &&
      (length + fieldLength > PAGE_TEXT_LIMIT ||
        pageFields.length >= FIELD_COUNT_LIMIT)
    ) {
      pages.push(new EmbedBuilder({ ...base, fields: pageFields }));
      pageFields = [];
      length = baseLength;
    }
    pageFields.push(field);
    length += fieldLength;
  }
  if (pageFields.length || !pages.length)
    pages.push(new EmbedBuilder({ ...base, fields: pageFields }));
  return pages;
}

module.exports = { splitRuleFields, paginateRuleEmbed };
