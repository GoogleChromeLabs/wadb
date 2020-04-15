import {terser} from 'rollup-plugin-terser';

export default [{
  input: 'dist/demos/main.js',
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
  input: 'dist/demos/interactiveshell.js',
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
