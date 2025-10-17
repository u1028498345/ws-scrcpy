const path = require('path');
const rspack = require('@rspack/core');
const { mergeWithDefaultConfig } = require('./build.config.utils.js');

const PROJECT_ROOT = path.resolve(__dirname);
const SERVER_DIST_PATH = path.join(PROJECT_ROOT, '../dist');
const CLIENT_DIST_PATH = path.join(PROJECT_ROOT, '../dist/public');

const override = path.join(PROJECT_ROOT, '../build.config.override.json');
const buildConfigOptions = mergeWithDefaultConfig(override);

const definePluginConfig = {};
Object.keys(buildConfigOptions).forEach(key => {
  definePluginConfig[`__${key}__`] = JSON.stringify(buildConfigOptions[key]);
});

/** @type {import('@rspack/core').Configuration} */
const commonConfig = {
  module: {
    rules: [
      {
        test: /\.css$/i,
        type: 'css',
      },
      {
        test: /\.tsx?$/,
        use: [
          {
            loader: 'builtin:swc-loader',
            options: {
              jsc: {
                parser: {
                  syntax: 'typescript',
                  decorators: true,
                },
                transform: {
                  legacyDecorator: true,
                  decoratorMetadata: true,
                },
              },
            },
          },
          {
            loader: 'ifdef-loader',
            options: buildConfigOptions,
          },
        ],
        exclude: [/node_modules/],
      },
      {
        test: /\.worker\.js$/,
        use: { 
          loader: 'builtin:worker-loader',
          options: {
            filename: '[name].worker.js'
          }
        },
      },
      {
        test: /\.svg$/,
        loader: 'svg-inline-loader',
      },
      {
        test: /\.(png|jpe?g|gif)$/i,
        type: 'asset/resource',
      },
      {
        test: /\.(asset)$/i,
        type: 'asset/resource',
        generator: {
          filename: '[name][ext]'
        }
      },
      {
        test: /\.jar$/,
        type: 'asset/resource',
        generator: {
          filename: '[path][name][ext]'
        }
      },
      {
        test: /LICENSE/i,
        type: 'asset/resource',
        generator: {
          filename: '[path][name]'
        }
      },
    ],
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.js'],
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
    fallback: {
      path: require.resolve('path-browserify'),
      buffer: require.resolve('buffer'),
      fs: false, // 添加 fs 的 polyfill
    },
  },
  plugins: [
    new rspack.DefinePlugin(definePluginConfig),
    new rspack.ProvidePlugin({
      Buffer: ['buffer', 'Buffer'],
    }),
  ],
};

module.exports = {
  PROJECT_ROOT,
  SERVER_DIST_PATH,
  CLIENT_DIST_PATH,
  commonConfig,
  buildConfigOptions
};