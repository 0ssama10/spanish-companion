"""Transcribe one lesson locally with faster-whisper; write segment timestamps as JSON.
Usage: python -I tools/transcribe.py <audio file> <out.json> [model]
Output stays private (never shipped in the app)."""
import json, sys
from faster_whisper import WhisperModel

audio, out = sys.argv[1], sys.argv[2]
model_name = sys.argv[3] if len(sys.argv) > 3 else "small.en"
model = WhisperModel(model_name, device="cpu", compute_type="int8")
# Decode with ffmpeg (the installed PyAV is incompatible with faster-whisper's decoder)
import subprocess, numpy as np
pcm = subprocess.run(["ffmpeg", "-v", "error", "-i", audio, "-f", "s16le", "-ac", "1", "-ar", "16000", "-"],
                     capture_output=True, check=True).stdout
samples = np.frombuffer(pcm, np.int16).astype(np.float32) / 32768.0
segments, info = model.transcribe(samples,beam_size=5, word_timestamps=False, vad_filter=True)
data = [{"start": round(s.start, 2), "end": round(s.end, 2), "text": s.text.strip()} for s in segments]
with open(out, "w", encoding="utf-8") as f:
    json.dump({"audio": audio.replace("\\", "/").split("/")[-1], "model": model_name,
               "duration": round(info.duration, 2), "segments": data}, f, ensure_ascii=False, indent=1)
print(f"{len(data)} segments, {info.duration:.0f}s -> {out}")
