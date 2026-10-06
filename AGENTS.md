# Repository instructions

## Windows file ownership

- Files created or modified for the user must remain owned by `S3P\namnguyen04248`.
- Never leave repository, workspace, artifact, test, configuration, or documentation files owned by `VGL0388\CodexSandboxOffline`.
- Preserve existing ownership with in-place edits. Create new files only under the user's account.
- After creating or materially editing files, verify every affected file's owner. Do not broaden ACLs or take ownership of unrelated files.
- If the environment cannot create a file under the user's account, ask the user to pre-create it, then edit that existing file.

## Player changelog

- For every update requested by the user, audit the final changes and add an entry to `src/changelog.json` before committing/pushing. Include the actual update time and concise Vietnamese descriptions of what changed for players.
- Use `npm run changelog:add -- --title "Tiêu đề" --change "Nội dung"`; repeat `--change` for multiple bullets. This records update/audit timestamps automatically.
- For historical backfill, pass `--commit <SHA>` to take the update timestamp and full SHA from Git. Verify the commit's changes before describing them; do not invent dates or features.
- Keep old entries as history. For a later balance change, create a new entry stating the new values instead of rewriting the old release.
- Never include tokens, credentials, private player data, or raw internal logs in player descriptions.
- Run `npm run test:changelog` after updating the history or its UI. Keep newest updates on page 1, display Vietnam time, and respect Discord embed limits.
- Only register `/changelog`; do not add the misspelled `/changlog` alias.
