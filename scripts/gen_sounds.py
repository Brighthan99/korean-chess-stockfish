# Self-made janggi move sounds (pure Python synthesis — copyright-clean CC0)
# Model: a wooden janggi piece landing on a wooden board = short noise attack + damped wood resonance modes + low-frequency board rumble
import math
import random
import struct
import wave
import os

SR = 44100
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "public", "sounds")
random.seed(20260719)


def damped_sine(buf, t0, freq, amp, decay):
    start = int(t0 * SR)
    length = min(len(buf) - start, int(decay * 8 * SR))
    for i in range(length):
        t = i / SR
        buf[start + i] += amp * math.exp(-t / decay) * math.sin(2 * math.pi * freq * t)


def noise_burst(buf, t0, amp, decay, lp=0.35):
    start = int(t0 * SR)
    length = min(len(buf) - start, int(decay * 8 * SR))
    prev = 0.0
    for i in range(length):
        t = i / SR
        x = random.uniform(-1.0, 1.0)
        prev += lp * (x - prev)  # one-pole low-pass to tame the harsh highs
        buf[start + i] += amp * math.exp(-t / decay) * prev


def wood_click(buf, t0, strength=1.0, pitch=1.0):
    noise_burst(buf, t0, 0.9 * strength, 0.004)
    damped_sine(buf, t0, 1150 * pitch, 0.55 * strength, 0.018)
    damped_sine(buf, t0, 1900 * pitch, 0.35 * strength, 0.012)
    damped_sine(buf, t0, 3200 * pitch, 0.22 * strength, 0.008)
    damped_sine(buf, t0, 168 * pitch, 0.50 * strength, 0.045)  # board rumble
    damped_sine(buf, t0, 92, 0.25 * strength, 0.060)


def render(name, dur, build):
    buf = [0.0] * int(SR * dur)
    build(buf)
    peak = max(abs(v) for v in buf) or 1.0
    gain = 0.85 / peak
    fade = int(0.012 * SR)
    n = len(buf)
    frames = bytearray()
    for i, v in enumerate(buf):
        v *= gain
        if i > n - fade:  # fade-out to avoid a click at the end
            v *= (n - i) / fade
        frames += struct.pack("<h", int(max(-1.0, min(1.0, v)) * 32767))
    os.makedirs(OUT, exist_ok=True)
    with wave.open(os.path.join(OUT, f"{name}.wav"), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(bytes(frames))
    print(f"{name}.wav  {len(frames) + 44:>7} bytes  {dur:.2f}s")


# Move sound — single click
render("move", 0.30, lambda b: wood_click(b, 0.0, 1.0, 1.0))

# Capture sound — double click (pieces knocking together)
def capture(b):
    wood_click(b, 0.0, 1.05, 0.92)
    wood_click(b, 0.028, 0.70, 1.18)
render("capture", 0.34, capture)

# Check — two firm knocks
def check(b):
    wood_click(b, 0.0, 0.95, 1.05)
    wood_click(b, 0.16, 1.0, 0.88)
render("check", 0.52, check)

# Game start — soft deep resonance
def start(b):
    wood_click(b, 0.0, 0.8, 0.72)
    damped_sine(b, 0.0, 120, 0.4, 0.12)
render("start", 0.55, start)

# Game end — three descending knocks
def end(b):
    wood_click(b, 0.0, 0.9, 1.12)
    wood_click(b, 0.22, 0.9, 0.86)
    wood_click(b, 0.44, 0.7, 0.68)
render("end", 0.85, end)
