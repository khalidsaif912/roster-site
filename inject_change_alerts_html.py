from pathlib import Path

SCRIPT_TAG = '<script src="/roster-site/change-alert.js"></script>'
TARGETS = [
    Path('docs/index.html'),
    Path('docs/now/index.html'),
    Path('docs/my-schedules/index.html'),
]


def patch_file(path: Path) -> bool:
    if not path.exists():
        print(f'SKIP: {path} does not exist')
        return False

    text = path.read_text(encoding='utf-8')
    if SCRIPT_TAG in text:
        print(f'OK: already injected in {path}')
        return False

    if '</body>' not in text:
        raise RuntimeError(f'Could not find </body> in {path}')

    text = text.replace('</body>', f'{SCRIPT_TAG}\n</body>', 1)
    path.write_text(text, encoding='utf-8')
    print(f'UPDATED: {path}')
    return True


def main() -> None:
    changed = 0
    for path in TARGETS:
        changed += int(patch_file(path))
    print(f'Done. Files changed: {changed}')


if __name__ == '__main__':
    main()
