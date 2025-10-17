const path = require('path');
const rspack = require('@rspack/core');
const HtmlRspackPlugin = require('@rspack/plugin-html').default;
const TerserPlugin = require('terser-webpack-plugin');
const GeneratePackageJsonPlugin = require('@dead50f7/generate-package-json-webpack-plugin');
const { commonConfig, PROJECT_ROOT, CLIENT_DIST_PATH, SERVER_DIST_PATH } = require('./rspack.common.js');

// 读取 package.json 文件
const fs = require('fs');
const PACKAGE_JSON = path.join(PROJECT_ROOT, '../package.json');
const packageJson = JSON.parse(fs.readFileSync(PACKAGE_JSON).toString());
const { name, version, description, author, license, scripts } = packageJson;
const basePackage = {
    name,
    version,
    description,
    author,
    license,
    scripts: { start: scripts['script:dist:start'] },
};

// Frontend configuration
const frontendConfig = {
  ...commonConfig,
  name: 'frontend',
  entry: {
    main: path.join(PROJECT_ROOT, '../src/app/index.ts'),
  },
  output: {
    path: CLIENT_DIST_PATH,
    filename: '[name].[contenthash:8].js',
    clean: true,
  },
  mode: 'production',
  experiments: {
    css: true,
  },
  plugins: [
    ...(commonConfig.plugins || []),
    new HtmlRspackPlugin({
      template: path.join(PROJECT_ROOT, '../src/public/index.html'),
      filename: 'index.html',
    }),
    new rspack.CssExtractRspackPlugin({
      filename: '[name].[contenthash:8].css',
    }),
  ],
  optimization: {
    minimize: true,
    minimizer: [
      new TerserPlugin({
        terserOptions: {
          compress: {
            drop_console: true,
          },
        },
      }),
    ],
    splitChunks: {
      chunks: 'all',
    },
  },
};

// Backend configuration
const backendConfig = {
  ...commonConfig,
  name: 'backend',
  entry: {
    index: path.join(PROJECT_ROOT, '../src/server/index.ts'),
  },
  output: {
    path: SERVER_DIST_PATH,
    filename: 'index.js',
    clean: true,
  },
  mode: 'production',
  target: 'node',
  externals: {
    // Externalize dependencies that shouldn't be bundled
    express: 'commonjs express',
    ws: 'commonjs ws',
    '@dead50f7/adbkit': 'commonjs @dead50f7/adbkit',
    '@devicefarmer/adbkit': 'commonjs @devicefarmer/adbkit',
    'node-mjpeg-proxy': 'commonjs node-mjpeg-proxy',
    'node-pty': 'commonjs node-pty',
    'portfinder': 'commonjs portfinder',
    'yaml': 'commonjs yaml',
    'ios-device-lib': 'commonjs ios-device-lib',
  },
  plugins: [
    ...(commonConfig.plugins || []),
    new GeneratePackageJsonPlugin(basePackage),
  ],
};

module.exports = [frontendConfig, backendConfig];