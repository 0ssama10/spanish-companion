"""Transcribe every lesson in the official zip (private). Writes private-audio/tNN.json with segments + words.
Skips lessons already done. Usage: python -I tools/batch_transcribe.py [worker] [workers]"""
import json, os, re, subprocess, sys, zipfile, numpy as np
from faster_whisper import WhisperModel
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "private-audio")
z = zipfile.ZipFile(os.path.join(ROOT, "spanish.zip"))
W, N = (int(sys.argv[1]), int(sys.argv[2])) if len(sys.argv) > 2 else (0, 1)
model = WhisperModel(os.environ.get("WHISPER_MODEL", "base.en"), device="cpu", compute_type="int8", cpu_threads=4)
names = sorted(n for n in z.namelist() if n.lower().endswith(".mp3"))
for n in names:
    num = int(re.search(r"Lesson (\d+)", n).group(1))
    if num % N != W: continue
    out = os.path.join(ROOT, f"t{num:02d}.json")
    if os.path.exists(out): continue
    mp3 = os.path.join(ROOT, os.path.basename(n))
    if not os.path.exists(mp3): z.extract(n, ROOT)
    pcm = subprocess.run(["ffmpeg","-v","error","-i",mp3,"-f","s16le","-ac","1","-ar","16000","-"],capture_output=True,check=True).stdout
    x = np.frombuffer(pcm, np.int16).astype(np.float32)/32768.0
    segs, info = model.transcribe(x, beam_size=1, word_timestamps=True, vad_filter=True)
    segs = [{"start": round(s.start,2), "text": s.text.strip(), "words": [[round(w.start,2), w.word.strip()] for w in s.words]} for s in segs]
    json.dump({"track": num, "duration": round(info.duration,2), "segments": segs}, open(out,"w",encoding="utf-8"), ensure_ascii=False)
    print(f"track {num:02d}: {info.duration:.0f}s, {len(segs)} segments", flush=True)
print("ALL DONE")
