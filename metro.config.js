const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Firebase 10's auth package ships separate web/RN builds. With package "exports"
// enabled, Metro picks the web build and @firebase/auth registers its component
// against a different @firebase/app instance -> "Component auth has not been registered yet".
config.resolver.unstable_enablePackageExports = false;

module.exports = config;
