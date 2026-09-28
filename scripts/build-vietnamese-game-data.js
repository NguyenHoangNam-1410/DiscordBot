const fs = require('node:fs');
const path = require('node:path');

const sourcePath = path.resolve(__dirname, '../data/games/vietnamese-wordlist-source.txt');
const outputPath = path.resolve(__dirname, '../data/games/vietnamese-game-words.json');
const lines = fs.readFileSync(sourcePath, 'utf8').split(/\r?\n/)
  .map(value => value.normalize('NFC').trim().toLowerCase());

function clean(value) {
  return value && value.length <= 45 && /^[\p{L} ]+$/u.test(value) && !/\s{2,}/.test(value);
}

const unique = values => [...new Set(values)];
const wordChains = unique(lines.filter(clean).filter(value => {
  const parts = value.split(' ');
  return parts.length === 2 && parts.every(part => part.length >= 2);
}));
const vuaWords = unique(lines.filter(clean).filter(value => {
  const parts = value.split(' ');
  const letters = value.replace(/\s/g, '').length;
  return parts.length >= 1 && parts.length <= 3 && letters >= 6 && letters <= 18 && parts.every(part => part.length >= 2);
}));

fs.writeFileSync(outputPath, `${JSON.stringify({
  source: 'https://github.com/duyet/vietnamese-wordlist/blob/master/Viet39K.txt',
  license: 'GNU General Public License',
  wordChains,
  vuaWords,
})}\n`);
console.log(JSON.stringify({ wordChains: wordChains.length, vuaWords: vuaWords.length, outputPath }));
