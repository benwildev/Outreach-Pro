const { Client } = require('pg');
const client = new Client({
  user: 'postgres',
  host: '127.0.0.1',
  database: 'outreach_pro_db',
  port: 5432,
  password: ''
});
async function run() {
  await client.connect();
  const res = await client.query("ALTER USER outreach_pro_user WITH PASSWORD 'OutreachPr0_2026!';");
  console.log("Password set successfully!");
  await client.end();
}
run().catch(console.error);
