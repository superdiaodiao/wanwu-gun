# take.py <yard file in repo> <final copy> <hole number 1-9>: put the final version of that hole's block (and the
# en lines that only it uses, when they differ) into the repo's file
import sys, re
cur_p, fin_p, k = sys.argv[1], sys.argv[2], int(sys.argv[3])
def split(s):
    starts = [m.start() for m in re.finditer(r'^    // \d+: ', s, re.M)]
    end = s.index('\n  ],\n  en: {')
    assert len(starts) == 9, len(starts)
    return s[:starts[0]], [s[starts[i]:(starts[i + 1] if i < 8 else end)] for i in range(9)], s[end:]
cur, fin = open(cur_p).read(), open(fin_p).read()
h, b, t = split(cur); fh, fb, ft = split(fin)
b[k - 1] = fb[k - 1]
# en: a tip that changed in this hole
otip = re.search(r"tip: '([^']*)'", split(cur)[1][k - 1]).group(1)
ntip = re.search(r"tip: '([^']*)'", fb[k - 1]).group(1)
if otip != ntip:
    ol = [l for l in t.split('\n') if l.startswith(f"    '{otip}':")]
    nl = [l for l in ft.split('\n') if l.startswith(f"    '{ntip}':")]
    assert len(ol) == 1 and len(nl) == 1
    t = t.replace(ol[0], nl[0])
open(cur_p, 'w').write(h + ''.join(b) + t)
