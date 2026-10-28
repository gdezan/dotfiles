#!/usr/bin/env python3
import re
import sys
from pathlib import Path


def convert_zsh_history(source: bytes) -> tuple[bytes, int]:
    if source and not source.endswith(b'\n'):
        raise ValueError('Zsh history has an incomplete final line')
    records = []
    command = None
    timestamp = None
    for line in source.split(b'\n')[:-1]:
        if command is None:
            match = re.match(rb'^: (\d+):\d+;(.*)$', line)
            if not match:
                raise ValueError('Zsh history contains an unsupported record')
            timestamp, line = match.groups()
            command = b''
        if line.endswith(b'\\'):
            command += line[:-1] + b'\n'
            continue
        command += line
        if b'\0' in command:
            raise ValueError('Zsh history contains a NUL byte')
        escaped = command.replace(b'\\', b'\\\\').replace(b'\n', b'\\n')
        records.append(b'- cmd: ' + escaped + b'\n  when: ' + timestamp + b'\n')
        command = None
    if command is not None:
        raise ValueError('Zsh history ends in an incomplete multiline record')
    return b''.join(records), len(records)


def main() -> None:
    if len(sys.argv) != 3:
        raise SystemExit('Usage: zsh-history-to-fish.py SOURCE OUTPUT')
    source, output = map(Path, sys.argv[1:])
    result, count = convert_zsh_history(source.read_bytes())
    with output.open('xb') as destination:
        destination.write(result)
    print(f'Converted {count} Zsh history entries to {output}')


if __name__ == '__main__':
    main()
