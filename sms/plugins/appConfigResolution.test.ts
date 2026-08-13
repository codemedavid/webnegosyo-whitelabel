import path from 'path';
import { getConfig } from '@expo/config';
import type { ExportedConfig } from 'expo/config-plugins';

describe('app.json plugin resolution', () => {
  it('resolves the SMS permissions config plugin and applies the Android manifest mod', () => {
    const projectRoot = path.resolve(__dirname, '..');

    const { exp } = getConfig(projectRoot, { skipSDKVersionRequirement: true, isModdedConfig: true });
    const config = exp as ExportedConfig;

    expect(typeof config.mods?.android?.manifest).toBe('function');
  });
});
