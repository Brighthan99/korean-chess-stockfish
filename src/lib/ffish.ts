// ffish(규칙 라이브러리) 초기화 싱글턴.
import ModuleFactory, { type FfishModule, type FfishBoard } from 'ffish-es6';

export type { FfishModule, FfishBoard };

let instance: FfishModule | null = null;
let loading: Promise<FfishModule> | null = null;

export function initFfish(): Promise<FfishModule> {
  if (instance) return Promise.resolve(instance);
  if (!loading) {
    loading = ModuleFactory({
      locateFile: (file: string) => (file.endsWith('.wasm') ? '/ffish/ffish.wasm' : file),
    }).then(mod => {
      // embind 워밍업: 첫 호출이 Board 생성 전이면 빈 문자열을 반환하는
      // 케이스가 있어(fairyground도 초기화 시 Board를 먼저 생성) 한 번 만들어 버린다.
      const b = new mod.Board('janggi');
      b.delete();
      instance = mod;
      return mod;
    });
  }
  return loading;
}
