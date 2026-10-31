# Dotfiles

## Herdr layout

`herdr-app/` contains the `gd` layout and its seven custom mods, based on
`iss`'s `sessions` layout. Install Herdr, Node.js and npm first, then deploy with Bash and make:

```sh
make herdr-deploy
```

Deployment installs the Sessions reader's pinned npm dependency, copies `gd.json`
and replaces only the seven named mod directories. The install requires network
access and finishes before existing targets are replaced. Deployment backs up
existing targets, including extra files and symlinks, under
`~/.local/state/dotfiles-backups/herdr-*`. It leaves shipped layouts and mods,
settings, keys, and runtime state alone. Set `HERDR_APP_HOME` to deploy to a
non-default Herdr home. On Windows, run the command from a Bash environment
such as Git Bash. Select `gd` in Herdr after deployment; deployment does not
switch layouts or remove the original `sessions` layout.

Deploy to another machine over SSH when that machine has no clone of this
repository:

```sh
make herdr-deploy-remote HOST=iss
```

The remote copy streams `herdr-app/` and the deploy script into a temporary
`~/herdr-remote-deploy-*` directory, runs the same deploy script there, and
removes the directory afterwards. It needs `tar` and `bash` on the remote host,
plus the same Herdr, Node.js and npm requirements as a local deployment.
`HERDR_REMOTE_BASH` overrides the remote shell, for a host whose SSH shell is not
bash. The `iss` machine needs this because its SSH shell is PowerShell:

```sh
HERDR_REMOTE_BASH='& "C:/Program Files/Git/bin/bash.exe"' make herdr-deploy-remote HOST=iss
```

Set `HERDR_REMOTE_APP_HOME` to deploy outside the remote `~/.config/herdr-app`,
and `HERDR_REMOTE_HOST` instead of passing `HOST`. Both scripts run
`--check-only` validation before anything is copied, so an incomplete
repository fails locally.

Edit the repository copies and redeploy to share changes. Edits made directly
in Herdr's home are not automatically copied back to the repository. The layout
and its cloned mods were based on Herdr 0.1.8; review compatibility when Herdr
changes. Saved panel sizes and visibility are machine-local and are not copied.
The `iss` settings use LythMonoTerm Nerd Font; install it and select it in
Herdr separately if desired.

The Usage panel runs a bundled reader on the active space's machine. Install
Node.js 22.19 or later there, then use the panel's install button when prompted.
The reader uses credentials already configured on that machine; credentials
are not part of this repository. An existing installed reader is not updated by
deploying the mod, so reader upgrades need a separate, deliberate update.

The Source panel replaces Changes in `gd`. It remembers repository selections per
Herdr tab, scans immediate child folders, and lets you add another checkout.
Selecting a file opens a staged or unstaged diff; commits include staged changes
only. Fetch contacts all remotes; pull uses fast-forward only and requires a clean
working tree; push targets only the current branch's upstream. Git hooks and
credential helpers use the machine's existing configuration. Discard restores the
index version or deletes an untracked file after confirmation. Refresh rechecks
selected repositories; external changes also refresh through local folder watches
and 10-second polling. Before commit, Source checks that the staged snapshot has
not changed since it was displayed. The discard confirmation rechecks the file.
Neither check can lock out a concurrent Git or file edit between the recheck and
the operation, so avoid committing or discarding while an agent is editing.

Source handles whole-file changes only. Resolve conflicts in an editor or
terminal; dirty submodule contents are not shown in the parent, while checkout
pointer changes are. Diff previews are limited to 3,000 rows and 4,000 characters
per line. Discovery is limited to 500 immediate child repositories, and the file
list to 1,000 entries per group. Large-list bulk actions are disabled. Binary
files have no text diff. Local Add folder uses the system picker; remote machines
accept an absolute path. The first view of a tab automatically selects its current
repository if cwd is inside one; explicitly selected lists stay pinned when cwd
changes. Prior saved Changes-panel selections are mapped to Source.

The Sessions panel lists local Pi, Claude Code and Cursor conversations across
projects. It opens a session in a matching local space, or creates a space for
its original folder. Cursor titles are generic, and the list can include active
conversations. Pi history requires a managed Pi installation. Other agents and
remote machines are not included.

Run `make herdr-test` for deployment and mod checks. The bundled
`rename-latency.test.mjs` is a machine-specific integration probe, not part of
that target; it requires its configured Pi, hc and SSH setup.

## Shell configuration

`fish/config.fish`, `.zshrc`, `zsh/zshenv`, `starship.toml` and
`systemd/shell-ssh-agent.service` are the source files for the Fish setup,
Starship prompt and Zsh fallback. Deploy them with:

```sh
make shell-deploy
```

Deployment copies files into the home directory and saves any existing files
under `~/.local/state/dotfiles-backups/`. Starship is deployed to
`~/.config/starship.toml`. If `STARSHIP_CONFIG` points elsewhere, deployment
stops before changing files. On macOS, deployment installs Fish and Starship
configuration only, leaving existing Zsh files and systemd configuration alone.
Fish also sources `~/.config/fish/local-macos.fish` on macOS when present; this
file is not managed by deployment. Keep private settings there and restrict its
permissions. Deployment does not change the login shell or start the SSH-agent
service. Edit the repository copies and redeploy after a change. The old
`make update` and `make push` targets are unrelated legacy workflows and can
overwrite home files; do not use them for the shell setup.

Fish uses Starship, eza, fzf and fnm when available. fnm selects the Node
version from `.nvmrc` or `.node-version` on directory changes. Install required
versions with `fnm install VERSION`; missing versions are not installed by
changing directory. Global npm packages belong to each Node installation.

On the Linux machines, Fish and eza come from the system package manager, while
`fnm` and Starship were installed as upstream release binaries in `~/.local/bin`
and are not updated by system package upgrades. On macOS, the shell tools can
be installed and updated with Homebrew. See the
[fnm releases](https://github.com/Schniz/fnm/releases) and
[Starship installation guide](https://starship.rs/installing/) for updates.

On Linux, the `shell-ssh-agent.service` user service provides
`$XDG_RUNTIME_DIR/shell-ssh-agent.sock`. The shell honors an inherited
`SSH_AUTH_SOCK`, including a forwarded agent, before using this socket. To
activate it after deployment:

```sh
systemctl --user daemon-reload
systemctl --user enable --now shell-ssh-agent.service
SSH_AUTH_SOCK="$XDG_RUNTIME_DIR/shell-ssh-agent.sock" ssh-add
```

Keys may need to be unlocked again after the agent restarts. Fish is not a
POSIX shell: remote commands that use POSIX syntax should invoke an appropriate
shell explicitly, for example `ssh host 'bash -c "..."'`.

Run the focused checks with `make shell-test`. The history converter writes to a
new file only and does not merge or overwrite live history. Back up history and
close active Fish sessions before any manual import.
