# Regenerates assets/audio/narration.mp3 (British narrator, Kokoro TTS voice bm_george).
# Setup: pip install kokoro-onnx soundfile; download kokoro-v1.0.onnx + voices-v1.0.bin from
# github.com/thewh1teagle/kokoro-onnx releases (model-files-v1.0) into the working directory.
# Then: python3 tools/narration.py && ffmpeg -i vo.wav -ac 1 -ar 48000 -b:a 96k assets/audio/narration.mp3
# British narrator voice-over, placed on the FILM clock (story × 100/72).
import json, numpy as np, soundfile as sf
from kokoro_onnx import Kokoro
TS = 100 / 72
VOICE, SPEED = 'bm_george', 0.92
LINES = [  # (story seconds, text)
  (0.625, "Every achievement begins as an idea."),   # over the flash-forward; clear of the SLAM (3.5)
  (4.1,   "And some ideas change the world."),        # after the SLAM, over the title
  (8.1,   "In Athens and Rome, we learned proportion, engineering… and the citizen."),
  (12.5,  "Then, power was made answerable to the people."),
  (16.0,  "The Renaissance. Artists became scientists."),
  (20.6,  "Copernicus. Galileo. Newton. The universe became knowable."),
  (25.1,  "Steam and steel multiplied our strength a thousandfold."),
  (29.0,  "Lightning, tamed, carried our voices across the oceans."),
  (32.0,  "Medicine gave billions longer lives."),
  (35.0,  "Within one lifetime… from wooden wings, to orbit."),
  (38.6,  "Nineteen sixty-nine. America went to the Moon."),
  (42.9,  "Machines that calculate… became machines that learn."),
  (46.9,  "From the printing press to the internet: knowledge, set free."),
  (49.95, "From the Shuttle to Webb, America keeps reaching further."),
  (53.2,  "And next… the first humans on Mars."),
  (56.2,  "If I have seen further, it is by standing on the shoulders of giants."),
  (62.4,  "From the agora to the Moon…"),
  (64.25, "twenty-five centuries of reason, courage, and invention."),
  (67.55, "Ideas build upon ideas."),
  (72.9,  "The journey continues."),
]
k = Kokoro("kokoro-v1.0.onnx", "voices-v1.0.bin")
SR = 48000
DUR = 78.3 * TS
out = np.zeros(int(DUR * SR) + SR, dtype=np.float32)
report = []
prev_end = 0
for st, text in LINES:
    a, sr = k.create(text, voice=VOICE, speed=SPEED, lang="en-gb")
    a = np.asarray(a, dtype=np.float32)
    # trim leading/trailing silence
    thr = 0.01 * np.abs(a).max(); nz = np.where(np.abs(a) > thr)[0]
    a = a[max(0, nz[0] - int(0.02 * sr)): nz[-1] + int(0.12 * sr)]
    # resample 24k → 48k (linear, fine for speech at this rate ratio after the TTS's own band-limit)
    x = np.interp(np.arange(0, len(a), sr / SR), np.arange(len(a)), a).astype(np.float32)
    x /= np.abs(x).max()
    t0 = st * TS
    n0 = int(t0 * SR)
    out[n0:n0 + len(x)] += x
    report.append((round(t0, 2), round(t0 + len(x) / SR, 2), round(len(x) / SR, 2), 'OVERLAP' if t0 < prev_end else '', text))
    prev_end = t0 + len(x) / SR
sf.write('vo.wav', out, SR, subtype='FLOAT')
for r in report: print(*r)
