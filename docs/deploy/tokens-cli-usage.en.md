# Tokens CLI guide (self-hosted site)

[中文](./tokens-cli-usage.md)

Two audiences: a developer pointing the CLI at `localhost:3000`, and an end user joining the site after it is live. The last section is the pre-install scripts, for the operator.

The CLI rule: **it only reads `TOKENS_API_URL`, and the default is upstream `https://tokens.ci`. `credentials.json` does not record the site. Change sites only after `tokens logout`.**

---

## 1. Local development (`localhost:3000`)

Prerequisite: the local Compose stack is up (`docs/deploy/local-orbstack-compose.md`) and a browser can open `http://localhost:3000`.

```bash
# 0. Open http://localhost:3000/register and register with an email.
#    Local setups without Resend do not send verification mail.
#    Registration and submit still work.

# 1. Clear any upstream credentials
tokens logout

# 2. Log in against local (localhost is the only HTTP exception the CLI allows)
TOKENS_API_URL=http://localhost:3000 tokens login
#    The terminal prints http://localhost:3000/device and a code. Open it and enter the code.

# 3. Submit and check the board
TOKENS_API_URL=http://localhost:3000 tokens submit
#    http://localhost:3000/leaderboard should show your usage

# 4. Optional: hide this account from public rankings and print a one-time read token
TOKENS_API_URL=http://localhost:3000 tokens login --private
```

Optional:

- To test downstream behavior that needs a verified email (accepting an email invite), set the flag locally:

  ```bash
  docker compose -f /Users/lusonglin/docker-compose/tokens/docker-compose.yml exec postgres \
    psql -U tokens -d tokens \
    -c "UPDATE users SET email_verified_at = now() WHERE lower(email) = lower('your-registered-email');"
  ```

- To go back to upstream: `tokens logout`, then `tokens login` with no environment variable.
- To avoid the prefix: `export TOKENS_API_URL=http://localhost:3000` once in the current shell. A new terminal does not keep it.

---

## 2. After go-live: user steps

Prerequisite, provided by the operator: the site is up at `https://<production-domain>` with a valid certificate.

**Step 1: install the CLI** (skip if it is already installed)

| Platform | Install |
|---|---|
| macOS | `brew install owo-network/brew/tokens` |
| Linux | Official `install.sh` (command below). By default it also installs a resident auto-submit service. See the note below |
| Windows | `npm i -g tokens-cli` (needs Node.js; the `tokens-cli` package pulls the matching platform binary) |

```bash
curl -fsSL https://s.ee/tokens | bash
```

**Step 2: clear old credentials**

```bash
tokens logout
```

Run this even if you think you never logged in. Leftover upstream credentials will send an upstream token to this site and get 401.

**Step 3: register on the site**

Open `https://<production-domain>/register` and register with an email. The CLI authorization page requires an account on the site first.

**Step 4: log the CLI into this site**

```bash
TOKENS_API_URL=https://<production-domain> tokens login
```

The terminal prints `https://<production-domain>/device` and a code. Open that page, enter the code, and approve.

**Step 5: submit**

```bash
TOKENS_API_URL=https://<production-domain> tokens submit
```

`https://<production-domain>/leaderboard` then shows your usage. Team and Teamboard are used in the browser.

**Notes:**

- Every `tokens` command reads `TOKENS_API_URL`. Export it once in the current shell, or run the pre-install script in section 3. That script writes an alias into the shell config so it persists.
- Usage history and tokens from tokens.ci are not migrated. This site is a new database. Register again and log in again.
- The official Linux `install.sh` starts a resident auto-submit service (`tokens.service`) by default. That service **does not read** a shell alias and will keep submitting to upstream. Either install with `TOKENS_NO_SERVICE=1`, or add `Environment=TOKENS_API_URL=https://<production-domain>` under `[Service]` in `~/.config/systemd/user/tokens.service`, then `systemctl --user daemon-reload && systemctl --user restart tokens`. macOS `brew services start tokens` has the same problem.

---

## 3. Pre-install scripts

