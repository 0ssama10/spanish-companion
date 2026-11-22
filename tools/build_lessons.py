"""Build app/lessons/NN.json from private sources.

Source: private-audio/src/NN.json — like the app format, but each card has "anchor" (a short phrase the
teacher says when the concept starts) instead of "t". Anchors are matched against the local Whisper word
timings (private-audio/tNN.json) to get the card's start time. Anchors are not published.
Also writes app/lessons/index.json. Usage: python -I tools/build_lessons.py [NN ...]
"""
import difflib, json, os, re, sys
sys.stdout.reconfigure(encoding="utf-8")

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
PRIV, APP = os.path.join(ROOT, "private-audio"), os.path.join(ROOT, "app", "lessons")
SC_IDS = dict(json.load(open(os.path.join(ROOT, "tools", "soundcloud_tracks.json"))))
norm = lambda s: re.sub(r"[^a-z0-9ñáéíóúü ]", "", s.lower().replace("'", "").replace("’", ""))


def words_of(track):
    d = json.load(open(os.path.join(PRIV, f"t{track:02d}.json"), encoding="utf-8"))
    ws = [(t, norm(w)) for s in d["segments"] for t, w in s["words"]]
    return [(t, w) for t, w in ws if w], d["duration"]


def locate(anchor, words, after):
    toks = norm(anchor).split()
    n, best = len(toks), (0, None)
    target = " ".join(toks)
    for i in range(len(words) - n + 1):
        if words[i][0] < after:
            continue
        cand = " ".join(w for _, w in words[i:i + n])
        r = difflib.SequenceMatcher(None, target, cand).ratio()
        if r > best[0]:
            best = (r, words[i][0])
    return best


MIN_SCORE = 0.72


def increasing_subset(cands):
    """Indices of the highest-total-score subset of (idx, t, score) with strictly increasing t."""
    best = []  # best[k] = (total, chain)
    for k, (i, t, s) in enumerate(cands):
        prev = max((best[j] for j in range(k) if cands[j][1] < t), key=lambda b: b[0], default=(0, []))
        best.append((prev[0] + s, prev[1] + [k]))
    return {cands[k][0] for k in max(best, key=lambda b: b[0], default=(0, []))[1]}


def build(num):
    src = json.load(open(os.path.join(PRIV, "src", f"{num}.json"), encoding="utf-8"))
    words, duration = words_of(src["track"])
    cards, problems = src["cards"], []
    # 1) match every anchor independently over the whole track
    found = {}
    for i, c in enumerate(cards):
        if "anchor" in c:
            score, t = locate(c.pop("anchor"), words, 0)
            if t is not None and score >= MIN_SCORE:
                found[i] = (t, score)
            else:
                problems.append(f"  card '{c['title']}': anchor weak (best {score:.2f}), interpolated")
        elif "t" in c:
            found[i] = (c["t"], 2.0)
    # 2) keep only matches that are in card order
    keep = increasing_subset([(i, t, s) for i, (t, s) in sorted(found.items())])
    for i in set(found) - keep:
        problems.append(f"  card '{cards[i]['title']}': match out of order, interpolated")
    anchors = sorted((i, found[i][0]) for i in keep)
    anchors = [(-1, 0.0)] + anchors + [(len(cards), duration)]
    # 3) interpolate any card without a reliable time between its neighbours
    for (i0, t0), (i1, t1) in zip(anchors, anchors[1:]):
        for i in range(max(i0, 0), i1):
            if i == i0:
                cards[i]["t"] = round(max(0, t0 - 0.4), 1)
            else:
                cards[i]["t"] = round(t0 + (t1 - t0) * (i - i0) / (i1 - i0), 1)
    if src["cards"]:
        src["cards"][0]["t"] = 0  # first card covers the lesson opening
    src["duration"] = duration
    src["scId"] = SC_IDS[src["track"]]
    json.dump(src, open(os.path.join(APP, f"{num}.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(f"{num}: {len(src['cards'])} cards, {len(src.get('practice', []))} practice" + ("\n" + "\n".join(problems) if problems else ""))


def index():
    out = []
    for f in sorted(os.listdir(APP)):
        if re.fullmatch(r"\d\d\.json", f):
            d = json.load(open(os.path.join(APP, f), encoding="utf-8"))
            out.append({"id": d["id"], "track": d["track"], "title": d["title"], "practice": len(d.get("practice", []))})
    json.dump(out, open(os.path.join(APP, "index.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(f"index: {len(out)} lessons")


if __name__ == "__main__":
    nums = sys.argv[1:] or sorted(f[:-5] for f in os.listdir(os.path.join(PRIV, "src")) if f.endswith(".json"))
    for n in nums:
        build(n)
    index()
