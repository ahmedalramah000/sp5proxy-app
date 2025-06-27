const path = require('path');
const webpack = require('webpack');
const BundleAnalyzerPlugin = require('webpack-bundle-analyzer').BundleAnalyzerPlugin;
const HtmlWebpackPlugin = require('html-webpack-plugin');

module.exports = (env, argv) => {
  const isProduction = argv.mode === 'production';
  const analyze = process.env.ANALYZE === 'true';

  return {
    mode: isProduction ? 'production' : 'development',
    entry: './src/react/index.js',
    output: {
      path: path.resolve(__dirname, 'dist-react'),
      filename: isProduction ? 'bundle.[contenthash].js' : 'bundle.js',
      publicPath: './',
      clean: true
    },

  module: {
    rules: [
      {
        test: /\.(js|jsx)$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader',
          options: {
            presets: ['@babel/preset-env', '@babel/preset-react']
          }
        }
      },
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader']
      },
      {
        test: /\.(png|svg|jpg|jpeg|gif|ico)$/,
        type: 'asset/resource'
      }
    ]
  },
  resolve: {
    extensions: ['.js', '.jsx'],
    fallback: {
      "global": false,
      "process": false,
      "Buffer": false
    }
  },
  target: 'electron-renderer',
  devtool: isProduction ? false : 'source-map',
  optimization: {
    splitChunks: isProduction ? {
      chunks: 'all',
      maxSize: 200000, // 200KB chunks for better progressive loading
      cacheGroups: {
        vendor: {
          test: /[\\/]node_modules[\\/]/,
          name: 'vendors',
          chunks: 'all',
          priority: 10,
          reuseExistingChunk: true,
        },
        react: {
          test: /[\\/]node_modules[\\/](react|react-dom)[\\/]/,
          name: 'react',
          chunks: 'all',
          priority: 20,
        },
        core: {
          test: /[\\/]src[\\/]react[\\/](components[\\/](core|essential)|index\.js)/,
          name: 'core',
          chunks: 'all',
          priority: 15,
        },
        features: {
          test: /[\\/]src[\\/]react[\\/]components[\\/](advanced|optional)/,
          name: 'features',
          chunks: 'async',
          priority: 8,
        },
        common: {
          name: 'common',
          minChunks: 2,
          chunks: 'all',
          priority: 5,
          reuseExistingChunk: true,
        },
      },
    } : false,
    minimize: isProduction,
    usedExports: true,
    sideEffects: false
  },
  plugins: [
    // Copy public folder and React assets
    {
      apply: (compiler) => {
        const fs = require('fs');

        compiler.hooks.emit.tap('CopyAssetsPlugin', (compilation) => {
          const copyFile = (src, dest) => {
            try {
              if (fs.existsSync(src)) {
                const content = fs.readFileSync(src);
                compilation.assets[dest] = {
                  source: () => content,
                  size: () => content.length
                };
                console.log(`✅ Copied: ${src} -> ${dest}`);
              }
            } catch (e) {
              console.warn('Could not copy', src, 'to', dest);
            }
          };

          // Copy public folder files
          const publicPath = path.resolve(__dirname, 'public');
          if (fs.existsSync(publicPath)) {
            copyFile(path.join(publicPath, 'favicon.ico'), 'favicon.ico');
            copyFile(path.join(publicPath, 'manifest.json'), 'manifest.json');
          }

          // Copy React UI icons to assets/icons/ in dist-react
          const iconsPath = path.resolve(__dirname, 'src/react/assets/icons');
          if (fs.existsSync(iconsPath)) {
            const iconFiles = fs.readdirSync(iconsPath);
            iconFiles.forEach(file => {
              if (file.endsWith('.png') || file.endsWith('.svg')) {
                copyFile(
                  path.join(iconsPath, file),
                  `assets/icons/${file}`
                );
              }
            });
          }

          // Copy main assets folder icons
          const assetsPath = path.resolve(__dirname, 'assets');
          if (fs.existsSync(assetsPath)) {
            const assetFiles = fs.readdirSync(assetsPath);
            assetFiles.forEach(file => {
              if (file.endsWith('.png') || file.endsWith('.ico') || file.endsWith('.svg')) {
                copyFile(
                  path.join(assetsPath, file),
                  `assets/${file}`
                );
              }
            });
          }
        });
      }
    },
    new HtmlWebpackPlugin({
      template: path.resolve(__dirname, 'public/index.html'),
      filename: 'index.html',
      inject: 'body',
      minify: isProduction ? {
        removeComments: true,
        collapseWhitespace: true,
        removeRedundantAttributes: true,
        useShortDoctype: true,
        removeEmptyAttributes: true,
        removeStyleLinkTypeAttributes: true,
        keepClosingSlash: true,
        minifyJS: true,
        minifyCSS: true,
        minifyURLs: true,
      } : false
    }),
    new webpack.DefinePlugin({
      'global': 'globalThis',
      'process.env.NODE_ENV': JSON.stringify(isProduction ? 'production' : 'development')
    }),
    ...(analyze ? [new BundleAnalyzerPlugin()] : [])
  ]
  };
};
