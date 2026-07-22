// ffish (rules library) initialization singleton.
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
      // embind warm-up: some calls return an empty string if made before any Board
      // has been created (fairyground also creates a Board on init), so create one once.
      const b = new mod.Board('janggi');
      b.delete();
      instance = mod;
      return mod;
    });
  }
  return loading;
}
