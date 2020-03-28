import {terser} from 'rollup-plugin-terser';

export default [{
  input: 'dist/main.js',
  output: [{
    file: 'dist/bundle.js',
    format: 'umd'
  }, {
    file: 'dist/bundle.min.js',
    format: 'iife',
    name: 'version',
    plugins: [terser()]    
  }]
}, {
  input: 'dist/interactiveshell.js',
  output: [{
    file: 'dist/interactiveshell-bundle.js',
    format: 'umd'
  }, {
    file: 'dist/interactiveshell-bundle.min.js',
    format: 'iife',
    name: 'version',
    plugins: [terser()]   
  }]
}];
