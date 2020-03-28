export default [{
  input: 'dist/main.js',
  output: {
    file: 'dist/bundle.js',
    format: 'umd'
  }
}, {
  input: 'dist/interactiveshell.js',
  output: {
      file: 'dist/interactiveshell-bundle.js',
      format: 'umd'
    }
}];

//    "package": "rollup dist/main.js --file dist/bundle.js --format umd --name \"main\" -m"