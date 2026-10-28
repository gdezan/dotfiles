# Dotfiles

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
stops before changing files. Deployment does not change the login shell or
start the SSH-agent service. Edit the repository copies and redeploy after a
change. The old `make update` and `make push` targets are unrelated legacy
workflows and can overwrite home files; do not use them for the shell setup.

Fish uses Starship, eza, fzf and fnm when available. fnm selects the Node
version from `.nvmrc` or `.node-version` on directory changes. Install required
versions with `fnm install VERSION`; missing versions are not installed by
changing directory. Global npm packages belong to each Node installation.

Fish and eza come from the system package manager. `fnm` and Starship were
installed as upstream release binaries in `~/.local/bin`, so system package
upgrades do not update them. See the [fnm releases](https://github.com/Schniz/fnm/releases)
and [Starship installation guide](https://starship.rs/installing/) for updates.

The `shell-ssh-agent.service` user service provides
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
