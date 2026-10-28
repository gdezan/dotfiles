import os
from pathlib import Path
import subprocess
import tempfile

repo = Path(__file__).resolve().parents[1]
with tempfile.TemporaryDirectory() as directory:
    home = Path(directory)
    source = home / 'zsh_history'
    source.write_bytes(b': 1000000000:0;echo slash\\path\\\nsecond line\n: 1000000001:0;echo invalid-\xb4-byte\n')
    target = home / '.local/share/fish/fish_history'
    target.parent.mkdir(parents=True)
    subprocess.run(['python3', str(repo / 'scripts/zsh-history-to-fish.py'), str(source), str(target)], check=True)
    env = os.environb.copy()
    env[b'HOME'] = os.fsencode(home)
    env[b'XDG_DATA_HOME'] = os.fsencode(home / '.local/share')
    env[b'fish_history'] = b'fish'
    result = subprocess.run(['fish', '--no-config', '-i', '-c', 'history search --reverse --null --contains echo'], env=env, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True)
    expected = b'echo slash\\path\nsecond line\0echo invalid-\xb4-byte\0'
    assert result.stdout == expected, (result.stdout, expected, result.stderr)
    before = target.read_bytes()
    result = subprocess.run(['python3', str(repo / 'scripts/zsh-history-to-fish.py'), str(source), str(target)], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    assert result.returncode != 0 and target.read_bytes() == before
    bad = home / 'bad_history'
    bad.write_bytes(b'not a zsh history record\n')
    output = home / 'bad_fish_history'
    result = subprocess.run(['python3', str(repo / 'scripts/zsh-history-to-fish.py'), str(bad), str(output)], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    assert result.returncode != 0 and not output.exists()
    print('zsh-history-import-test passed')
