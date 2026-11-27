# Exact-string edits written atomically (temp file in the same folder, then rename), because the
# ui2 sandboxes load these files live.
import os, sys
def edit(path, pairs):
    s = open(path).read()
    for old, new in pairs:
        assert s.count(old) == 1, (path, old[:80], s.count(old))
        s = s.replace(old, new)
    tmp = path + '.tmp-safari'
    with open(tmp, 'w') as f: f.write(s)
    os.chmod(tmp, os.stat(path).st_mode)
    os.replace(tmp, path)
