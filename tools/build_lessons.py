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


def build(num):
    src = json.load(open(os.path.join(PRIV, "src", f"{num}.json"), encoding="utf-8"))
    words, duration = words_of(src["track"])
    after, problems = 0, []
    for c in src["cards"]:
        if "t" in c and "anchor" not in c:
            after = c["t"]; continue
        score, t = locate(c.pop("anchor"), words, after)
        if t is None or score < 0.6:
            problems.append(f"  card '{c['title']}': anchor not found (best {score:.2f})")
            t = after
        c["t"] = round(max(0, t - 0.4), 1)
        after = c["t"]
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
