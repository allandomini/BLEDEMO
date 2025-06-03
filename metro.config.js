const {getDefaultConfig, mergeConfig} = require('@react-native/metro-config');
const path = require('path');

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @type {import('metro-config').MetroConfig}
 */
const config = {
  watchFolders: [
    // Make sure Metro knows about the src directory
    path.resolve(__dirname, 'src'),
  ],
  resolver: {
    // Add .ts and .tsx to the list of extensions Metro will look for
    sourceExts: ['js', 'jsx', 'json', 'ts', 'tsx'],
  },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
