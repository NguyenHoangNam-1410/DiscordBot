"use strict";
const { normalizeVietnamese } = require("./text");
const TONES = /[\u0300\u0301\u0303\u0309\u0323]/g;
const LETTERS =
  /^[a-zđăâêôơưàáảãạằắẳẵặầấẩẫậèéẻẽẹềếểễệìíỉĩịòóỏõọồốổỗộờớởỡợùúủũụừứửữựỳýỷỹỵ]+(?: [a-zđăâêôơưàáảãạằắẳẵặầấẩẫậèéẻẽẹềếểễệìíỉĩịòóỏõọồốổỗộờớởỡợùúủũụừứửữựỳýỷỹỵ]+)*$/u;
function canonicalVietnameseTones(value) {
  return String(value)
    .normalize("NFC")
    .replace(/[\p{L}\p{M}]+/gu, (syllable) => {
      const tones = syllable.normalize("NFD").match(TONES) || [];
      if (tones.length !== 1) return syllable;
      const chars = Array.from(
        syllable.normalize("NFD").replace(TONES, "").normalize("NFC"),
      );
      const plain = chars.join("").toLocaleLowerCase("vi-VN");
      if (!/(oa|oe|uy)$/.test(plain)) return syllable;
      // Only relocate a tone already on this final vowel pair, never one in a compound prefix.
      const original = Array.from(syllable.normalize("NFC"));
      if (
        !original
          .slice(-2)
          .some((c) => (c.normalize("NFD").match(TONES) || []).length)
      )
        return syllable;
      // qu- is an onset: quý/quỳ/quỷ/quỹ/quỵ keep their tone on y.
      const target = plain === "quy" ? chars.length - 1 : chars.length - 2;
      chars[target] = (chars[target] + tones[0]).normalize("NFC");
      return chars.join("").normalize("NFC");
    });
}
function validatedVuaWord(value) {
  if (typeof value !== "string") return null;
  const text = value
    .normalize("NFC")
    .toLocaleLowerCase("vi-VN")
    .replace(/\s+/gu, " ")
    .trim();
  if (!text || text.length > 45 || !LETTERS.test(text)) return null;
  for (const word of text.split(" "))
    if (
      (word.normalize("NFD").match(TONES) || []).length > 1 ||
      !/[aăâeêioôơuưy]/u.test(
        word.normalize("NFD").replace(TONES, "").normalize("NFC"),
      )
    )
      return null;
  return canonicalVietnameseTones(text);
}
const normalizeVuaAnswer = (value) =>
  canonicalVietnameseTones(normalizeVietnamese(value));
module.exports = {
  canonicalVietnameseTones,
  validatedVuaWord,
  normalizeVuaAnswer,
};
