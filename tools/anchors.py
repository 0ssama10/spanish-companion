"""Word-level timestamps for anchor phrases (private; used to place cards)."""
import sys, subprocess, numpy as np, re
from faster_whisper import WhisperModel
audio = sys.argv[1]; phrases = sys.argv[2:]
pcm = subprocess.run(["ffmpeg","-v","error","-i",audio,"-f","s16le","-ac","1","-ar","16000","-"],capture_output=True,check=True).stdout
x = np.frombuffer(pcm, np.int16).astype(np.float32)/32768.0
segs, _ = WhisperModel("small.en", device="cpu", compute_type="int8").transcribe(x, beam_size=5, word_timestamps=True)
words = [(w.start, re.sub(r"[^a-z0-9]", "", w.word.lower())) for s in segs for w in s.words]
for p in phrases:
    toks = [re.sub(r"[^a-z0-9]","",t) for t in p.lower().split()]
    hits = [words[i][0] for i in range(len(words)-len(toks)+1) if [w for _,w in words[i:i+len(toks)]] == toks]
    print(f"{p!r}: " + ", ".join(f"{int(h//60)}:{h%60:05.2f}" for h in hits[:3]))
