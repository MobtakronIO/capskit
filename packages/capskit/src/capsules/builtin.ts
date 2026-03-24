import { CapsuleManifest } from '../types';
import { service as systemService } from './system/manifest';
import { service as httpService } from './http/manifest';
import { service as calculatorService } from './capskit-calculator/manifest';
import { service as websocketService } from './websocket/manifest';

export const builtinCapsules: CapsuleManifest[] = [
  systemService,
  httpService,
  calculatorService,
  websocketService,
];
