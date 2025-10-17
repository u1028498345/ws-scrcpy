const fs = require('fs');
const path = require('path');

const DEFAULT_CONFIG_PATH = path.resolve(__dirname, 'default.build.config.json');
const configCache = new Map();
const mergedCache = new Map();

function getConfig(filename) {
    let cached = configCache.get(filename);
    if (!cached) {
        const filtered = {};
        const absolutePath = path.isAbsolute(filename) ? filename : path.resolve(process.cwd(), filename);
        const rawConfig = JSON.parse(fs.readFileSync(absolutePath).toString());
        Object.keys(rawConfig).forEach((key) => {
            const value = rawConfig[key];
            if (typeof value === 'boolean' || typeof value === 'string') {
                filtered[key] = value;
            }
        });
        cached = filtered;
        configCache.set(filename, cached);
    }
    return cached;
}

function mergeWithDefaultConfig(custom) {
    if (!custom) {
        return getConfig(DEFAULT_CONFIG_PATH);
    }
    let cached = mergedCache.get(custom);
    if (!cached) {
        const defaultConfig = getConfig(DEFAULT_CONFIG_PATH);
        const customConfig = getConfig(custom);
        cached = Object.assign({}, defaultConfig, customConfig);
        mergedCache.set(custom, cached);
    }
    return cached;
}

module.exports = {
    getConfig,
    mergeWithDefaultConfig
};