`pre-install-tokens.sh` (macOS / Linux) and `pre-install-tokens.ps1` (Windows) at the repo root automate the setup in section 2. They sit next to `install.sh`. The site build copies them into `public/`, so users can also download `https://<production-domain>/pre-install-tokens.sh`.

**The scripts do three things:**

1. **Detect or install the tokens CLI.** Skip if it is installed. Otherwise install by platform: brew on macOS, official `install.sh` on Linux with `TOKENS_NO_SERVICE=1` so no resident service starts, and `npm i -g tokens-cli` on Windows. If a resident submit service is already present (`tokens.service`, or brew services' tokens), the script stops it. A resident service does not read a shell alias and would keep reporting to upstream.
2. **`tokens logout`.** Clears whatever is logged in, upstream or another site, so the next login is clean.
3. **Write a global alias or function.** Wraps the `tokens` command so it always sets `TOKENS_API_URL=https://<production-domain>`. macOS/Linux writes `~/.zshrc` or `~/.bashrc`. Windows writes the PowerShell `$PROFILE`. PowerShell aliases cannot carry an environment variable, so this is a function.

**Usage:**

Preview first: `--dry-run` (sh) or `-DryRun` (ps1) prints the install, logout, and config write without changing anything.

**Preferred: run the pinned script without cloning**

```bash
# macOS / Linux (pinned ref, not a moving branch)
curl -fsSL https://raw.githubusercontent.com/KunoLu/tokens/v1.0.5/pre-install-tokens.sh | bash -s -- https://<production-domain>

# Windows
iex "& { $(irm https://raw.githubusercontent.com/KunoLu/tokens/v1.0.5/pre-install-tokens.ps1) } -Site https://<production-domain>"
```

The script URL points at an immutable ref (a tag or a pinned commit, never a branch). At release, `scripts/set-version.sh <version>` advances `PINNED_SCRIPTS_REF` in `web/src/lib/scriptsRef.ts` to the `v<version>` about to be created, and replaces the old ref in this manual and the READMEs. The order is fixed: set-version, commit, tag, deploy. It does not scan tags. Historical tags (`v27.0.0` / `v27.0.1`) do not contain the pre-install scripts, so a scan would 404. An emergency override is the `TOKENS_SCRIPTS_REF` env var. It accepts only `vX.Y.Z[-prerelease]` or a 40-character SHA; an invalid value falls back to the pin. The site build also copies the script to `https://<production-domain>/pre-install-tokens.sh` as an alternate download.

**Local files:**

```bash
# macOS / Linux (site URL is an explicit argument; the script has no default domain and rejects placeholders)
bash pre-install-tokens.sh https://<production-domain>

# Windows (Administrator or a normal PowerShell both work)
powershell -ExecutionPolicy Bypass -File pre-install-tokens.ps1 -Site https://<production-domain>
```

**What the scripts do not do:**

- They do not log the user in. Browser authorization for `tokens login` has to be done by the user.
- They do not cover non-interactive environments. The alias or function applies to interactive terminals only. Scripts and scheduled tasks must still set `TOKENS_API_URL` explicitly.
- They do not rewrite a system service. They only stop a resident submit service if one exists. To keep resident auto-submit, configure `TOKENS_API_URL` on that service as in section 2, then enable it by hand.

The scripts are idempotent. If the domain changes, run again with the new URL. The alias or function is updated in place.

**Resident automation (after preinstall and login):**

```bash
# Linux: systemd user service for resident submit (drop-in override.conf points at this site; the base unit is not edited)
curl -fsSL https://<production-domain>/enable-tokens-service.sh | bash -s -- https://<production-domain>
```

```powershell
# Windows: scheduled submit (default every 30 minutes; the runner sets TOKENS_API_URL itself)
iex "& { $(irm https://<production-domain>/register-tokens-submit-task.ps1) } -Site https://<production-domain>"
```

Both scripts only configure resident submit and the site URL. They do not log in or log out. Existing credentials are reused. On Linux, do not run `tokens serve` and the resident service together. Uninstall: Linux `systemctl --user disable --now tokens`; Windows, rerun the script with `-Remove`.
