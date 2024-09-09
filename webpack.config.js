/* eslint import/order: 0 */
const path = require('path');

// eslint-disable-next-line import/no-extraneous-dependencies
const webpack = require('webpack');
// eslint-disable-next-line import/no-extraneous-dependencies
const nodeExternals = require('webpack-node-externals');

module.exports = {
  // Set the webpack4 mode 'none' for compatibility with the behavior of the
  // webpack3 bundling step.
  mode: 'none',
  entry: {
    'addons-linter': './src/main.js',
  },
  target: 'node',
  output: {
    filename: '[name].js',
    libraryTarget: 'commonjs2',
    libraryExport: 'default',
    path: path.join(__dirname, 'dist'),
  },
  module: {
    rules: [
      {
        use: 'babel-loader',
        // babel options are in babel.config.json
        exclude: /(node_modules|bower_components)/,
        test: /\.js$/,
      },
      {
        use: 'raw-loader',
        exclude: /(node_modules|bower_components)/,
        test: /\.txt$/,
      },
    ],
  },
  externals: [
    nodeExternals({
      modulesFromFile: true,
    }),
  ],
  plugins: [
    new webpack.BannerPlugin({
      banner: 'require("source-map-support").install();',
      raw: true,
      entryOnly: false,
    }),
  ],
  resolve: {
    extensions: ['.js', '.json'],
    modules: ['src', 'node_modules', 'vendor'],
  },
  devtool: 'source-map',
  node: {
    // This is required because the default value does not seem to be `false`.
    // If this isn't set to `false`, `__dirname` is likely invalid and it
    // prevents JS rules to be loaded correctly.
    __dirname: false,
  },
};
