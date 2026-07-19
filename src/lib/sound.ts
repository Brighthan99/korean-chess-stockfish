// 착수 사운드. 파일은 직접 제작한 자체 저작 WAV (public/sounds/, 기획서 §5.8).
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
  // 연타 시 겹쳐 재생되도록 클론 사용
  const node = audio.cloneNode() as HTMLAudioElement;
  node.volume = 0.9;
  void node.play().catch(() => {
    /* 사용자 제스처 전 자동재생 차단은 무시 */
  });
}
