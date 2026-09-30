"""
Translations: checks that every text in the app has a German and Croatian version and
rebuilds src/app/core/i18n/de.ts and hr.ts.

Run from the repository root:   python3 tools/i18n.py

The English text is the key. Translations live in tools/i18n/*.txt as blocks of three
lines (English, German, Croatian) separated by a blank line. Counted texts list their
forms with " || " (German: one || other; Croatian: one || few || other).
"""
import re, glob, json, sys
keys = {}; plurals = {}
Q = r"""(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)")"""
def val(mm, i):
    a, b = mm.group(i), mm.group(i + 1)
    return a.replace("\\'", "'") if a is not None else b.replace('\\"', '"')
for p in sorted(glob.glob('src/app/**/*', recursive=True)):
    if not p.endswith(('.ts', '.html')) or '/core/i18n/' in p or p.endswith('.spec.ts'): continue
    s = open(p).read(); f = p.split('/')[-1]
    for mm in re.finditer(r"(?<![\w.$])tn\(\s*[^,]+?,\s*" + Q + r"\s*,\s*" + Q, s, flags=re.S):
        plurals[val(mm, 1)] = val(mm, 3)
    for mm in re.finditer(r"(?<![\w.$])(?:t|m)\(\s*" + Q, s):
        keys.setdefault(val(mm, 1), f)
    for mm in re.finditer(r"(?<![\w.$])t\(\s*[^'\"\n][^?\n]*\?\s*" + Q + r"\s*:\s*" + Q, s):
        keys.setdefault(val(mm, 1), f); keys.setdefault(val(mm, 3), f)

# ---- build
wanted = set(keys) | set(plurals)
table = {}
for f in sorted(glob.glob('tools/i18n/*.txt')):
    blocks = [b.strip().split('\n') for b in open(f).read().strip().split('\n\n')]
    for b in blocks:
        if len(b) != 3: print('BAD BLOCK in', f.split('/')[-1], ':', b[:1]); continue
        table[b[0]] = (b[1], b[2])
missing = sorted(wanted - set(table)); extra = sorted(set(table) - wanted)
def entry(v):
    parts = [p.strip() for p in v.split(' || ')]
    q = lambda s: json.dumps(s, ensure_ascii=False)
    if len(parts) == 1: return q(parts[0])
    if len(parts) == 2: return '{ one: %s, other: %s }' % (q(parts[0]), q(parts[1]))
    return '{ one: %s, few: %s, other: %s }' % (q(parts[0]), q(parts[1]), q(parts[2]))
for i, name in enumerate(['de', 'hr']):
    lines = ["import type { Dictionary } from './i18n';", '', '/** Keys are the English texts; see i18n.ts. */', 'export const %s: Dictionary = {' % name]
    for k in sorted(table):
        if k in wanted: lines.append('  %s: %s,' % (json.dumps(k, ensure_ascii=False), entry(table[k][i])))
    lines.append('};'); lines.append('')
    open('src/app/core/i18n/%s.ts' % name, 'w').write('\n'.join(lines))
print(len(wanted), 'wanted,', len(wanted) - len(missing), 'translated,', len(missing), 'missing,', len(extra), 'unused')
for k in missing: print('MISSING', k)
for k in extra: print('UNUSED', k)
