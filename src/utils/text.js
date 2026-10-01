const DIACRITICS = /[\u0300-\u036f]/g;

function normalizeSearch(value = "") {
  return String(value)
    .normalize("NFD")
    .replace(DIACRITICS, "")
    .toLowerCase()
    .replace(/[^a-z0-9+%'-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Game answers must keep Vietnamese accents. Search remains accent-insensitive,
// but accepting an unaccented answer changes the word in Vietnamese word games.
function normalizeVietnamese(value = "") {
  return String(value)
    .normalize("NFC")
    .toLocaleLowerCase("vi-VN")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

module.exports = { normalizeSearch, normalizeVietnamese };
