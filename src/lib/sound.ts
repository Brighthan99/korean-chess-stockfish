// Move sounds. Files are self-made original WAVs (public/sounds/, plan §5.8).
export type SoundName = 'move' | 'capture' | 'check' | 'start' | 'end';

let muted = localStorage.getItem('kc-muted') === '1';
const cache = new Map<SoundName, HTMLAudioElement>();

export function isMuted(): boolean {
  return muted;
}

export function setMuted(m: boolean): void {
  muted = m;
  localStorage.setItem('kc-muted', m ? '1' : '0');
}

export function playSound(name: SoundName): void {
  if (muted) return;
  let audio = cache.get(name);
  if (!audio) {
    audio = new Audio(`/sounds/${name}.wav`);
    audio.preload = 'auto';
    cache.set(name, audio);
  }
  // Use a clone so rapid consecutive moves can overlap
  const node = audio.cloneNode() as HTMLAudioElement;
  node.volume = 0.9;
  void node.play().catch(() => {
    /* ignore autoplay blocking before a user gesture */
  });
}
