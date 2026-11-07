"""Makes DayFlow's alarm sound: a three-note chime (C5-E5-G5) that repeats and gets louder,
about 12 seconds. Writes sounds/dayflow-alarm.wav (web) and the Android copy in res/raw.
Run: python tools/make-alarm.py
"""
import math, pathlib, struct, wave

RATE = 16000
LENGTH = 12.0
NOTES = [523.25, 659.25, 783.99]  # C5, E5, G5
GAP = 0.18                        # between notes
REPEAT = 1.2                      # seconds per three-note phrase

samples = [0.0] * int(RATE * LENGTH)
t0 = 0.0
phrase = 0
while t0 < LENGTH - 0.6:
    loud = min(1.0, 0.35 + phrase * 0.07)  # rises gently, then stays full
    for i, f in enumerate(NOTES):
        start = int((t0 + i * GAP) * RATE)
        for n in range(int(0.9 * RATE)):
            k = start + n
            if k >= len(samples):
                break
            t = n / RATE
            env = math.exp(-4.0 * t) * min(1.0, t / 0.005)  # quick attack, bell-like decay
            # a little second harmonic makes it sound like a bell, not a beep
            samples[k] += loud * env * (0.7 * math.sin(2 * math.pi * f * t) + 0.3 * math.sin(4 * math.pi * f * t))
    t0 += REPEAT
    phrase += 1

peak = max(abs(s) for s in samples) or 1.0
frames = b"".join(struct.pack("<h", int(s / peak * 0.9 * 32767)) for s in samples)

root = pathlib.Path(__file__).resolve().parent.parent
for target in [root / "sounds" / "dayflow-alarm.wav",
               root / "android" / "app" / "src" / "main" / "res" / "raw" / "dayflow_alarm.wav"]:
    target.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(target), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(RATE)
        w.writeframes(frames)
    print("Wrote", target, round(target.stat().st_size / 1024), "KB")
