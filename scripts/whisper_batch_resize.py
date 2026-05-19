import sys, struct, time, subprocess, os

sys.path.insert(0, '/opt/graphite/lib/python3.9/site-packages')
from scripts import whisper

NEW_RETENTIONS = ['10s:1d', '1m:28d', '10m:1y', '1h:4y']
NEW_MAX_RETENTION = 126144000  # 4 years in seconds
RESIZE_SCRIPT = '/opt/graphite/bin/whisper-resize.py'
WHISPER_LIB = '/opt/graphite/lib/python3.9/site-packages'
WHISPER_DIR = '/opt/graphite/storage/whisper/stats/gauges'


def read_raw_points(filepath):
    """Read all non-zero (ts, val) from every archive, bypassing retention."""
    points = {}
    with open(filepath, 'rb') as f:
        _, _, _, arch_count = struct.unpack('!LLfL', f.read(16))
        archives = [struct.unpack('!LLL', f.read(12)) for _ in range(arch_count)]
        for offset, spp, npoints in reversed(archives):  # low-res first so high-res wins
            f.seek(offset)
            for _ in range(npoints):
                ts, val = struct.unpack('!Ld', f.read(12))
                if ts > 0 and val == val:
                    points[(ts // spp) * spp] = val
    return points


def safe_resize(filepath):
    # Skip files already at new retention
    with open(filepath, 'rb') as f:
        _, maxRet, _, _ = struct.unpack('!LLfL', f.read(16))
    if maxRet >= NEW_MAX_RETENTION:
        return None, 'already at 4y retention'

    old_points = read_raw_points(filepath)

    env = {'PYTHONPATH': WHISPER_LIB, 'PATH': '/usr/local/bin:/usr/bin:/bin'}
    r = subprocess.run(
        ['python3', RESIZE_SCRIPT, '--nobackup', filepath] + NEW_RETENTIONS,
        capture_output=True, text=True, env=env
    )
    if r.returncode != 0:
        return False, r.stderr.strip()

    now = int(time.time())
    valid = sorted((ts, val) for ts, val in old_points.items() if 0 < now - ts < NEW_MAX_RETENTION)
    if valid:
        whisper.update_many(filepath, valid)

    return True, f'{len(valid)} pts'


total = ok = skipped = errors = 0
for root, dirs, files in os.walk(WHISPER_DIR):
    for f in files:
        if not f.endswith('.wsp'):
            continue
        path = os.path.join(root, f)
        total += 1
        result, msg = safe_resize(path)
        if result is None:
            skipped += 1
        elif result:
            ok += 1
            if ok % 50 == 0:
                print(f'Progress: {ok} done, {errors} errors, {skipped} skipped of {total} seen')
        else:
            errors += 1
            print(f'ERROR: {path}: {msg}')

print(f'DONE: {ok} resized, {errors} errors, {skipped} skipped (already at 4y)')
