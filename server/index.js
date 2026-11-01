require('dotenv').config();

const app = require('./app');
const port = Number(process.env.PORT || 5000);

app.listen(port, () => {
  console.log(`Pawpaw Clinic server listening on port ${port}`);
});
