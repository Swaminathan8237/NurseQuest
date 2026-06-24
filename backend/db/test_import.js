const { cleanAndImport } = require('./clean_and_import');
cleanAndImport()
  .then(() => {
    console.log('Test import succeeded!');
    process.exit(0);
  })
  .catch(err => {
    console.error('Test import failed:', err);
    process.exit(1);
  });
