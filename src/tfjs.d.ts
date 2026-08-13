declare module '@tensorflow/tfjs' {
  export type Tensor = any;
  export type LayersModel = any;
  export type GraphModel = any;
  export const tidy: <T>(fn: () => T) => T;
  export const tensor2d: (values: any, shape: [number, number]) => any;
  export const sequential: () => any;
  export const layers: any;
  export const ready: () => Promise<void>;
  export const setBackend: (backend: string) => Promise<boolean>;
  export const findBackend: (backend: string) => any;
  export const loadLayersModel: (url: string) => Promise<any>;
}
