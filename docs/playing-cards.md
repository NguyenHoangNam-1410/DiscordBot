# Playing card emojis

The bot displays cards using the existing application-emoji registry (`appEmoji` and `appEmojiObject`). On startup it fetches emoji IDs from the bot's Discord Developer Portal. Card rendering needs only the emoji name/ID; it does not read image files, upload emojis, or load an image renderer.

Names match the uploaded filenames: `<rank><suit>`, for example `3H`, `QS`, or `10D`. Suit codes: S = green spades, C = blue clubs, D = red diamonds, H = pink hearts. Ranks are A, 2–10, J, Q, K.

Each new game stores one randomly chosen `cardBack` in its existing JSON state. Choices are the available emojis `cardBack_red1` through `cardBack_red5`, `cardBack_green1` through `cardBack_green5`, and `cardBack_blue1` through `cardBack_blue5`. All hidden cards in that game use the same stored choice, including public and private views. Legacy games derive a stable choice from the session ID. If an emoji is unavailable, readable Unicode/text remains as a fallback. Card-display randomness does not consume the game's fairness RNG.

The original SVG/PNG files and preview have been moved out of the worktree to `D:\temp\discordbot-playing-cards\originals`; the 128 × 128 emoji PNGs are in `D:\temp\discordbot-playing-cards\emojis`. These files are for local artwork maintenance and are not included in deployment.

The optional generator requires an output directory outside the worktree. To regenerate locally:

```powershell
npm run generate:cards -- --out=D:\temp\discordbot-playing-cards\originals --emoji-out=D:\temp\discordbot-playing-cards\emojis
```

Run `npm run test:cards` for all five card-game modes, hidden-card privacy, state persistence, and button emoji checks. Tests use mocked emoji IDs and an in-memory database. They do not require local artwork or connect to Discord.
