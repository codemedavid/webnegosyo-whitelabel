import type { AndroidManifest, ExportedConfig, ExportedConfigWithProps } from 'expo/config-plugins';
import { addSmsPermissions, withSmsPermissions } from './withSmsPermissions';

function makeManifest(existingPermissions: string[] = []): AndroidManifest {
  return {
    manifest: {
      $: { 'xmlns:android': 'http://schemas.android.com/apk/res/android' },
      application: [{ $: {} }],
      'uses-permission': existingPermissions.map((name) => ({ $: { 'android:name': name } })),
    },
  } as unknown as AndroidManifest;
}

describe('addSmsPermissions', () => {
  it('adds the SEND_SMS permission when it is not already present', () => {
    const manifest = makeManifest();

    const result = addSmsPermissions(manifest);

    const permissionNames = result.manifest['uses-permission']?.map((entry) => entry.$['android:name']);
    expect(permissionNames).toContain('android.permission.SEND_SMS');
  });

  it('does not duplicate the permission when it is already present', () => {
    const manifest = makeManifest(['android.permission.SEND_SMS']);

    const result = addSmsPermissions(manifest);

    const permissionNames = result.manifest['uses-permission']?.map((entry) => entry.$['android:name']);
    const matches = permissionNames?.filter((name) => name === 'android.permission.SEND_SMS');
    expect(matches).toHaveLength(1);
  });
});

describe('withSmsPermissions', () => {
  it('registers an Android manifest mod without throwing', () => {
    const config = withSmsPermissions({ name: 'test-app', slug: 'test-app' }) as ExportedConfig;

    expect(typeof config.mods?.android?.manifest).toBe('function');
  });

  it('adds the SEND_SMS permission when the registered mod runs', async () => {
    const config = withSmsPermissions({ name: 'test-app', slug: 'test-app' }) as ExportedConfig;
    const manifestMod = config.mods?.android?.manifest;
    const modConfig = { ...config, modResults: makeManifest() } as ExportedConfigWithProps<AndroidManifest>;

    const result = await manifestMod?.(modConfig);

    const permissionNames = result?.modResults.manifest['uses-permission']?.map((entry) => entry.$['android:name']);
    expect(permissionNames).toContain('android.permission.SEND_SMS');
  });
});
